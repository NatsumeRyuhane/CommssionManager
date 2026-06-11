"""Server-side image derivative pipeline.

Derivatives are resized copies of uploaded images, generated with Pillow and
cached through the storage abstraction under ``derivatives/{storage_object_id}/``.
They are a cache, not source data: nothing references them in the database, the
preset set is fixed so the key space stays finite, and they can be deleted (or
lost in a backend migration) at any time — the next request regenerates them.
"""

from __future__ import annotations

import io
import logging
import threading

from PIL import Image, ImageOps

from app.storage import get_storage
from app.storage.base import StorageBackendDriver

logger = logging.getLogger(__name__)

# Preset name -> max edge in pixels. Fixed so cache keys stay finite.
PRESETS: dict[str, int] = {
    "thumb": 240,
    "small": 640,
    "medium": 1280,
    "large": 2048,
}

# Query value -> (Pillow format, media type).
FORMATS: dict[str, tuple[str, str]] = {
    "webp": ("WEBP", "image/webp"),
    "jpeg": ("JPEG", "image/jpeg"),
    "png": ("PNG", "image/png"),
}

DEFAULT_FORMAT = "webp"

_QUALITY = {"webp": 82, "jpeg": 85}

# Keys currently being generated, so concurrent cache misses for the same
# derivative don't duplicate the resize work.
_inflight: set[str] = set()
_inflight_lock = threading.Lock()


def derivative_key(storage_object_id: int, token: str | None, preset: str, fmt: str) -> str:
    """Cache key for one derivative. `token` is a checksum-derived secret segment: it
    keeps derivative URLs unguessable when the bucket sits behind a public CDN domain
    (originals get the same property from the random segment in their upload key)."""
    return f"derivatives/{storage_object_id}/{(token or 'v0')[:16]}/{preset}.{fmt}"


def render(data: bytes, preset: str, fmt: str) -> bytes:
    """Resample original image bytes to the preset's max edge (never upscaling)."""
    max_edge = PRESETS[preset]
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im)
        im.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        if fmt == "jpeg":
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
        elif im.mode not in ("RGB", "RGBA", "L", "LA"):
            im = im.convert("RGBA")
        out = io.BytesIO()
        pillow_format = FORMATS[fmt][0]
        kwargs = {"quality": _QUALITY[fmt]} if fmt in _QUALITY else {}
        im.save(out, format=pillow_format, **kwargs)
        return out.getvalue()


def generate(
    storage: StorageBackendDriver,
    source_key: str,
    source_bucket: str | None,
    storage_object_id: int,
    token: str | None,
    preset: str,
    fmt: str,
) -> None:
    """Generate one derivative into the cache; a failure only logs (it's a cache)."""
    key = derivative_key(storage_object_id, token, preset, fmt)
    with _inflight_lock:
        if key in _inflight:
            return
        _inflight.add(key)
    try:
        data = storage.read(source_key, bucket=source_bucket)
        storage.save(key, render(data, preset, fmt))
    except Exception:
        logger.exception("derivative generation failed for %s", key)
    finally:
        with _inflight_lock:
            _inflight.discard(key)


def generate_presets(
    storage_object_id: int, token: str | None, source_key: str, source_bucket: str | None
) -> None:
    """Eagerly build every preset in the default format (upload background task)."""
    storage = get_storage()
    for preset in PRESETS:
        generate(storage, source_key, source_bucket, storage_object_id, token, preset, DEFAULT_FORMAT)


def delete_derivatives(
    storage: StorageBackendDriver, storage_object_id: int, token: str | None
) -> None:
    """Best-effort removal of every cached derivative for a storage object."""
    for preset in PRESETS:
        for fmt in FORMATS:
            try:
                storage.delete(derivative_key(storage_object_id, token, preset, fmt))
            except OSError:
                pass
