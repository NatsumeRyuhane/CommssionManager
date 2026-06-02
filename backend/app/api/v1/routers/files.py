from __future__ import annotations

import io
import mimetypes

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile, status
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.orm import Session

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
from app.schemas import FileOut
from app.storage import get_storage

router = APIRouter(tags=["files"])

IMAGE_FORMATS = {"png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"}


@router.post("/nodes/{node_id}/files", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    node_id: int,
    upload: UploadFile,
    label: str | None = Form(default=None),
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    node = db.get(CommissionNode, node_id)
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
    key = f"commissions/{node.commission_id}/nodes/{node_id}/{upload.filename}"
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
        format=fmt or "bin",
        label=label,
        is_image=is_image,
        width=width,
        height=height,
        focal_x=0.5 if is_image else None,
        focal_y=0.5 if is_image else None,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return crud.file_out(file, None, crud.load_visibility_context(db))


@router.get("/files/{file_id}/raw")
def get_raw(
    file_id: int,
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    file = db.get(CommissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    visibility_context = crud.load_visibility_context(db)
    commission = file.node.commission
    public_file = (
        file.is_image
        and crud.effective_commission_visibility(commission, visibility_context)
        == crud.Visibility.public
        and crud.effective_file_visibility(file, visibility_context) == crud.Visibility.public
    )
    if not public_file and (principal is None or not principal.can_write):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    obj = db.get(StorageObject, file.storage_object_id)
    data = get_storage().read(obj.key, bucket=obj.bucket)
    media = mimetypes.guess_type(obj.key)[0] or "application/octet-stream"
    return Response(content=data, media_type=media)


@router.patch("/files/{file_id}/focal", response_model=FileOut)
def set_focal(
    file_id: int,
    focal_x: float = Form(...),
    focal_y: float = Form(...),
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
    db.commit()
    db.refresh(file)
    return crud.file_out(file, None, crud.load_visibility_context(db))


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    file = db.get(CommissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    obj = db.get(StorageObject, file.storage_object_id)
    db.execute(
        update(CommissionMetadata)
        .where(CommissionMetadata.cover_file_id == file_id)
        .values(cover_file_id=None)
    )
    db.delete(file)
    if obj:
        try:
            get_storage().delete(obj.key, bucket=obj.bucket)
        except OSError:
            pass
        # only drop the storage object if nothing else points at it
        still_used = db.scalar(
            select(CommissionFile).where(
                CommissionFile.storage_object_id == obj.id, CommissionFile.id != file_id
            )
        )
        if not still_used:
            db.delete(obj)
    db.commit()
