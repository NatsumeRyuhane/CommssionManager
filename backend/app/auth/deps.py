from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import API_KEY_PREFIX, decode_access_token, hash_api_key
from app.db import get_db
from app.models import ApiKey

SESSION_COOKIE = "cmgr_session"


@dataclass
class Principal:
    kind: str  # "admin" | "api_key"
    scopes: set[str]
    label: str

    @property
    def can_write(self) -> bool:
        return self.kind == "admin" or "write" in self.scopes


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    xkey = request.headers.get("x-api-key")
    if xkey:
        return xkey.strip()
    return request.cookies.get(SESSION_COOKIE)


def get_principal(request: Request, db: Session = Depends(get_db)) -> Principal | None:
    """Resolve the caller, or None for anonymous (public read)."""
    token = _extract_token(request)
    if not token:
        return None

    if token.startswith(API_KEY_PREFIX):
        row = db.scalar(select(ApiKey).where(ApiKey.prefix == token[:12]))
        if row and row.revoked_at is None and hash_api_key(token) == row.key_hash:
            row.last_used_at = datetime.now(timezone.utc)
            db.commit()
            return Principal(kind="api_key", scopes=set(row.scopes.split()), label=row.name)
        return None

    payload = decode_access_token(token)
    if payload and payload.get("scope") == "admin":
        return Principal(kind="admin", scopes={"read", "write"}, label=payload.get("sub", "admin"))
    return None


def require_edit(principal: Principal | None = Depends(get_principal)) -> Principal:
    if principal is None or not principal.can_write:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Edit access requires admin login or a write-scoped API key.",
        )
    return principal
