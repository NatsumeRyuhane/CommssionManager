"""Delivery semantics of /raw and /image: cache headers + 304s on the streaming
path, and 302s to the CDN / signed URLs when an object-storage backend is active."""

import io
import re

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.storage.s3 import S3Storage
from tests.fake_s3 import FakeS3Client


def _png(width: int = 64, height: int = 48) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "#abcabc").save(buf, format="PNG")
    return buf.getvalue()


def _setup(
    admin_client: TestClient,
    filename: str = "art.png",
    content: bytes | None = None,
    content_type: str = "image/png",
) -> dict:
    res = admin_client.post(
        "/api/v1/commissions", json={"title": "Delivery test", "node_names": ["Delivered"]}
    )
    assert res.status_code == 201, res.text
    commission_id = res.json()["id"]
    node = next(item for item in res.json()["nodes"] if item["name"] == "Delivered")
    res = admin_client.post(
        f"/api/v1/nodes/{node['id']}/files",
        files={"upload": (filename, content if content is not None else _png(), content_type)},
    )
    assert res.status_code == 201, res.text
    return {**res.json(), "commission_id": commission_id}


def _checksum(admin_client: TestClient) -> str:
    return admin_client.get("/api/v1/exports/database.json").json()["storage_objects"][-1][
        "checksum"
    ]


# ---------------------------------------------------------------- local streaming


def test_public_raw_sets_validators_and_honors_if_none_match(
    client: TestClient, admin_client: TestClient
):
    file = _setup(admin_client)
    etag = f'"{_checksum(admin_client)}"'
    admin_client.post("/api/v1/auth/logout")

    res = client.get(f"/api/v1/files/{file['id']}/raw")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=86400"
    assert res.headers["etag"] == etag
    assert "last-modified" in res.headers

    res = client.get(f"/api/v1/files/{file['id']}/raw", headers={"If-None-Match": etag})
    assert res.status_code == 304
    assert res.content == b""

    # weak-validator and wildcard forms also revalidate
    res = client.get(f"/api/v1/files/{file['id']}/raw", headers={"If-None-Match": f"W/{etag}"})
    assert res.status_code == 304
    res = client.get(f"/api/v1/files/{file['id']}/raw", headers={"If-None-Match": '"nope"'})
    assert res.status_code == 200


def test_admin_only_raw_is_never_shared_cacheable(admin_client: TestClient):
    file = _setup(admin_client, "source.txt", b"layered secrets", "text/plain")
    res = admin_client.get(f"/api/v1/files/{file['id']}/raw")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "private, no-store"


def test_public_image_derivative_is_shared_cacheable(
    client: TestClient, admin_client: TestClient
):
    file = _setup(admin_client)
    admin_client.post("/api/v1/auth/logout")
    res = client.get(f"/api/v1/files/{file['id']}/image?size=thumb")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=86400"


def test_image_streaming_sets_validators_and_honors_if_none_match(
    client: TestClient, admin_client: TestClient
):
    file = _setup(admin_client)
    admin_client.post("/api/v1/auth/logout")
    res = client.get(f"/api/v1/files/{file['id']}/image?size=thumb")
    assert res.status_code == 200
    etag = res.headers["etag"]
    assert "last-modified" in res.headers

    res = client.get(
        f"/api/v1/files/{file['id']}/image?size=thumb", headers={"If-None-Match": etag}
    )
    assert res.status_code == 304
    assert res.content == b""

    # a different representation must not match the validator
    res = client.get(
        f"/api/v1/files/{file['id']}/image?size=small", headers={"If-None-Match": etag}
    )
    assert res.status_code == 200


def test_same_filename_uploads_no_longer_collide(admin_client: TestClient):
    file = _setup(admin_client)
    res = admin_client.post(
        f"/api/v1/nodes/{file['node_id']}/files",
        files={"upload": ("art.png", _png(), "image/png")},
    )
    assert res.status_code == 201, res.text


def test_upload_keys_carry_a_random_segment(admin_client: TestClient):
    _setup(admin_client)
    key = admin_client.get("/api/v1/exports/database.json").json()["storage_objects"][-1]["key"]
    assert re.fullmatch(r"commissions/\d+/nodes/\d+/[0-9a-f]{32}/art\.png", key), key


# ---------------------------------------------------------------- object storage 302s


@pytest.fixture
def s3_storage(monkeypatch: pytest.MonkeyPatch) -> S3Storage:
    """Swap the app's storage for a fake-client S3 driver with a CDN domain."""
    storage = S3Storage(
        FakeS3Client(),
        "test-bucket",
        cdn_base_url="https://cdn.example.com",
        signed_url_ttl=600,
    )
    monkeypatch.setattr("app.api.v1.routers.files.get_storage", lambda: storage)
    monkeypatch.setattr("app.images.get_storage", lambda: storage)
    return storage


def test_public_raw_redirects_to_cdn(
    client: TestClient, admin_client: TestClient, s3_storage: S3Storage
):
    file = _setup(admin_client)
    admin_client.post("/api/v1/auth/logout")
    res = client.get(f"/api/v1/files/{file['id']}/raw", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://cdn.example.com/commissions/")
    assert res.headers["cache-control"] == "public, max-age=300"


def test_private_raw_redirects_to_signed_url(admin_client: TestClient, s3_storage: S3Storage):
    file = _setup(admin_client, "source.txt", b"layered secrets", "text/plain")
    res = admin_client.get(f"/api/v1/files/{file['id']}/raw", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://signed.example/test-bucket/")
    assert res.headers["location"].endswith("expires=600")
    assert res.headers["cache-control"] == "private, no-store"


def test_public_raw_without_cdn_falls_back_to_signed_url(
    client: TestClient, admin_client: TestClient, s3_storage: S3Storage
):
    s3_storage.cdn_base_url = None
    file = _setup(admin_client)
    admin_client.post("/api/v1/auth/logout")
    res = client.get(f"/api/v1/files/{file['id']}/raw", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://signed.example/")
    assert res.headers["cache-control"] == "private, no-store"


def test_raw_redirect_opt_out_streams_bytes(admin_client: TestClient, s3_storage: S3Storage):
    content = _png()
    file = _setup(admin_client, content=content)
    res = admin_client.get(f"/api/v1/files/{file['id']}/raw?redirect=0")
    assert res.status_code == 200
    assert res.content == content


def test_public_image_redirects_to_cdn_derivative(
    client: TestClient, admin_client: TestClient, s3_storage: S3Storage
):
    file = _setup(admin_client)  # eager generation built derivatives into the fake bucket
    admin_client.post("/api/v1/auth/logout")
    res = client.get(f"/api/v1/files/{file['id']}/image?size=thumb", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://cdn.example.com/derivatives/")


def test_private_image_redirects_to_signed_url(
    admin_client: TestClient, s3_storage: S3Storage
):
    file = _setup(admin_client)
    res = admin_client.patch(
        f"/api/v1/commissions/{file['commission_id']}/visibility",
        json={"files": {file["id"]: "private"}},
    )
    assert res.status_code == 200, res.text
    res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=thumb", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://signed.example/test-bucket/derivatives/")
    assert res.headers["cache-control"] == "private, no-store"


def test_image_redirect_opt_out_streams_bytes(admin_client: TestClient, s3_storage: S3Storage):
    file = _setup(admin_client)
    res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=thumb&redirect=0")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/webp"
