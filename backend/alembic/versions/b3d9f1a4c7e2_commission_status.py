"""commission ongoing/completed status

Adds a commission-level lifecycle status to commission_metadata.

Backfill policy: rows that predate this field are assumed delivered, so the
migration flips every existing row to `completed`. The column's server default
is `ongoing`, so commissions created after the migration start `ongoing`.

Revision ID: b3d9f1a4c7e2
Revises: f7a3c5b9e2d1
Create Date: 2026-06-17 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b3d9f1a4c7e2"
down_revision: str | Sequence[str] | None = "f7a3c5b9e2d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


commission_status = postgresql.ENUM(
    "ongoing", "completed", name="commission_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM("ongoing", "completed", name="commission_status").create(
        bind, checkfirst=True
    )
    # server_default 'ongoing' fills existing rows and stands as the default for
    # future inserts; the UPDATE then reclassifies all pre-existing rows as
    # completed (they predate the field and are assumed delivered).
    op.add_column(
        "commission_metadata",
        sa.Column(
            "status", commission_status, server_default="ongoing", nullable=False
        ),
    )
    op.execute("UPDATE commission_metadata SET status = 'completed'")


def downgrade() -> None:
    op.drop_column("commission_metadata", "status")
    postgresql.ENUM("ongoing", "completed", name="commission_status").drop(
        op.get_bind(), checkfirst=True
    )
