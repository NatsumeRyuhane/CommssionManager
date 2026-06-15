from __future__ import annotations

import io
import mimetypes
import random
from datetime import datetime, timezone
from email.utils import format_datetime
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse, RedirectResponse
from PIL import Image
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import images
from app.api.v1 import crud
from app.auth.deps import Principal, get_principal, require_edit
from app.core.config import settings as app_config
from app.db import get_db
from app.models import (
    CommissionFile,
    CommissionMetadata,
    CommissionNode,
    StorageBackend,
    StorageObject,
    UploadSession,
)
from app.schemas import (
    FileMove,
    FileOut,
    FileReorder,
    UploadSessionCreate,
    UploadSessionOut,
    UploadSessionStatusOut,
)
from app.storage import get_storage

router = APIRouter(tags=["files"])

IMAGE_FORMATS = {"png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"}

# Originals are immutable (upload keys carry a random segment), so public copies can
# cache for a day; private bytes must never land in a shared cache. Redirects to the
# CDN cache briefly so an edge in front of the app can absorb repeat lookups.
PUBLIC_CACHE = "public, max-age=86400"
PRIVATE_CACHE = "private, no-store"
REDIRECT_CACHE = "public, max-age=300"


def _next_position(db: Session, node_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.max(CommissionFile.position), -1) + 1).where(
            CommissionFile.node_id == node_id
        )
    )


def _resequence_node_files(db: Session, node_id: int) -> list[CommissionFile]:
    files = list(
        db.scalars(
            select(CommissionFile)
            .where(CommissionFile.node_id == node_id)
            .order_by(CommissionFile.position, CommissionFile.id)
        )
    )
    offset = max((file.position for file in files), default=-1) + len(files) + 1
    for index, file in enumerate(files):
        file.position = offset + index
    db.flush()
    for index, file in enumerate(files):
        file.position = index
    db.flush()
    return files


@router.post("/nodes/{node_id}/files", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    node_id: int,
    upload: UploadFile,
    background: BackgroundTasks,
    label: str | None = Form(default=None),
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    node = db.scalar(
        select(CommissionNode).where(CommissionNode.id == node_id).with_for_update()
    )
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")

    raw = await upload.read()
    filename = upload.filename or ""
    fmt = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    is_image = fmt in IMAGE_FORMATS

    width = height = None
    if is_image:
        try:
            with Image.open(io.BytesIO(raw)) as im:
                width, height = im.size
        except Exception:
            is_image = False

    storage = get_storage()
    # The random segment keeps object URLs unguessable behind a public CDN domain,
    # busts caches when the same filename is re-uploaded, and keeps repeat filenames
    # from colliding on the (backend, bucket, key) unique constraint. The basename
    # stays last so export zips keep the original filename.
    key = f"commissions/{node.commission_id}/nodes/{node_id}/{uuid4().hex}/{upload.filename}"
    stored = storage.save(key, raw)

    obj = StorageObject(
        backend=StorageBackend(stored.backend),
        bucket=stored.bucket,
        key=stored.key,
        size_bytes=stored.size_bytes,
        checksum=stored.checksum,
    )
    db.add(obj)
    db.flush()

    file = CommissionFile(
        node_id=node_id,
        storage_object_id=obj.id,
        position=_next_position(db, node_id),
        format=fmt or "bin",
        label=label,
        is_image=is_image,
        width=width,
        height=height,
        focal_x=0.5 if is_image else None,
        focal_y=0.5 if is_image else None,
        focal_zoom=1.0 if is_image else None,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    if is_image:
        # eager derivative generation keeps the read path warm for new uploads
        background.add_task(
            images.generate_presets, obj.id, stored.checksum, stored.key, stored.bucket
        )
    return crud.file_out(file, None, crud.load_visibility_context(db))


# ---------------------------------------------------------------- direct uploads
# Browser-direct upload flow: client requests a session, PUTs bytes straight to
# S3, then calls finalize. The proxied endpoint above stays the implementation
# for local storage and for S3 when the admin toggle is off.


def _require_direct_upload_supported() -> None:
    if not app_config.storage_direct_upload_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Direct uploads are disabled at the deployment level "
                "(CMGR_STORAGE_DIRECT_UPLOAD_ALLOWED=false)."
            ),
        )
    if app_config.storage_backend != "s3":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Direct uploads require an S3-compatible storage backend.",
        )


