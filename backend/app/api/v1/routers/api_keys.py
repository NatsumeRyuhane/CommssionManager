from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import Principal, require_edit
from app.auth.security import generate_api_key
from app.db import get_db
from app.models import ApiKey
from app.schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyOut

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _require_admin(principal: Principal) -> None:
    if principal.kind != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="API key management is admin-only"
        )


@router.get("", response_model=list[ApiKeyOut])
def list_keys(db: Session = Depends(get_db), principal: Principal = Depends(require_edit)):
    _require_admin(principal)
    return list(db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())))


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_key(
    body: ApiKeyCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    full, prefix, key_hash = generate_api_key()
    row = ApiKey(name=body.name, prefix=prefix, key_hash=key_hash, scopes=" ".join(body.scopes))
    db.add(row)
    db.commit()
    db.refresh(row)
    return ApiKeyCreated(**ApiKeyOut.model_validate(row).model_dump(), full_key=full)


@router.post("/{key_id}/revoke", response_model=ApiKeyOut)
def revoke_key(
    key_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_edit),
):
    _require_admin(principal)
    row = db.get(ApiKey, key_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row
