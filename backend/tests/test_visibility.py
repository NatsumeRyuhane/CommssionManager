import io

from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import settings


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


def test_public_images_honor_stage_and_file_visibility(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Visibility test", "node_names": ["Sketching", "Delivered"]},
    )
    assert created.status_code == 201, created.text
    commission = created.json()
    sketching = _node(commission, "Sketching")
    delivered = _node(commission, "Delivered")
    sketch_image = _upload_image(admin_client, sketching["id"], "sketch.png", "#222222")
    delivered_image = _upload_image(admin_client, delivered["id"], "delivered.png", "#111111")

    public = admin_client.get(f"/api/v1/commissions/{commission['id']}/images")
    assert public.status_code == 200
    assert [item["id"] for item in public.json()] == [delivered_image["id"]]

    visibility = admin_client.get(f"/api/v1/commissions/{commission['id']}/visibility")
    assert visibility.status_code == 200
    stage_visibility = {row["name"]: row["effective_visibility"] for row in visibility.json()["nodes"]}
    assert stage_visibility["Sketching"] == "private"
    assert stage_visibility["Delivered"] == "public"

    patched = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}/visibility",
        json={
            "nodes": {delivered["id"]: "private"},
            "files": {sketch_image["id"]: "public"},
        },
    )
    assert patched.status_code == 200, patched.text

    public = admin_client.get(f"/api/v1/commissions/{commission['id']}/images")
    assert [item["id"] for item in public.json()] == [sketch_image["id"]]

    private = admin_client.get(
        f"/api/v1/commissions/{commission['id']}/images", params={"visibility": "private"}
    )
    assert [item["id"] for item in private.json()] == [delivered_image["id"]]


def test_private_commission_is_hidden_from_public_list_detail_and_raw_file(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Private commission", "node_names": ["Delivered"]},
    )
    assert created.status_code == 201, created.text
    commission = created.json()
    delivered = _node(commission, "Delivered")
    image = _upload_image(admin_client, delivered["id"], "delivered.png", "#111111")

    hidden = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}/visibility",
        json={"visibility": "private"},
    )
    assert hidden.status_code == 200, hidden.text

    admin_client.cookies.clear()
    public_list = admin_client.get("/api/v1/commissions")
    assert public_list.status_code == 200
    assert public_list.json() == []
    assert admin_client.get(f"/api/v1/commissions/{commission['id']}").status_code == 404
    assert admin_client.get(image["url"]).status_code == 404
    assert admin_client.get(f"/api/v1/commissions/{commission['id']}/files").status_code == 401
    assert admin_client.get(f"/api/v1/commissions/{commission['id']}/copy-json").status_code == 401

    login = admin_client.post(
        "/api/v1/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert login.status_code == 200

    assert admin_client.get(f"/api/v1/commissions/{commission['id']}").status_code == 200
    assert admin_client.get(image["url"]).status_code == 200
    all_files = admin_client.get(f"/api/v1/commissions/{commission['id']}/files")
    assert all_files.status_code == 200
    assert [item["id"] for item in all_files.json()] == [image["id"]]


def test_public_detail_redacts_fields_marked_private(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": "Sensitive title",
            "description": "private notes",
            "completed_at": "2026-05-01",
            "confirmed_at": "2026-04-20T12:00:00Z",
            "price_amount": "125.00",
            "price_currency": "USD",
            "rating": "mature",
            "category_names": ["Reference"],
            "tag_names": ["spoiler"],
            "character_names": ["Heiyao"],
            "artist_names": ["Natsume Ryuhane"],
            "node_names": ["Delivered"],
        },
    )
    assert created.status_code == 201, created.text
    commission = created.json()
    delivered = _node(commission, "Delivered")
    image = _upload_image(admin_client, delivered["id"], "delivered.png", "#111111")

    patched = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}/visibility",
        json={
            "fields": {
                "title": False,
                "description": False,
                "labels": False,
                "rating": False,
                "characters": False,
                "artists": False,
                "completed_at": False,
                "confirmed_at": False,
                "price": False,
            }
        },
    )
    assert patched.status_code == 200, patched.text

    admin_client.cookies.clear()
    listed = admin_client.get("/api/v1/commissions")
    assert listed.status_code == 200
    public_item = listed.json()[0]
    assert public_item["title"] == f"#{commission['id']}"
    assert public_item["rating"] is None
    assert public_item["completed_at"] is None
    assert public_item["categories"] == []
    assert public_item["tags"] == []
    assert public_item["characters"] == []
    assert public_item["artists"] == []
    assert public_item["cover"]["file_id"] == image["id"]

    public_detail = admin_client.get(f"/api/v1/commissions/{commission['id']}")
    assert public_detail.status_code == 200
    body = public_detail.json()
    assert body["description"] is None
    assert body["confirmed_at"] is None
    assert body["price_amount"] is None
    assert body["price_currency"] is None

    login = admin_client.post(
        "/api/v1/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert login.status_code == 200
    admin_detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    assert admin_detail["title"] == "Sensitive title"
    assert admin_detail["rating"] == "mature"
    assert admin_detail["categories"] == ["Reference"]
    assert admin_detail["characters"] == ["Heiyao"]
    assert admin_detail["description"] == "private notes"
    assert admin_detail["price_amount"] == "125.00"
