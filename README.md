# Ryuhane's Commission Manager

Single-owner commission-art management app — metadata, multi-dimensional filtering,
lifecycle stages, a FurAffinity-style gallery, and a REST API for agent automation.
Public read; admin login for editing; scoped API keys for machine/agent access.

## Layout

```
main.py     Management CLI — start/stop/restart/status/logs/test (reads CMGR_ENV)
backend/    FastAPI + SQLAlchemy 2 + Alembic, Postgres (Python 3.12, managed with uv)
frontend/   React 18 + Vite + TypeScript (managed with pnpm)
deploy/     Docker Compose + Dockerfiles, plus setup.py + helpers used by main.py
docs/       requirements.xml, schema.dbml, architecture.md, TODO.md, commit-convention.md
```

## Prerequisites

- **Docker** (Desktop or Engine) — for Postgres in dev, the test database, and the prod stack.
- **[uv](https://docs.astral.sh/uv/)** — backend Python toolchain (pins Python 3.12 itself).
- **[pnpm](https://pnpm.io/)** + **Node 22** — frontend. The repo pins `pnpm@10.23.0` via
  `packageManager`, so `corepack enable` will use the right version automatically.
- **Python 3** on the host — only to run the `deploy/setup.py` / `main.py` management scripts
  (stdlib only, no virtualenv of their own).

## Configuration

All backend configuration is read from the environment (prefix `CMGR_`) or a local `.env`
file — **there are no in-code defaults**, so a missing value fails fast at startup rather than
silently falling back to insecure dev values. The full set of variables is documented in
[`backend/.env.example`](backend/.env.example).

> Tests do **not** need a `.env` — the pytest harness supplies its own deterministic config.

---

## Quick start (managed scripts)

Two stdlib-only Python helpers wrap the whole workflow — no virtualenv needed, just Python 3
on the host. `CMGR_ENV` in `backend/.env` (`dev` | `test` | `prod`) decides what they do.

```sh
python3 deploy/setup.py --env dev   # checks tools, installs deps, scaffolds backend/.env
python3 main.py start               # dev: Postgres + migrate + uvicorn + vite (prints URLs)
python3 main.py status              # what's running
python3 main.py logs                # tail the dev server logs
python3 main.py stop                # stop the dev servers
python3 main.py upgrade             # prod: stop app containers, sync repo, rebuild, start
python3 main.py uninstall --yes     # prod: remove local containers, DB volume, and built images
python3 main.py test                # run the backend suite (any env)
```

`main.py` reads config from `backend/.env` and announces where it loaded it from. By mode:
`start` runs **dev** servers on the host (background, hot reload, tracked in `deploy/.run/`),
runs the **test** suite, or builds & launches the full **prod** Docker stack. The manual steps
below are what these scripts automate.

---

## DEV — run it locally with hot reload

1. **Start the dev Postgres** (compose project `deploy`; host port `55432` to avoid clashing
   with a system Postgres on 5432):
   ```sh
   docker compose -f deploy/docker-compose.dev.yml up -d
   ```
2. **Backend** (from `backend/`):
   ```sh
   cp .env.example .env          # required — config is env-only (the dev values match the dev Postgres)
   uv sync                       # create .venv and install deps
   uv run alembic upgrade head   # apply migrations
   uv run python -m app.seed     # optional: sample commissions + placeholder cover images
   uv run uvicorn app.main:app --reload
   ```
   API at <http://localhost:8000>, interactive OpenAPI docs at <http://localhost:8000/docs>.

   > If `VIRTUAL_ENV` is set in your shell, prefix commands with `env -u VIRTUAL_ENV …` so uv
   > targets the project's `.venv` (Python 3.12).
3. **Frontend** (from `frontend/`):
   ```sh
   corepack enable               # one-time; selects the pinned pnpm
   pnpm install
   pnpm dev                      # :5173, proxies /api -> :8000
   ```
   App at <http://localhost:5173>.

**Dev admin login:** `admin` / `changeme` (from `.env.example`). Public pages need no login;
the admin login unlocks editing.

---

## TEST — lint, types, and the API suite

**Backend** (from `backend/`):
```sh
uv run ruff check app tests       # lint
uv run pytest -q                  # API + behavior coverage
```
The suite is **self-contained**: it spins up a throwaway `postgres:16-alpine` for the session
via [testcontainers](https://testcontainers.com/) (so it needs Docker running, but **not** the
dev compose stack) and tears it down afterwards. To run against an existing Postgres instead
(e.g. a CI service container), set `CMGR_TEST_DATABASE_URL`:
```sh
CMGR_TEST_DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db uv run pytest -q
```

**Frontend** (from `frontend/`):
```sh
pnpm typecheck                    # tsc --noEmit
pnpm build                        # production build (also type-checks)
```

---

## PROD — full self-hosted stack via Docker Compose

The production stack (Compose project `cmgr`) builds and runs the API + an nginx container that
serves the built SPA and proxies `/api` to the API. It uses the bundled Postgres service by
default, or an external database when selected in `deploy/.env`. The bundled database is isolated
from the dev Postgres (project `deploy`), so the two can run side by side.

1. **Set up production mode and strong secrets.** The setup script checks Docker and deployment
   assets, sets `CMGR_ENV=prod` in `backend/.env`, and skips host development dependencies:
   ```sh
   python3 deploy/setup.py --env prod
   cp deploy/.env.example deploy/.env
   openssl rand -hex 32  # generate URL-safe values for SECRET_KEY and external DB_PASSWORD
   ```
   Replace the placeholders in `deploy/.env`; Compose auto-loads it for variable substitution.
   By default, the stack starts a bundled Postgres container and the commented `DB_*` settings
   are ignored. To use an external database without starting the bundled container, uncomment
   `COMPOSE_FILE` and all `DB_*` settings in `deploy/.env`. Set `CORS_ORIGINS` to a JSON array
   containing the public app origin. Set `APP_PORT` to the host port where the app should listen;
   it defaults to `8080`. The compose file has insecure fallback values for convenience, so
   **override every required value for any real deployment**.
2. **Build and start** with the managed script:
   ```sh
   python3 main.py start
   ```
   The API container runs `alembic upgrade head` on startup, then serves on the internal
   network; the web container publishes the app on `http://localhost:<APP_PORT>`.

   To run Compose directly instead:
   ```sh
   docker compose --project-directory deploy up -d --build --remove-orphans
   ```
3. **Upgrade an existing deployment** from the checked-out branch's upstream:
   ```sh
   python3 main.py upgrade
   ```
   In `CMGR_ENV=prod`, this stops the `api` and `web` containers, discards tracked local changes
   plus untracked non-ignored files (`git reset --hard` + `git clean -fd`), fetches/prunes, resets
   the repo to upstream `main`, and rebuilds/starts the stack. Ignored runtime data such as
   `data/`, `.env`, Docker volumes, and `deploy/.run/` is preserved.
4. **Data** lives outside rebuilt containers. Bundled Postgres uses the named Docker volume
   `cmgr_cmgr_pgdata`; an external database must be backed up separately. Uploaded files are
   bind-mounted from repo-root `data/storage` into the API container at `/data/storage`. Back up
   the applicable database and uploaded files to preserve commissions and their files.

   If upgrading an older deployment that used the former `cmgr_cmgr_storage` Docker volume for
   uploads, copy that volume's contents into `data/storage` before switching to this compose file;
   otherwise the app will start with an empty upload directory.
5. **Stop or uninstall.** `python3 main.py stop` removes the production containers and network,
   but retains the bundled database volume, uploaded files, env files, and built images so the
   stack can be started again. To permanently remove the local production containers, network,
   bundled database volume, and built images:
   ```sh
   python3 main.py uninstall --yes
   ```
   Uninstall deliberately retains `deploy/.env`, `backend/.env`, `data/storage`, and any external
   database. Delete retained files manually only after confirming they are no longer needed.

---

## Agent / automation API

- REST API under `/api/v1` (OpenAPI at `/docs`).
- `GET /api/v1/commissions/{id}/copy-json` returns an agent-friendly payload (internal id, key
  metadata, and endpoint URLs) — **never credentials**.
- Machine access uses scoped API keys (`read` / `write`) via `Authorization: Bearer cmgr_…`.

See [docs/TODO.md](docs/TODO.md) for the roadmap/status and
[docs/architecture.md](docs/architecture.md) for design notes.