def _load_session_for_edit(
    db: Session, session_id: str, principal: Principal
) -> UploadSession:
    """Load the session, enforce edit access via its node's commission, and 404
    when the session doesn't exist or the principal can't reach it."""
    session = db.get(UploadSession, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found"
        )
    # require_edit already gates this, but principal-scoped checks remain so
    # multi-tenant deployments can extend the rule later without losing the gate.
    if not principal.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Edit access required"
        )
    return session


def _session_status_out(session: UploadSession) -> UploadSessionStatusOut:
    """Agent-facing projection of an UploadSession row. `is_expired` and
    `is_finalized` are derived here so callers never have to compare a
    timestamp to `now()` themselves."""
    now = datetime.now(timezone.utc)
    is_finalized = session.finalized_at is not None
    # A session that finalized after its presign expired is NOT expired —
    # finalization completed the lifecycle, so the expiry no longer matters.
    is_expired = (not is_finalized) and session.expires_at < now
    return UploadSessionStatusOut(
        session_id=session.id,
        node_id=session.node_id,
        filename=session.filename,
        content_type=session.content_type,
        expected_size_bytes=session.expected_size_bytes,
        created_at=session.created_at,
        expires_at=session.expires_at,
        finalized_at=session.finalized_at,
        commission_file_id=session.commission_file_id,
        is_expired=is_expired,
        is_finalized=is_finalized,
    )


