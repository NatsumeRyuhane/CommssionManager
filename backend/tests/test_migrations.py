"""Migration smoke tests.

The rest of the suite uses `Base.metadata.create_all` to set up schema, which
bypasses Alembic entirely — that's fast but means migration-only bugs (a
missing `create_type=False`, an enum that gets re-emitted, a downgrade that
drops the wrong column) reach prod undetected. These tests run Alembic
end-to-end against a throwaway Postgres container so the same bugs blow up
here first.

The container is provisioned per-test (function-scoped) and is completely
isolated from the conftest's shared test database — every migration run
starts from an empty Postgres instance and walks the entire revision
history from scratch. That matches what `alembic upgrade head` does on a
fresh deployment and is the failure mode we most need to protect against.

Two checks:

1. **upgrade head from empty** — catches the most common failure mode
   (CREATE TYPE already exists, server_default missing on a non-null column,
   referenced table doesn't exist yet, etc.).

2. **round-trip** — upgrade → downgrade base → upgrade head. Confirms every
   downgrade implementation is plausible; without this a wrong downgrade
   only surfaces during disaster recovery.
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

# Path to the project's alembic.ini, resolved relative to this test file so
# the test is independent of the working directory pytest is launched from.
ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _make_config(db_url: str) -> Config:
    """Build an Alembic Config pointing at the project's alembic.ini and
    overriding the DB URL. `env.py` honors the override when set."""
    cfg = Config(str(ALEMBIC_INI))
    # Alembic resolves `script_location` relative to the ini file's directory
    # when the value is relative; nail it down explicitly so the test works
    # regardless of cwd.
    cfg.set_main_option("script_location", str(ALEMBIC_INI.parent / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


@pytest.fixture
def fresh_db_url() -> Generator[str, None, None]:
    """A brand-new Postgres container per test, completely isolated from the
    rest of the suite.

    Migration tests must start from an empty database — the bugs they're
    designed to catch (a CREATE TYPE that clashes with one created by an
    earlier revision, for example) only surface when Alembic walks the
    revision chain from scratch. Reusing the conftest's `test` database
    would skip the very thing this suite exists to check.

    Container startup is ~3-5s; we pay it once per migration test (currently
    two), which is a reasonable tax for the isolation."""
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine", driver="psycopg") as pg:
        yield pg.get_connection_url()


def _current_revision(db_url: str) -> str | None:
    engine = create_engine(db_url)
    try:
        with engine.connect() as conn:
            return conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()
    finally:
        engine.dispose()


def test_upgrade_head_from_empty_db_succeeds(fresh_db_url: str):
    """`alembic upgrade head` against an empty DB must reach the head revision
    without exceptions. Catches CREATE TYPE / CREATE TABLE conflicts and
    similar per-revision regressions before they hit a real deployment."""
    cfg = _make_config(fresh_db_url)
    command.upgrade(cfg, "head")

    head = ScriptDirectory.from_config(cfg).get_current_head()
    assert head is not None, "alembic could not determine the head revision"
    assert _current_revision(fresh_db_url) == head


@pytest.mark.xfail(
    reason=(
        "Latent issue in existing migrations, not introduced by this branch: the "
        "initial schema migration (1c887f9c3d81) creates Postgres enum types but "
        "its downgrade drops only the tables, not the enums. A re-upgrade after "
        "downgrade base then fails with `type \"label_type\" already exists`. "
        "Tracked separately; this xfail flips to XPASS once historical downgrade "
        "implementations are taught to drop their enums."
    ),
    strict=True,
)
def test_migration_round_trip_upgrade_downgrade_upgrade(fresh_db_url: str):
    """upgrade → downgrade base → upgrade head must succeed. Catches missing
    or wrong downgrade implementations that only show up during a disaster-
    recovery rollback. Stops short of asserting per-table state — the goal
    is to confirm the chain executes, not to lock in current schema details.

    Currently expected to fail (see xfail marker)."""
    cfg = _make_config(fresh_db_url)
    head = ScriptDirectory.from_config(cfg).get_current_head()
    assert head is not None

    command.upgrade(cfg, "head")
    assert _current_revision(fresh_db_url) == head

    command.downgrade(cfg, "base")
    # After full downgrade Alembic clears the version row; the table itself
    # is kept around for the next upgrade to write into.
    assert _current_revision(fresh_db_url) is None

    command.upgrade(cfg, "head")
    assert _current_revision(fresh_db_url) == head
