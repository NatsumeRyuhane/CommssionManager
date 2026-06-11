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
- [x] Mobile layouts (Phase 2)

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
    typeahead/picker `has_page` marker.
- [x] Artist management: multi-platform handles, paste-to-match, no-match resolve dialog
- [x] Mobile views for every section: responsive gallery columns, wrapping topbar,
  bottom-sheet filter popover, horizontal settings tabs, stacked rails/grids, clamped
  modals, iOS-safe field sizing, coarse-pointer touch targets
- [x] UI polish pass: uniform button heights (`<a>`/`<button>` parity), lucide icons in
  place of emoji glyphs, entrance/hover/focus motion with `prefers-reduced-motion` support
- [x] Focal-point reticle editor on cover image
  - Focal edits now stage in the edit form and commit with Save (failed saves keep the
    staged values); editor actions are Center focal / Revert; `focal_zoom` (1.0–3.0)
    crops toward the focal point everywhere covers render
- [x] Export: DB export + file-export `.zip` (`{artists}-{id}/{node}/`, node-dated dirs)
- [x] Image derivatives: in-app surfaces load server-generated variants instead of original
  bytes (issue #19)
  - `/api/v1/files/{id}/image?size=thumb|small|medium|large[&format=webp|jpeg|png]` behind
    the same visibility gate as `/raw`; derivatives cache through the storage abstraction
    under `derivatives/{storage_object_id}/` (pure cache, no schema change)
  - Eager generation at upload (background task) + async build on cache miss: the endpoint
    answers 202 and the frontend `DerivedImg` shows a placeholder and retries with backoff
  - `FileOut`/`CoverOut` expose an `image_urls` preset map; `url` still points at `/raw`
  - Surfaces: gallery/lifecycle/bookshelf/picker/visibility tiles `thumb`, focal editor
    canvas + previews `small` (picking is percentage-based, so no precision loss), hero +
    character main ref `medium` (+`srcset`), viewer defaults `medium` and downloads
    server-rendered variants (client canvas resize removed); only downloads still
    touch `/raw`
  - Deleting a file/commission removes its derivatives; commission delete also stops
    leaking original bytes + `storage_objects` rows; export zip stays originals-only
- [x] CDN-backed file delivery (issue #20, Option 2 — object storage + CDN)
  - `S3Storage` driver (S3-compatible: Cloudflare R2 / AWS S3 / MinIO) behind the existing
    storage abstraction; selected via `CMGR_STORAGE_BACKEND=s3` + `CMGR_STORAGE_S3_*` /
    `CMGR_STORAGE_CDN_BASE_URL` settings (boto3, lazily imported)
  - `/files/{id}/raw` and `/files/{id}/image` now 302 to the CDN (public files) or a
    signed URL (private files) when the backend provides URLs; `?redirect=0` opts back
    into streaming (used by the viewer's blob downloads — fetch() can't carry credentials
    across a cross-origin redirect)
  - Streaming path got the Option-1 header work: `ETag` (checksum) + `If-None-Match` →
    304, `Last-Modified`, `Cache-Control: public, max-age=86400` for public files,
    `private, no-store` for admin-only files
  - Upload keys + derivative cache keys carry an unguessable random/checksum segment:
    safe behind a public bucket domain, busts caches on re-upload, and fixes the
    duplicate-filename unique-constraint collision
  - `python3 main.py storage <status|migrate> [--dry-run]` wraps
    `python -m app.storage.migrate`: copies objects (and cached derivatives) into the
    configured backend, verifies checksums, re-keys legacy predictable keys, commits
    per object (resumable); source bytes are never deleted
  - Settings → Storage panel now shows bucket / endpoint / CDN base URL
  - CI: dedicated `S3 integration (live driver tests)` job runs the driver-contract tests
    against a real bucket when the `TEST_S3_*` repo secrets/variables are set (gated on the
    `TEST_S3_BUCKET` variable, skipped otherwise); the Backend job stays hermetic on the
    fake S3 client
- [ ] Webhooks delivery (`commission.created/updated/delivered`)
- [x] UX streamline pass (creation friction, viewer, detail layout)
  - Site-level stage template: `app_settings.default_stage_names` (comma-separated, display
    order, first = topmost), editable under Settings → Site; `POST /commissions` applies it
    when `node_names` is omitted (explicit `[]` still opts out)
  - "+ New" creates an Untitled commission from the template and lands directly on the edit
    page; the separate create form and `/commissions/new` route are gone (EditPage is
    edit-only)
  - Dropped `current_stage` everywhere (API list/detail, copy-json, chips, crumb, rail block):
    the topmost stage conveys progress — **breaking API change**
  - Image viewer reworked Preview-style: floats over the page on a translucent backdrop,
    controls on top, thumbnail pill at the bottom, click the dark area to dismiss,
    wheel/trackpad + touch pinch zoom with pan and double-click zoom; resolution choice
    persists in localStorage and re-applies across image switches (clamped per file)
  - Detail page: in-page cover removed (stage tiles open the viewer); lifecycle joined the
    left column and the metadata rail is sticky on desktop
  - Title optional: omitted/blank titles default to "Untitled" (create and update)
  - Original-download gate: `app_settings.allow_public_original_download` (Settings → Site
    toggle, default on); when off, `/files/{id}/raw` and lossless `format=png` derivatives
    require write access — visitors get lossy (jpeg/webp) derivatives only, the viewer hides
    "Original" and saves jpeg for png sources (gif animation is admin-only while gated, since
    derivatives are static)

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
