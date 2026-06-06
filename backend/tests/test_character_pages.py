import io

from fastapi.testclient import TestClient
from PIL import Image


def _png(width: int = 30, height: int = 40, color: str = "#abcabc") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _make_commission(
    admin_client: TestClient,
    *,
    title: str = "Cmsn",
    characters: list[str] | None = None,
) -> dict:
    res = admin_client.post(
        "/api/v1/commissions",
        json={
            "title": title,
            "character_names": characters or [],
            "node_names": ["Delivered"],
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _upload_image(admin_client: TestClient, node_id: int, filename: str = "a.png") -> dict:
    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/files",
        files={"upload": (filename, _png(), "image/png")},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _delivered_node(commission: dict) -> dict:
    return next(n for n in commission["nodes"] if n["name"] == "Delivered")


def _character_id(client: TestClient, name: str) -> int:
    res = client.get("/api/v1/characters", params={"q": name}).json()
    return next(c for c in res if c["name"] == name)["id"]


def _commission_with_cover(
    admin_client: TestClient,
    *,
    title: str,
    characters: list[str] | None = None,
) -> dict:
    """Create a commission and upload a Delivered (public) image so it has a public cover."""
    commission = _make_commission(admin_client, title=title, characters=characters)
    _upload_image(admin_client, _delivered_node(commission)["id"], f"{title}.png")
    return admin_client.get(f"/api/v1/commissions/{commission['id']}").json()


def test_character_lookup_has_page_flag_reflects_page_existence(admin_client: TestClient):
    _make_commission(admin_client, characters=["Heiyao"])
    chars = admin_client.get("/api/v1/characters").json()
    assert chars[0]["has_page"] is False

    char_id = chars[0]["id"]
    res = admin_client.put(f"/api/v1/characters/{char_id}/page", json={"about": "OC"})
    assert res.status_code == 200, res.text

    chars = admin_client.get("/api/v1/characters").json()
    assert chars[0]["has_page"] is True


def test_get_page_404_until_created(admin_client: TestClient):
    _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    assert admin_client.get(f"/api/v1/characters/{char_id}/page").status_code == 404


def test_upsert_creates_and_updates_page(admin_client: TestClient):
    commission = _commission_with_cover(
        admin_client, title="WithCover", characters=["Heiyao"]
    )
    char_id = _character_id(admin_client, "Heiyao")

    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={
            "about": "Primary OC",
            "main_reference_commission_id": commission["id"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["about"] == "Primary OC"
    assert body["main_reference"]["commission_id"] == commission["id"]
    assert body["main_reference"]["cover"]["file_id"] == commission["cover"]["file_id"]
    assert body["commission_count"] == 1

    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page", json={"about": "Updated"}
    )
    assert res.status_code == 200
    assert res.json()["about"] == "Updated"
    assert res.json()["main_reference"]["commission_id"] == commission["id"]

    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={"main_reference_commission_id": None},
    )
    assert res.status_code == 200
    assert res.json()["main_reference"] is None


def test_main_reference_rejects_unknown_commission(admin_client: TestClient):
    _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={"main_reference_commission_id": 9999},
    )
    assert res.status_code == 400


def test_set_and_item_crud_round_trip(admin_client: TestClient):
    cmsn_a = _commission_with_cover(admin_client, title="A", characters=["Heiyao"])
    cmsn_b = _commission_with_cover(admin_client, title="B", characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(f"/api/v1/characters/{char_id}/page", json={"about": "x"})

    create = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets",
        json={"title": "Portraits", "description": "Bust shots"},
    )
    assert create.status_code == 201, create.text
    set_id = create.json()["id"]
    assert create.json()["position"] == 0

    add = admin_client.post(
        f"/api/v1/character-page-sets/{set_id}/items",
        json={"commission_ids": [cmsn_a["id"], cmsn_b["id"]]},
    )
    assert add.status_code == 201, add.text
    assert [it["commission"]["commission_id"] for it in add.json()["items"]] == [
        cmsn_a["id"],
        cmsn_b["id"],
    ]
    # Each tile carries the commission's cover image.
    assert all(it["commission"]["cover"] for it in add.json()["items"])

    # Adding the same commission twice is a no-op.
    again = admin_client.post(
        f"/api/v1/character-page-sets/{set_id}/items",
        json={"commission_ids": [cmsn_a["id"]]},
    )
    assert again.status_code == 201
    assert len(again.json()["items"]) == 2

    item_ids = [it["id"] for it in again.json()["items"]]
    reorder = admin_client.post(
        f"/api/v1/character-page-sets/{set_id}/items/reorder",
        json={"item_ids": list(reversed(item_ids))},
    )
    assert reorder.status_code == 200
    assert [it["id"] for it in reorder.json()["items"]] == list(reversed(item_ids))

    delete_item = admin_client.delete(
        f"/api/v1/character-page-set-items/{item_ids[0]}"
    )
    assert delete_item.status_code == 204

    page = admin_client.get(f"/api/v1/characters/{char_id}/page").json()
    assert len(page["sets"]) == 1
    assert [it["id"] for it in page["sets"][0]["items"]] == [item_ids[1]]

    patch = admin_client.patch(
        f"/api/v1/character-page-sets/{set_id}",
        json={"title": "Portraits & headshots"},
    )
    assert patch.status_code == 200
    assert patch.json()["title"] == "Portraits & headshots"


def test_set_reorder_validates_ids(admin_client: TestClient):
    _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(f"/api/v1/characters/{char_id}/page", json={})

    s1 = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets", json={"title": "A"}
    ).json()
    s2 = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets", json={"title": "B"}
    ).json()
    s3 = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets", json={"title": "C"}
    ).json()

    reorder = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets/reorder",
        json={"set_ids": [s3["id"], s1["id"], s2["id"]]},
    )
    assert reorder.status_code == 200
    assert [s["id"] for s in reorder.json()] == [s3["id"], s1["id"], s2["id"]]
    assert [s["position"] for s in reorder.json()] == [0, 1, 2]

    bad = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets/reorder",
        json={"set_ids": [s1["id"], s2["id"]]},
    )
    assert bad.status_code == 400


