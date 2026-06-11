import io
import random
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from threading import Event

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.storage import get_storage


def _png(width: int = 30, height: int = 40, color: str = "#abcabc") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _commission(admin_client: TestClient) -> tuple[int, int]:
    res = admin_client.post(
        "/api/v1/commissions", json={"title": "File test", "node_names": ["Delivered"]}
    )
    assert res.status_code == 201, res.text
    body = res.json()
    node = next(item for item in body["nodes"] if item["name"] == "Delivered")
    return body["id"], node["id"]


def _upload(
    admin_client: TestClient,
    node_id: int,
    filename: str,
    content: bytes,
    content_type: str,
    *,
    label: str | None = None,
) -> dict:
    res = admin_client.post(
        f"/api/v1/nodes/{node_id}/files",
        data={"label": label} if label is not None else None,
        files={"upload": (filename, content, content_type)},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _block_storage_save(monkeypatch: pytest.MonkeyPatch) -> tuple[Event, Event]:
    save_started = Event()
    release_save = Event()
    storage = get_storage()
    original_save = storage.save

    def blocked_save(key: str, data: bytes):
        save_started.set()
        if not release_save.wait(timeout=5):
            raise TimeoutError("test did not release blocked storage save")
        return original_save(key, data)

    monkeypatch.setattr(storage, "save", blocked_save)
    return save_started, release_save


def test_upload_records_image_metadata_and_serves_raw_bytes(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    raw = _png(width=31, height=47)

    uploaded = _upload(
        admin_client,
        node_id,
        "final.png",
        raw,
        "image/png",
        label="final render",
    )

    assert uploaded["format"] == "png"
    assert uploaded["label"] == "final render"
    assert uploaded["position"] == 0
    assert uploaded["is_image"] is True
    assert uploaded["width"] == 31
    assert uploaded["height"] == 47
    assert uploaded["focal_x"] == 0.5
    assert uploaded["focal_y"] == 0.5
    assert uploaded["focal_zoom"] == 1.0

    served = admin_client.get(uploaded["url"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == raw


@pytest.mark.parametrize("seed", [7, 41, 20260607])
def test_randomized_parallel_uploads_receive_distinct_positions(
    admin_client: TestClient, seed: int
):
    commission_id, node_id = _commission(admin_client)
    randomizer = random.Random(seed)
    upload_ids = list(range(8))
    randomizer.shuffle(upload_ids)
    delays = {upload_id: randomizer.uniform(0, 0.03) for upload_id in upload_ids}

    def upload(index: int):
        time.sleep(delays[index])
        return admin_client.post(
            f"/api/v1/nodes/{node_id}/files",
            files={"upload": (f"parallel-{index}.png", _png(), "image/png")},
        )

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(upload, upload_ids))

    assert [result.status_code for result in results] == [201] * len(upload_ids)
    detail = admin_client.get(f"/api/v1/commissions/{commission_id}").json()
    files = next(node for node in detail["nodes"] if node["id"] == node_id)["files"]
    assert [file["position"] for file in files] == list(range(len(upload_ids)))


def test_move_waits_for_in_flight_upload_to_source_node(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    res = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Concurrent move test", "node_names": ["Sketching", "Delivered"]},
    )
    commission = res.json()
    source = next(node for node in commission["nodes"] if node["name"] == "Sketching")
    target = next(node for node in commission["nodes"] if node["name"] == "Delivered")
    existing = _upload(admin_client, source["id"], "existing.png", _png(), "image/png")
    save_started, release_save = _block_storage_save(monkeypatch)

    with ThreadPoolExecutor(max_workers=2) as executor:
        upload_future = executor.submit(
            admin_client.post,
            f"/api/v1/nodes/{source['id']}/files",
            files={"upload": ("concurrent.png", _png(), "image/png")},
        )
        assert save_started.wait(timeout=2)
        move_future = executor.submit(
            admin_client.patch,
            f"/api/v1/files/{existing['id']}/node",
            json={"node_id": target["id"]},
        )
        try:
            with pytest.raises(FutureTimeoutError):
                move_future.result(timeout=0.2)
        finally:
            release_save.set()
        assert upload_future.result(timeout=5).status_code == 201
        assert move_future.result(timeout=5).status_code == 200

    detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    source_files = next(node for node in detail["nodes"] if node["id"] == source["id"])["files"]
    target_files = next(node for node in detail["nodes"] if node["id"] == target["id"])["files"]
    assert [file["position"] for file in source_files] == [0]
    assert [file["id"] for file in target_files] == [existing["id"]]
    assert [file["position"] for file in target_files] == [0]


def test_delete_and_reorder_wait_for_in_flight_upload(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    commission_id, node_id = _commission(admin_client)
    first = _upload(admin_client, node_id, "first.png", _png(), "image/png")
    second = _upload(admin_client, node_id, "second.png", _png(), "image/png")
    save_started, release_save = _block_storage_save(monkeypatch)

    with ThreadPoolExecutor(max_workers=3) as executor:
        upload_future = executor.submit(
            admin_client.post,
            f"/api/v1/nodes/{node_id}/files",
            files={"upload": ("concurrent.png", _png(), "image/png")},
        )
        assert save_started.wait(timeout=2)
        delete_future = executor.submit(admin_client.delete, f"/api/v1/files/{first['id']}")
        reorder_future = executor.submit(
            admin_client.post,
            f"/api/v1/nodes/{node_id}/files/reorder",
            json={"file_ids": [second["id"], first["id"]]},
        )
        try:
            with pytest.raises(FutureTimeoutError):
                delete_future.result(timeout=0.2)
            with pytest.raises(FutureTimeoutError):
                reorder_future.result(timeout=0.2)
        finally:
            release_save.set()
        assert upload_future.result(timeout=5).status_code == 201
        assert delete_future.result(timeout=5).status_code == 204
        assert reorder_future.result(timeout=5).status_code == 400

    detail = admin_client.get(f"/api/v1/commissions/{commission_id}").json()
    files = next(node for node in detail["nodes"] if node["id"] == node_id)["files"]
    assert [file["position"] for file in files] == [0, 1]


def test_non_image_upload_has_no_dimensions_and_rejects_focal_point(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    uploaded = _upload(
        admin_client,
        node_id,
        "source.psd",
        b"not actually an image",
        "application/octet-stream",
    )

    assert uploaded["format"] == "psd"
    assert uploaded["is_image"] is False
    assert uploaded["width"] is None
    assert uploaded["height"] is None
    assert uploaded["focal_x"] is None
    assert uploaded["focal_y"] is None
    assert uploaded["focal_zoom"] is None

    focal = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/focal", data={"focal_x": "0.2", "focal_y": "0.8"}
    )
    assert focal.status_code == 400


def test_set_focal_point_clamps_to_image_bounds(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    uploaded = _upload(admin_client, node_id, "final.png", _png(), "image/png")

    focal = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/focal", data={"focal_x": "-0.2", "focal_y": "1.7"}
    )
    assert focal.status_code == 200
    assert focal.json()["focal_x"] == 0.0
    assert focal.json()["focal_y"] == 1.0
    # zoom untouched when omitted
    assert focal.json()["focal_zoom"] == 1.0


def test_set_focal_zoom_persists_and_clamps(admin_client: TestClient):
    _, node_id = _commission(admin_client)
    uploaded = _upload(admin_client, node_id, "final.png", _png(), "image/png")

    focal = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/focal",
        data={"focal_x": "0.3", "focal_y": "0.6", "focal_zoom": "1.8"},
    )
    assert focal.status_code == 200
    assert focal.json()["focal_zoom"] == 1.8

    too_small = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/focal",
        data={"focal_x": "0.3", "focal_y": "0.6", "focal_zoom": "0.4"},
    )
    assert too_small.json()["focal_zoom"] == 1.0

    too_large = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/focal",
        data={"focal_x": "0.3", "focal_y": "0.6", "focal_zoom": "11"},
    )
    assert too_large.json()["focal_zoom"] == 3.0


def test_move_file_between_nodes_in_same_commission(admin_client: TestClient):
    res = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Move file test", "node_names": ["Sketching", "Delivered"]},
    )
    assert res.status_code == 201, res.text
    commission = res.json()
    sketching = next(n for n in commission["nodes"] if n["name"] == "Sketching")
    delivered = next(n for n in commission["nodes"] if n["name"] == "Delivered")
    detached = next(n for n in commission["nodes"] if n["is_detached"])
    uploaded = _upload(admin_client, sketching["id"], "rough.png", _png(), "image/png")

    moved = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/node", json={"node_id": delivered["id"]}
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["node_id"] == delivered["id"]

    detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    delivered_files = next(n for n in detail["nodes"] if n["id"] == delivered["id"])["files"]
    sketching_files = next(n for n in detail["nodes"] if n["id"] == sketching["id"])["files"]
    assert [f["id"] for f in delivered_files] == [uploaded["id"]]
    assert sketching_files == []

    moved_to_detached = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/node", json={"node_id": detached["id"]}
    )
    assert moved_to_detached.status_code == 200, moved_to_detached.text
    assert moved_to_detached.json()["node_id"] == detached["id"]


