import hashlib
import io
import re

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import sessionmaker

from app import images
from app.storage.factory import build_storage
from app.storage.migrate import _target_key, migrate_all
from app.storage.s3 import S3Storage
from tests.fake_s3 import FakeS3Client


@pytest.fixture
def s3():
    return S3Storage(
        FakeS3Client(),
        "test-bucket",
        cdn_base_url="https://cdn.example.com/",
        signed_url_ttl=600,
    )


def test_save_read_exists_delete_roundtrip(s3: S3Storage):
    stored = s3.save("a/b/file.png", b"bytes")
    assert stored.backend == "s3"
    assert stored.bucket == "test-bucket"
    assert stored.key == "a/b/file.png"
    assert stored.size_bytes == 5
    assert stored.checksum == hashlib.sha256(b"bytes").hexdigest()
    assert s3.exists("a/b/file.png")
    assert s3.read("a/b/file.png") == b"bytes"
    s3.delete("a/b/file.png")
    assert not s3.exists("a/b/file.png")


def test_read_missing_raises_file_not_found(s3: S3Storage):
    with pytest.raises(FileNotFoundError):
        s3.read("missing.png")


def test_delete_missing_is_idempotent(s3: S3Storage):
    s3.delete("missing.png")  # must not raise


def test_public_url_requires_cdn_base():
    with_cdn = S3Storage(FakeS3Client(), "b", cdn_base_url="https://cdn.example.com")
    without_cdn = S3Storage(FakeS3Client(), "b")
    assert with_cdn.public_url("x/y z.png") == "https://cdn.example.com/x/y%20z.png"
    assert without_cdn.public_url("x.png") is None


def test_signed_url_uses_configured_ttl(s3: S3Storage):
    assert s3.signed_url("k.png") == "https://signed.example/test-bucket/k.png?expires=600"
    assert s3.signed_url("k.png", ttl=60).endswith("expires=60")


# ---------------------------------------------------------------- factory

def test_build_storage_s3_fails_fast_without_credentials(monkeypatch: pytest.MonkeyPatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "storage_s3_bucket", "bucket")
    monkeypatch.setattr(settings, "storage_s3_access_key", "")
    monkeypatch.setattr(settings, "storage_s3_secret_key", None)
    with pytest.raises(RuntimeError) as excinfo:
        build_storage("s3")
    assert "CMGR_STORAGE_S3_ACCESS_KEY" in str(excinfo.value)
    assert "CMGR_STORAGE_S3_SECRET_KEY" in str(excinfo.value)


def test_build_storage_s3_treats_empty_env_values_as_unset(monkeypatch: pytest.MonkeyPatch):
    """The prod compose file passes unset knobs as empty strings."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "storage_s3_bucket", "bucket")
    monkeypatch.setattr(settings, "storage_s3_access_key", "key")
    monkeypatch.setattr(settings, "storage_s3_secret_key", "secret")
    monkeypatch.setattr(settings, "storage_s3_endpoint", "")
    monkeypatch.setattr(settings, "storage_cdn_base_url", "")
    driver = build_storage("s3")
    assert isinstance(driver, S3Storage)
    assert driver.cdn_base_url is None
    assert driver.public_url("x.png") is None


def test_build_storage_rejects_unknown_backend():
    with pytest.raises(NotImplementedError):
        build_storage("gcs")


# ---------------------------------------------------------------- migration

def test_target_key_randomizes_legacy_keys_for_object_storage():
    legacy = "commissions/1/nodes/2/art.png"
    rekeyed = _target_key(legacy, "s3")
    assert re.fullmatch(r"commissions/1/nodes/2/[0-9a-f]{32}/art\.png", rekeyed)
    # already-randomized keys and local targets stay put (idempotent re-runs)
    assert _target_key(rekeyed, "s3") == rekeyed
    assert _target_key(legacy, "local") == legacy


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), "#abcabc").save(buf, format="PNG")
    return buf.getvalue()


def _upload_one(admin_client: TestClient) -> dict:
    res = admin_client.post(
        "/api/v1/commissions", json={"title": "Migration test", "node_names": ["Delivered"]}
    )
    assert res.status_code == 201, res.text
    node = next(item for item in res.json()["nodes"] if item["name"] == "Delivered")
    res = admin_client.post(
        f"/api/v1/nodes/{node['id']}/files",
        files={"upload": ("final.png", _png(), "image/png")},
    )
    assert res.status_code == 201, res.text
    obj = admin_client.get("/api/v1/exports/database.json").json()["storage_objects"][-1]
    return obj


def test_migrate_local_to_s3(admin_client: TestClient, engine, s3: S3Storage):
    before = _upload_one(admin_client)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    with TestSession() as db:
        assert migrate_all(db, s3, build_source=build_storage) == 1
        # a second run finds nothing left to move
        assert migrate_all(db, s3, build_source=build_storage) == 0

    after = admin_client.get("/api/v1/exports/database.json").json()["storage_objects"][-1]
    assert after["backend"] == "s3"
    assert after["bucket"] == "test-bucket"
    assert after["checksum"] == before["checksum"]
    # upload keys already carry a random segment, so migration keeps them unchanged
    assert after["key"] == before["key"]
    data = s3.read(after["key"], bucket=after["bucket"])
    assert hashlib.sha256(data).hexdigest() == before["checksum"]
    # cached derivatives rode along (same key on both backends)
    dkey = images.derivative_key(
        after["id"], after["checksum"], "thumb", images.DEFAULT_FORMAT
    )
    assert s3.exists(dkey)


def test_migrate_dry_run_moves_nothing(admin_client: TestClient, engine, s3: S3Storage):
    before = _upload_one(admin_client)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    with TestSession() as db:
        assert migrate_all(db, s3, build_source=build_storage, dry_run=True) == 1
    after = admin_client.get("/api/v1/exports/database.json").json()["storage_objects"][-1]
    assert after["backend"] == "local"
    assert after["key"] == before["key"]
    assert s3.client.objects == {}
