from fastapi.testclient import TestClient


def _make(admin_client: TestClient, **overrides) -> dict:
    body = {
        "title": "Listing test",
        "description": "plain description",
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


def _set_stage_date(admin_client: TestClient, comm: dict, started_at: str) -> None:
    """The topmost stage's date stands in as the commission's date."""
    res = admin_client.patch(
        f"/api/v1/nodes/{_node(comm)['id']}", json={"started_at": started_at}
    )
    assert res.status_code == 200, res.text


def test_list_filters_can_be_combined_across_metadata_and_files(admin_client: TestClient):
    alpha = _make(
        admin_client,
        title="Moonlight chibi",
        description="soft lantern scene",
        category_names=["Chibi"],
        tag_names=["background"],
        character_names=["Heiyao", "Banzhi"],
        artist_names=["Natsume"],
    )
    _set_stage_date(admin_client, alpha, "2024-05-20T00:00:00Z")
    other = _make(
        admin_client,
        title="Avatar portrait",
        description="clean icon",
        rating="mature",
        category_names=["Avatar"],
        tag_names=["icon"],
        character_names=["Gengzi"],
        artist_names=["Other Artist"],
    )
    _set_stage_date(admin_client, other, "2023-03-04T00:00:00Z")

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


def test_new_commission_defaults_to_ongoing(admin_client: TestClient):
    created = _make(admin_client)
    assert created["status"] == "ongoing"


def test_status_filter(admin_client: TestClient):
    _make(admin_client, title="Still going")  # defaults to ongoing
    done = _make(admin_client, title="Wrapped up", status="completed")
    assert done["status"] == "completed"

    ongoing = admin_client.get("/api/v1/commissions", params={"status": "ongoing"})
    assert [item["title"] for item in ongoing.json()] == ["Still going"]

    completed = admin_client.get("/api/v1/commissions", params={"status": "completed"})
    assert [item["title"] for item in completed.json()] == ["Wrapped up"]

    # both states selected behaves like no status filter
    both = admin_client.get(
        "/api/v1/commissions", params=[("status", "ongoing"), ("status", "completed")]
    )
    assert {item["title"] for item in both.json()} == {"Still going", "Wrapped up"}


def test_status_round_trips_on_update(admin_client: TestClient):
    created = _make(admin_client, status="ongoing")
    patched = admin_client.patch(
        f"/api/v1/commissions/{created['id']}", json={"status": "completed"}
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "completed"
    # omitting status leaves it unchanged
    untouched = admin_client.patch(
        f"/api/v1/commissions/{created['id']}", json={"title": "renamed"}
    )
    assert untouched.json()["status"] == "completed"


def test_none_filter_matches_records_with_nothing_set(admin_client: TestClient):
    _make(admin_client, title="Has a category", category_names=["Chibi"])
    _make(admin_client, title="No category")

    only_none = admin_client.get(
        "/api/v1/commissions", params={"categories": "__none__"}
    )
    assert [item["title"] for item in only_none.json()] == ["No category"]

    # the sentinel ORs with concrete values: unset OR Chibi keeps both
    none_or_chibi = admin_client.get(
        "/api/v1/commissions",
        params=[("categories", "__none__"), ("categories", "Chibi")],
    )
    assert {item["title"] for item in none_or_chibi.json()} == {
        "Has a category",
        "No category",
    }

    # the sentinel works for the other taxonomy filters too — neither
    # commission has characters, so both match
    none_chars = admin_client.get(
        "/api/v1/commissions", params={"characters": "__none__"}
    )
    assert {item["title"] for item in none_chars.json()} == {
        "Has a category",
        "No category",
    }


def test_list_sorting_by_title_and_date(admin_client: TestClient):
    # "date" sorts by the topmost stage's start date
    _set_stage_date(admin_client, _make(admin_client, title="Charlie"), "2024-01-01T00:00:00Z")
    _set_stage_date(admin_client, _make(admin_client, title="alpha"), "2025-01-01T00:00:00Z")
    _set_stage_date(admin_client, _make(admin_client, title="Bravo"), "2023-01-01T00:00:00Z")

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
