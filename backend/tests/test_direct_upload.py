"""Direct browser-to-S3 upload session lifecycle.

Covers create-session / cancel / finalize / cleanup plus the toggle and
deployment-level kill switch that gate the feature. Uses the FakeS3Client
so the tests run anywhere without real S3 credentials, mirroring the pattern
in test_file_delivery and test_storage_s3.
"""

from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models import AppSettings, CommissionFile, StorageObject, UploadSession
from app.storage.s3 import S3Storage
from tests.fake_s3 import FakeS3Client


def _png(color: str = "#abcabc", width: int = 32, height: int = 32) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def s3_storage(monkeypatch: pytest.MonkeyPatch) -> S3Storage:
    storage = S3Storage(
        FakeS3Client(),
        "direct-upload-test",
        cdn_base_url="https://cdn.example.com",
        signed_url_ttl=600,
    )
    monkeypatch.setattr("app.api.v1.routers.files.get_storage", lambda: storage)
    monkeypatch.setattr("app.api.v1.routers.nodes.get_storage", lambda: storage)
    monkeypatch.setattr("app.images.get_storage", lambda: storage)
    # The direct-upload gates compare against the live env-backed settings.
    monkeypatch.setattr(settings, "storage_backend", "s3")
    monkeypatch.setattr(settings, "storage_direct_upload_allowed", True)
    monkeypatch.setattr(settings, "storage_upload_url_ttl", 900)
    return storage


def _enable_direct_upload(admin_client: TestClient) -> None:
    res = admin_client.patch(
        "/api/v1/settings/site", json={"allow_direct_upload": True}
    )
    assert res.status_code == 200, res.text
    assert res.json()["allow_direct_upload"] is True


def _create_commission(admin_client: TestClient) -> tuple[int, int]:
    res = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Direct upload test", "node_names": ["Delivered"]},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    node = next(n for n in body["nodes"] if n["name"] == "Delivered")
    return body["id"], node["id"]


# ---------------------------------------------------------------- capabilities

def test_capabilities_reflect_backend_env_and_toggle(
    admin_client: TestClient, s3_storage: S3Storage
):
    initial = admin_client.get("/api/v1/settings/storage/capabilities").json()
    assert initial["backend"] == "s3"
    assert initial["direct_upload_supported"] is True
    # Toggle defaults off — supported but not available
    assert initial["direct_upload_enabled"] is False
    assert initial["direct_upload_available"] is False

    _enable_direct_upload(admin_client)
    after = admin_client.get("/api/v1/settings/storage/capabilities").json()
    assert after["direct_upload_enabled"] is True
    assert after["direct_upload_available"] is True


def test_capabilities_for_local_backend_report_unsupported(admin_client: TestClient):
    # storage_backend defaults to "local" in the test env; capabilities should
    # report direct upload as unsupported and never available.
    res = admin_client.get("/api/v1/settings/storage/capabilities").json()
    assert res["backend"] == "local"
    assert res["direct_upload_supported"] is False
    assert res["direct_upload_available"] is False


# ---------------------------------------------------------------- toggle gates

def test_toggle_blocked_when_env_kill_switch_off(
    admin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "storage_backend", "s3")
    monkeypatch.setattr(settings, "storage_direct_upload_allowed", False)
    res = admin_client.patch(
        "/api/v1/settings/site", json={"allow_direct_upload": True}
    )
    assert res.status_code == 400
    assert "deployment level" in res.json()["detail"]


def test_toggle_blocked_when_backend_not_s3(admin_client: TestClient):
    # local backend; trying to enable should be rejected
    res = admin_client.patch(
        "/api/v1/settings/site", json={"allow_direct_upload": True}
    )
    assert res.status_code == 400
    assert "S3" in res.json()["detail"]


# ---------------------------------------------------------------- create session

def test_create_session_requires_admin(
    admin_client: TestClient, s3_storage: S3Storage
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)

    # API-key auth (write scope) is intentionally not enough for direct uploads:
    # they're a browser-side optimization and the server-side keys stay proxied.
    created_key = admin_client.post(
        "/api/v1/api-keys", json={"name": "agent", "scopes": ["write"]}
    )
    assert created_key.status_code == 201, created_key.text
    key = created_key.json()["full_key"]

    admin_client.post("/api/v1/auth/logout")
    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "a.png", "content_type": "image/png", "size_bytes": 10},
        headers={"X-API-Key": key},
    )
    assert res.status_code == 400, res.text


