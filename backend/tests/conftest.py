import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

# The app loads all config from the environment (no in-code defaults), so the suite stays
# self-contained by providing deterministic values before importing anything under app.*.
# The real DB connection is supplied separately by the db_url fixture; this placeholder URL
# only satisfies engine construction at import time (get_db is overridden, so it's unused).
os.environ.setdefault("CMGR_DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test")
os.environ.setdefault("CMGR_SECRET_KEY", "test-secret-key-not-for-production-use")
os.environ.setdefault("CMGR_ADMIN_USERNAME", "admin")
os.environ.setdefault("CMGR_ADMIN_PASSWORD", "changeme")
os.environ.setdefault("CMGR_ACCESS_TOKEN_EXPIRE_MINUTES", "10080")
os.environ.setdefault("CMGR_STORAGE_BACKEND", "local")
os.environ.setdefault("CMGR_STORAGE_LOCAL_ROOT", "./data/storage")
os.environ.setdefault("CMGR_CORS_ORIGINS", '["http://localhost:5173"]')

import app.models  # noqa: E402, F401  (register all tables on Base.metadata)
from app.core.config import settings  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.storage.factory import get_storage  # noqa: E402


@pytest.fixture(scope="session")
def db_url() -> Generator[str, None, None]:
    """A Postgres for the test session, self-contained by default.

    By default this spins up a throwaway Postgres container (via testcontainers) so the
    suite has no dependency on the dev compose stack being up. Set CMGR_TEST_DATABASE_URL
    to point at an existing Postgres instead (e.g. a CI service container)."""
    override = os.getenv("CMGR_TEST_DATABASE_URL")
    if override:
        yield override
        return

    from testcontainers.postgres import PostgresContainer

    # driver="psycopg" so the URL matches the app's psycopg (v3) driver.
    with PostgresContainer("postgres:16-alpine", driver="psycopg") as pg:
        yield pg.get_connection_url()


@pytest.fixture(scope="session")
def engine(db_url: str) -> Generator[Engine, None, None]:
    eng = create_engine(db_url, future=True)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def storage_root(monkeypatch: pytest.MonkeyPatch, tmp_path) -> Generator[None, None, None]:
    monkeypatch.setattr(settings, "storage_local_root", str(tmp_path / "storage"))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


@pytest.fixture
def client(engine: Engine, storage_root: None) -> Generator[TestClient, None, None]:
    # Clean slate per test.
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE'))

    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(client: TestClient) -> TestClient:
    res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert res.status_code == 200
    return client
