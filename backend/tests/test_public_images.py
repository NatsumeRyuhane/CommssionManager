import io

from fastapi.testclient import TestClient
from PIL import Image


def _png(color: str) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), color).save(buf, format="PNG")
    return buf.getvalue()


def _node(comm: dict, name: str) -> dict:
    return next(node for node in comm["nodes"] if node["name"] == name)


def _upload_image(admin_client: TestClient, node_id: int, filename: str, color: str) -> dict:
    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/files",
        files={"upload": (filename, _png(color), "image/png")},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_public_images_are_regular_images_in_stage_order(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Timeline test", "node_names": ["Sketching", "Delivered", "Color"]},
    )
    assert created.status_code == 201, created.text
    commission = created.json()
    sketching = _node(commission, "Sketching")
    delivered = _node(commission, "Delivered")
    color = _node(commission, "Color")

    delivered_image = _upload_image(admin_client, delivered["id"], "delivered.png", "#111111")
    sketch_image = _upload_image(admin_client, sketching["id"], "sketch.png", "#222222")
    detached_later = _upload_image(admin_client, color["id"], "detached.png", "#333333")
    psd = admin_client.post(
        f"/api/v1/nodes/{delivered['id']}/files",
        files={"upload": ("source.psd", b"source", "application/octet-stream")},
    )
    assert psd.status_code == 201, psd.text

    set_cover = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}",
        json={"cover_file_id": delivered_image["id"]},
    )
    assert set_cover.status_code == 200
    show_sketch = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}/visibility",
        json={"files": {sketch_image["id"]: "public"}},
    )
    assert show_sketch.status_code == 200
    assert admin_client.delete(f"/api/v1/nodes/{color['id']}").status_code == 204

    images = admin_client.get(f"/api/v1/commissions/{commission['id']}/images").json()
    assert [item["id"] for item in images] == [sketch_image["id"], delivered_image["id"]]
    assert [item["is_cover"] for item in images] == [False, True]

    detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    detached = next(node for node in detail["nodes"] if node["is_detached"])
    assert [file["id"] for file in detached["files"]] == [detached_later["id"]]