@router.post(
    "/nodes/{node_id}/uploads",
    response_model=UploadSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_upload_session(
    node_id: int,
    body: UploadSessionCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    """Mint a presigned PUT for a future upload to `node_id`. The session row
    records what the client said it would upload so finalize can verify it."""
    _require_direct_upload_supported()
    if not crud.direct_upload_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Direct uploads are not enabled on this site.",
        )
    # API-key callers run server-side where direct upload isn't useful — keep
    # them on the proxied endpoint.
    if principal.kind != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Direct uploads require an admin session; API keys must use the proxied endpoint.",
        )

    node = db.scalar(select(CommissionNode).where(CommissionNode.id == node_id))
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")

    storage = get_storage()
    # Server-generated key — never trust client input here. The randomized
    # segment matches the proxied endpoint so existing key parsing keeps working.
    key = f"commissions/{node.commission_id}/nodes/{node_id}/{uuid4().hex}/{body.filename}"

    presigned = storage.presign_upload(
        key,
        content_type=body.content_type,
        max_size_bytes=body.size_bytes,
        ttl=app_config.storage_upload_url_ttl,
    )
    if presigned is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The configured storage backend does not support direct uploads.",
        )

    bucket = getattr(storage, "bucket", None)
    session = UploadSession(
        id=uuid4().hex,
        node_id=node_id,
        storage_backend=StorageBackend(storage.backend_name),
        storage_bucket=bucket,
        storage_key=key,
        filename=body.filename,
        content_type=body.content_type,
        expected_size_bytes=body.size_bytes,
        label=body.label,
        expires_at=presigned.expires_at or datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Opportunistic cleanup so deployments without a cron job don't accumulate
    # forever; ~5% probability keeps the latency impact negligible.
    if random.random() < 0.05:
        try:
            crud.cleanup_expired_upload_sessions(db, storage)
        except Exception:  # noqa: BLE001 — never let cleanup break the create
            pass

    return UploadSessionOut(
        session_id=session.id,
        upload_url=presigned.url,
        upload_method=presigned.method,
        upload_headers=presigned.headers,
        expires_at=session.expires_at,
    )


@router.delete("/uploads/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_upload_session(
    session_id: str,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    """Drop an in-flight session and best-effort delete the uploaded bytes.
    Finalized sessions return 409 so a duplicate cancel after a finalize race
    can't silently drop a real commission file."""
    session = _load_session_for_edit(db, session_id, principal)
    if session.finalized_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session already finalized; cancellation is not allowed.",
        )
    storage = get_storage()
    try:
        storage.delete(session.storage_key, bucket=session.storage_bucket)
    except OSError:
        pass
    db.delete(session)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/uploads/{session_id}/finalize",
    response_model=FileOut,
    status_code=status.HTTP_201_CREATED,
)
def finalize_upload_session(
    session_id: str,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    """Verify the uploaded object actually arrived and register it as a
    CommissionFile. Idempotent: re-finalizing returns the same file so a lost
    response can be retried safely. Sessions created before the admin toggle
    was flipped off still finalize, so an upload mid-flight is never stranded.
    """
    session = _load_session_for_edit(db, session_id, principal)
    storage = get_storage()

    # Idempotent return: a previous finalize already produced the file, so
    # surface it as-is — never create a duplicate row even if the same client
    # retries because the original response was lost.
    if session.finalized_at is not None and session.commission_file_id is not None:
        existing = db.get(CommissionFile, session.commission_file_id)
        if existing is None:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Finalized file was deleted; create a new upload session.",
            )
        cover_id = (
            existing.node.commission.meta.cover_file_id
            if existing.node.commission.meta
            else None
        )
        return crud.file_out(existing, cover_id, crud.load_visibility_context(db))

    # Expired sessions can't be finalized even if the object happens to exist —
    # the bytes might belong to a stale upload the operator wanted gone.
    if session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Upload session expired; start a new upload.",
        )

    metadata = storage.head_object(
        session.storage_key, bucket=session.storage_bucket
    )
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Uploaded object not found; retry the upload before finalizing.",
        )
    if metadata.size_bytes != session.expected_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Uploaded size ({metadata.size_bytes} bytes) does not match the "
                f"declared size ({session.expected_size_bytes} bytes)."
            ),
        )

    # Lock the destination node so direct and proxied uploads can't both grab
    # the same position concurrently.
    node = db.scalar(
        select(CommissionNode)
        .where(CommissionNode.id == session.node_id)
        .with_for_update()
    )
    if node is None:
        # Cascading delete during the upload window — nothing to attach to.
        try:
            storage.delete(session.storage_key, bucket=session.storage_bucket)
        except OSError:
            pass
        db.delete(session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination stage no longer exists.",
        )

    fmt = (
        session.filename.rsplit(".", 1)[-1].lower()
        if "." in session.filename
        else ""
    )
    is_image = fmt in IMAGE_FORMATS or (
        session.content_type.startswith("image/")
        if session.content_type
        else False
    )
    width = height = None
    raw: bytes | None = None
    if is_image:
        # Image probing needs the bytes; for direct uploads we round-trip them
        # from storage. The original byte transfer (browser → app) is what
        # the feature optimizes away — this read-back is small by comparison
        # and runs once per file.
        try:
            raw = storage.read(session.storage_key, bucket=session.storage_bucket)
            with Image.open(io.BytesIO(raw)) as im:
                width, height = im.size
        except Exception:
            is_image = False
            raw = None

    obj = StorageObject(
        backend=session.storage_backend,
        bucket=session.storage_bucket,
        key=session.storage_key,
        size_bytes=metadata.size_bytes,
        # ETag is a content-derived hash for single-PUT uploads on most S3
        # implementations; close enough as a checksum proxy and avoids a second
        # full read for non-image uploads.
        checksum=metadata.etag,
    )
    db.add(obj)
    db.flush()

    file = CommissionFile(
        node_id=node.id,
        storage_object_id=obj.id,
        position=_next_position(db, node.id),
        format=fmt or "bin",
        label=session.label,
        is_image=is_image,
        width=width,
        height=height,
        focal_x=0.5 if is_image else None,
        focal_y=0.5 if is_image else None,
        focal_zoom=1.0 if is_image else None,
    )
    db.add(file)
    db.flush()

    session.finalized_at = datetime.now(timezone.utc)
    session.commission_file_id = file.id
    db.commit()
    db.refresh(file)

    if is_image:
        background.add_task(
            images.generate_presets, obj.id, obj.checksum, obj.key, obj.bucket
        )

    cover_id = (
        file.node.commission.meta.cover_file_id
        if file.node.commission.meta
        else None
    )
    return crud.file_out(file, cover_id, crud.load_visibility_context(db))