def test_create_session_returns_presigned_url_and_records_row(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)

    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "art.png",
            "content_type": "image/png",
            "size_bytes": 1234,
            "label": "final",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["upload_method"] == "PUT"
    assert body["upload_headers"]["Content-Type"] == "image/png"
    assert body["upload_url"].startswith("https://signed.example/direct-upload-test/")
    assert "op=put_object" in body["upload_url"]

    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        row = db.get(UploadSession, body["session_id"])
        assert row is not None
        assert row.node_id == node_id
        assert row.storage_key.endswith("/art.png")
        assert row.expected_size_bytes == 1234
        assert row.label == "final"
        assert row.finalized_at is None


def test_create_session_rejects_path_traversal_filenames(
    admin_client: TestClient, s3_storage: S3Storage
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    bad = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "../escape.png",
            "content_type": "image/png",
            "size_bytes": 10,
        },
    )
    assert bad.status_code == 422


def test_create_session_blocked_when_toggle_off(
    admin_client: TestClient, s3_storage: S3Storage
):
    # toggle stays off by default — even though everything else is configured
    _, node_id = _create_commission(admin_client)
    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "a.png", "content_type": "image/png", "size_bytes": 10},
    )
    assert res.status_code == 400
    assert "not enabled" in res.json()["detail"]


# ---------------------------------------------------------------- finalize

def _put_bytes(s3: S3Storage, key: str, body: bytes, content_type: str) -> None:
    """Stand in for the browser's direct PUT — drops the bytes into the fake."""
    s3.client.put_object(
        Bucket=s3.bucket, Key=key, Body=body, ContentType=content_type
    )


def test_finalize_creates_records_and_is_idempotent(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()

    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "final.png",
            "content_type": "image/png",
            "size_bytes": len(raw),
        },
    ).json()
    _put_bytes(s3_storage, _key_from_url(session["upload_url"]), raw, "image/png")

    first = admin_client.post(f"/api/v1/uploads/{session['session_id']}/finalize")
    assert first.status_code == 201, first.text
    file_id = first.json()["id"]
    assert first.json()["is_image"] is True
    assert first.json()["width"] == 32

    # Re-finalizing returns the same file row instead of creating a duplicate.
    second = admin_client.post(f"/api/v1/uploads/{session['session_id']}/finalize")
    assert second.status_code == 201, second.text
    assert second.json()["id"] == file_id

    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        files = list(db.scalars(select(CommissionFile)))
        objects = list(db.scalars(select(StorageObject)))
        assert len(files) == 1
        assert len(objects) == 1
        assert objects[0].size_bytes == len(raw)


def test_finalize_rejects_size_mismatch(
    admin_client: TestClient, s3_storage: S3Storage
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()

    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "final.png",
            "content_type": "image/png",
            "size_bytes": len(raw) + 100,
        },
    ).json()
    _put_bytes(s3_storage, _key_from_url(session["upload_url"]), raw, "image/png")

    res = admin_client.post(f"/api/v1/uploads/{session['session_id']}/finalize")
    assert res.status_code == 400
    assert "size" in res.json()["detail"]


def test_finalize_rejects_when_object_missing(
    admin_client: TestClient, s3_storage: S3Storage
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "ghost.png", "content_type": "image/png", "size_bytes": 10},
    ).json()
    # never PUT the bytes
    res = admin_client.post(f"/api/v1/uploads/{session['session_id']}/finalize")
    assert res.status_code == 409


def test_finalize_works_after_toggle_disabled(
    admin_client: TestClient, s3_storage: S3Storage
):
    """A session created while direct upload was enabled must remain
    finalizable even if the admin flips the toggle off mid-flight — otherwise
    bytes already in S3 would be stranded."""
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "midflight.png",
            "content_type": "image/png",
            "size_bytes": len(raw),
        },
    ).json()
    _put_bytes(s3_storage, _key_from_url(session["upload_url"]), raw, "image/png")

    # Toggle off after the PUT, before finalize
    admin_client.patch("/api/v1/settings/site", json={"allow_direct_upload": False})

    res = admin_client.post(f"/api/v1/uploads/{session['session_id']}/finalize")
    assert res.status_code == 201, res.text


def test_finalize_rejects_expired_session(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "stale.png",
            "content_type": "image/png",
            "size_bytes": len(raw),
        },
    ).json()
    _put_bytes(s3_storage, _key_from_url(session["upload_url"]), raw, "image/png")

    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        row = db.get(UploadSession, session["session_id"])
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    res = admin_client.post(f"/api/v1/uploads/{session['session_id']}/finalize")
    assert res.status_code == 410


# ---------------------------------------------------------------- cancel

