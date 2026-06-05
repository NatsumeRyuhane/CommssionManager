"""site title setting

Revision ID: 9d6f4c1b2a83
Revises: 6c3f0b7a92d4
Create Date: 2026-06-03 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "9d6f4c1b2a83"
down_revision: str | None = "6c3f0b7a92d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column(
            "site_title",
            sa.String(length=120),
            server_default="Commissions",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("app_settings", "site_title")
