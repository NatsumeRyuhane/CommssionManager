# Ryuhane's Commission Manager

Single-owner commission-art management app — metadata, multi-dimensional filtering,
lifecycle stages, FurAffinity-style gallery, and a REST API for agent automation.

## Layout

```
backend/    FastAPI + SQLAlchemy + Alembic (Python 3.12)
frontend/   React + Vite + TypeScript
deploy/     Docker Compose + Dockerfiles
docs/       requirements.xml, schema.dbml, TODO.md, architecture notes
```

## Quick start (dev)

1. Start Postgres:
   ```sh
   docker compose -f deploy/docker-compose.dev.yml up -d
   ```
2. Backend (from `backend/`):
   ```sh
   uv sync
   uv run alembic upgrade head
   uv run python -m app.seed          # optional sample data
   uv run uvicorn app.main:app --reload
   ```
   API at http://localhost:8000, docs at http://localhost:8000/docs
3. Frontend (from `frontend/`):
   ```sh
   pnpm install
   pnpm dev
   ```
   App at http://localhost:5173 (proxies `/api` to the backend).

See [docs/TODO.md](docs/TODO.md) for the build roadmap and [docs/architecture.md](docs/architecture.md) for design notes.
