from fastapi.testclient import TestClient


def _make(admin_client: TestClient, title: str) -> None:
    res = admin_client.post("/api/v1/commissions", json={"title": title})
    assert res.status_code == 201


def test_pagination_and_total_count_header(admin_client: TestClient):
    for i in range(3):
        _make(admin_client, f"Piece {i}")

    first = admin_client.get("/api/v1/commissions", params={"limit": 2, "offset": 0})
    assert first.headers["X-Total-Count"] == "3"
    assert len(first.json()) == 2

    second = admin_client.get("/api/v1/commissions", params={"limit": 2, "offset": 2})
    assert second.headers["X-Total-Count"] == "3"
    assert len(second.json()) == 1


def test_total_count_reflects_filter(admin_client: TestClient):
    _make(admin_client, "Alpha")
    _make(admin_client, "Beta")
    res = admin_client.get("/api/v1/commissions", params={"q": "Alpha"})
    assert res.headers["X-Total-Count"] == "1"
    assert len(res.json()) == 1


def test_limit_bounds_are_validated(admin_client: TestClient):
    assert admin_client.get("/api/v1/commissions", params={"limit": 0}).status_code == 422
    assert admin_client.get("/api/v1/commissions", params={"limit": 999}).status_code == 422
