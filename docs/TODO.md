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
  - [x] file upload -> storage object, image dimension probe
  - [x] lifecycle node management (add/rename/reorder/delete + detached reparenting)
  - [x] `cover_file_id` validation (must be an image file of the commission; cleared on file delete)
- [x] Seed script with sample data for dev
- [x] Pytest harness + API coverage (auth, API keys, CRUD, filters/sort, files, nodes, cover, lookups, pagination)
- [x] Self-contained tests: ephemeral Postgres via `testcontainers` (no dependency on the dev
  compose stack; `CMGR_TEST_DATABASE_URL` overrides for CI)
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
- [x] Gallery: total count (X-Total-Count) + load-more pagination
- [ ] Focal-point reticle editor on the cover image (Phase 2)
- [ ] Mobile layouts (Phase 2)

### Deploy
- [x] `deploy/docker-compose.dev.yml` (Postgres for local dev)
- [x] `deploy/docker-compose.yml` (full stack: db + api + web)
- [x] Backend + frontend Dockerfiles, nginx for web
- [x] Reproducible frontend image: pin `packageManager` (pnpm) + `.npmrc` so the build doesn't
  float pnpm versions or fail on the minimum-release-age supply-chain gate
- [x] End-to-end verify of the full-stack compose build (db migrates + api serves + web/nginx
  proxies `/api`; verified `X-Total-Count` through the proxy)

## Phase 2 — Breadth (deferred)
- [ ] Settings (admin): API keys UI, webhooks, storage config
- [ ] Visibility/privacy: global preset -> per-commission -> per-stage -> per-file precedence
  (includes making `/images?visibility=` honor real per-file/stage visibility; currently a stub
  that always returns public displayable images in stage order)
- [ ] Lifecycle: shared component, drag-and-drop files between stages, detached-node handling
- [ ] Character pages: shareable profile, main ref, curated image "bookshelves" + picker
- [ ] Artist management: multi-platform handles, paste-to-match, no-match resolve dialog
- [ ] Mobile views for every section
- [ ] Focal-point reticle editor on cover image
- [ ] Export: DB export + file-export `.zip` (`{artists}-{id}/{node}/`, node-dated dirs)
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
- Each commission has exactly one system-managed **detached node** (`is_detached=true`), auto-created; deleting a node reparents its files to detached.
- `cover_file_id` must point to a `commission_files` row with `is_image=true`; deleting that file clears the explicit cover so fallback cover selection can run.
- Detail page shows public displayable images in **timeline (stage) order**, ignoring detached.
- API copy-JSON must include internal id + endpoint URLs, never API credentials.
- **Compose projects are isolated by explicit name:** both compose files live in `deploy/`, so
  without explicit names they'd share the directory-derived project name and the same `postgres`
  service — bringing up the full stack would recreate the dev container `cmgr-postgres-dev`. Fixed
  via top-level `name:` — full stack is project `cmgr`, dev is `deploy` (kept so its existing
  container + `deploy_cmgr_pgdata_dev` volume are preserved). The two now run side by side.
