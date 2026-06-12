"""default stage names setting

Revision ID: b7e2a9c5d1f6
Revises: f3c9d2e8a4b1
Create Date: 2026-06-12 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b7e2a9c5d1f6"
down_revision: str | Sequence[str] | None = "f3c9d2e8a4b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column(
            "default_stage_names",
            sa.String(length=500),
            server_default="Delivered, Color, Lineart, Sketching",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("app_settings", "default_stage_names")
