"""nullable commission title

Untitled commissions now store NULL instead of the "Untitled" placeholder,
so existing placeholder rows are folded into NULL on upgrade.

Revision ID: a9f2e6c1d8b4
Revises: c8d3b0a7e2f1
Create Date: 2026-06-12 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a9f2e6c1d8b4"
down_revision: str | Sequence[str] | None = "c8d3b0a7e2f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("commission_metadata") as batch:
        batch.alter_column("title", existing_type=sa.String(), nullable=True)
    op.execute(
        "UPDATE commission_metadata SET title = NULL "
        "WHERE TRIM(title) = '' OR title = 'Untitled'"
    )


def downgrade() -> None:
    op.execute("UPDATE commission_metadata SET title = 'Untitled' WHERE title IS NULL")
    with op.batch_alter_table("commission_metadata") as batch:
        batch.alter_column("title", existing_type=sa.String(), nullable=False)