def test_cancel_deletes_object_and_session(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "cancel.png",
            "content_type": "image/png",
            "size_bytes": len(raw),
        },
    ).json()
    key = _key_from_url(session["upload_url"])
    _put_bytes(s3_storage, key, raw, "image/png")

    res = admin_client.delete(f"/api/v1/uploads/{session['session_id']}")
    assert res.status_code == 204
    assert not s3_storage.exists(key)

    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        assert db.get(UploadSession, session["session_id"]) is None


def test_cancel_rejects_finalized_session(
    admin_client: TestClient, s3_storage: S3Storage
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "registered.png",
            "content_type": "image/png",
            "size_bytes": len(raw),
        },
    ).json()
    _put_bytes(s3_storage, _key_from_url(session["upload_url"]), raw, "image/png")
    finalized = admin_client.post(f"/api/v1/uploads/{session['session_id']}/finalize")
    assert finalized.status_code == 201

    res = admin_client.delete(f"/api/v1/uploads/{session['session_id']}")
    assert res.status_code == 409


# ---------------------------------------------------------------- cleanup

def test_cleanup_removes_expired_unfinalized_sessions_only(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()

    # finalized session — must be kept
    keep = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "keep.png",
            "content_type": "image/png",
            "size_bytes": len(raw),
        },
    ).json()
    _put_bytes(s3_storage, _key_from_url(keep["upload_url"]), raw, "image/png")
    admin_client.post(f"/api/v1/uploads/{keep['session_id']}/finalize")

    # unfinalized + expired — must be cleaned
    drop = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={
            "filename": "drop.png",
            "content_type": "image/png",
            "size_bytes": len(raw),
        },
    ).json()
    drop_key = _key_from_url(drop["upload_url"])
    _put_bytes(s3_storage, drop_key, raw, "image/png")

    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        row = db.get(UploadSession, drop["session_id"])
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    res = admin_client.post("/api/v1/uploads/cleanup")
    assert res.status_code == 200
    assert res.json()["cleaned"] == 1

    with TestSession() as db:
        assert db.get(UploadSession, drop["session_id"]) is None
        assert db.get(UploadSession, keep["session_id"]) is not None
    assert not s3_storage.exists(drop_key)


# ---------------------------------------------------------------- settings round-trip

def test_site_settings_round_trip_includes_direct_upload(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    initial = admin_client.get("/api/v1/settings/site").json()
    assert initial["allow_direct_upload"] is False

    _enable_direct_upload(admin_client)
    after = admin_client.get("/api/v1/settings/site").json()
    assert after["allow_direct_upload"] is True

    # Persisted in the singleton row
    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        row = db.get(AppSettings, 1)
        assert row is not None
        assert row.allow_direct_upload is True


# ---------------------------------------------------------------- agent-facing read endpoints

def test_list_node_uploads_returns_pending_only(
    admin_client: TestClient, s3_storage: S3Storage
):
    """Agents listing a node should see only the sessions that need their
    attention — finalized and cancelled sessions disappear from the listing."""
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()

    # one finalized
    s_finalized = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "done.png", "content_type": "image/png", "size_bytes": len(raw)},
    ).json()
    _put_bytes(s3_storage, _key_from_url(s_finalized["upload_url"]), raw, "image/png")
    assert (
        admin_client.post(f"/api/v1/uploads/{s_finalized['session_id']}/finalize").status_code
        == 201
    )

    # one cancelled
    s_cancelled = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "cancel.png", "content_type": "image/png", "size_bytes": len(raw)},
    ).json()
    admin_client.delete(f"/api/v1/uploads/{s_cancelled['session_id']}")

    # one still pending
    s_pending = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "wait.png", "content_type": "image/png", "size_bytes": len(raw)},
    ).json()

    res = admin_client.get(f"/api/v1/nodes/{node_id}/uploads")
    assert res.status_code == 200
    listed = res.json()
    assert [row["session_id"] for row in listed] == [s_pending["session_id"]]
    assert listed[0]["is_finalized"] is False
    assert listed[0]["is_expired"] is False
    assert listed[0]["filename"] == "wait.png"


def test_list_node_uploads_requires_admin(
    admin_client: TestClient, s3_storage: S3Storage
):
    """Write-scoped API keys are explicitly *not* admins — listing pending
    uploads is admin-only, mirroring create-session."""
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    key = admin_client.post(
        "/api/v1/api-keys", json={"name": "agent", "scopes": ["write"]}
    ).json()["full_key"]

    admin_client.post("/api/v1/auth/logout")
    res = admin_client.get(
        f"/api/v1/nodes/{node_id}/uploads",
        headers={"X-API-Key": key},
    )
    assert res.status_code == 400, res.text


