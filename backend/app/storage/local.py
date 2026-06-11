from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

from app.storage.base import StorageBackendDriver, StoredFile


class LocalStorage(StorageBackendDriver):
    """Local filesystem backend. `key` is a path relative to the storage root."""

    backend_name = "local"

    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError(f"key escapes storage root: {key!r}")
        return p

    def save(self, key: str, data: bytes) -> StoredFile:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        # write-then-rename so concurrent readers never observe partial bytes
        tmp = p.with_name(f".{p.name}.{uuid4().hex}.tmp")
        tmp.write_bytes(data)
        tmp.replace(p)
        return StoredFile(
            backend=self.backend_name,
            bucket=None,
            key=key,
            size_bytes=len(data),
            checksum=hashlib.sha256(data).hexdigest(),
        )

    def read(self, key: str, *, bucket: str | None = None) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str, *, bucket: str | None = None) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str, *, bucket: str | None = None) -> bool:
        return self._path(key).exists()