@router.get(
    "/nodes/{node_id}/uploads",
    response_model=list[UploadSessionStatusOut],
)
def list_node_upload_sessions(
    node_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    """List pending upload sessions for a node so agents can coordinate around
    in-flight uploads. Admin-only (matches the create-session gate); finalized
    sessions are excluded — once a CommissionFile exists, the file APIs are
    the right surface for further work."""
    if principal.kind != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload session listing requires an admin session.",
        )
    if db.get(CommissionNode, node_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Node not found"
        )
    sessions = list(
        db.scalars(
            select(UploadSession)
            .where(
                UploadSession.node_id == node_id,
                UploadSession.finalized_at.is_(None),
            )
            .order_by(UploadSession.created_at)
        )
    )
    return [_session_status_out(s) for s in sessions]


@router.get(
    "/uploads/{session_id}",
    response_model=UploadSessionStatusOut,
)
def get_upload_session_status(
    session_id: str,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    """Single-session status for an agent that already holds a session id —
    e.g., one it created itself and now wants to confirm finalized or expired.
    Admin-only to match the listing and create-session gates."""
    if principal.kind != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload session status requires an admin session.",
        )
    session = _load_session_for_edit(db, session_id, principal)
    return _session_status_out(session)


@router.post("/uploads/cleanup")
def trigger_upload_cleanup(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    """Admin-only sweeper for orphaned upload sessions. Intended to be invoked
    on a cron schedule from the deployment; the create-session endpoint also
    runs it opportunistically."""
    if principal.kind != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Upload cleanup is admin-only.",
        )
    storage = get_storage()
    cleaned = crud.cleanup_expired_upload_sessions(db, storage)
    return {"cleaned": cleaned}


