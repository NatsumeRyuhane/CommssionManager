import io
import zipfile

from fastapi.testclient import TestClient
from PIL import Image

from app import images
from app.storage import get_storage


def _png(width: int = 800, height: int = 600, color: str = "#abcabc") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _commission(admin_client: TestClient) -> tuple[int, int]:
    res = admin_client.post(
        "/api/v1/commissions", json={"title": "Derivative test", "node_names": ["Delivered"]}
    )
    assert res.status_code == 201, res.text
    body = res.json()
    node = next(item for item in body["nodes"] if item["name"] == "Delivered")
    return body["id"], node["id"]


def _upload(
    admin_client: TestClient,
    node_id: int,
    filename: str = "art.png",
    content: bytes | None = None,
    content_type: str = "image/png",
) -> dict:
    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/files",
        files={"upload": (filename, content if content is not None else _png(), content_type)},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _storage_object(admin_client: TestClient) -> dict:
    """The most recently created storage object row (id + checksum drive cache keys)."""
    res = admin_client.get("/api/v1/exports/database.json")
    assert res.status_code == 200
    objects = res.json()["storage_objects"]
    assert objects
    return objects[-1]


def _drop_derivatives(obj: dict) -> None:
    images.delete_derivatives(get_storage(), obj["id"], obj["checksum"])


def test_upload_eagerly_builds_all_presets(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    _upload(admin_client, node_id)
    obj = _storage_object(admin_client)
    storage = get_storage()
    for preset in images.PRESETS:
        key = images.derivative_key(obj["id"], obj["checksum"], preset, images.DEFAULT_FORMAT)
        assert storage.exists(key), f"missing eager derivative {key}"


def test_image_endpoint_serves_resized_webp(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=thumb")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "image/webp"
    with Image.open(io.BytesIO(res.content)) as im:
        assert max(im.size) == 240
        # aspect ratio preserved (800x600 -> 240x180)
        assert im.size == (240, 180)
    assert len(res.content) < len(_png())


def test_image_endpoint_format_param(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    for fmt, media in (("jpeg", "image/jpeg"), ("png", "image/png")):
        res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=thumb&format={fmt}")
        # first request may answer 202 while the variant builds; retry once
        if res.status_code == 202:
            res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=thumb&format={fmt}")
        assert res.status_code == 200, res.text
        assert res.headers["content-type"] == media


def test_image_endpoint_never_upscales(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id, content=_png(120, 90))
    res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=large")
    assert res.status_code == 200, res.text
    with Image.open(io.BytesIO(res.content)) as im:
        assert im.size == (120, 90)


def test_image_endpoint_validates_params(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    assert admin_client.get(f"/api/v1/files/{file['id']}/image?size=huge").status_code == 422
    assert (
        admin_client.get(f"/api/v1/files/{file['id']}/image?size=thumb&format=avif").status_code
        == 422
    )


def test_image_endpoint_rejects_non_image(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id, "notes.txt", b"hello", "text/plain")
    res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=thumb")
    assert res.status_code == 400


def test_cache_miss_answers_202_then_builds(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    obj = _storage_object(admin_client)
    _drop_derivatives(obj)

    res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=small")
    assert res.status_code == 202
    assert res.headers["cache-control"] == "no-store"
    # TestClient runs background tasks before returning, so the rebuild has landed
    res = admin_client.get(f"/api/v1/files/{file['id']}/image?size=small")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/webp"


def test_visibility_gate_matches_raw(client: TestClient, admin_client: TestClient):
    commission_id, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    # make the file private; anonymous viewers must get a 404, exactly like /raw
    res = admin_client.patch(
        f"/api/v1/commissions/{commission_id}/visibility",
        json={"files": {file["id"]: "private"}},
    )
    assert res.status_code == 200, res.text
    admin_client.post("/api/v1/auth/logout")
    assert client.get(f"/api/v1/files/{file['id']}/raw").status_code == 404
    assert client.get(f"/api/v1/files/{file['id']}/image?size=thumb").status_code == 404


def test_public_file_serves_derivative_anonymously(client: TestClient, admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    admin_client.post("/api/v1/auth/logout")
    res = client.get(f"/api/v1/files/{file['id']}/image?size=thumb")
    assert res.status_code in (200, 202)


def test_file_delete_cleans_derivatives(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    obj = _storage_object(admin_client)
    storage = get_storage()
    key = images.derivative_key(obj["id"], obj["checksum"], "thumb", images.DEFAULT_FORMAT)
    assert storage.exists(key)
    assert admin_client.delete(f"/api/v1/files/{file['id']}").status_code == 204
    for preset in images.PRESETS:
        assert not storage.exists(
            images.derivative_key(obj["id"], obj["checksum"], preset, images.DEFAULT_FORMAT)
        )


def test_commission_delete_cleans_originals_and_derivatives(admin_client: TestClient):
    commission_id, node_id = _commission(admin_client)
    _upload(admin_client, node_id)
    res = admin_client.get("/api/v1/exports/database.json")
    obj = res.json()["storage_objects"][-1]
    storage = get_storage()
    assert storage.exists(obj["key"])
    assert storage.exists(
        images.derivative_key(obj["id"], obj["checksum"], "thumb", images.DEFAULT_FORMAT)
    )

    assert admin_client.delete(f"/api/v1/commissions/{commission_id}").status_code == 204
    assert not storage.exists(obj["key"])
    for preset in images.PRESETS:
        assert not storage.exists(
            images.derivative_key(obj["id"], obj["checksum"], preset, images.DEFAULT_FORMAT)
        )
    # storage object row is gone too
    res = admin_client.get("/api/v1/exports/database.json")
    assert all(row["id"] != obj["id"] for row in res.json()["storage_objects"])


def test_file_out_exposes_image_urls(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    file = _upload(admin_client, node_id)
    assert file["url"].endswith("/raw")
    assert set(file["image_urls"]) == set(images.PRESETS)
    assert file["image_urls"]["thumb"] == f"/api/v1/files/{file['id']}/image?size=thumb"
    non_image = _upload(admin_client, node_id, "notes.txt", b"hello", "text/plain")
    assert non_image["image_urls"] is None


def test_export_zip_contains_only_originals(admin_client: TestClient):
    commission_id, node_id = _commission(admin_client)
    _upload(admin_client, node_id)
    res = admin_client.get(f"/api/v1/exports/files.zip?commission_id={commission_id}")
    assert res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
        names = zf.namelist()
    assert len(names) == 1
    assert all("derivatives" not in name for name in names)
    assert names[0].endswith("art.png")
