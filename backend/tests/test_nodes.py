import io

from fastapi.testclient import TestClient
from PIL import Image


def _commission(client: TestClient, **overrides) -> dict:
    body = {"title": "Lifecycle test", "node_names": ["Sketching", "Delivered"], **overrides}
    res = client.post("/api/v1/commissions", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _regular(nodes: list[dict]) -> list[dict]:
    return [n for n in nodes if not n["is_detached"]]


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 50), "#cccccc").save(buf, format="PNG")
    return buf.getvalue()


def test_add_node_appends_at_end(admin_client: TestClient):
    c = _commission(admin_client)
    res = admin_client.post(f"/api/v1/commissions/{c['id']}/nodes", json={"name": "Color"})
    assert res.status_code == 201
    node = res.json()
    assert node["name"] == "Color"
    assert node["position"] == 2  # after Sketching(0), Delivered(1)
    assert node["is_detached"] is False


def test_rename_node(admin_client: TestClient):
    c = _commission(admin_client)
    sketching = _regular(c["nodes"])[0]
    res = admin_client.patch(f"/api/v1/nodes/{sketching['id']}", json={"name": "Rough"})
    assert res.status_code == 200
    assert res.json()["name"] == "Rough"


def test_update_node_started_at(admin_client: TestClient):
    c = _commission(admin_client)
    delivered = _regular(c["nodes"])[1]

    dated = admin_client.patch(
        f"/api/v1/nodes/{delivered['id']}", json={"started_at": "2026-05-29T00:00:00Z"}
    )
    assert dated.status_code == 200, dated.text
    assert dated.json()["started_at"].startswith("2026-05-29T00:00:00")

    cleared = admin_client.patch(f"/api/v1/nodes/{delivered['id']}", json={"started_at": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["started_at"] is None


def test_cannot_rename_or_delete_detached(admin_client: TestClient):
    c = _commission(admin_client)
    detached = next(n for n in c["nodes"] if n["is_detached"])
    assert admin_client.patch(f"/api/v1/nodes/{detached['id']}", json={"name": "x"}).status_code == 400
    assert (
        admin_client.patch(
            f"/api/v1/nodes/{detached['id']}", json={"started_at": "2026-05-29T00:00:00Z"}
        ).status_code
        == 400
    )
    assert admin_client.delete(f"/api/v1/nodes/{detached['id']}").status_code == 400


def test_reorder_nodes(admin_client: TestClient):
    c = _commission(admin_client)
    admin_client.post(f"/api/v1/commissions/{c['id']}/nodes", json={"name": "Color"})
    nodes = admin_client.get(f"/api/v1/commissions/{c['id']}/nodes").json()
    regular = _regular(nodes)
    reversed_ids = [n["id"] for n in reversed(regular)]
    res = admin_client.post(
        f"/api/v1/commissions/{c['id']}/nodes/reorder", json={"node_ids": reversed_ids}
    )
    assert res.status_code == 200
    out = res.json()
    assert [n["id"] for n in out] == reversed_ids
    assert [n["position"] for n in out] == [0, 1, 2]


def test_reorder_rejects_incomplete_id_set(admin_client: TestClient):
    c = _commission(admin_client)
    one_id = _regular(c["nodes"])[0]["id"]
    res = admin_client.post(
        f"/api/v1/commissions/{c['id']}/nodes/reorder", json={"node_ids": [one_id]}
    )
    assert res.status_code == 400


def test_delete_node_reparents_files_to_detached(admin_client: TestClient):
    c = _commission(admin_client)
    sketching = _regular(c["nodes"])[0]

    upload = admin_client.post(
        f"/api/v1/nodes/{sketching['id']}/files",
        files={"upload": ("rough.png", _png_bytes(), "image/png")},
    )
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]

    assert admin_client.delete(f"/api/v1/nodes/{sketching['id']}").status_code == 204

    detail = admin_client.get(f"/api/v1/commissions/{c['id']}").json()
    node_names = [n["name"] for n in detail["nodes"]]
    assert "Sketching" not in node_names
    detached = next(n for n in detail["nodes"] if n["is_detached"])
    assert file_id in [f["id"] for f in detached["files"]]


def test_node_management_requires_auth(client: TestClient):
    # anonymous create commission is blocked, so just probe the write endpoints directly
    assert client.post("/api/v1/commissions/1/nodes", json={"name": "x"}).status_code == 401
    assert client.delete("/api/v1/nodes/1").status_code == 401
