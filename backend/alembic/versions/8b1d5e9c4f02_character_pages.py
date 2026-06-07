"""character pages

Revision ID: 8b1d5e9c4f02
Revises: 7a8f3c2d1e40, 4f2b8a5d3e10
Create Date: 2026-06-06 12:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "8b1d5e9c4f02"
down_revision: str | Sequence[str] | None = ("7a8f3c2d1e40", "4f2b8a5d3e10")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "character_pages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "character_id",
            sa.Integer(),
            sa.ForeignKey("characters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("about", sa.Text(), nullable=True),
        sa.Column(
            "main_reference_commission_id",
            sa.Integer(),
            sa.ForeignKey("commissions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("character_id", name="uq_character_pages_character_id"),
    )

    op.create_table(
        "character_image_sets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "page_id",
            sa.Integer(),
            sa.ForeignKey("character_pages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("page_id", "position", name="uq_character_image_sets_position"),
    )
    op.create_index(
        "ix_character_image_sets_page_id", "character_image_sets", ["page_id"]
    )

    op.create_table(
        "character_image_set_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "set_id",
            sa.Integer(),
            sa.ForeignKey("character_image_sets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "commission_id",
            sa.Integer(),
            sa.ForeignKey("commissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "set_id", "commission_id", name="uq_character_image_set_items_commission"
        ),
        sa.UniqueConstraint(
            "set_id", "position", name="uq_character_image_set_items_position"
        ),
    )
    op.create_index(
        "ix_character_image_set_items_set_id",
        "character_image_set_items",
        ["set_id"],
    )
    op.create_index(
        "ix_character_image_set_items_commission_id",
        "character_image_set_items",
        ["commission_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_character_image_set_items_commission_id",
        table_name="character_image_set_items",
    )
    op.drop_index(
        "ix_character_image_set_items_set_id", table_name="character_image_set_items"
    )
    op.drop_table("character_image_set_items")
    op.drop_index("ix_character_image_sets_page_id", table_name="character_image_sets")
    op.drop_table("character_image_sets")
    op.drop_table("character_pages")
