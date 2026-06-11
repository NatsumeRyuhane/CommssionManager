"""Move stored bytes between storage backends (issue #20).

Run inside the backend environment (``python3 main.py storage ...`` wraps this):

    python -m app.storage.migrate status
    python -m app.storage.migrate migrate [--dry-run]

``migrate`` copies every StorageObject whose backend differs from the configured
``CMGR_STORAGE_BACKEND`` into the configured backend, verifies checksums, updates
the row, and commits per object — an interrupted run can simply be re-run. Source
bytes are never deleted; clean them up manually once the migration checks out.
Cached derivatives are copied best-effort and regenerate lazily when missing.
"""

from __future__ import annotations

import argparse
import hashlib
import posixpath
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import images
from app.core.config import settings
from app.models import StorageBackend, StorageObject
from app.storage.base import StorageBackendDriver
from app.storage.factory import build_storage


def pending_objects(db: Session, target_backend: str) -> list[StorageObject]:
    return list(
        db.scalars(
            select(StorageObject)
            .where(StorageObject.backend != StorageBackend(target_backend))
            .order_by(StorageObject.id)
        )
    )


def _has_random_segment(key: str) -> bool:
    return any(
        len(part) == 32 and all(ch in "0123456789abcdef" for ch in part)
        for part in key.split("/")
    )


def _target_key(key: str, target_backend: str) -> str:
    """Re-key objects moving into object storage: legacy local keys are predictable,
    but bucket keys may be exposed through a public CDN domain, so they get the same
    random segment new uploads carry. Local targets and already-randomized keys are
    left unchanged (keeps re-runs and round-trips idempotent)."""
    if target_backend == "local" or _has_random_segment(key):
        return key
    head, tail = posixpath.split(key)
    return f"{head}/{uuid4().hex}/{tail}" if head else f"{uuid4().hex}/{tail}"


def migrate_object(
    db: Session,
    obj: StorageObject,
    source: StorageBackendDriver,
    target: StorageBackendDriver,
) -> None:
    """Copy one object (and any cached derivatives) to `target` and update its row."""
    data = source.read(obj.key, bucket=obj.bucket)
    if obj.checksum and hashlib.sha256(data).hexdigest() != obj.checksum:
        raise RuntimeError(f"checksum mismatch reading object {obj.id} ({obj.key})")

    stored = target.save(_target_key(obj.key, target.backend_name), data)

    # derivatives are a pure cache keyed off (id, checksum), so their keys survive
    # the move unchanged; copying them avoids a regeneration storm after cutover
    for preset in images.PRESETS:
        for fmt in images.FORMATS:
            dkey = images.derivative_key(obj.id, obj.checksum, preset, fmt)
            if source.exists(dkey):
                target.save(dkey, source.read(dkey))

    obj.backend = StorageBackend(stored.backend)
    obj.bucket = stored.bucket
    obj.key = stored.key
    obj.size_bytes = stored.size_bytes
    obj.checksum = stored.checksum
    # commit per object so an interrupted migration resumes where it stopped
    db.commit()


def migrate_all(
    db: Session,
    target: StorageBackendDriver,
    *,
    build_source=build_storage,
    dry_run: bool = False,
    echo=print,
) -> int:
    sources: dict[str, StorageBackendDriver] = {}
    count = 0
    for obj in pending_objects(db, target.backend_name):
        action = "would migrate" if dry_run else "migrating"
        echo(f"{action} object {obj.id}: {obj.backend.value}:{obj.key}")
        if not dry_run:
            source = sources.setdefault(obj.backend.value, build_source(obj.backend.value))
            migrate_object(db, obj, source, target)
        count += 1
    return count


def print_status(db: Session) -> None:
    rows = db.execute(
        select(
            StorageObject.backend,
            func.count(),
            func.coalesce(func.sum(StorageObject.size_bytes), 0),
        ).group_by(StorageObject.backend)
    ).all()
    print(f"configured backend: {settings.storage_backend}")
    if not rows:
        print("no stored objects")
        return
    for backend, count, total_bytes in sorted(rows, key=lambda r: r[0].value):
        print(f"  {backend.value}: {count} objects, {total_bytes / 1_048_576:.1f} MiB")
    pending = len(pending_objects(db, settings.storage_backend))
    print(f"pending migration to {settings.storage_backend}: {pending}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.storage.migrate", description=__doc__.split("\n\n")[0]
    )
    parser.add_argument("command", choices=["status", "migrate"])
    parser.add_argument(
        "--dry-run", action="store_true", help="list what would move without copying"
    )
    args = parser.parse_args(argv)

    from app.db import SessionLocal

    with SessionLocal() as db:
        if args.command == "status":
            print_status(db)
            return 0
        target = build_storage(settings.storage_backend)
        count = migrate_all(db, target, dry_run=args.dry_run)
        verb = "would migrate" if args.dry_run else "migrated"
        print(f"{verb} {count} object(s); source bytes retained")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
