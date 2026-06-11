import hashlib
import io
import os
import re
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import sessionmaker

from app import images
from app.storage.factory import build_storage
from app.storage.migrate import _target_key, migrate_all
from app.storage.s3 import S3Storage
from tests.fake_s3 import FakeS3Client

# Driver-contract tests run against the dict-backed fake always, and additionally
# against a real bucket when these are set (mirrors the CMGR_TEST_DATABASE_URL
# pattern; in CI they come from the TEST_S3_* repo secrets/variables). Use a
# dedicated test bucket — the tests write and delete small objects in it.
LIVE_S3_ENV = (
    "CMGR_TEST_S3_BUCKET",
    "CMGR_TEST_S3_ENDPOINT",
    "CMGR_TEST_S3_ACCESS_KEY",
    "CMGR_TEST_S3_SECRET_KEY",
)


def _fake_s3() -> S3Storage:
    return S3Storage(
        FakeS3Client(),
        "test-bucket",
        cdn_base_url="https://cdn.example.com/",
        signed_url_ttl=600,
    )


def _live_s3() -> S3Storage | None:
    values = {name: os.getenv(name) for name in LIVE_S3_ENV}
    if not all(values.values()):
        return None
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=values["CMGR_TEST_S3_ENDPOINT"],
        region_name=os.getenv("CMGR_TEST_S3_REGION") or "auto",
        aws_access_key_id=values["CMGR_TEST_S3_ACCESS_KEY"],
        aws_secret_access_key=values["CMGR_TEST_S3_SECRET_KEY"],
    )
    return S3Storage(
        client,
        values["CMGR_TEST_S3_BUCKET"],
        cdn_base_url="https://cdn.example.com/",
        signed_url_ttl=600,
    )


@pytest.fixture(params=["fake", "live"])
def s3(request: pytest.FixtureRequest) -> S3Storage:
    """Each driver test runs twice: the live leg skips unless CMGR_TEST_S3_* is set."""
    if request.param == "live":
        live = _live_s3()
        if live is None:
            pytest.skip("live S3 not configured (set CMGR_TEST_S3_*)")
        return live
    return _fake_s3()


@pytest.fixture
def fake_s3() -> S3Storage:
    """Fake-only driver for tests that assert on the fake's internals."""
    return _fake_s3()


def test_save_read_exists_delete_roundtrip(s3: S3Storage):
    key = f"pytest-driver/{uuid4().hex}/file.png"
    try:
        stored = s3.save(key, b"bytes")
        assert stored.backend == "s3"
        assert stored.bucket == s3.bucket
        assert stored.key == key
        assert stored.size_bytes == 5
        assert stored.checksum == hashlib.sha256(b"bytes").hexdigest()
        assert s3.exists(key)
        assert s3.read(key) == b"bytes"
    finally:
        s3.delete(key)
    assert not s3.exists(key)


def test_read_missing_raises_file_not_found(s3: S3Storage):
    with pytest.raises(FileNotFoundError):
        s3.read(f"pytest-missing/{uuid4().hex}.png")


def test_delete_missing_is_idempotent(s3: S3Storage):
    s3.delete(f"pytest-missing/{uuid4().hex}.png")  # must not raise


def test_public_url_requires_cdn_base():
    with_cdn = S3Storage(FakeS3Client(), "b", cdn_base_url="https://cdn.example.com")
    without_cdn = S3Storage(FakeS3Client(), "b")
    assert with_cdn.public_url("x/y z.png") == "https://cdn.example.com/x/y%20z.png"
    assert without_cdn.public_url("x.png") is None


def test_signed_url_uses_configured_ttl(s3: S3Storage):
    # fake: ...?expires=600 ; real SigV4: ...&X-Amz-Expires=600&...
    assert re.search(r"expires=600(\D|$)", s3.signed_url("k.png").lower())
    assert re.search(r"expires=60(\D|$)", s3.signed_url("k.png", ttl=60).lower())


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


def test_migrate_local_to_s3(admin_client: TestClient, engine, fake_s3: S3Storage):
    before = _upload_one(admin_client)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    with TestSession() as db:
        assert migrate_all(db, fake_s3, build_source=build_storage) == 1
        # a second run finds nothing left to move
        assert migrate_all(db, fake_s3, build_source=build_storage) == 0

    after = admin_client.get("/api/v1/exports/database.json").json()["storage_objects"][-1]
    assert after["backend"] == "s3"
    assert after["bucket"] == "test-bucket"
    assert after["checksum"] == before["checksum"]
    # upload keys already carry a random segment, so migration keeps them unchanged
    assert after["key"] == before["key"]
    data = fake_s3.read(after["key"], bucket=after["bucket"])
    assert hashlib.sha256(data).hexdigest() == before["checksum"]
    # cached derivatives rode along (same key on both backends)
    dkey = images.derivative_key(
        after["id"], after["checksum"], "thumb", images.DEFAULT_FORMAT
    )
    assert fake_s3.exists(dkey)


def test_migrate_dry_run_moves_nothing(admin_client: TestClient, engine, fake_s3: S3Storage):
    before = _upload_one(admin_client)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    with TestSession() as db:
        assert migrate_all(db, fake_s3, build_source=build_storage, dry_run=True) == 1
    after = admin_client.get("/api/v1/exports/database.json").json()["storage_objects"][-1]
    assert after["backend"] == "local"
    assert after["key"] == before["key"]
    assert fake_s3.client.objects == {}
