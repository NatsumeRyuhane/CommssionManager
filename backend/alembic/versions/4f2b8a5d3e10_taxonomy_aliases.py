"""taxonomy aliases

Revision ID: 4f2b8a5d3e10
Revises: 9d6f4c1b2a83
Create Date: 2026-06-06 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "4f2b8a5d3e10"
down_revision: str | None = "9d6f4c1b2a83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_alias_table(table_name: str, parent_table: str, parent_fk_col: str) -> None:
    op.create_table(
        table_name,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            parent_fk_col,
            sa.Integer(),
            sa.ForeignKey(f"{parent_table}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("alias", sa.String(), nullable=False),
        sa.Column("alias_lower", sa.String(), nullable=False),
        sa.UniqueConstraint("alias_lower", name=f"uq_{table_name}_alias_lower"),
    )
    op.create_index(f"ix_{table_name}_{parent_fk_col}", table_name, [parent_fk_col])


def upgrade() -> None:
    _create_alias_table("label_aliases", "labels", "label_id")
    _create_alias_table("character_aliases", "characters", "character_id")
    _create_alias_table("artist_aliases", "artists", "artist_id")


def downgrade() -> None:
    for table_name, parent_fk_col in (
        ("artist_aliases", "artist_id"),
        ("character_aliases", "character_id"),
        ("label_aliases", "label_id"),
    ):
        op.drop_index(f"ix_{table_name}_{parent_fk_col}", table_name=table_name)
        op.drop_table(table_name)
