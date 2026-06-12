"""drop the commission completed_at attribute

The topmost lifecycle stage now stands in as the commission's "most
recent update" date, so the standalone completed_at metadata (and its
public/private visibility plumbing) no longer makes sense.

Revision ID: d2c8f5a1e7b3
Revises: a9f2e6c1d8b4
Create Date: 2026-06-12 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d2c8f5a1e7b3"
down_revision: str | Sequence[str] | None = "a9f2e6c1d8b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("commission_metadata") as batch:
        batch.drop_column("completed_at")
        batch.drop_column("completed_at_public_override")
    with op.batch_alter_table("app_settings") as batch:
        batch.drop_column("completed_at_public")


def downgrade() -> None:
    with op.batch_alter_table("commission_metadata") as batch:
        batch.add_column(sa.Column("completed_at", sa.Date(), nullable=True))
        batch.add_column(sa.Column("completed_at_public_override", sa.Boolean(), nullable=True))
    with op.batch_alter_table("app_settings") as batch:
        batch.add_column(
            sa.Column(
                "completed_at_public",
                sa.Boolean(),
                server_default=sa.true(),
                nullable=False,
            )
        )
