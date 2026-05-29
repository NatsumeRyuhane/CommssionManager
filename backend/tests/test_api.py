from fastapi.testclient import TestClient


def _make_commission(client: TestClient, **overrides) -> dict:
    body = {
        "title": "Test piece",
        "rating": "general",
        "category_names": ["Chibi"],
        "tag_names": ["background"],
        "character_names": ["Heiyao"],
        "artist_names": ["Natsume Ryuhane"],
        "node_names": ["Sketching", "Delivered"],
        **overrides,
    }
    res = client.post("/api/v1/commissions", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_health(client: TestClient):
    assert client.get("/health").json() == {"status": "ok"}


def test_anonymous_is_read_only(client: TestClient):
    me = client.get("/api/v1/auth/me").json()
    assert me["authenticated"] is False
    assert me["can_write"] is False
    # writes are rejected without auth
    assert client.post("/api/v1/commissions", json={"title": "x"}).status_code == 401


def test_login_grants_write(admin_client: TestClient):
    me = admin_client.get("/api/v1/auth/me").json()
    assert me["authenticated"] is True
    assert me["kind"] == "admin"
    assert me["can_write"] is True


def test_create_adds_detached_node(admin_client: TestClient):
    data = _make_commission(admin_client)
    node_names = [n["name"] for n in data["nodes"]]
    # detached pinned first, then the requested stages
    assert node_names[0] == "Detached"
    assert "Sketching" in node_names and "Delivered" in node_names
    detached = [n for n in data["nodes"] if n["is_detached"]]
    assert len(detached) == 1


def test_get_and_list(admin_client: TestClient):
    created = _make_commission(admin_client, title="Banzhi pair")
    got = admin_client.get(f"/api/v1/commissions/{created['id']}").json()
    assert got["title"] == "Banzhi pair"
    assert got["categories"] == ["Chibi"]

    listing = admin_client.get("/api/v1/commissions").json()
    assert len(listing) == 1
    assert listing[0]["title"] == "Banzhi pair"


def test_list_filters_and_search(admin_client: TestClient):
    _make_commission(admin_client, title="Chibi one", category_names=["Chibi"])
    _make_commission(admin_client, title="Avatar two", category_names=["Avatar"])

    assert len(admin_client.get("/api/v1/commissions", params={"q": "Chibi"}).json()) == 1
    assert len(admin_client.get("/api/v1/commissions", params={"categories": "Avatar"}).json()) == 1
    assert len(admin_client.get("/api/v1/commissions").json()) == 2


def test_update_commission(admin_client: TestClient):
    created = _make_commission(admin_client)
    res = admin_client.patch(
        f"/api/v1/commissions/{created['id']}",
        json={"title": "Renamed", "tag_names": ["差分"]},
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["title"] == "Renamed"
    assert updated["tags"] == ["差分"]


def test_copy_json_shape_has_no_credentials(admin_client: TestClient):
    created = _make_commission(admin_client, completed_at="2024-09-12")
    payload = admin_client.get(f"/api/v1/commissions/{created['id']}/copy-json").json()
    assert payload["id"] == created["id"]
    assert payload["date"] == "2024-09-12"  # alias is emitted, not 'completed_date'
    assert payload["files_endpoint"].endswith(f"/commissions/{created['id']}/files")
    assert "key" not in payload and "api_key" not in payload and "credentials" not in payload


def test_delete_commission(admin_client: TestClient):
    created = _make_commission(admin_client)
    assert admin_client.delete(f"/api/v1/commissions/{created['id']}").status_code == 204
    assert admin_client.get(f"/api/v1/commissions/{created['id']}").status_code == 404
