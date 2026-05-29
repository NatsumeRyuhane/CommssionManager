from fastapi import APIRouter

from app.api.v1.routers import api_keys, auth, commissions, files, lookups

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(commissions.router)
api_router.include_router(files.router)
api_router.include_router(lookups.router)
api_router.include_router(api_keys.router)
