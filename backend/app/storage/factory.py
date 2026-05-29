from functools import lru_cache

from app.core.config import settings
from app.storage.base import StorageBackendDriver
from app.storage.local import LocalStorage


@lru_cache
def get_storage() -> StorageBackendDriver:
    if settings.storage_backend == "local":
        return LocalStorage(settings.storage_local_root)
    raise NotImplementedError(f"storage backend not implemented: {settings.storage_backend}")
