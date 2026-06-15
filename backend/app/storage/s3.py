from __future__ import annotations

import hashlib
import mimetypes
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from app.storage.base import (
    ObjectMetadata,
    PresignedUpload,
    StorageBackendDriver,
    StoredFile,
)


class S3Storage(StorageBackendDriver):
    """S3-compatible object storage (Cloudflare R2, AWS S3, MinIO, ...).

    The boto3 client is injected so tests can substitute a fake; the factory builds
    the real one. `cdn_base_url` is the public domain mapped to the bucket — when
    set, `public_url` lets endpoints redirect public files straight to the CDN.
    """

    backend_name = "s3"

    def __init__(
        self,
        client,
        bucket: str,
        *,
        cdn_base_url: str | None = None,
        signed_url_ttl: int = 600,
    ) -> None:
        self.client = client
        self.bucket = bucket
        self.cdn_base_url = cdn_base_url.rstrip("/") if cdn_base_url else None
        self.signed_url_ttl = signed_url_ttl

    def save(self, key: str, data: bytes) -> StoredFile:
        content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
        self.client.put_object(
            Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
        )
        return StoredFile(
            backend=self.backend_name,
            bucket=self.bucket,
            key=key,
            size_bytes=len(data),
            checksum=hashlib.sha256(data).hexdigest(),
        )

    def read(self, key: str, *, bucket: str | None = None) -> bytes:
        from botocore.exceptions import ClientError

        try:
            res = self.client.get_object(Bucket=bucket or self.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                # FileNotFoundError is an OSError, matching LocalStorage's failure mode
                raise FileNotFoundError(key) from exc
            raise
        return res["Body"].read()

    def delete(self, key: str, *, bucket: str | None = None) -> None:
        # S3 DeleteObject is idempotent: deleting a missing key succeeds.
        self.client.delete_object(Bucket=bucket or self.bucket, Key=key)

    def exists(self, key: str, *, bucket: str | None = None) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=bucket or self.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                return False
            raise
        return True

    def public_url(self, key: str, *, bucket: str | None = None) -> str | None:
        if self.cdn_base_url is None:
            return None
        return f"{self.cdn_base_url}/{quote(key)}"

    def signed_url(
        self, key: str, *, bucket: str | None = None, ttl: int | None = None
    ) -> str | None:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket or self.bucket, "Key": key},
            ExpiresIn=ttl or self.signed_url_ttl,
        )

    def presign_upload(
        self,
        key: str,
        *,
        content_type: str,
        max_size_bytes: int,
        ttl: int = 900,
        bucket: str | None = None,
    ) -> PresignedUpload | None:
        # ContentType is part of the signed params, so the client MUST send the
        # same Content-Type header on the PUT or S3 rejects the signature. We
        # don't sign Content-Length here: presigned PUTs don't natively enforce
        # a max size; the finalize step verifies actual size from HeadObject.
        url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket or self.bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=ttl,
        )
        return PresignedUpload(
            url=url,
            method="PUT",
            headers={"Content-Type": content_type},
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl),
        )

    def head_object(
        self, key: str, *, bucket: str | None = None
    ) -> ObjectMetadata | None:
        from botocore.exceptions import ClientError

        try:
            res = self.client.head_object(Bucket=bucket or self.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                return None
            raise
        # Real S3 returns ETag wrapped in quotes; FakeS3Client may omit it.
        etag = res.get("ETag")
        if isinstance(etag, str):
            etag = etag.strip('"')
        return ObjectMetadata(
            size_bytes=int(res.get("ContentLength", 0)),
            content_type=res.get("ContentType"),
            etag=etag,
        )
