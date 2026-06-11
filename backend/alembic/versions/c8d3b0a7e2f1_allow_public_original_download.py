"""allow public original download setting

Revision ID: c8d3b0a7e2f1
Revises: b7e2a9c5d1f6
Create Date: 2026-06-12 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c8d3b0a7e2f1"
down_revision: str | Sequence[str] | None = "b7e2a9c5d1f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column(
            "allow_public_original_download",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("app_settings", "allow_public_original_download")
