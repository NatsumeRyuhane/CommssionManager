"""Coverage for Phase-1 of the taxonomy refactor: aliases and the
category/tag boundary on labels.

These tests treat the API surface as the source of truth; everything goes
through the admin client so we exercise the auth gate too.
"""
from fastapi.testclient import TestClient


# ---------------------------------------------------------------- labels


def test_create_label_with_type(admin_client: TestClient):
    res = admin_client.post("/api/v1/labels", json={"name": "Chibi", "type": "category"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Chibi"
    assert body["type"] == "category"
    assert body["aliases"] == []


def test_create_label_rejects_clashing_name_regardless_of_type(admin_client: TestClient):
    assert admin_client.post(
        "/api/v1/labels", json={"name": "Chibi", "type": "category"}
    ).status_code == 201
    dup = admin_client.post("/api/v1/labels", json={"name": "Chibi", "type": "tag"})
    assert dup.status_code == 409
    assert "already exists as a category" in dup.json()["detail"]


def test_update_label_blocks_tag_to_category(admin_client: TestClient):
    """
    Verify that labels of type "tag" cannot be changed to "category", while labels created as "category" can be changed to "tag".
    
    Creates a label with type "tag" and asserts a PATCH to change it to "category" is rejected with HTTP 400 and the error detail contains "Tags cannot be promoted". Then creates a label with type "category", patches it to "tag", and asserts the change succeeds with HTTP 200 and the updated label's `type` is "tag".
    """
    created = admin_client.post(
        "/api/v1/labels", json={"name": "rendered", "type": "tag"}
    )
    tag_id = created.json()["id"]
    bad = admin_client.patch(f"/api/v1/labels/{tag_id}", json={"type": "category"})
    assert bad.status_code == 400
    assert "Tags cannot be promoted" in bad.json()["detail"]
    # Reverse direction is allowed.
    cat = admin_client.post(
        "/api/v1/labels", json={"name": "Avatar", "type": "category"}
    ).json()
    ok = admin_client.patch(f"/api/v1/labels/{cat['id']}", json={"type": "tag"})
    assert ok.status_code == 200
    assert ok.json()["type"] == "tag"


def test_label_aliases_resolve_to_parent_and_appear_in_typeahead(admin_client: TestClient):
    """
    Verifies that label aliases attach to their parent label, resolve during commission creation, and appear in label typeahead searches.
    
    Creates a tag label, adds an alias, and asserts the alias is returned by the alias endpoint. Submits a commission using the alias and asserts the commission records the canonical label name and no duplicate label is created. Confirms typeahead queries match both the canonical name and the alias.
    """
    label = admin_client.post(
        "/api/v1/labels", json={"name": "background", "type": "tag"}
    ).json()
    add = admin_client.post(
        f"/api/v1/labels/{label['id']}/aliases", json={"alias": "BG"}
    )
    assert add.status_code == 201
    aliases = add.json()["aliases"]
    assert [a["alias"] for a in aliases] == ["BG"]

    # Submitting the alias name on a commission resolves to the existing label,
    # not a new one.
    commission = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": "alias hit",
            "tag_names": ["bg"],
            "category_names": [],
            "character_names": [],
            "artist_names": [],
        },
    )
    assert commission.status_code == 201, commission.text
    assert commission.json()["tags"] == ["background"]
    # Still only one label row.
    labels = admin_client.get("/api/v1/labels").json()
    assert [item["name"] for item in labels] == ["background"]

    # Typeahead matches both the canonical name and the alias.
    by_name = admin_client.get("/api/v1/labels", params={"q": "back"}).json()
    by_alias = admin_client.get("/api/v1/labels", params={"q": "bg"}).json()
    assert [item["name"] for item in by_name] == ["background"]
    assert [item["name"] for item in by_alias] == ["background"]


def test_typeahead_treats_like_wildcards_as_literals(admin_client: TestClient):
    percent = admin_client.post(
        "/api/v1/labels", json={"name": "100% complete", "type": "tag"}
    ).json()
    underscore = admin_client.post(
        "/api/v1/labels", json={"name": "underscore parent", "type": "tag"}
    ).json()
    slash = admin_client.post(
        "/api/v1/labels", json={"name": "slash parent", "type": "tag"}
    ).json()
    admin_client.post("/api/v1/labels", json={"name": "plain", "type": "tag"})
    admin_client.post(
        f"/api/v1/labels/{underscore['id']}/aliases", json={"alias": "under_score"}
    )
    admin_client.post(
        f"/api/v1/labels/{slash['id']}/aliases", json={"alias": r"slash\name"}
    )

    assert [
        row["id"] for row in admin_client.get("/api/v1/labels", params={"q": "%"}).json()
    ] == [percent["id"]]
    assert [
        row["id"] for row in admin_client.get("/api/v1/labels", params={"q": "_"}).json()
    ] == [underscore["id"]]
    assert [
        row["id"] for row in admin_client.get("/api/v1/labels", params={"q": "\\"}).json()
    ] == [slash["id"]]
    assert admin_client.get("/api/v1/labels", params={"q": "   "}).json() == []


