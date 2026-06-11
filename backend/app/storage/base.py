from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class StoredFile:
    """Result of persisting bytes to a storage backend."""

    backend: str
    bucket: str | None
    key: str
    size_bytes: int
    checksum: str  # sha-256 hex


class StorageBackendDriver(ABC):
    """Backend-agnostic file storage. Adding S3/GCS means implementing this, no schema change."""

    backend_name: str

    @abstractmethod
    def save(self, key: str, data: bytes) -> StoredFile: ...

    @abstractmethod
    def read(self, key: str, *, bucket: str | None = None) -> bytes: ...

    @abstractmethod
    def delete(self, key: str, *, bucket: str | None = None) -> None: ...

    @abstractmethod
    def exists(self, key: str, *, bucket: str | None = None) -> bool: ...

    # URL-producing backends (object storage behind a CDN) override these so endpoints
    # can redirect clients to the bytes instead of streaming them through the app.

    def public_url(self, key: str, *, bucket: str | None = None) -> str | None:
        """Stable publicly fetchable URL (CDN), or None when the backend has none."""
        return None

    def signed_url(
        self, key: str, *, bucket: str | None = None, ttl: int | None = None
    ) -> str | None:
        """Expiring URL for private objects, or None when the backend can't mint one."""
        return None
