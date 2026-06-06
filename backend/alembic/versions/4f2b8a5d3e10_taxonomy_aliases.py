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
    """
    Create an alias lookup table for a taxonomy entity.
    
    Creates a new table named `table_name` with columns: `id` (primary key), a required foreign-key column `parent_fk_col` referencing `{parent_table}.id` with ON DELETE CASCADE, `alias`, and `alias_lower`. Adds a unique constraint on `alias_lower` (name `uq_{table_name}_alias_lower`) and an index on `parent_fk_col` (name `ix_{table_name}_{parent_fk_col}`).
    
    Parameters:
        table_name (str): Name of the alias table to create (e.g., "label_aliases").
        parent_table (str): Name of the parent table that the alias references (e.g., "labels").
        parent_fk_col (str): Name of the foreign-key column to add to the alias table (e.g., "label_id").
    """
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
    """
    Create the alias mapping tables used for taxonomy entries.
    
    Creates three tables: `label_aliases` (references `labels.label_id`), `character_aliases` (references `characters.character_id`),
    and `artist_aliases` (references `artists.artist_id`). Each table includes an integer primary key `id`, a non-null foreign-key
    column to its parent table with cascade delete, `alias` and `alias_lower` string columns, a unique constraint on `alias_lower`,
    and an index on the parent foreign-key column.
    """
    _create_alias_table("label_aliases", "labels", "label_id")
    _create_alias_table("character_aliases", "characters", "character_id")
    _create_alias_table("artist_aliases", "artists", "artist_id")


def downgrade() -> None:
    """
    Revert the migration by dropping each alias table and its per-parent index.
    
    This removes the indexes named `ix_{table_name}_{parent_fk_col}` and then drops the tables:
    `artist_aliases`, `character_aliases`, and `label_aliases`.
    """
    for table_name, parent_fk_col in (
        ("artist_aliases", "artist_id"),
        ("character_aliases", "character_id"),
        ("label_aliases", "label_id"),
    ):
        op.drop_index(f"ix_{table_name}_{parent_fk_col}", table_name=table_name)
        op.drop_table(table_name)
