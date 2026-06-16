from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class StoredFile:
    """Result of persisting bytes to a storage backend."""

    backend: str
    bucket: str | None
    key: str
    size_bytes: int
    checksum: str  # sha-256 hex


@dataclass
class PresignedUpload:
    """A short-lived, single-object upload request a browser can execute directly.

    `headers` are headers the client MUST send with the PUT so the request matches
    the signature; servers should also echo back additional response-exposed headers
    (e.g. ETag) via bucket CORS configuration.
    """

    url: str
    method: str
    headers: dict[str, str] = field(default_factory=dict)
    expires_at: datetime | None = None


@dataclass
class ObjectMetadata:
    """Verified metadata for an object actually present in the backend."""

    size_bytes: int
    content_type: str | None
    etag: str | None


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

    # Browser-direct upload support — overridden by backends that can mint a
    # short-lived upload request the client can execute itself. Backends that don't
    # (LocalStorage) return None and the app keeps proxying uploads.

    def presign_upload(
        self,
        key: str,
        *,
        content_type: str,
        max_size_bytes: int,
        ttl: int = 900,
        bucket: str | None = None,
    ) -> PresignedUpload | None:
        """Mint a one-shot presigned request the browser can PUT bytes to, or
        None when the backend doesn't support browser-direct uploads."""
        return None

    def head_object(
        self, key: str, *, bucket: str | None = None
    ) -> ObjectMetadata | None:
        """Inspect a previously-uploaded object. None if the object does not exist."""
        return None
