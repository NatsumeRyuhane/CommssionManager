# Object storage on Cloudflare R2

Step-by-step setup for serving uploaded files from R2 (issue #20). Any S3-compatible
provider (AWS S3, MinIO, …) works the same way; only the token screen described below
and the literal `auto` region are R2-specific.

## 1. Create the bucket

Cloudflare dashboard → **R2 Object Storage** → **Create bucket** (e.g. `commission-files`).
The default automatic location is fine.

## 2. Create a scoped API token

R2 → **Manage R2 API Tokens** → **Create API token**:

- Permissions: **Object Read & Write**
- Scope: **Apply to specific buckets only** → select your bucket (avoid account-wide tokens)
- TTL: forever is fine; you rotate manually (see below)

Cloudflare then shows a **one-time screen** with five values whose names do *not* match
this app's config keys. Mapping:

| Cloudflare shows      | Goes to (app config)                       | Notes                                                            |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| **Access Key ID**     | `…STORAGE_S3_ACCESS_KEY`                   | S3-compatible credential pair                                     |
| **Secret Access Key** | `…STORAGE_S3_SECRET_KEY`                   | shown only on this screen — copy it now                           |
| **S3 API Endpoint**   | `…STORAGE_S3_ENDPOINT`                     | already contains your account ID                                  |
| **API Token** (`cfat_…`) | **nowhere — do not use**                | Cloudflare REST API / Wrangler credential; this app speaks S3 only |
| **Account ID**        | nowhere directly                           | only appears embedded in the endpoint URL                         |

The region for R2 is always the literal string `auto` (the app's default).

## 3. Optional: public CDN domain

Bucket → **Settings** → **Public access** → **Custom Domains** → connect a domain you
manage on Cloudflare (e.g. `files.example.com`). Set it as `…STORAGE_CDN_BASE_URL`; public
files then 302 straight to the CDN while private files always use short-lived signed URLs.

Leave it unset to serve everything via signed URLs — that works fine, just without edge
caching for public files.

> A public bucket domain serves any object to whoever knows its exact key. The app's keys
> carry an unguessable 128-bit random segment to make that safe; never reuse the bucket for
> data with predictable keys.

## 4. Configure the app — which name goes where

There are two `.env` dialects, which is why the prefix differs by file:

- **`backend/.env`** (dev) is read directly by the API; pydantic applies the `CMGR_` prefix,
  so keys look like `CMGR_STORAGE_S3_BUCKET`.
- **`deploy/.env`** (prod) is read by docker compose for variable substitution; keys are
  **unprefixed** (`STORAGE_S3_BUCKET`) and `deploy/docker-compose.yml` maps each one into
  the matching `CMGR_*` variable inside the api container.
- **GitHub repository secrets/variables** (only if you automate deploys with Actions) follow
  the unprefixed `deploy/.env` names, because a deploy workflow writes `deploy/.env` on the
  runner — see the README's "Object storage + CDN" section for the two `gh` blocks. The
  repo's own CI (`.github/workflows/ci.yml`) uses none of these: the test suite covers the
  S3 driver with a fake client.

Dev — `backend/.env`:

```sh
CMGR_STORAGE_BACKEND=s3
CMGR_STORAGE_S3_BUCKET=commission-files
CMGR_STORAGE_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
CMGR_STORAGE_S3_REGION=auto
CMGR_STORAGE_S3_ACCESS_KEY=<Access Key ID>
CMGR_STORAGE_S3_SECRET_KEY=<Secret Access Key>
#CMGR_STORAGE_CDN_BASE_URL=https://files.example.com
#CMGR_STORAGE_SIGNED_URL_TTL=600
```

Prod — `deploy/.env`:

```sh
STORAGE_BACKEND=s3
STORAGE_S3_BUCKET=commission-files
STORAGE_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_S3_REGION=auto
STORAGE_S3_ACCESS_KEY=<Access Key ID>
STORAGE_S3_SECRET_KEY=<Secret Access Key>
#STORAGE_CDN_BASE_URL=https://files.example.com
#STORAGE_SIGNED_URL_TTL=600
```

## 5. Restart and migrate existing files

```sh
python3 main.py restart
python3 main.py storage status             # per-backend object counts
python3 main.py storage migrate --dry-run  # preview what would move
python3 main.py storage migrate            # copy into the bucket (source bytes retained)
```

Migration is resumable (commits per object) and never deletes the local source bytes;
remove `data/storage` contents manually once you've verified the cutover.

## 6. Optional: run the driver tests against live S3

The suite always tests the S3 driver with a dict-backed fake client, so neither local runs
nor CI need any S3 configuration. To *additionally* run the driver-contract tests
(round trip, missing-key handling, signed URLs) against a real bucket, provide
`CMGR_TEST_S3_*` — the live test leg skips whenever they're absent, mirroring the
`CMGR_TEST_DATABASE_URL` pattern.

Use a **dedicated test bucket with its own bucket-scoped token** — never the production
bucket. The tests write and delete a few tiny objects under `pytest-driver/`.

Locally:

```sh
export CMGR_TEST_S3_BUCKET=commission-files-test
export CMGR_TEST_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
export CMGR_TEST_S3_ACCESS_KEY=<access-key-id>
export CMGR_TEST_S3_SECRET_KEY=<secret-access-key>
python3 main.py test
```

In CI, the live legs run as their own **`S3 integration (live driver tests)`** check —
separate from `Backend (ruff + pytest)`, which stays hermetic on the fake client — so a red
S3-integration check means bucket connectivity or credentials, never app code. The job is
gated on the `TEST_S3_BUCKET` repository variable: when it's unset (unconfigured repos, fork
PRs) the check shows as skipped. Configure it with:

```sh
gh variable set TEST_S3_BUCKET   --body "commission-files-test"
gh variable set TEST_S3_ENDPOINT --body "https://<account-id>.r2.cloudflarestorage.com"
gh secret set TEST_S3_ACCESS_KEY --body "<access-key-id>"
gh secret set TEST_S3_SECRET_KEY --body "<secret-access-key>"
```

## 7. Rotating the credentials

R2 → Manage R2 API Tokens → delete the old token, create a new one (same scope), then
update the values everywhere they live — `backend/.env` / `deploy/.env` on the server and
the GitHub repository secrets if you set those up — and restart the stack. Treat any
credential that has appeared in a screenshot, chat, or log as already exposed and rotate it.
