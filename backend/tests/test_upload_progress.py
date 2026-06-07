import asyncio
from uuid import uuid4

from app.middleware.upload_progress import UploadProgressMiddleware
from app.upload_progress import UploadProgressRegistry, upload_progress


def test_upload_progress_is_visible_while_request_body_is_received():
    upload_id = str(uuid4())
    observations = []
    request_messages = iter(
        [
            {"type": "http.request", "body": b"1234", "more_body": True},
            {"type": "http.request", "body": b"567890", "more_body": False},
        ]
    )

    async def receive():
        return next(request_messages)

    async def send(_message):
        return None

    async def downstream(_scope, receive, send):
        await receive()
        observations.append(upload_progress.get(upload_id))
        await receive()
        observations.append(upload_progress.get(upload_id))
        await send({"type": "http.response.start", "status": 201, "headers": []})
        await send({"type": "http.response.body", "body": b"", "more_body": False})

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/nodes/1/files",
        "headers": [
            (b"x-upload-id", upload_id.encode()),
            (b"content-length", b"10"),
        ],
    }

    upload_progress.clear()
    asyncio.run(UploadProgressMiddleware(downstream)(scope, receive, send))

    assert observations[0].status == "receiving"
    assert observations[0].received_bytes == 4
    assert observations[0].percentage == 40
    assert observations[1].status == "processing"
    assert observations[1].received_bytes == 10
    assert observations[1].percentage == 100
    assert upload_progress.get(upload_id).status == "completed"
    upload_progress.clear()


def test_upload_progress_registry_discards_oldest_entry_at_capacity(monkeypatch):
    monkeypatch.setattr("app.upload_progress.MAX_PROGRESS_ENTRIES", 2)
    registry = UploadProgressRegistry()
    upload_ids = [str(uuid4()) for _ in range(3)]

    for upload_id in upload_ids:
        registry.start(upload_id, 100)

    assert registry.get(upload_ids[0]) is None
    assert registry.get(upload_ids[1]) is not None
    assert registry.get(upload_ids[2]) is not None