def test_upload_move_delete_and_reorder_preserve_node_file_order(admin_client: TestClient):
    res = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Order files test", "node_names": ["Sketching", "Delivered"]},
    )
    assert res.status_code == 201, res.text
    commission = res.json()
    sketching = next(n for n in commission["nodes"] if n["name"] == "Sketching")
    delivered = next(n for n in commission["nodes"] if n["name"] == "Delivered")
    first = _upload(admin_client, delivered["id"], "first.png", _png(), "image/png")
    second = _upload(admin_client, delivered["id"], "second.png", _png(), "image/png")
    moved = _upload(admin_client, sketching["id"], "moved.png", _png(), "image/png")
    assert [first["position"], second["position"]] == [0, 1]

    moved_res = admin_client.patch(
        f"/api/v1/files/{moved['id']}/node", json={"node_id": delivered["id"]}
    )
    assert moved_res.status_code == 200, moved_res.text
    assert moved_res.json()["position"] == 2

    reordered_ids = [moved["id"], first["id"], second["id"]]
    reordered = admin_client.post(
        f"/api/v1/nodes/{delivered['id']}/files/reorder",
        json={"file_ids": reordered_ids},
    )
    assert reordered.status_code == 200, reordered.text
    assert [file["id"] for file in reordered.json()] == reordered_ids
    assert [file["position"] for file in reordered.json()] == [0, 1, 2]

    detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    delivered_files = next(n for n in detail["nodes"] if n["id"] == delivered["id"])["files"]
    assert [file["id"] for file in delivered_files] == reordered_ids

    deleted = admin_client.delete(f"/api/v1/files/{first['id']}")
    assert deleted.status_code == 204
    detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    delivered_files = next(n for n in detail["nodes"] if n["id"] == delivered["id"])["files"]
    assert [file["id"] for file in delivered_files] == [moved["id"], second["id"]]
    assert [file["position"] for file in delivered_files] == [0, 1]


