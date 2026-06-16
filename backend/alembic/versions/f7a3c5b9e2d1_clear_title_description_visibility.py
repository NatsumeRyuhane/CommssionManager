"""clear per-commission title/description visibility overrides

Per-commission visibility overrides for `title` and `description` are no
longer configurable — they always inherit the site-wide default. Clear
any pre-existing non-null overrides so the next save round-trip from the
UI doesn't trip the new API guard.

The columns are kept for now (they're cheap and removing them would
require coordinating with any in-flight downgrades of the previous
revisions); a follow-up may drop them outright.

Revision ID: f7a3c5b9e2d1
Revises: e4a1c9b2f7d8
Create Date: 2026-06-16 12:00:00.000000
"""
from collections.abc import Sequence

from alembic import op


revision: str = "f7a3c5b9e2d1"
down_revision: str | Sequence[str] | None = "e4a1c9b2f7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE commission_metadata "
        "SET title_public_override = NULL, description_public_override = NULL"
    )


def downgrade() -> None:
    # Data-clearing is a one-way operation; the override values cannot be
    # recovered from a downgrade since they weren't preserved.
    pass
