"""p2 visibility settings webhooks

Revision ID: 6c3f0b7a92d4
Revises: 1c887f9c3d81
Create Date: 2026-06-02 18:45:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "6c3f0b7a92d4"
down_revision: str | None = "1c887f9c3d81"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


visibility = sa.Enum("public", "private", name="visibility")
visibility_preset = sa.Enum(
    "public_by_default", "private_by_default", "custom", name="visibility_preset"
)


def upgrade() -> None:
    bind = op.get_bind()
    visibility.create(bind, checkfirst=True)
    visibility_preset.create(bind, checkfirst=True)

    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "visibility_preset",
            visibility_preset,
            server_default="public_by_default",
            nullable=False,
        ),
        sa.Column(
            "default_commission_visibility",
            visibility,
            server_default="public",
            nullable=False,
        ),
        sa.Column("default_stage_visibility", visibility, server_default="private", nullable=False),
        sa.Column("title_public", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("description_public", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("labels_public", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("rating_public", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("characters_public", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("artists_public", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("completed_at_public", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("confirmed_at_public", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("price_public", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "visibility_stage_defaults",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stage_name", sa.String(), nullable=False),
        sa.Column("visibility", visibility, nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stage_name"),
    )
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("events", sa.String(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_delivery_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status_code", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("commission_metadata", sa.Column("visibility_override", visibility, nullable=True))
    op.add_column("commission_metadata", sa.Column("title_public_override", sa.Boolean(), nullable=True))
    op.add_column(
        "commission_metadata", sa.Column("description_public_override", sa.Boolean(), nullable=True)
    )
    op.add_column("commission_metadata", sa.Column("labels_public_override", sa.Boolean(), nullable=True))
    op.add_column("commission_metadata", sa.Column("rating_public_override", sa.Boolean(), nullable=True))
    op.add_column(
        "commission_metadata", sa.Column("characters_public_override", sa.Boolean(), nullable=True)
    )
    op.add_column("commission_metadata", sa.Column("artists_public_override", sa.Boolean(), nullable=True))
    op.add_column(
        "commission_metadata", sa.Column("completed_at_public_override", sa.Boolean(), nullable=True)
    )
    op.add_column(
        "commission_metadata", sa.Column("confirmed_at_public_override", sa.Boolean(), nullable=True)
    )
    op.add_column("commission_metadata", sa.Column("price_public_override", sa.Boolean(), nullable=True))
    op.add_column("commission_nodes", sa.Column("visibility_override", visibility, nullable=True))
    op.add_column("commission_files", sa.Column("visibility_override", visibility, nullable=True))

    op.bulk_insert(
        sa.table(
            "app_settings",
            sa.column("id", sa.Integer),
            sa.column("visibility_preset", visibility_preset),
            sa.column("default_commission_visibility", visibility),
            sa.column("default_stage_visibility", visibility),
        ),
        [
            {
                "id": 1,
                "visibility_preset": "public_by_default",
                "default_commission_visibility": "public",
                "default_stage_visibility": "private",
            }
        ],
    )
    op.bulk_insert(
        sa.table(
            "visibility_stage_defaults",
            sa.column("stage_name", sa.String),
            sa.column("visibility", visibility),
            sa.column("position", sa.Integer),
            sa.column("note", sa.String),
        ),
        [
            {
                "stage_name": "Delivered",
                "visibility": "public",
                "position": 0,
                "note": "final deliverables - public by default",
            },
            {
                "stage_name": "Color",
                "visibility": "private",
                "position": 1,
                "note": "WIP - private by default",
            },
            {
                "stage_name": "Lineart",
                "visibility": "private",
                "position": 2,
                "note": "WIP - private by default",
            },
            {
                "stage_name": "Sketching",
                "visibility": "private",
                "position": 3,
                "note": "WIP - private by default",
            },
        ],
    )
    op.execute(
        """
        UPDATE commission_nodes
        SET visibility_override = CASE
            WHEN is_detached THEN 'private'::visibility
            WHEN lower(name) = 'delivered' THEN 'public'::visibility
            ELSE 'private'::visibility
        END
        """
    )


def downgrade() -> None:
    op.drop_column("commission_files", "visibility_override")
    op.drop_column("commission_nodes", "visibility_override")
    op.drop_column("commission_metadata", "price_public_override")
    op.drop_column("commission_metadata", "confirmed_at_public_override")
    op.drop_column("commission_metadata", "completed_at_public_override")
    op.drop_column("commission_metadata", "artists_public_override")
    op.drop_column("commission_metadata", "characters_public_override")
    op.drop_column("commission_metadata", "rating_public_override")
    op.drop_column("commission_metadata", "labels_public_override")
    op.drop_column("commission_metadata", "description_public_override")
    op.drop_column("commission_metadata", "title_public_override")
    op.drop_column("commission_metadata", "visibility_override")
    op.drop_table("webhook_endpoints")
    op.drop_table("visibility_stage_defaults")
    op.drop_table("app_settings")

    bind = op.get_bind()
    visibility_preset.drop(bind, checkfirst=True)
    visibility.drop(bind, checkfirst=True)
