from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.auth.deps import SESSION_COOKIE, Principal, get_principal
from app.auth.security import create_access_token, verify_admin
from app.core.config import settings
from app.schemas import LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response):
    if not verify_admin(body.username, body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(body.username)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
    )
    return TokenResponse(access_token=token)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/me")
def me(principal: Principal | None = Depends(get_principal)):
    if principal is None:
        return {"authenticated": False, "kind": None, "can_write": False}
    return {
        "authenticated": True,
        "kind": principal.kind,
        "label": principal.label,
        "can_write": principal.can_write,
        "scopes": sorted(principal.scopes),
    }
