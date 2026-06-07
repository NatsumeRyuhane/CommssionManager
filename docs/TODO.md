# Commission Manager — Build TODO

> Persistent roadmap across sessions. Source of truth for what's done and what's next.
> Design inputs: `docs/requirements.xml`, `docs/schema.dbml`, wireframes (Claude Design handoff).
> `docs/requirements.xml` is the original design brief; `docs/schema.dbml` is the current backend
> schema reference. See `docs/architecture.md` for documented drift.

## Decisions (locked)

- **Backend:** Python 3.12 + FastAPI + SQLAlchemy 2.x + Alembic, Postgres 16.
- **Frontend:** React 18 + Vite + TypeScript. Styling ported from the wireframe `styles.css` (Notion low-fi, warm paper palette). Plain CSS + CSS vars, no UI framework.
- **Storage:** abstracted layer; `local` filesystem backend first, `s3`/`gcs` later with no schema change.
- **Auth:** public read; password/session login for admin edit; scoped API keys for machine/agent access.
- **Deploy:** Docker Compose, single-owner self-host. Dev-first.
- **Agents:** REST API + scoped API keys now. **MCP server deferred** (see Phase 3).

## Phase 1 — Core MVP (complete)

### Backend
- [x] Project scaffold (`backend/app`, config, db session)
- [x] SQLAlchemy models for all tables in `docs/schema.dbml`
- [x] Alembic baseline migration
- [x] Storage abstraction + local backend
- [x] Auth: admin password/session + API-key dependency (scopes: read / write)
- [x] REST API v1:
  - [x] `commissions` CRUD (+ metadata, labels, characters, artists)
  - [x] `commissions/{id}/files`, `/images?visibility=`
  - [x] `commissions/{id}/copy-json` (the documented agent payload, no credentials)
  - [x] list endpoint with search / filter / sort
  - [x] list pagination (`limit`/`offset`) + `X-Total-Count` header
  - [x] `labels`, `characters`, `artists` read
  - [x] Case-insensitive taxonomy uniqueness and literal typeahead matching
  - [x] file upload -> storage object, image dimension probe
  - [x] lifecycle node management (add/rename/reorder/delete + detached reparenting)
  - [x] `cover_file_id` validation (must be an image file of the commission; cleared on file delete)
- [x] Seed script with sample data for dev
- [x] Pytest harness + API coverage (auth, API keys, CRUD, filters/sort, files, nodes, cover, lookups, pagination)
- [x] Self-contained tests: ephemeral Postgres via `testcontainers` (no dependency on the dev
  compose stack; `CMGR_TEST_DATABASE_URL` overrides for CI)
- [x] GitHub Actions CI on pull requests and pushes to `main`: backend `ruff check` + `pytest`
  (against a Postgres service container) and frontend `pnpm build` (typecheck + bundle) run in
  parallel
- [x] Config: all settings required from env / `.env` (no in-code defaults); `.env.example` committed
- [x] Wire frontend gallery to read `X-Total-Count` (paginate beyond 60)

### Frontend
- [x] Vite + React + TS scaffold
- [x] Port `styles.css` + fonts
- [x] Primitives: Chip, Cover/ImgPh, FaGallery, filter popover, buttons
- [x] Pages: Auth gate, Home/Gallery, Detail, Add/Edit
- [x] API client + types (commissions, nodes, files, paged list)
- [x] Router + public-read / admin-edit gating
- [x] Edit page: lifecycle stage management (add/rename/reorder/delete)
- [x] Edit page: per-stage file upload/delete + set cover
- [x] Edit page: per-file upload percentage previews + red failure state
- [x] Lifecycle images: node-scoped viewer with keyboard/thumbnail navigation and
  original/large/medium/small image downloads
- [x] Edit page: Firefox-compatible drag-and-drop uploads + persisted file reorder within a stage
- [x] Gallery: total count (X-Total-Count) + load-more pagination
- [x] Focal-point reticle editor on uploaded images (Phase 2)
- [ ] Mobile layouts (Phase 2)

### Deploy
- [x] `deploy/docker-compose.dev.yml` (Postgres for local dev)
- [x] `deploy/docker-compose.yml` (full stack: db + api + web)
- [x] `deploy/.env.example` production configuration template with configurable app port and
  optional external database mode that skips bundled Postgres
- [x] Backend + frontend Dockerfiles, nginx for web
- [x] Reproducible frontend image: pin `packageManager` (pnpm) + `.npmrc` so the build doesn't
  float pnpm versions or fail on the minimum-release-age supply-chain gate
- [x] End-to-end verify of the full-stack compose build (db migrates + api serves + web/nginx
  proxies `/api`; verified `X-Total-Count` through the proxy)
