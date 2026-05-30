from fastapi.testclient import TestClient


def _make(admin_client: TestClient, **overrides) -> dict:
    body = {
        "title": "Listing test",
        "description": "plain description",
        "completed_at": "2024-01-01",
        "rating": "general",
        "category_names": [],
        "tag_names": [],
        "character_names": [],
        "artist_names": [],
        "node_names": ["Delivered"],
        **overrides,
    }
    res = admin_client.post("/api/v1/commissions", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _node(comm: dict, name: str = "Delivered") -> dict:
    return next(node for node in comm["nodes"] if node["name"] == name)


def test_list_filters_can_be_combined_across_metadata_and_files(admin_client: TestClient):
    alpha = _make(
        admin_client,
        title="Moonlight chibi",
        description="soft lantern scene",
        completed_at="2024-05-20",
        category_names=["Chibi"],
        tag_names=["background"],
        character_names=["Heiyao", "Banzhi"],
        artist_names=["Natsume"],
    )
    _make(
        admin_client,
        title="Avatar portrait",
        description="clean icon",
        completed_at="2023-03-04",
        rating="mature",
        category_names=["Avatar"],
        tag_names=["icon"],
        character_names=["Gengzi"],
        artist_names=["Other Artist"],
    )

    upload = admin_client.post(
        f"/api/v1/nodes/{_node(alpha)['id']}/files",
        files={"upload": ("source.psd", b"psd bytes", "application/octet-stream")},
    )
    assert upload.status_code == 201, upload.text

    params = [
        ("q", "lantern"),
        ("search_in", "description"),
        ("categories", "Chibi"),
        ("tags", "background"),
        ("rating", "general"),
        ("characters", "Heiyao"),
        ("artists", "Natsume"),
        ("formats", "psd"),
        ("date_from", "2024-01-01"),
        ("date_to", "2024-12-31"),
        ("char_min", "2"),
        ("char_max", "2"),
    ]
    res = admin_client.get("/api/v1/commissions", params=params)
    assert res.status_code == 200
    assert res.headers["X-Total-Count"] == "1"
    assert [item["title"] for item in res.json()] == ["Moonlight chibi"]

    title_only = admin_client.get(
        "/api/v1/commissions", params={"q": "lantern", "search_in": "title"}
    )
    assert title_only.headers["X-Total-Count"] == "0"
    assert title_only.json() == []


def test_list_sorting_by_title_and_date(admin_client: TestClient):
    _make(admin_client, title="Charlie", completed_at="2024-01-01")
    _make(admin_client, title="alpha", completed_at="2025-01-01")
    _make(admin_client, title="Bravo", completed_at="2023-01-01")

    by_title = admin_client.get(
        "/api/v1/commissions", params={"sort": "title", "order": "asc"}
    ).json()
    assert [item["title"] for item in by_title] == ["alpha", "Bravo", "Charlie"]

    by_date = admin_client.get(
        "/api/v1/commissions", params={"sort": "date", "order": "desc"}
    ).json()
    assert [item["title"] for item in by_date] == ["alpha", "Charlie", "Bravo"]


def test_update_preserves_unspecified_relationships_and_clears_supplied_lists(
    admin_client: TestClient,
):
    created = _make(
        admin_client,
        category_names=["Chibi"],
        tag_names=["soft", "background"],
        character_names=["Heiyao"],
        artist_names=["Natsume"],
    )

    tags_only = admin_client.patch(
        f"/api/v1/commissions/{created['id']}", json={"tag_names": ["rendered"]}
    )
    assert tags_only.status_code == 200
    assert tags_only.json()["categories"] == ["Chibi"]
    assert tags_only.json()["tags"] == ["rendered"]
    assert tags_only.json()["characters"] == ["Heiyao"]
    assert tags_only.json()["artists"] == ["Natsume"]

    cleared = admin_client.patch(
        f"/api/v1/commissions/{created['id']}",
        json={"category_names": [], "character_names": []},
    )
    assert cleared.status_code == 200
    body = cleared.json()
    assert body["categories"] == []
    assert body["tags"] == ["rendered"]
    assert body["characters"] == []
    assert body["artists"] == ["Natsume"]
