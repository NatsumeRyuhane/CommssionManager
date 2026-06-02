from __future__ import annotations

import io
import posixpath
import re
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1 import crud
from app.auth.deps import Principal, require_edit
from app.db import get_db
from app.models import (
    AppSettings,
    Artist,
    Character,
    Commission,
    CommissionFile,
    CommissionNode,
    Label,
    StorageObject,
    VisibilityStageDefault,
    WebhookEndpoint,
)
from app.storage import get_storage

router = APIRouter(prefix="/exports", tags=["exports"])


@router.get("/database.json")
def export_database(
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commissions = db.scalars(
        select(Commission)
        .options(
            selectinload(Commission.meta),
            selectinload(Commission.labels),
            selectinload(Commission.characters),
            selectinload(Commission.artists),
            selectinload(Commission.nodes)
            .selectinload(CommissionNode.files)
            .selectinload(CommissionFile.storage_object),
        )
        .order_by(Commission.id)
    ).unique()
    payload = {
        "exported_at": datetime.now(timezone.utc),
        "labels": [
            {"id": row.id, "name": row.name, "type": row.type.value}
            for row in db.scalars(select(Label).order_by(Label.id))
        ],
        "characters": [
            {"id": row.id, "name": row.name, "settings_xml": row.settings_xml}
            for row in db.scalars(select(Character).order_by(Character.id))
        ],
        "artists": [
            {"id": row.id, "name": row.name, "info_xml": row.info_xml}
            for row in db.scalars(select(Artist).order_by(Artist.id))
        ],
        "storage_objects": [
            {
                "id": row.id,
                "backend": row.backend.value,
                "bucket": row.bucket,
                "key": row.key,
                "size_bytes": row.size_bytes,
                "checksum": row.checksum,
                "created_at": row.created_at,
            }
            for row in db.scalars(select(StorageObject).order_by(StorageObject.id))
        ],
        "settings": _settings_export(db),
        "webhooks": [
            {
                "id": row.id,
                "url": row.url,
                "events": row.events,
                "is_enabled": row.is_enabled,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
                "last_delivery_at": row.last_delivery_at,
                "last_status_code": row.last_status_code,
                "last_error": row.last_error,
            }
            for row in db.scalars(select(WebhookEndpoint).order_by(WebhookEndpoint.id))
        ],
        "commissions": [_commission_export(row) for row in commissions],
    }
    return JSONResponse(
        content=jsonable_encoder(payload),
        headers={"Content-Disposition": 'attachment; filename="commission-manager-database.json"'},
    )


@router.get("/files.zip")
def export_files(
    commission_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    stmt = (
        select(Commission)
        .options(
            selectinload(Commission.meta),
            selectinload(Commission.artists),
            selectinload(Commission.nodes)
            .selectinload(CommissionNode.files)
            .selectinload(CommissionFile.storage_object),
        )
        .order_by(Commission.id)
    )
    if commission_id is not None:
        stmt = stmt.where(Commission.id == commission_id)
    commissions = list(db.scalars(stmt).unique())
    storage = get_storage()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for commission in commissions:
            root = _commission_dir(commission)
            nodes = crud.ordered_nodes(commission)
            detached = [node for node in commission.nodes if node.is_detached and node.files]
            for node in nodes + detached:
                for file in node.files:
                    obj = file.storage_object
                    filename = _safe_segment(posixpath.basename(obj.key) or f"file-{file.id}.{file.format}")
                    path = f"{root}/{_safe_segment(node.name)}/{filename}"
                    info = zipfile.ZipInfo(path, date_time=_zip_date(node.started_at))
                    zf.writestr(info, storage.read(obj.key, bucket=obj.bucket))
    filename = (
        f"commission-{commission_id}-files.zip" if commission_id is not None else "commission-files.zip"
    )
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _settings_export(db: Session) -> dict[str, object] | None:
    settings = db.get(AppSettings, crud.SETTINGS_ID)
    if settings is None:
        return None
    return {
        "visibility_preset": settings.visibility_preset.value,
        "default_commission_visibility": settings.default_commission_visibility.value,
        "default_stage_visibility": settings.default_stage_visibility.value,
        "fields": {
            field: getattr(settings, attr) for field, attr in crud.FIELD_SETTING_ATTRS.items()
        },
        "stage_defaults": [
            {
                "id": row.id,
                "stage_name": row.stage_name,
                "visibility": row.visibility.value,
                "position": row.position,
                "note": row.note,
            }
            for row in db.scalars(
                select(VisibilityStageDefault).order_by(
                    VisibilityStageDefault.position, VisibilityStageDefault.stage_name
                )
            )
        ],
        "updated_at": settings.updated_at,
    }


def _commission_export(commission: Commission) -> dict[str, object]:
    meta = commission.meta
    return {
        "id": commission.id,
        "created_at": commission.created_at,
        "updated_at": commission.updated_at,
        "metadata": {
            "title": meta.title,
            "description": meta.description,
            "completed_at": meta.completed_at,
            "rating": meta.rating.value,
            "cover_file_id": meta.cover_file_id,
            "confirmed_at": meta.confirmed_at,
            "price_amount": meta.price_amount,
            "price_currency": meta.price_currency,
            "visibility_override": meta.visibility_override.value if meta.visibility_override else None,
            "field_overrides": {
                field: getattr(meta, attr) for field, attr in crud.FIELD_OVERRIDE_ATTRS.items()
            },
        },
        "labels": [{"id": row.id, "name": row.name, "type": row.type.value} for row in commission.labels],
        "characters": [{"id": row.id, "name": row.name} for row in commission.characters],
        "artists": [{"id": row.id, "name": row.name} for row in commission.artists],
        "nodes": [_node_export(row) for row in commission.nodes],
    }


def _node_export(node: CommissionNode) -> dict[str, object]:
    return {
        "id": node.id,
        "name": node.name,
        "position": node.position,
        "started_at": node.started_at,
        "is_detached": node.is_detached,
        "visibility_override": node.visibility_override.value if node.visibility_override else None,
        "files": [
            {
                "id": file.id,
                "storage_object_id": file.storage_object_id,
                "format": file.format,
                "label": file.label,
                "is_image": file.is_image,
                "width": file.width,
                "height": file.height,
                "focal_x": file.focal_x,
                "focal_y": file.focal_y,
                "visibility_override": file.visibility_override.value if file.visibility_override else None,
                "created_at": file.created_at,
            }
            for file in node.files
        ],
    }


def _commission_dir(commission: Commission) -> str:
    artists = "-".join(_safe_segment(artist.name) for artist in commission.artists) or "unknown"
    return f"{artists}-{commission.id}"


def _safe_segment(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip(".-")
    return cleaned or "untitled"


def _zip_date(value: datetime | None) -> tuple[int, int, int, int, int, int]:
    dt = value or datetime.now(timezone.utc)
    return (max(dt.year, 1980), dt.month, dt.day, dt.hour, dt.minute, dt.second)
