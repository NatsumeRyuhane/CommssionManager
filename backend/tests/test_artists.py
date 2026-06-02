from fastapi.testclient import TestClient


def test_artist_crud_manages_info_xml(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/artists",
        json={
            "name": "Natsume Ryuhane",
            "info_xml": '<artist><handle platform="twitter">@natsume</handle></artist>',
        },
    )
    assert created.status_code == 201, created.text
    artist = created.json()
    assert artist["name"] == "Natsume Ryuhane"
    assert 'platform="twitter"' in artist["info_xml"]

    updated = admin_client.patch(
        f"/api/v1/artists/{artist['id']}",
        json={
            "name": "Ryuhane",
            "info_xml": '<artist><handle platform="furaffinity">ryuhane</handle></artist>',
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Ryuhane"
    assert "furaffinity" in updated.json()["info_xml"]

    listed = admin_client.get("/api/v1/artists")
    assert listed.status_code == 200
    assert listed.json() == [updated.json()]

    deleted = admin_client.delete(f"/api/v1/artists/{artist['id']}")
    assert deleted.status_code == 204
    assert admin_client.get("/api/v1/artists").json() == []


def test_artist_names_must_be_unique(admin_client: TestClient):
    one = admin_client.post("/api/v1/artists", json={"name": "Alpha"})
    assert one.status_code == 201
    assert admin_client.post("/api/v1/artists", json={"name": "Alpha"}).status_code == 409

    two = admin_client.post("/api/v1/artists", json={"name": "Beta"})
    assert two.status_code == 201
    renamed = admin_client.patch(f"/api/v1/artists/{two.json()['id']}", json={"name": "Alpha"})
    assert renamed.status_code == 409


def test_artist_management_requires_auth(client: TestClient):
    assert client.post("/api/v1/artists", json={"name": "Alpha"}).status_code == 401
    assert client.patch("/api/v1/artists/1", json={"name": "Beta"}).status_code == 401
    assert client.delete("/api/v1/artists/1").status_code == 401