def test_eligible_commissions_defaults_to_tagged_only(admin_client: TestClient):
    tagged = _commission_with_cover(
        admin_client, title="WithHeiyao", characters=["Heiyao"]
    )
    untagged = _commission_with_cover(admin_client, title="Other", characters=["Other"])
    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(f"/api/v1/characters/{char_id}/page", json={})

    only_tagged = admin_client.get(
        f"/api/v1/characters/{char_id}/page/eligible-commissions"
    ).json()
    assert [c["commission_id"] for c in only_tagged] == [tagged["id"]]

    all_cmsns = admin_client.get(
        f"/api/v1/characters/{char_id}/page/eligible-commissions",
        params={"only_tagged": "false"},
    ).json()
    assert sorted(c["commission_id"] for c in all_cmsns) == sorted(
        [tagged["id"], untagged["id"]]
    )


def test_eligible_commissions_can_exclude_set_members(admin_client: TestClient):
    cmsn_a = _commission_with_cover(admin_client, title="A", characters=["Heiyao"])
    cmsn_b = _commission_with_cover(admin_client, title="B", characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(f"/api/v1/characters/{char_id}/page", json={})
    set_row = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets", json={"title": "Refs"}
    ).json()
    admin_client.post(
        f"/api/v1/character-page-sets/{set_row['id']}/items",
        json={"commission_ids": [cmsn_a["id"]]},
    )

    res = admin_client.get(
        f"/api/v1/characters/{char_id}/page/eligible-commissions",
        params={"exclude_set_id": set_row["id"]},
    ).json()
    assert [c["commission_id"] for c in res] == [cmsn_b["id"]]


def test_public_view_hides_private_commissions(admin_client: TestClient):
    public_cmsn = _commission_with_cover(admin_client, title="Public", characters=["Heiyao"])
    private_cmsn = _commission_with_cover(admin_client, title="Hidden", characters=["Heiyao"])
    flip = admin_client.patch(
        f"/api/v1/commissions/{private_cmsn['id']}/visibility",
        json={"visibility": "private"},
    )
    assert flip.status_code == 200, flip.text

    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={"main_reference_commission_id": private_cmsn["id"]},
    )
    set_row = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets", json={"title": "Mix"}
    ).json()
    admin_client.post(
        f"/api/v1/character-page-sets/{set_row['id']}/items",
        json={"commission_ids": [public_cmsn["id"], private_cmsn["id"]]},
    )

    admin_view = admin_client.get(f"/api/v1/characters/{char_id}/page").json()
    assert admin_view["main_reference"]["commission_id"] == private_cmsn["id"]
    assert [
        it["commission"]["commission_id"] for it in admin_view["sets"][0]["items"]
    ] == [public_cmsn["id"], private_cmsn["id"]]

    assert admin_client.post("/api/v1/auth/logout").status_code == 200
    public_view = admin_client.get(f"/api/v1/characters/{char_id}/page").json()
    assert public_view["main_reference"] is None
    assert [
        it["commission"]["commission_id"] for it in public_view["sets"][0]["items"]
    ] == [public_cmsn["id"]]


def test_character_pages_directory_lists_pages_alphabetically(admin_client: TestClient):
    _make_commission(admin_client, characters=["Banzhi"])
    _make_commission(admin_client, characters=["Heiyao"])
    banzhi = _character_id(admin_client, "Banzhi")
    heiyao = _character_id(admin_client, "Heiyao")

    admin_client.put(f"/api/v1/characters/{heiyao}/page", json={"about": "OC"})
    directory = admin_client.get("/api/v1/character-pages").json()
    assert [it["character_id"] for it in directory] == [heiyao]
    assert directory[0]["commission_count_total"] == 1
    assert directory[0]["commission_count_in_db"] == 0

    admin_client.put(f"/api/v1/characters/{banzhi}/page", json={"about": "Other"})
    directory = admin_client.get("/api/v1/character-pages").json()
    assert [it["character_name"] for it in directory] == ["Banzhi", "Heiyao"]


def test_page_endpoints_require_auth(client: TestClient):
    assert client.put("/api/v1/characters/1/page", json={}).status_code == 401
    assert client.delete("/api/v1/characters/1/page").status_code == 401
    assert client.post(
        "/api/v1/characters/1/page/sets", json={"title": "x"}
    ).status_code == 401
    assert client.patch(
        "/api/v1/character-page-sets/1", json={"title": "x"}
    ).status_code == 401
    assert client.delete("/api/v1/character-page-sets/1").status_code == 401
    assert client.post(
        "/api/v1/character-page-sets/1/items", json={"commission_ids": []}
    ).status_code == 401
    assert client.delete("/api/v1/character-page-set-items/1").status_code == 401


def test_set_position_unique_constraint_survives_reorder(admin_client: TestClient):
    _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(f"/api/v1/characters/{char_id}/page", json={})
    ids = []
    for title in ("a", "b", "c"):
        res = admin_client.post(
            f"/api/v1/characters/{char_id}/page/sets", json={"title": title}
        )
        ids.append(res.json()["id"])

    res = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets/reorder", json={"set_ids": ids}
    )
    assert res.status_code == 200
    assert [s["position"] for s in res.json()] == [0, 1, 2]