def test_label_alias_rejects_collision_with_existing_name(admin_client: TestClient):
    admin_client.post("/api/v1/labels", json={"name": "background", "type": "tag"})
    other = admin_client.post(
        "/api/v1/labels", json={"name": "rendered", "type": "tag"}
    ).json()
    clash = admin_client.post(
        f"/api/v1/labels/{other['id']}/aliases", json={"alias": "Background"}
    )
    assert clash.status_code == 409


def test_delete_label_alias(admin_client: TestClient):
    """
    Verifies that removing a label alias deletes it from typeahead search while preserving the canonical label.
    
    Creates a label and an alias, deletes the alias, asserts the delete returns HTTP 204, confirms a typeahead query for the alias returns no results, and confirms the canonical label still exists and has no aliases.
    """
    label = admin_client.post(
        "/api/v1/labels", json={"name": "background", "type": "tag"}
    ).json()
    added = admin_client.post(
        f"/api/v1/labels/{label['id']}/aliases", json={"alias": "BG"}
    ).json()
    alias_id = added["aliases"][0]["id"]
    assert admin_client.delete(f"/api/v1/label-aliases/{alias_id}").status_code == 204
    # Typeahead by the deleted alias finds nothing; the parent label is unchanged.
    assert admin_client.get("/api/v1/labels", params={"q": "bg"}).json() == []
    parent = admin_client.get("/api/v1/labels", params={"q": "back"}).json()
    assert parent[0]["aliases"] == []


def test_commission_rejects_tag_used_as_category(admin_client: TestClient):
    admin_client.post("/api/v1/labels", json={"name": "rendered", "type": "tag"})
    bad = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": "wrong bucket",
            "category_names": ["rendered"],
            "tag_names": [],
            "character_names": [],
            "artist_names": [],
        },
    )
    assert bad.status_code == 400
    assert "already exists as a tag" in bad.json()["detail"]


# ---------------------------------------------------------------- characters


def test_character_alias_resolves_in_commission_write(admin_client: TestClient):
    aki = admin_client.post("/api/v1/characters", json={"name": "Aki"}).json()
    admin_client.post(
        f"/api/v1/characters/{aki['id']}/aliases", json={"alias": "アキ"}
    )

    commission = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": "alias hit",
            "character_names": ["アキ"],
            "category_names": [],
            "tag_names": [],
            "artist_names": [],
        },
    )
    assert commission.status_code == 201
    assert commission.json()["characters"] == ["Aki"]
    # Confirm no duplicate Character row.
    assert [c["name"] for c in admin_client.get("/api/v1/characters").json()] == ["Aki"]


def test_character_alias_typeahead_matches_aliases(admin_client: TestClient):
    """
    Verifies that searching characters by an alias returns the canonical character.
    
    Creates a character, adds an alias, and asserts that a typeahead query for the alias
    returns the canonical character name "Aki".
    """
    aki = admin_client.post("/api/v1/characters", json={"name": "Aki"}).json()
    admin_client.post(
        f"/api/v1/characters/{aki['id']}/aliases", json={"alias": "アキ"}
    )
    by_alias = admin_client.get("/api/v1/characters", params={"q": "アキ"}).json()
    assert [c["name"] for c in by_alias] == ["Aki"]


# ---------------------------------------------------------------- artists


def test_artist_alias_resolves_in_commission_write(admin_client: TestClient):
    """
    Verifies that an artist alias resolves to the canonical artist name when creating a commission.
    
    Creates an artist, adds an alias, submits a commission using the alias, and asserts the commission records the canonical artist name "TouMeiSheep".
    """
    art = admin_client.post(
        "/api/v1/artists", json={"name": "TouMeiSheep"}
    ).json()
    admin_client.post(
        f"/api/v1/artists/{art['id']}/aliases", json={"alias": "@toumeisheep"}
    )

    commission = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": "alias hit",
            "artist_names": ["@TouMeiSheep"],
            "category_names": [],
            "tag_names": [],
            "character_names": [],
        },
    )
    assert commission.status_code == 201
    assert commission.json()["artists"] == ["TouMeiSheep"]


# ---------------------------------------------------------------- auth


def test_taxonomy_management_requires_auth(client: TestClient):
    assert client.post("/api/v1/labels", json={"name": "x", "type": "tag"}).status_code == 401
    assert client.patch("/api/v1/labels/1", json={"name": "y"}).status_code == 401
    assert client.delete("/api/v1/labels/1").status_code == 401
    assert client.post(
        "/api/v1/labels/1/aliases", json={"alias": "x"}
    ).status_code == 401
    assert client.delete("/api/v1/label-aliases/1").status_code == 401
    assert client.post("/api/v1/characters", json={"name": "x"}).status_code == 401
    assert client.patch("/api/v1/characters/1", json={"name": "y"}).status_code == 401
    assert client.delete("/api/v1/characters/1").status_code == 401
    assert client.post(
        "/api/v1/characters/1/aliases", json={"alias": "x"}
    ).status_code == 401
    assert client.delete("/api/v1/character-aliases/1").status_code == 401
    assert client.post(
        "/api/v1/artists/1/aliases", json={"alias": "x"}
    ).status_code == 401
    assert client.delete("/api/v1/artist-aliases/1").status_code == 401
