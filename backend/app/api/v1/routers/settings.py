from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.v1 import crud
from app.auth.deps import Principal, require_edit
from app.core.config import settings
from app.db import get_db
from app.models import AppSettings, VisibilityStageDefault, WebhookEndpoint, WebhookEvent
from app.schemas import (
    SiteSettingsOut,
    SiteSettingsUpdate,
    StorageSettingsOut,
    VisibilitySettingsOut,
    VisibilitySettingsUpdate,
    WebhookCreate,
    WebhookOut,
    WebhookUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _require_admin(principal: Principal) -> None:
    if principal.kind != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Settings management is admin-only"
        )


def _events_to_storage(events: list[WebhookEvent]) -> str:
    return " ".join(event.value for event in events)


def _events_from_storage(events: str) -> list[WebhookEvent]:
    return [WebhookEvent(event) for event in events.split()]


def _webhook_status(row: WebhookEndpoint) -> str:
    if not row.is_enabled:
        return "disabled"
    if row.last_status_code is None or 200 <= row.last_status_code < 300:
        return "active"
    return "failing"


def _webhook_out(row: WebhookEndpoint) -> WebhookOut:
    return WebhookOut(
        id=row.id,
        url=row.url,
        events=_events_from_storage(row.events),
        is_enabled=row.is_enabled,
        status=_webhook_status(row),
        created_at=row.created_at,
        updated_at=row.updated_at,
        last_delivery_at=row.last_delivery_at,
        last_status_code=row.last_status_code,
        last_error=row.last_error,
    )


@router.get("/site", response_model=SiteSettingsOut)
def get_site_settings(db: Session = Depends(get_db)):
    return crud.site_settings_out(db.get(AppSettings, crud.SETTINGS_ID))


@router.patch("/site", response_model=SiteSettingsOut)
def update_site_settings(
    body: SiteSettingsUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    row = crud.ensure_app_settings(db)
    if body.site_title is not None:
        row.site_title = body.site_title
    if body.default_stage_names is not None:
        row.default_stage_names = ", ".join(body.default_stage_names)
    if body.allow_public_original_download is not None:
        row.allow_public_original_download = body.allow_public_original_download
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return crud.site_settings_out(row)


@router.get("/visibility", response_model=VisibilitySettingsOut)
def get_visibility_settings(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    row, stage_defaults = crud.ensure_visibility_settings(db)
    db.commit()
    return crud.visibility_settings_out(row, stage_defaults)


@router.patch("/visibility", response_model=VisibilitySettingsOut)
def update_visibility_settings(
    body: VisibilitySettingsUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    row, _ = crud.ensure_visibility_settings(db)

    if body.preset is not None:
        row.visibility_preset = body.preset
    if body.default_commission_visibility is not None:
        row.default_commission_visibility = body.default_commission_visibility
    if body.default_stage_visibility is not None:
        row.default_stage_visibility = body.default_stage_visibility
    if body.fields is not None:
        for field, value in body.fields.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(row, crud.FIELD_SETTING_ATTRS[field], value)
    if body.stage_defaults is not None:
        db.execute(delete(VisibilityStageDefault))
        for item in body.stage_defaults:
            stage_name = item.stage_name.strip()
            if not stage_name:
                raise HTTPException(status_code=422, detail="stage_name must not be empty")
            db.add(
                VisibilityStageDefault(
                    stage_name=stage_name,
                    visibility=item.visibility,
                    position=item.position,
                    note=item.note,
                )
            )

    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    row, stage_defaults = crud.ensure_visibility_settings(db)
    db.commit()
    return crud.visibility_settings_out(row, stage_defaults)


@router.get("/storage", response_model=StorageSettingsOut)
def get_storage_settings(principal: Principal = Depends(require_edit)):
    _require_admin(principal)
    is_s3 = settings.storage_backend == "s3"
    return StorageSettingsOut(
        backend=settings.storage_backend,
        local_root=settings.storage_local_root if settings.storage_backend == "local" else None,
        s3_bucket=settings.storage_s3_bucket if is_s3 else None,
        s3_endpoint=settings.storage_s3_endpoint if is_s3 else None,
        cdn_base_url=settings.storage_cdn_base_url if is_s3 else None,
    )


@router.get("/webhooks", response_model=list[WebhookOut])
def list_webhooks(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    rows = db.scalars(select(WebhookEndpoint).order_by(WebhookEndpoint.created_at.desc()))
    return [_webhook_out(row) for row in rows]


@router.post("/webhooks", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
def create_webhook(
    body: WebhookCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    row = WebhookEndpoint(
        url=body.url,
        events=_events_to_storage(body.events),
        is_enabled=body.is_enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _webhook_out(row)


@router.patch("/webhooks/{webhook_id}", response_model=WebhookOut)
def update_webhook(
    webhook_id: int,
    body: WebhookUpdate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    row = db.get(WebhookEndpoint, webhook_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    if body.url is not None:
        row.url = body.url
    if body.events is not None:
        row.events = _events_to_storage(body.events)
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _webhook_out(row)


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    row = db.get(WebhookEndpoint, webhook_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    db.delete(row)
    db.commit()
