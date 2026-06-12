from __future__ import annotations

import io
import mimetypes
from datetime import timezone
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
from app.db import get_db
from app.models import (
    CommissionFile,
    CommissionMetadata,
    CommissionNode,
    StorageBackend,
    StorageObject,
)
from app.schemas import FileMove, FileOut, FileReorder
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
