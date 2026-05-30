from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401  (register all tables on Base.metadata)
from app.core.config import settings
from app.db import Base, get_db
from app.main import app
from app.storage.factory import get_storage

TEST_DB = "commission_manager_test"


def _swap_db(url: str, name: str) -> str:
    return url.rsplit("/", 1)[0] + "/" + name


@pytest.fixture(scope="session")
def engine() -> Generator[Engine, None, None]:
    # Create the test database (cmgr is a superuser in the dev Postgres image).
    admin = create_engine(_swap_db(settings.database_url, "postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    admin.dispose()

    eng = create_engine(_swap_db(settings.database_url, TEST_DB), future=True)
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