def test_reorder_files_rejects_incomplete_or_cross_node_ids(admin_client: TestClient):
    res = admin_client.post(
        "/api/v1/commissions",
        json={"title": "Invalid file order test", "node_names": ["Sketching", "Delivered"]},
    )
    commission = res.json()
    sketching = next(n for n in commission["nodes"] if n["name"] == "Sketching")
    delivered = next(n for n in commission["nodes"] if n["name"] == "Delivered")
    first = _upload(admin_client, delivered["id"], "first.png", _png(), "image/png")
    second = _upload(admin_client, delivered["id"], "second.png", _png(), "image/png")
    other = _upload(admin_client, sketching["id"], "other.png", _png(), "image/png")

    incomplete = admin_client.post(
        f"/api/v1/nodes/{delivered['id']}/files/reorder",
        json={"file_ids": [first["id"]]},
    )
    assert incomplete.status_code == 400
    cross_node = admin_client.post(
        f"/api/v1/nodes/{delivered['id']}/files/reorder",
        json={"file_ids": [first["id"], other["id"]]},
    )
    assert cross_node.status_code == 400

    detail = admin_client.get(f"/api/v1/commissions/{commission['id']}").json()
    delivered_files = next(n for n in detail["nodes"] if n["id"] == delivered["id"])["files"]
    assert [file["id"] for file in delivered_files] == [first["id"], second["id"]]


def test_move_file_rejects_nodes_from_other_commissions(admin_client: TestClient):
    source_commission_id, source_node_id = _commission(admin_client)
    _, other_node_id = _commission(admin_client)
    uploaded = _upload(admin_client, source_node_id, "final.png", _png(), "image/png")

    moved = admin_client.patch(
        f"/api/v1/files/{uploaded['id']}/node", json={"node_id": other_node_id}
    )

    assert moved.status_code == 422
    files = admin_client.get(f"/api/v1/commissions/{source_commission_id}/files").json()
    assert files[0]["node_id"] == source_node_id


def test_move_file_requires_auth(client: TestClient):
    assert client.patch("/api/v1/files/1/node", json={"node_id": 1}).status_code == 401
    assert client.post("/api/v1/nodes/1/files/reorder", json={"file_ids": []}).status_code == 401


def test_delete_file_removes_it_from_api_results_and_raw_access(admin_client: TestClient):
    commission_id, node_id = _commission(admin_client)
    uploaded = _upload(admin_client, node_id, "final.png", _png(), "image/png")

    deleted = admin_client.delete(f"/api/v1/files/{uploaded['id']}")
    assert deleted.status_code == 204
    assert admin_client.get(uploaded["url"]).status_code == 404
    assert admin_client.get(f"/api/v1/commissions/{commission_id}/files").json() == []


def test_deleting_cover_file_clears_cover_and_uses_next_available_image(
    admin_client: TestClient,
):
    commission_id, node_id = _commission(admin_client)
    fallback = _upload(admin_client, node_id, "fallback.png", _png(color="#112233"), "image/png")
    explicit = _upload(admin_client, node_id, "cover.png", _png(color="#445566"), "image/png")

    set_cover = admin_client.patch(
        f"/api/v1/commissions/{commission_id}", json={"cover_file_id": explicit["id"]}
    )
    assert set_cover.status_code == 200
    assert set_cover.json()["cover"]["file_id"] == explicit["id"]

    deleted = admin_client.delete(f"/api/v1/files/{explicit['id']}")
    assert deleted.status_code == 204

    detail = admin_client.get(f"/api/v1/commissions/{commission_id}").json()
    assert detail["cover"]["file_id"] == fallback["id"]
    assert [file["id"] for node in detail["nodes"] for file in node["files"]] == [fallback["id"]]
