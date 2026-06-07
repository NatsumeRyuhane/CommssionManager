from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.upload_progress import normalize_upload_id, upload_progress

ASGIMessage = dict[str, Any]
Receive = Callable[[], Awaitable[ASGIMessage]]
Send = Callable[[ASGIMessage], Awaitable[None]]


class UploadProgressMiddleware:
    """Track request-body progress for file uploads carrying an X-Upload-ID UUID."""

    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        self.app = app

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Receive,
        send: Send,
    ) -> None:
        if not self._is_file_upload(scope):
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        upload_id = normalize_upload_id(headers.get("x-upload-id"))
        if upload_id is None:
            await self.app(scope, receive, send)
            return

        total_bytes = self._content_length(headers.get("content-length"))
        upload_progress.start(upload_id, total_bytes)
        response_status: int | None = None

        async def receive_with_progress() -> ASGIMessage:
            message = await receive()
            if message["type"] == "http.request":
                upload_progress.receive(
                    upload_id,
                    len(message.get("body", b"")),
                    complete=not message.get("more_body", False),
                )
            elif message["type"] == "http.disconnect":
                upload_progress.finish(upload_id, succeeded=False, detail="Client disconnected")
            return message

        async def send_with_progress(message: ASGIMessage) -> None:
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive_with_progress, send_with_progress)
        except Exception:
            upload_progress.finish(upload_id, succeeded=False, detail="Upload request failed")
            raise
        else:
            succeeded = response_status is not None and 200 <= response_status < 300
            detail = None if succeeded else f"Upload failed with HTTP status {response_status}"
            upload_progress.finish(upload_id, succeeded=succeeded, detail=detail)

    @staticmethod
    def _is_file_upload(scope: dict[str, Any]) -> bool:
        path = scope.get("path", "")
        return (
            scope.get("type") == "http"
            and scope.get("method") == "POST"
            and path.startswith("/api/v1/nodes/")
            and path.endswith("/files")
        )

    @staticmethod
    def _content_length(value: str | None) -> int | None:
        try:
            return int(value) if value is not None else None
        except ValueError:
            return None
