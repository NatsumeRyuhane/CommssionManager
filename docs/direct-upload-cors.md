# Direct-to-S3 uploads — bucket CORS

When the **Settings → Storage → Direct uploads** toggle is on, browsers `PUT`
file bytes straight to the configured S3 bucket instead of routing them
through the app server. That cross-origin `PUT` is only allowed if the bucket
exposes the right CORS configuration; without it the browser blocks the
request and the UI surfaces a CORS-aware error.

This document spells out the required rule and shows how to apply it on the
providers we test against. Configure CORS **before** enabling the toggle.

## What the bucket must allow

| Setting          | Value(s)                                                              |
| ---------------- | --------------------------------------------------------------------- |
| Allowed origins  | The app's own origins (frontend dev origin + the deployed host)       |
| Allowed methods  | `PUT`, `HEAD`                                                         |
| Allowed headers  | `Content-Type` (the presign signs Content-Type; the browser must send it) |
| Exposed headers  | `ETag` (the finalize endpoint stores it as the object's checksum)     |
| Max age          | Any value ≥ `300` — the preflight only fires once per origin/method   |

The presigned URL embeds the bucket, key, and Content-Type — the browser
cannot upload anywhere else and cannot mutate the object key. The signature
TTL is 15 minutes by default (`CMGR_STORAGE_UPLOAD_URL_TTL`); a session that
expires before the PUT completes shows the user an explicit "expired" error
rather than silently retrying.

## Cloudflare R2

R2 takes a JSON CORS document on the bucket. From the dashboard:
**R2 → your bucket → Settings → CORS Policy**.

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://commissions.example.com"
    ],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

R2 returns `ETag` as a plain MD5 for single-PUT uploads. The finalize endpoint
stores it on the matching `storage_objects` row.

## AWS S3

S3 takes the same JSON document. From the console: **S3 → your bucket →
Permissions → Cross-origin resource sharing**.

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://commissions.example.com"
    ],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Or via the CLI:

```sh
aws s3api put-bucket-cors \
  --bucket your-bucket-name \
  --cors-configuration file://cors.json
```

## MinIO

MinIO's recent releases accept the same JSON document via `mc` or the admin
console. Example with `mc`:

```sh
mc anonymous set-json cors.json myalias/your-bucket
```

Some older MinIO builds permit cross-origin `PUT` by default; if you rely on
that, document the assumption in your deployment runbook so a MinIO upgrade
doesn't silently break direct uploads.

## Disabling direct uploads at the deployment level

If you operate in an environment where bucket CORS cannot be configured
(audited bucket policy, multi-tenant shared bucket, etc.), set the kill
switch:

```
CMGR_STORAGE_DIRECT_UPLOAD_ALLOWED=false
```

When this is `false` the admin toggle cannot be enabled at runtime — the
PATCH on `/settings/site` returns `400` with a deployment-level error. All
uploads continue to flow through the proxied multipart endpoint.

## Verifying

1. Configure CORS as above.
2. Enable the admin toggle under **Settings → Storage → Direct uploads**.
3. Reload an editor view and upload a file. Watch the browser DevTools
   Network panel for an `OPTIONS` preflight followed by a `PUT` to the
   bucket origin — the bytes never hit the app host.
4. The finalize call to `/api/v1/uploads/{session_id}/finalize` returns
   the registered file row.

If you see a CORS error, the UI surfaces it as
**"Direct upload failed — bucket CORS may not be configured for this origin."**
Disable the toggle to revert to proxied uploads while you fix the policy.
