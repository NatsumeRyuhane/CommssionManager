from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
from time import monotonic
from typing import Literal
from uuid import UUID

UploadStatus = Literal["receiving", "processing", "completed", "failed"]

PROGRESS_RETENTION_SECONDS = 60 * 60
MAX_PROGRESS_ENTRIES = 1000


@dataclass(frozen=True)
class UploadProgress:
    upload_id: str
    status: UploadStatus
    received_bytes: int
    total_bytes: int | None
    detail: str | None = None

    @property
    def percentage(self) -> int | None:
        if self.total_bytes is None or self.total_bytes <= 0:
            return None
        return min(100, int(self.received_bytes * 100 / self.total_bytes))


@dataclass
class _ProgressEntry:
    progress: UploadProgress
    updated_at: float


class UploadProgressRegistry:
    """Temporary, process-local progress for active and recently completed uploads."""

    def __init__(self) -> None:
        self._entries: dict[str, _ProgressEntry] = {}
        self._lock = RLock()

    def start(self, upload_id: str, total_bytes: int | None) -> None:
        with self._lock:
            self._prune()
            self._make_room()
            self._set(
                UploadProgress(
                    upload_id=upload_id,
                    status="receiving",
                    received_bytes=0,
                    total_bytes=total_bytes,
                )
            )

    def receive(self, upload_id: str, byte_count: int, *, complete: bool) -> None:
        with self._lock:
            entry = self._entries.get(upload_id)
            if entry is None:
                return
            current = entry.progress
            self._set(
                UploadProgress(
                    upload_id=upload_id,
                    status="processing" if complete else "receiving",
                    received_bytes=current.received_bytes + byte_count,
                    total_bytes=current.total_bytes,
                )
            )

    def finish(self, upload_id: str, *, succeeded: bool, detail: str | None = None) -> None:
        with self._lock:
            entry = self._entries.get(upload_id)
            if entry is None:
                return
            current = entry.progress
            self._set(
                UploadProgress(
                    upload_id=upload_id,
                    status="completed" if succeeded else "failed",
                    received_bytes=current.received_bytes,
                    total_bytes=current.total_bytes,
                    detail=detail,
                )
            )

    def get(self, upload_id: str) -> UploadProgress | None:
        with self._lock:
            self._prune()
            entry = self._entries.get(upload_id)
            return entry.progress if entry else None

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def _set(self, progress: UploadProgress) -> None:
        self._entries[progress.upload_id] = _ProgressEntry(progress=progress, updated_at=monotonic())

    def _prune(self) -> None:
        cutoff = monotonic() - PROGRESS_RETENTION_SECONDS
        expired = [
            upload_id for upload_id, entry in self._entries.items() if entry.updated_at < cutoff
        ]
        for upload_id in expired:
            del self._entries[upload_id]

    def _make_room(self) -> None:
        if len(self._entries) < MAX_PROGRESS_ENTRIES:
            return
        oldest_upload_id = min(self._entries, key=lambda upload_id: self._entries[upload_id].updated_at)
        del self._entries[oldest_upload_id]


upload_progress = UploadProgressRegistry()


def normalize_upload_id(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return str(UUID(value))
    except ValueError:
        return None
