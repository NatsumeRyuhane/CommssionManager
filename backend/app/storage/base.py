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