- [x] Prod uploaded files bind-mount to repo-root `data/storage`; Postgres remains in a Docker
  named volume
- [x] `python3 main.py upgrade` for prod: stop app containers, discard non-runtime local changes,
  sync to upstream `main`, rebuild, and start
- [x] `python3 main.py uninstall --yes` removes local production containers, bundled database
  volume, and built images while retaining env files, uploads, and external databases
- [x] `python3 main.py` with no arguments prints the management CLI usage guide

## Phase 2 — Breadth (deferred)
- [x] Backend settings/admin surface:
  - [x] Site title setting
  - [x] Visibility preset settings + stage defaults
  - [x] Webhook endpoint config CRUD (delivery worker remains below)
  - [x] Storage config summary endpoint (env-driven, read-only)
- [x] Settings (admin): frontend UI for site title, API keys, visibility presets, and storage config
- [ ] Settings (admin): frontend UI for webhooks (excluded from this round)
- [x] Backend visibility/privacy: global preset -> per-commission -> per-stage -> per-file
  precedence, public metadata redaction, public lifecycle stage/file omission, raw-file privacy,
  and `/images?visibility=` filtering
- [x] Visibility/privacy: frontend controls for global defaults and per-commission/stage/file
  overrides
- [x] Lifecycle: shared component, draggable stage reorder handle, drag-and-drop files between
  stages, detached-first exception handling
- [x] Design polish to match the wireframe handoff: detail page hero + side rail (breadcrumb,
  privacy-marked meta rows, chip blocks); edit page two-column layout (borderless title, sticky
  meta rail with chip previews + inline price/confirmed fields); filter popover arrow
- [x] Factory lifecycle stage defaults use chronological order
- [x] Character pages: shareable profile, main ref, curated commission "bookshelves" + picker
  - Sets and the main reference reference whole commissions; each tile renders that
    commission's cover image. `CharacterOut.has_page` is now truthful and drives the
    page marker on character chips, the taxonomy management panel, and the directory.
  - Public viewers see only commissions whose effective visibility is public; admins see
    everything in the picker (defaulting to commissions tagged with the character).
  - Still to do: drag-to-reorder of sets and tiles from the UI (backend endpoints exist),
    typeahead/picker `has_page` marker, mobile character page polish.
- [x] Artist management: multi-platform handles, paste-to-match, no-match resolve dialog
- [ ] Mobile views for every section
- [x] Focal-point reticle editor on cover image
- [x] Export: DB export + file-export `.zip` (`{artists}-{id}/{node}/`, node-dated dirs)
- [ ] Webhooks delivery (`commission.created/updated/delivered`)

## Phase 3 — Optional / advanced (deferred)
- [ ] MCP server wrapping the REST API (tools: create_commission, upload_file, search, set_focal_point)
- [ ] CLIP image2txt accessibility
- [ ] PSD layer extraction for export
- [ ] Physical / digital watermarking
- [ ] "Safe mode"
- [ ] Pinyin-aware title sort
- [ ] Species filtering via XML parse at app layer

## Notes / gotchas
- `commission_metadata.rating` is the single rating source for a commission; `commission_labels`
  currently stores categories and tags.
- Each commission has exactly one system-managed **detached node** (`is_detached=true`),
  auto-created and forced private; deleting a node reparents its files to detached.
- `cover_file_id` must point to a `commission_files` row with `is_image=true`; deleting that file clears the explicit cover so fallback cover selection can run.
- Public image listing shows displayable images in **timeline (stage) order**, ignoring detached,
  and filters by effective file visibility.
- API copy-JSON requires edit access and must include internal id + endpoint URLs, never API
  credentials.
- Exports require edit access: `/api/v1/exports/database.json` exports metadata/storage records
  without physical file bytes; `/api/v1/exports/files.zip` packages stored files under
  `{artists}-{id}/{node}/` and accepts `commission_id` for a single-work zip.
- Prod uploaded files live under repo-root `data/storage` via the API container's `/data/storage`
  bind mount; this path is gitignored runtime data. Postgres remains in Docker volume
  `cmgr_cmgr_pgdata`.
- Prod upgrade is intentionally destructive to repo-local drift: `python3 main.py upgrade` hard
  resets to upstream `main` and runs `git clean -fd`; ignored runtime data is preserved.
- **Compose projects are isolated by explicit name:** both compose files live in `deploy/`, so
  without explicit names they'd share the directory-derived project name and the same `postgres`
  service — bringing up the full stack would recreate the dev container `cmgr-postgres-dev`. Fixed
  via top-level `name:` — full stack is project `cmgr`, dev is `deploy` (kept so its existing
  container + `deploy_cmgr_pgdata_dev` volume are preserved). The two now run side by side.
