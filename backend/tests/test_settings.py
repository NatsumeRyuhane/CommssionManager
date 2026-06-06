from fastapi.testclient import TestClient


def _create_key(admin_client: TestClient, *, name: str, scopes: list[str]) -> dict:
    res = admin_client.post("/api/v1/api-keys", json={"name": name, "scopes": scopes})
    assert res.status_code == 201, res.text
    return res.json()


def test_site_settings_are_public_with_default(client: TestClient):
    initial = client.get("/api/v1/settings/site")
    assert initial.status_code == 200, initial.text
    assert initial.json()["site_title"] == "Commissions"


def test_site_settings_are_admin_patchable(admin_client: TestClient):
    key = _create_key(admin_client, name="writer", scopes=["write"])
    blocked = admin_client.patch(
        "/api/v1/settings/site",
        json={"site_title": "Private header"},
        headers={"X-API-Key": key["full_key"]},
    )
    assert blocked.status_code == 403

    blank = admin_client.patch("/api/v1/settings/site", json={"site_title": "  "})
    assert blank.status_code == 422

    patched = admin_client.patch(
        "/api/v1/settings/site",
        json={"site_title": "Heiyao's commissions"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["site_title"] == "Heiyao's commissions"

    fetched = admin_client.get("/api/v1/settings/site")
    assert fetched.status_code == 200
    assert fetched.json()["site_title"] == "Heiyao's commissions"


def test_visibility_settings_are_admin_only_and_patchable(admin_client: TestClient):
    key = _create_key(admin_client, name="writer", scopes=["write"])
    headers = {"X-API-Key": key["full_key"]}

    blocked = admin_client.get("/api/v1/settings/visibility", headers=headers)
    assert blocked.status_code == 403

    initial = admin_client.get("/api/v1/settings/visibility")
    assert initial.status_code == 200, initial.text
    data = initial.json()
    assert data["preset"] == "public_by_default"
    assert data["default_commission_visibility"] == "public"
    assert data["default_stage_visibility"] == "private"
    assert data["fields"]["confirmed_at"] is False
    assert [row["stage_name"] for row in data["stage_defaults"]] == [
        "Sketching",
        "Lineart",
        "Color",
        "Delivered",
    ]
    assert {row["stage_name"]: row["visibility"] for row in data["stage_defaults"]}[
        "Delivered"
    ] == "public"

    patched = admin_client.patch(
        "/api/v1/settings/visibility",
        json={
            "preset": "custom",
            "default_stage_visibility": "public",
            "fields": {"price": True},
            "stage_defaults": [
                {
                    "stage_name": "Review",
                    "visibility": "private",
                    "position": 10,
                    "note": "client review",
                }
            ],
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["preset"] == "custom"
    assert body["default_stage_visibility"] == "public"
    assert body["fields"]["price"] is True
    assert {row["stage_name"]: row["visibility"] for row in body["stage_defaults"]}[
        "Review"
    ] == "private"


def test_storage_settings_are_read_only_environment_summary(admin_client: TestClient):
    res = admin_client.get("/api/v1/settings/storage")
    assert res.status_code == 200
    assert res.json()["backend"] == "local"
    assert res.json()["configurable_via"] == "environment"


def test_webhook_crud_is_admin_only(admin_client: TestClient):
    key = _create_key(admin_client, name="writer", scopes=["write"])
    headers = {"Authorization": f"Bearer {key['full_key']}"}

    blocked = admin_client.post(
        "/api/v1/settings/webhooks",
        json={"url": "https://example.com/hook", "events": ["commission.created"]},
        headers=headers,
    )
    assert blocked.status_code == 403

    created = admin_client.post(
        "/api/v1/settings/webhooks",
        json={
            "url": "https://example.com/hook",
            "events": ["commission.created", "commission.updated"],
        },
    )
    assert created.status_code == 201, created.text
    webhook = created.json()
    assert webhook["status"] == "active"
    assert webhook["events"] == ["commission.created", "commission.updated"]

    updated = admin_client.patch(
        f"/api/v1/settings/webhooks/{webhook['id']}",
        json={"is_enabled": False, "events": ["commission.delivered"]},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "disabled"
    assert updated.json()["events"] == ["commission.delivered"]

    listed = admin_client.get("/api/v1/settings/webhooks")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [webhook["id"]]

    deleted = admin_client.delete(f"/api/v1/settings/webhooks/{webhook['id']}")
    assert deleted.status_code == 204
    assert admin_client.get("/api/v1/settings/webhooks").json() == []
