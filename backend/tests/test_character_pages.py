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
    match = next(c for c in res if c["name"] == name)
    return match["id"]


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
    commission = _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    ref = _upload_image(admin_client, _delivered_node(commission)["id"])

    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={"about": "Primary OC", "main_reference_file_id": ref["id"]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["about"] == "Primary OC"
    assert body["main_reference"]["id"] == ref["id"]
    assert body["commission_count"] == 1

    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={"about": "Updated"},
    )
    assert res.status_code == 200
    assert res.json()["about"] == "Updated"
    assert res.json()["main_reference"]["id"] == ref["id"]

    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page", json={"main_reference_file_id": None}
    )
    assert res.status_code == 200
    assert res.json()["main_reference"] is None


def test_main_reference_rejects_non_image_files(admin_client: TestClient):
    commission = _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    node_id = _delivered_node(commission)["id"]
    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/files",
        files={"upload": ("source.psd", b"raw", "application/octet-stream")},
    )
    assert res.status_code == 201
    psd_id = res.json()["id"]

    res = admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={"main_reference_file_id": psd_id},
    )
    assert res.status_code == 400


def test_set_and_item_crud_round_trip(admin_client: TestClient):
    commission = _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    node_id = _delivered_node(commission)["id"]
    file_a = _upload_image(admin_client, node_id, "a.png")
    file_b = _upload_image(admin_client, node_id, "b.png")
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
        json={"file_ids": [file_a["id"], file_b["id"]]},
    )
    assert add.status_code == 201, add.text
    assert [it["file"]["id"] for it in add.json()["items"]] == [file_a["id"], file_b["id"]]

    # adding the same file twice is a no-op
    add = admin_client.post(
        f"/api/v1/character-page-sets/{set_id}/items",
        json={"file_ids": [file_a["id"]]},
    )
    assert add.status_code == 201
    assert len(add.json()["items"]) == 2

    item_ids = [it["id"] for it in add.json()["items"]]
    reorder = admin_client.post(
        f"/api/v1/character-page-sets/{set_id}/items/reorder",
        json={"item_ids": list(reversed(item_ids))},
    )
    assert reorder.status_code == 200
    assert [it["id"] for it in reorder.json()["items"]] == list(reversed(item_ids))

    # delete single item
    delete_item = admin_client.delete(
        f"/api/v1/character-page-set-items/{item_ids[0]}"
    )
    assert delete_item.status_code == 204

    page = admin_client.get(f"/api/v1/characters/{char_id}/page").json()
    assert len(page["sets"]) == 1
    assert [it["id"] for it in page["sets"][0]["items"]] == [item_ids[1]]

    # update set
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


def test_eligible_images_defaults_to_tagged_only(admin_client: TestClient):
    tagged = _make_commission(admin_client, title="With Heiyao", characters=["Heiyao"])
    untagged = _make_commission(admin_client, title="Other", characters=["Other"])
    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(f"/api/v1/characters/{char_id}/page", json={})

    tagged_file = _upload_image(admin_client, _delivered_node(tagged)["id"], "yes.png")
    untagged_file = _upload_image(
        admin_client, _delivered_node(untagged)["id"], "no.png"
    )

    only_tagged = admin_client.get(
        f"/api/v1/characters/{char_id}/page/eligible-images"
    ).json()
    assert [it["id"] for it in only_tagged] == [tagged_file["id"]]

    all_images = admin_client.get(
        f"/api/v1/characters/{char_id}/page/eligible-images",
        params={"only_tagged": "false"},
    ).json()
    assert sorted(it["id"] for it in all_images) == sorted(
        [tagged_file["id"], untagged_file["id"]]
    )


def test_eligible_images_can_exclude_files_already_in_a_set(admin_client: TestClient):
    commission = _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    admin_client.put(f"/api/v1/characters/{char_id}/page", json={})
    node_id = _delivered_node(commission)["id"]
    file_a = _upload_image(admin_client, node_id, "a.png")
    file_b = _upload_image(admin_client, node_id, "b.png")
    set_row = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets", json={"title": "Refs"}
    ).json()
    admin_client.post(
        f"/api/v1/character-page-sets/{set_row['id']}/items",
        json={"file_ids": [file_a["id"]]},
    )

    res = admin_client.get(
        f"/api/v1/characters/{char_id}/page/eligible-images",
        params={"exclude_set_id": set_row["id"]},
    ).json()
    assert [it["id"] for it in res] == [file_b["id"]]


def test_public_view_hides_private_files(admin_client: TestClient):
    commission = _make_commission(admin_client, characters=["Heiyao"])
    char_id = _character_id(admin_client, "Heiyao")
    public_file = _upload_image(admin_client, _delivered_node(commission)["id"], "p.png")

    # Detached node is private by default; uploads there are private files.
    detached = next(n for n in commission["nodes"] if n["is_detached"])
    private_file = _upload_image(admin_client, detached["id"], "secret.png")

    admin_client.put(
        f"/api/v1/characters/{char_id}/page",
        json={"main_reference_file_id": private_file["id"]},
    )
    set_row = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets", json={"title": "Mix"}
    ).json()
    admin_client.post(
        f"/api/v1/character-page-sets/{set_row['id']}/items",
        json={"file_ids": [public_file["id"], private_file["id"]]},
    )

    admin_view = admin_client.get(f"/api/v1/characters/{char_id}/page").json()
    assert admin_view["main_reference"]["id"] == private_file["id"]
    assert [it["file"]["id"] for it in admin_view["sets"][0]["items"]] == [
        public_file["id"],
        private_file["id"],
    ]

    assert admin_client.post("/api/v1/auth/logout").status_code == 200
    public_view = admin_client.get(f"/api/v1/characters/{char_id}/page").json()
    assert public_view["main_reference"] is None
    assert [it["file"]["id"] for it in public_view["sets"][0]["items"]] == [
        public_file["id"]
    ]


def test_character_pages_directory_lists_pages_alphabetically(admin_client: TestClient):
    _make_commission(admin_client, characters=["Banzhi"])
    _make_commission(admin_client, characters=["Heiyao"])
    banzhi = _character_id(admin_client, "Banzhi")
    heiyao = _character_id(admin_client, "Heiyao")

    # Only Heiyao has a published page; the directory should not list Banzhi.
    admin_client.put(f"/api/v1/characters/{heiyao}/page", json={"about": "OC"})
    directory = admin_client.get("/api/v1/character-pages").json()
    assert [it["character_id"] for it in directory] == [heiyao]
    assert directory[0]["commission_count"] == 1

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
        "/api/v1/character-page-sets/1/items", json={"file_ids": []}
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

    # Identity-order reorder should still succeed; if the two-phase update is wrong
    # we'd hit the unique (page_id, position) constraint here.
    res = admin_client.post(
        f"/api/v1/characters/{char_id}/page/sets/reorder", json={"set_ids": ids}
    )
    assert res.status_code == 200
    assert [s["position"] for s in res.json()] == [0, 1, 2]
