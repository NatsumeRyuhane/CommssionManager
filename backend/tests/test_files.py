import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image


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
    assert uploaded["is_image"] is True
    assert uploaded["width"] == 31
    assert uploaded["height"] == 47
    assert uploaded["focal_x"] == 0.5
    assert uploaded["focal_y"] == 0.5

    served = admin_client.get(uploaded["url"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == raw


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


def test_delete_file_removes_it_from_api_results_and_raw_access(admin_client: TestClient):
    commission_id, node_id = _commission(admin_client)
    uploaded = _upload(admin_client, node_id, "final.png", _png(), "image/png")

    deleted = admin_client.delete(f"/api/v1/files/{uploaded['id']}")
    assert deleted.status_code == 204
    assert admin_client.get(uploaded["url"]).status_code == 404
    assert admin_client.get(f"/api/v1/commissions/{commission_id}/files").json() == []


@pytest.mark.xfail(
    reason="Deleting a cover file currently violates the cover_file_id FK; fix outside test branch.",
    strict=True,
)
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
