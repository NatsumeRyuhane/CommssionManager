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
    assert admin_client.get(f"/api/v1/commissions/{commission['id']}/nodes").status_code == 404
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


def test_public_lifecycle_omits_private_stages_and_files(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Public lifecycle test", "node_names": ["Delivered", "Review"]},
    )
    assert created.status_code == 201, created.text
    commission = created.json()
    delivered = _node(commission, "Delivered")
    review = _node(commission, "Review")
    public_image = _upload_image(admin_client, delivered["id"], "public.png", "#111111")
    hidden_image = _upload_image(admin_client, delivered["id"], "hidden.png", "#222222")
    review_image = _upload_image(admin_client, review["id"], "review.png", "#333333")

    patched = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}/visibility",
        json={"files": {hidden_image["id"]: "private"}},
    )
    assert patched.status_code == 200, patched.text

    admin_detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    assert [node["name"] for node in admin_detail["nodes"] if not node["is_detached"]] == [
        "Delivered",
        "Review",
    ]
    assert {
        file["id"] for node in admin_detail["nodes"] for file in node["files"]
    } == {public_image["id"], hidden_image["id"], review_image["id"]}

    admin_client.cookies.clear()

    public_detail = admin_client.get(f"/api/v1/commissions/{commission['id']}")
    assert public_detail.status_code == 200
    body = public_detail.json()
    assert [node["name"] for node in body["nodes"]] == ["Delivered"]
    assert [file["id"] for file in body["nodes"][0]["files"]] == [public_image["id"]]

    public_nodes = admin_client.get(f"/api/v1/commissions/{commission['id']}/nodes")
    assert public_nodes.status_code == 200
    assert [node["name"] for node in public_nodes.json()] == ["Delivered"]
    assert [file["id"] for file in public_nodes.json()[0]["files"]] == [public_image["id"]]

    public_images = admin_client.get(f"/api/v1/commissions/{commission['id']}/images")
    assert public_images.status_code == 200
    assert [image["id"] for image in public_images.json()] == [public_image["id"]]
    assert admin_client.get(hidden_image["url"]).status_code == 404
    assert admin_client.get(review_image["url"]).status_code == 404


def test_detached_node_and_files_cannot_be_public(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Detached privacy test", "node_names": ["Delivered"]},
    )
    assert created.status_code == 201, created.text
    commission = created.json()
    detached = next(node for node in commission["nodes"] if node["is_detached"])
    detached_image = _upload_image(admin_client, detached["id"], "detached.png", "#111111")

    publish_node = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}/visibility",
        json={"nodes": {detached["id"]: "public"}},
    )
    assert publish_node.status_code == 422
    assert publish_node.json()["detail"] == "The detached node must remain private"

    publish_file = admin_client.patch(
        f"/api/v1/commissions/{commission['id']}/visibility",
        json={"files": {detached_image["id"]: "public"}},
    )
    assert publish_file.status_code == 422
    assert publish_file.json()["detail"] == "Files in the detached node must remain private"

    visibility = admin_client.get(f"/api/v1/commissions/{commission['id']}/visibility").json()
    detached_visibility = next(node for node in visibility["nodes"] if node["is_detached"])
    assert detached_visibility["effective_visibility"] == "private"
    assert detached_visibility["files"][0]["effective_visibility"] == "private"

    admin_client.cookies.clear()
    assert admin_client.get(detached_image["url"]).status_code == 404
    # the only file is detached (private), so visitors don't see the
    # commission at all — not even an empty shell
    assert admin_client.get(f"/api/v1/commissions/{commission['id']}/images").status_code == 404
    assert admin_client.get(f"/api/v1/commissions/{commission['id']}").status_code == 404


def test_public_detail_redacts_fields_marked_private(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": "Sensitive title",
            "description": "private notes",
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


def test_commission_without_public_files_is_hidden_from_visitors(admin_client: TestClient):
    # no files at all
    empty = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Empty", "node_names": ["Delivered"]},
    ).json()
    # one file, but its stage is private
    hidden = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Hidden file", "node_names": ["Delivered"]},
    ).json()
    hidden_image = _upload_image(admin_client, _node(hidden, "Delivered")["id"], "h.png", "#111111")
    res = admin_client.patch(
        f"/api/v1/commissions/{hidden['id']}/visibility",
        json={"files": {hidden_image["id"]: "private"}},
    )
    assert res.status_code == 200, res.text
    # one public file
    shown = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Shown", "node_names": ["Delivered"]},
    ).json()
    _upload_image(admin_client, _node(shown, "Delivered")["id"], "s.png", "#222222")

    admin_list = admin_client.get("/api/v1/commissions")
    assert {item["id"] for item in admin_list.json()} == {empty["id"], hidden["id"], shown["id"]}

    admin_client.cookies.clear()
    public_list = admin_client.get("/api/v1/commissions")
    assert [item["id"] for item in public_list.json()] == [shown["id"]]
    assert admin_client.get(f"/api/v1/commissions/{empty['id']}").status_code == 404
    assert admin_client.get(f"/api/v1/commissions/{hidden['id']}").status_code == 404
    assert admin_client.get(f"/api/v1/commissions/{shown['id']}").status_code == 200

    login = admin_client.post(
        "/api/v1/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert login.status_code == 200
    assert admin_client.get(f"/api/v1/commissions/{empty['id']}").status_code == 200
