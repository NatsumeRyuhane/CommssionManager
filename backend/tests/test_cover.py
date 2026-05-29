import io

from fastapi.testclient import TestClient
from PIL import Image


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (30, 40), "#abcabc").save(buf, format="PNG")
    return buf.getvalue()


def _setup(admin_client: TestClient) -> tuple[int, int, int]:
    """Create a commission with one image file and one non-image file. Returns
    (commission_id, image_file_id, psd_file_id)."""
    c = admin_client.post(
        "/api/v1/commissions", json={"title": "Cover test", "node_names": ["Delivered"]}
    ).json()
    delivered = next(n for n in c["nodes"] if n["name"] == "Delivered")

    img = admin_client.post(
        f"/api/v1/nodes/{delivered['id']}/files",
        files={"upload": ("final.png", _png(), "image/png")},
    ).json()
    psd = admin_client.post(
        f"/api/v1/nodes/{delivered['id']}/files",
        files={"upload": ("final.psd", b"not-an-image", "application/octet-stream")},
    ).json()
    assert img["is_image"] is True
    assert psd["is_image"] is False
    return c["id"], img["id"], psd["id"]


def test_set_cover_to_image_file(admin_client: TestClient):
    cid, image_id, _ = _setup(admin_client)
    res = admin_client.patch(f"/api/v1/commissions/{cid}", json={"cover_file_id": image_id})
    assert res.status_code == 200
    detail = res.json()
    assert detail["cover"]["file_id"] == image_id
    cover_files = [f for n in detail["nodes"] for f in n["files"] if f["is_cover"]]
    assert [f["id"] for f in cover_files] == [image_id]


def test_cover_rejects_non_image_file(admin_client: TestClient):
    cid, _, psd_id = _setup(admin_client)
    res = admin_client.patch(f"/api/v1/commissions/{cid}", json={"cover_file_id": psd_id})
    assert res.status_code == 422


def test_cover_rejects_foreign_or_missing_file(admin_client: TestClient):
    cid, _, _ = _setup(admin_client)
    res = admin_client.patch(f"/api/v1/commissions/{cid}", json={"cover_file_id": 999999})
    assert res.status_code == 422
