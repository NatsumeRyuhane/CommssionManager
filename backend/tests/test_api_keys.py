from fastapi.testclient import TestClient


def _create_key(admin_client: TestClient, *, name: str, scopes: list[str]) -> dict:
    res = admin_client.post("/api/v1/api-keys", json={"name": name, "scopes": scopes})
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["full_key"].startswith("cmgr_")
    assert data["prefix"] == data["full_key"][:12]
    return data


def test_read_scoped_api_key_authenticates_but_cannot_write(admin_client: TestClient):
    key = _create_key(admin_client, name="reader", scopes=["read"])
    headers = {"Authorization": f"Bearer {key['full_key']}"}

    me = admin_client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json() == {
        "authenticated": True,
        "kind": "api_key",
        "label": "reader",
        "can_write": False,
        "scopes": ["read"],
    }

    assert admin_client.get("/api/v1/commissions", headers=headers).status_code == 200
    write = admin_client.post("/api/v1/commissions", json={"title": "blocked"}, headers=headers)
    assert write.status_code == 401

    listed = admin_client.get("/api/v1/api-keys").json()
    row = next(item for item in listed if item["id"] == key["id"])
    assert row["last_used_at"] is not None
    assert "full_key" not in row


def test_write_scoped_api_key_can_edit_but_cannot_administer_keys(admin_client: TestClient):
    key = _create_key(admin_client, name="writer", scopes=["write"])
    headers = {"X-API-Key": key["full_key"]}

    create = admin_client.post(
        "/api/v1/commissions", json={"title": "Created by key"}, headers=headers
    )
    assert create.status_code == 201, create.text

    manage_keys = admin_client.post(
        "/api/v1/api-keys",
        json={"name": "not allowed", "scopes": ["read"]},
        headers=headers,
    )
    assert manage_keys.status_code == 403


def test_revoked_api_key_is_no_longer_accepted(admin_client: TestClient):
    key = _create_key(admin_client, name="temporary", scopes=["write"])
    headers = {"Authorization": f"Bearer {key['full_key']}"}
    assert admin_client.get("/api/v1/auth/me", headers=headers).json()["authenticated"] is True

    revoked = admin_client.post(f"/api/v1/api-keys/{key['id']}/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None

    me = admin_client.get("/api/v1/auth/me", headers=headers).json()
    assert me["authenticated"] is False
    blocked = admin_client.post("/api/v1/commissions", json={"title": "blocked"}, headers=headers)
    assert blocked.status_code == 401
