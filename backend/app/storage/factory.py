from functools import lru_cache

from app.core.config import settings
from app.storage.base import StorageBackendDriver
from app.storage.local import LocalStorage


def build_storage(backend: str) -> StorageBackendDriver:
    """Construct a driver for any supported backend (the migration CLI needs drivers
    for backends other than the configured one)."""
    if backend == "local":
        return LocalStorage(settings.storage_local_root)
    if backend == "s3":
        return _build_s3()
    raise NotImplementedError(f"storage backend not implemented: {backend}")


def _build_s3() -> StorageBackendDriver:
    required = ("storage_s3_bucket", "storage_s3_access_key", "storage_s3_secret_key")
    missing = [name for name in required if not getattr(settings, name)]
    if missing:
        raise RuntimeError(
            "storage_backend=s3 requires settings: " + ", ".join(f"CMGR_{m.upper()}" for m in missing)
        )
    import boto3  # deferred so local-only deployments never touch it

    from app.storage.s3 import S3Storage

    client = boto3.client(
        "s3",
        endpoint_url=settings.storage_s3_endpoint,
        region_name=settings.storage_s3_region,
        aws_access_key_id=settings.storage_s3_access_key,
        aws_secret_access_key=settings.storage_s3_secret_key,
    )
    return S3Storage(
        client,
        settings.storage_s3_bucket,
        cdn_base_url=settings.storage_cdn_base_url,
        signed_url_ttl=settings.storage_signed_url_ttl,
    )


@lru_cache
def get_storage() -> StorageBackendDriver:
    return build_storage(settings.storage_backend)