def test_get_upload_session_status_pending_and_finalized(
    admin_client: TestClient, s3_storage: S3Storage
):
    """An agent that holds a session id can ask whether it's finalized yet,
    and after finalize the response carries the resulting commission_file_id."""
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "tracked.png", "content_type": "image/png", "size_bytes": len(raw)},
    ).json()

    before = admin_client.get(f"/api/v1/uploads/{session['session_id']}").json()
    assert before["is_finalized"] is False
    assert before["is_expired"] is False
    assert before["commission_file_id"] is None
    assert before["filename"] == "tracked.png"

    _put_bytes(s3_storage, _key_from_url(session["upload_url"]), raw, "image/png")
    finalized = admin_client.post(
        f"/api/v1/uploads/{session['session_id']}/finalize"
    )
    file_id = finalized.json()["id"]

    after = admin_client.get(f"/api/v1/uploads/{session['session_id']}").json()
    assert after["is_finalized"] is True
    assert after["is_expired"] is False
    assert after["commission_file_id"] == file_id


def test_get_upload_session_status_reports_expired(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    """A pending session past its presign TTL reports `is_expired=true`. We
    derive it server-side so agents don't have to parse timestamps."""
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "stale.png", "content_type": "image/png", "size_bytes": len(raw)},
    ).json()

    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        row = db.get(UploadSession, session["session_id"])
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

    status = admin_client.get(f"/api/v1/uploads/{session['session_id']}").json()
    assert status["is_expired"] is True
    assert status["is_finalized"] is False


def test_get_upload_session_404_for_missing_id(admin_client: TestClient):
    """An unknown session id returns 404 — important so agents can distinguish
    "I lost the session" from "the server failed". No fixture / toggle needed
    because the endpoint short-circuits on the missing row before touching
    storage."""
    res = admin_client.get("/api/v1/uploads/does-not-exist")
    assert res.status_code == 404


# ---------------------------------------------------------------- defensive cleanup on node delete

def test_node_delete_cleans_pending_upload_bytes(
    admin_client: TestClient, s3_storage: S3Storage, engine
):
    """Deleting a node with pending direct-upload sessions must not leave
    orphan bytes in S3. The session row cascades on delete, so without this
    cleanup the keys would become permanent garbage that cleanup_expired_
    upload_sessions never sees."""
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "orphan.png", "content_type": "image/png", "size_bytes": len(raw)},
    ).json()
    key = _key_from_url(session["upload_url"])
    _put_bytes(s3_storage, key, raw, "image/png")
    assert s3_storage.exists(key)

    res = admin_client.delete(f"/api/v1/nodes/{node_id}")
    assert res.status_code == 204, res.text

    # bytes gone
    assert not s3_storage.exists(key)
    # session row gone too (FK cascade)
    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        assert db.get(UploadSession, session["session_id"]) is None


def test_node_delete_with_pending_session_does_not_abort_on_s3_failure(
    admin_client: TestClient,
    s3_storage: S3Storage,
    engine,
    monkeypatch: pytest.MonkeyPatch,
):
    """If S3 is unreachable while we're cleaning up orphans, the node delete
    must still succeed — partial cleanup is better than aborting and leaving
    the user stuck on a node they wanted gone."""
    _enable_direct_upload(admin_client)
    _, node_id = _create_commission(admin_client)
    raw = _png()
    session = admin_client.post(
        f"/api/v1/nodes/{node_id}/uploads",
        json={"filename": "flaky.png", "content_type": "image/png", "size_bytes": len(raw)},
    ).json()
    _put_bytes(s3_storage, _key_from_url(session["upload_url"]), raw, "image/png")

    def boom(*args, **kwargs):
        raise RuntimeError("simulated S3 outage")

    monkeypatch.setattr(s3_storage, "delete", boom)

    res = admin_client.delete(f"/api/v1/nodes/{node_id}")
    assert res.status_code == 204, res.text

    TestSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    with TestSession() as db:
        # session row cascaded with the node even though byte cleanup failed
        assert db.get(UploadSession, session["session_id"]) is None


# ---------------------------------------------------------------- helpers

def _key_from_url(url: str) -> str:
    # FakeS3Client returns URLs of the form
    # https://signed.example/<bucket>/<key>?op=...&expires=...
    prefix = "https://signed.example/direct-upload-test/"
    assert url.startswith(prefix), url
    return url[len(prefix) :].split("?", 1)[0]
