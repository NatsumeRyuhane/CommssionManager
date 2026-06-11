"""focal zoom factor for image files

Revision ID: f3c9d2e8a4b1
Revises: d4e5f6a7b8c9
Create Date: 2026-06-10 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f3c9d2e8a4b1"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("commission_files", sa.Column("focal_zoom", sa.Float(), nullable=True))
    op.execute("UPDATE commission_files SET focal_zoom = 1.0 WHERE is_image")


def downgrade() -> None:
    op.drop_column("commission_files", "focal_zoom")
