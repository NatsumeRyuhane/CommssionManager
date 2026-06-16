"""Dict-backed stand-in for boto3's S3 client (just the surface S3Storage touches)."""

from __future__ import annotations

import hashlib
import io
import mimetypes

from botocore.exceptions import ClientError


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.content_types: dict[tuple[str, str], str] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str | None = None):
        self.objects[(Bucket, Key)] = Body
        if ContentType:
            self.content_types[(Bucket, Key)] = ContentType

    def get_object(self, *, Bucket: str, Key: str):
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    # Deliberately raises code "404" while get_object raises "NoSuchKey" (matching
    # real S3, where HEAD responses carry no body and surface the bare status code)
    # so the suite exercises both missing-key branches in S3Storage.
    def head_object(self, *, Bucket: str, Key: str):
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        body = self.objects[(Bucket, Key)]
        content_type = (
            self.content_types.get((Bucket, Key))
            or mimetypes.guess_type(Key)[0]
            or "application/octet-stream"
        )
        return {
            "ContentLength": len(body),
            "ContentType": content_type,
            "ETag": f'"{hashlib.md5(body).hexdigest()}"',
        }

    def delete_object(self, *, Bucket: str, Key: str):
        self.objects.pop((Bucket, Key), None)
        self.content_types.pop((Bucket, Key), None)

    def generate_presigned_url(
        self, operation: str, *, Params: dict, ExpiresIn: int
    ) -> str:
        # `op` is appended for direct-upload tests that need to distinguish put
        # from get presigns; keep `expires=<n>` at the *end* so existing
        # assertions like `.endswith("expires=600")` keep working.
        return (
            f"https://signed.example/{Params['Bucket']}/{Params['Key']}"
            f"?op={operation}&expires={ExpiresIn}"
        )
