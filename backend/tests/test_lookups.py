from fastapi.testclient import TestClient


def _make(admin_client: TestClient, **overrides) -> None:
    body = {
        "title": "Lookup test",
        "category_names": [],
        "tag_names": [],
        "character_names": [],
        "artist_names": [],
        **overrides,
    }
    res = admin_client.post("/api/v1/commissions", json=body)
    assert res.status_code == 201, res.text


def test_lookup_endpoints_return_sorted_deduplicated_metadata(admin_client: TestClient):
    _make(
        admin_client,
        category_names=["Avatar", "Chibi"],
        tag_names=["rendered"],
        character_names=["Heiyao", "Banzhi"],
        artist_names=["Zeta", "Alpha"],
    )
    _make(
        admin_client,
        category_names=["Chibi"],
        tag_names=["background"],
        character_names=["Heiyao"],
        artist_names=["Alpha"],
    )

    labels = admin_client.get("/api/v1/labels").json()
    assert [(item["name"], item["type"]) for item in labels] == [
        ("Avatar", "category"),
        ("Chibi", "category"),
        ("background", "tag"),
        ("rendered", "tag"),
    ]

    categories = admin_client.get("/api/v1/labels", params={"type": "category"}).json()
    assert [item["name"] for item in categories] == ["Avatar", "Chibi"]
    assert {item["type"] for item in categories} == {"category"}

    characters = admin_client.get("/api/v1/characters").json()
    assert [item["name"] for item in characters] == ["Banzhi", "Heiyao"]

    artists = admin_client.get("/api/v1/artists").json()
    assert [item["name"] for item in artists] == ["Alpha", "Zeta"]