def _visible_file_or_404(
    db: Session, file_id: int, principal: Principal | None
) -> tuple[CommissionFile, bool]:
    """The shared visibility gate for byte-serving endpoints (/raw and /image).

    Returns the file plus whether it is publicly visible — delivery picks cache
    headers and redirect targets (CDN vs signed URL) off that flag.
    """
    file = db.get(CommissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    visibility_context = crud.load_visibility_context(db)
    commission = file.node.commission
    # raw-file privacy: non-image files (PSD sources etc.) are never served to
    # the public regardless of visibility settings; admins can always fetch them
    public_file = (
        file.is_image
        and crud.effective_commission_visibility(commission, visibility_context)
        == crud.Visibility.public
        and crud.effective_file_visibility(file, visibility_context) == crud.Visibility.public
    )
    if not public_file and (principal is None or not principal.can_write):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return file, public_file


def _storage_redirect(storage, key: str, bucket: str | None, public: bool):
    """302 to the CDN (public files) or a signed URL, or None when the backend
    serves no URLs (local disk) and the caller must stream the bytes itself."""
    if public:
        target = storage.public_url(key, bucket=bucket)
        if target:
            return RedirectResponse(
                target,
                status_code=status.HTTP_302_FOUND,
                headers={"Cache-Control": REDIRECT_CACHE},
            )
    target = storage.signed_url(key, bucket=bucket)
    if target:
        # signed URLs expire, so the redirect itself must never be cached
        return RedirectResponse(
            target,
            status_code=status.HTTP_302_FOUND,
            headers={"Cache-Control": PRIVATE_CACHE},
        )
    return None


def _etag_matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    candidates = {tag.strip().removeprefix("W/") for tag in if_none_match.split(",")}
    return "*" in candidates or etag in candidates


@router.get("/files/{file_id}/raw")
def get_raw(
    file_id: int,
    request: Request,
    redirect: bool = Query(default=True),
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    """Serve original bytes: a redirect to object storage / the CDN when the backend
    provides URLs, otherwise a stream with validators so a CDN in front of the app
    can cache public files. ``redirect=0`` forces streaming (browser fetch() can't
    carry credentials across a cross-origin redirect, so downloads opt out).
    """
    file, public = _visible_file_or_404(db, file_id, principal)
    # visitors only ever reach this point with public image files (the gate above
    # already hides everything else), so this check is exactly the original-art gate.
    # gifs are exempt: re-encoding can't preserve them (derivatives are static
    # stills), so a visible gif is always served raw
    if (
        file.format != "gif"
        and (principal is None or not principal.can_write)
        and not crud.public_originals_allowed(db)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Original downloads are disabled on this site",
        )
    obj = db.get(StorageObject, file.storage_object_id)
    storage = get_storage()

    if redirect:
        response = _storage_redirect(storage, obj.key, obj.bucket, public)
        if response is not None:
            return response

    headers = {"Cache-Control": PUBLIC_CACHE if public else PRIVATE_CACHE}
    if obj.created_at is not None:
        headers["Last-Modified"] = format_datetime(
            obj.created_at.astimezone(timezone.utc), usegmt=True
        )
    if obj.checksum:
        etag = f'"{obj.checksum}"'
        headers["ETag"] = etag
        if _etag_matches(request.headers.get("if-none-match"), etag):
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    data = storage.read(obj.key, bucket=obj.bucket)
    media = mimetypes.guess_type(obj.key)[0] or "application/octet-stream"
    return Response(content=data, media_type=media, headers=headers)


@router.get("/files/{file_id}/image")
def get_image(
    file_id: int,
    request: Request,
    background: BackgroundTasks,
    size: str = Query(...),
    format: str = Query(default=images.DEFAULT_FORMAT),
    redirect: bool = Query(default=True),
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    """Serve a cached derivative, or start building it and answer 202.

    Cache hits redirect to object storage / the CDN when the backend provides URLs
    (``redirect=0`` opts back into streaming, as on /raw). Clients treat the 202 as
    "show a placeholder and retry shortly"; generation runs in the background and
    is deduplicated across concurrent misses.
    """
    if size not in images.PRESETS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"size must be one of: {', '.join(images.PRESETS)}",
        )
    if format not in images.FORMATS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"format must be one of: {', '.join(images.FORMATS)}",
        )
    file, public = _visible_file_or_404(db, file_id, principal)
    if not file.is_image:
        raise HTTPException(status_code=400, detail="Derivatives only exist for image files")
    # a png derivative is lossless — at source size it reproduces the original
    # bit-for-bit, so it falls under the same gate as /raw. gif sources are
    # exempt like on /raw: their original is freely served anyway
    if (
        format == "png"
        and file.format != "gif"
        and (principal is None or not principal.can_write)
        and not crud.public_originals_allowed(db)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lossless downloads are disabled on this site",
        )
    obj = db.get(StorageObject, file.storage_object_id)
    storage = get_storage()
    key = images.derivative_key(obj.id, obj.checksum, size, format)
    if storage.exists(key):
        if redirect:
            response = _storage_redirect(storage, key, None, public)
            if response is not None:
                return response
        try:
            data = storage.read(key)
        except OSError:
            data = None  # evicted between exists() and read(); fall through to rebuild
        if data is not None:
            headers = {"Cache-Control": PUBLIC_CACHE if public else "private, max-age=3600"}
            if obj.created_at is not None:
                headers["Last-Modified"] = format_datetime(
                    obj.created_at.astimezone(timezone.utc), usegmt=True
                )
            if obj.checksum:
                # derivative bytes are a pure function of (source checksum, preset,
                # format), so their identity makes a stable validator
                etag = f'"{obj.checksum[:16]}-{size}-{format}"'
                headers["ETag"] = etag
                if _etag_matches(request.headers.get("if-none-match"), etag):
                    return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
            return Response(
                content=data,
                media_type=images.FORMATS[format][1],
                headers=headers,
            )
    background.add_task(
        images.generate, storage, obj.key, obj.bucket, obj.id, obj.checksum, size, format
    )
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={"detail": "derivative is being generated"},
        headers={"Cache-Control": "no-store", "Retry-After": "1"},
    )


