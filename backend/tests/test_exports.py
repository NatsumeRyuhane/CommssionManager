import io
import zipfile

from fastapi.testclient import TestClient
from PIL import Image


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (24, 24), "#aaccee").save(buf, format="PNG")
    return buf.getvalue()


def _commission(admin_client: TestClient) -> dict:
    res = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": "Export test",
            "artist_names": ["Alpha Artist"],
            "character_names": ["Heiyao"],
            "node_names": ["Sketching", "Delivered"],
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_database_export_contains_metadata_without_file_bytes(admin_client: TestClient):
    commission = _commission(admin_client)
    delivered = next(node for node in commission["nodes"] if node["name"] == "Delivered")
    upload = admin_client.post(
        f"/api/v1/nodes/{delivered['id']}/files",
        files={"upload": ("final.png", _png(), "image/png")},
    )
    assert upload.status_code == 201, upload.text

    exported = admin_client.get("/api/v1/exports/database.json")

    assert exported.status_code == 200
    assert exported.headers["content-type"] == "application/json"
    body = exported.json()
    assert body["commissions"][0]["metadata"]["title"] == "Export test"
    assert body["artists"][0]["name"] == "Alpha Artist"
    assert body["storage_objects"][0]["key"].endswith("final.png")
    assert "access_token" not in exported.text


def test_file_export_zip_uses_commission_artist_node_layout(admin_client: TestClient):
    commission = _commission(admin_client)
    sketching = next(node for node in commission["nodes"] if node["name"] == "Sketching")
    delivered = next(node for node in commission["nodes"] if node["name"] == "Delivered")
    for node, filename in [(sketching, "rough.png"), (delivered, "final.png")]:
        upload = admin_client.post(
            f"/api/v1/nodes/{node['id']}/files",
            files={"upload": (filename, _png(), "image/png")},
        )
        assert upload.status_code == 201, upload.text

    exported = admin_client.get(
        "/api/v1/exports/files.zip", params={"commission_id": commission["id"]}
    )

    assert exported.status_code == 200
    assert exported.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(exported.content)) as zf:
        names = sorted(zf.namelist())
        assert names == [
            f"Alpha-Artist-{commission['id']}/Delivered/final.png",
            f"Alpha-Artist-{commission['id']}/Sketching/rough.png",
        ]
        assert zf.read(names[0])


def test_exports_require_auth(client: TestClient):
    assert client.get("/api/v1/exports/database.json").status_code == 401
    assert client.get("/api/v1/exports/files.zip").status_code == 401
