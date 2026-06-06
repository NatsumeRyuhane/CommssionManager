# Architecture

Single-owner commission-art manager. Public read; admin login for edit; scoped API keys for agents.

## Components

```
React SPA (Vite)  ──/api──▶  FastAPI  ──▶  PostgreSQL
                                  └──▶  Storage layer (local FS now; S3/GCS later)
```

- **frontend/** — React + Vite + TS. Dev server proxies `/api` to the backend (`vite.config.ts`).
  Styling ported from the wireframe `styles.css` (Notion low-fi tokens in `src/styles/index.css`).
- **backend/** — FastAPI app (`app/main.py`) mounting `app/api/v1`. SQLAlchemy 2.x models in
  `app/models`, Pydantic I/O schemas in `app/schemas`, request → response mapping in
  `app/api/v1/crud.py`.
- **deploy/** — Docker Compose. `docker-compose.dev.yml` runs only Postgres for host-based dev;
  `docker-compose.yml` builds the full stack (db + api + web/nginx).

## Source Of Truth

- `docs/requirements.xml` is the original product/design brief. It is useful for intent, but parts
  have drifted from the implemented MVP.
- `docs/schema.dbml` is the current schema reference and should track the SQLAlchemy models plus
  Alembic migrations. When it conflicts with `requirements.xml`, use `schema.dbml` and the backend
  code as the current truth.
- `docs/TODO.md` is the roadmap/status ledger for what landed and what remains deferred.

Known drift from `requirements.xml`:
- Ratings are a first-class `commission_metadata.rating` enum, not a `labels` row linked through
  `commission_labels`.
- Settings are limited to character and artist XML blobs in Phase 1; full settings pages, outfits,
  weapons, webhooks, export flows, and richer visibility/privacy rules are deferred.
- Public image listing is implemented as stage-ordered image files that ignore detached nodes and
  enforce per-stage/per-file visibility.

## Auth model

- **Anonymous** — public read of commissions/images.
- **Admin** — username/password login (`/auth/login`) issues a JWT stored in an httpOnly cookie;
  full read+write.
- **API key** — `Authorization: Bearer cmgr_…` (or `X-API-Key`). Scopes: `read`, `write`.
  Stored as a SHA-256 hash; the full key is shown once on creation. Keys never appear in
  copy-JSON output.

Resolution lives in `app/auth/deps.py` (`get_principal`, `require_edit`).

## Storage abstraction

`app/storage` defines `StorageBackendDriver` (`save/read/delete/exists`). `StorageObject` rows
carry `backend`, `bucket`, `key`, `size_bytes`, `checksum` — adding S3/GCS means a new driver +
enum value, no schema change. The "commission folder" is a local-backend convention only
(`commissions/{id}/nodes/{node_id}/{filename}`).

## Data model notes

See `docs/schema.dbml` for the canonical schema. App-layer invariants:
- Exactly one `rating` per commission (stored on `commission_metadata.rating`).
- Each commission auto-creates one **detached node** (`is_detached=true`); deleting a regular
  node reparents its files there. Detached nodes and their files are always private.
- `cover_file_id` must point to an `is_image=true` file; deleting that file clears the explicit
  cover reference.
- Public lifecycle responses omit private stages and files. Detail pages show public displayable
  images in stage (timeline) order, ignoring detached.

## Agent integration

- REST API under `/api/v1` (OpenAPI at `/docs`).
- `GET /commissions/{id}/copy-json` returns the agent payload: internal id, key metadata, and
  `files_endpoint` / `public_images_endpoint` URLs — never credentials.
- **MCP server is deferred** (Phase 3): a thin wrapper over this REST API.