@router.patch("/files/{file_id}/focal", response_model=FileOut)
def set_focal(
    file_id: int,
    focal_x: float = Form(...),
    focal_y: float = Form(...),
    focal_zoom: float | None = Form(None),
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    file = db.get(CommissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if not file.is_image:
        raise HTTPException(status_code=400, detail="Focal point only applies to image files")
    file.focal_x = max(0.0, min(1.0, focal_x))
    file.focal_y = max(0.0, min(1.0, focal_y))
    if focal_zoom is not None:
        file.focal_zoom = max(1.0, min(3.0, focal_zoom))
    db.commit()
    db.refresh(file)
    return crud.file_out(file, None, crud.load_visibility_context(db))


@router.patch("/files/{file_id}/node", response_model=FileOut)
def move_file(
    file_id: int,
    body: FileMove,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    file = db.get(CommissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    source_node_id = file.node_id
    locked_nodes = {
        node.id: node
        for node in db.scalars(
            select(CommissionNode)
            .where(CommissionNode.id.in_([source_node_id, body.node_id]))
            .order_by(CommissionNode.id)
            .with_for_update()
        )
    }
    target = locked_nodes.get(body.node_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    source = locked_nodes.get(source_node_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source node not found")
    db.refresh(file)
    if file.node_id != source_node_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File moved concurrently; retry the request",
        )
    if target.commission_id != source.commission_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="node_id must belong to the same commission as the file",
        )

    if file.node_id != target.id:
        file.position = _next_position(db, target.id)
        file.node_id = target.id
        db.flush()
        _resequence_node_files(db, source_node_id)
    db.commit()
    db.refresh(file)
    cover_id = target.commission.meta.cover_file_id if target.commission.meta else None
    return crud.file_out(file, cover_id, crud.load_visibility_context(db))


@router.post("/nodes/{node_id}/files/reorder", response_model=list[FileOut])
def reorder_files(
    node_id: int,
    body: FileReorder,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    node = db.scalar(
        select(CommissionNode).where(CommissionNode.id == node_id).with_for_update()
    )
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    files = {file.id: file for file in node.files}
    if len(body.file_ids) != len(files) or set(body.file_ids) != set(files):
        raise HTTPException(
            status_code=400,
            detail="file_ids must list exactly the node's files",
        )

    offset = max((file.position for file in files.values()), default=-1) + len(files) + 1
    for index, file_id in enumerate(body.file_ids):
        files[file_id].position = offset + index
    db.flush()
    for index, file_id in enumerate(body.file_ids):
        files[file_id].position = index
    db.commit()
    visibility_context = crud.load_visibility_context(db)
    cover_id = node.commission.meta.cover_file_id if node.commission.meta else None
    return [crud.file_out(files[file_id], cover_id, visibility_context) for file_id in body.file_ids]


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    file = db.get(CommissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    db.scalar(
        select(CommissionNode).where(CommissionNode.id == file.node_id).with_for_update()
    )
    obj = db.get(StorageObject, file.storage_object_id)
    node_id = file.node_id
    db.execute(
        update(CommissionMetadata)
        .where(CommissionMetadata.cover_file_id == file_id)
        .values(cover_file_id=None)
    )
    db.delete(file)
    db.flush()
    _resequence_node_files(db, node_id)
    if obj:
        storage = get_storage()
        try:
            storage.delete(obj.key, bucket=obj.bucket)
        except OSError:
            pass
        images.delete_derivatives(storage, obj.id, obj.checksum)
        # only drop the storage object if nothing else points at it
        still_used = db.scalar(
            select(CommissionFile).where(
                CommissionFile.storage_object_id == obj.id, CommissionFile.id != file_id
            )
        )
        if not still_used:
            db.delete(obj)
    db.commit()
