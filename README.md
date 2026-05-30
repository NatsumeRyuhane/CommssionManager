# Ryuhane's Commission Manager

Single-owner commission-art management app — metadata, multi-dimensional filtering,
lifecycle stages, a FurAffinity-style gallery, and a REST API for agent automation.
Public read; admin login for editing; scoped API keys for machine/agent access.

## Layout

```
backend/    FastAPI + SQLAlchemy 2 + Alembic, Postgres (Python 3.12, managed with uv)
frontend/   React 18 + Vite + TypeScript (managed with pnpm)
deploy/     Docker Compose + Dockerfiles (dev = Postgres only; full stack = db + api + web)
docs/       requirements.xml, schema.dbml, architecture.md, TODO.md, commit-convention.md
```

## Prerequisites

- **Docker** (Desktop or Engine) — for Postgres in dev, the test database, and the prod stack.
- **[uv](https://docs.astral.sh/uv/)** — backend Python toolchain (pins Python 3.12 itself).
- **[pnpm](https://pnpm.io/)** + **Node 22** — frontend. The repo pins `pnpm@10.23.0` via
  `packageManager`, so `corepack enable` will use the right version automatically.

## Configuration

All backend configuration is read from the environment (prefix `CMGR_`) or a local `.env`
file — **there are no in-code defaults**, so a missing value fails fast at startup rather than
silently falling back to insecure dev values. The full set of variables is documented in
[`backend/.env.example`](backend/.env.example).

> Tests do **not** need a `.env` — the pytest harness supplies its own deterministic config.

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

The full stack (`deploy/docker-compose.yml`, compose project `cmgr`) builds and runs Postgres +
the API + an nginx container that serves the built SPA and proxies `/api` to the API. It is
isolated from the dev Postgres (project `deploy`), so the two can run side by side.

1. **Set strong secrets.** The compose file reads these from the environment (with insecure
   fallbacks for convenience — **override them for any real deployment**). Put them in a
   `deploy/.env` file (Compose auto-loads it for variable substitution) or export them:
   ```sh
   # deploy/.env
   POSTGRES_PASSWORD=<strong-db-password>
   ADMIN_USERNAME=<your-admin>
   ADMIN_PASSWORD=<strong-admin-password>
   SECRET_KEY=<openssl rand -hex 32>          # JWT signing key, >= 32 bytes
   CORS_ORIGINS=["https://your.domain"]        # JSON array of allowed origins
   # optional: ACCESS_TOKEN_EXPIRE_MINUTES, STORAGE_BACKEND
   ```
2. **Build and start** (build context is the repo root):
   ```sh
   docker compose -f deploy/docker-compose.yml up -d --build
   ```
   The API container runs `alembic upgrade head` on startup, then serves on the internal
   network; the web container publishes the app on **<http://localhost:8080>** (change the
   `web` port mapping in the compose file to suit your host).
3. **Data** lives in named volumes (`cmgr_cmgr_pgdata` for Postgres, `cmgr_cmgr_storage` for
   uploaded files). Back these up to preserve commissions and their files.

---

## Agent / automation API

- REST API under `/api/v1` (OpenAPI at `/docs`).
- `GET /api/v1/commissions/{id}/copy-json` returns an agent-friendly payload (internal id, key
  metadata, and endpoint URLs) — **never credentials**.
- Machine access uses scoped API keys (`read` / `write`) via `Authorization: Bearer cmgr_…`.

See [docs/TODO.md](docs/TODO.md) for the roadmap/status and
[docs/architecture.md](docs/architecture.md) for design notes.
