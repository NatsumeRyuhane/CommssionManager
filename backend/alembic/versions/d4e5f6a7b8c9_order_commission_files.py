"""order commission files within lifecycle nodes

Revision ID: d4e5f6a7b8c9
Revises: 8b1d5e9c4f02
Create Date: 2026-06-07 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "8b1d5e9c4f02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("commission_files", sa.Column("position", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE commission_files
        SET position = ordered.position
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY node_id ORDER BY created_at, id
            ) - 1 AS position
            FROM commission_files
        ) AS ordered
        WHERE commission_files.id = ordered.id
        """
    )
    op.alter_column("commission_files", "position", nullable=False)
    op.create_unique_constraint(
        "uq_commission_files_node_position",
        "commission_files",
        ["node_id", "position"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_commission_files_node_position",
        "commission_files",
        type_="unique",
    )
    op.drop_column("commission_files", "position")
