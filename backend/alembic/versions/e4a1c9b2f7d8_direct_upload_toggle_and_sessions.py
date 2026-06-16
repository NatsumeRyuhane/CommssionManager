"""direct-upload toggle and upload sessions

Adds the admin-controlled `allow_direct_upload` flag to app_settings and the
`upload_sessions` table used to track pending browser-direct uploads.

Revision ID: e4a1c9b2f7d8
Revises: d2c8f5a1e7b3
Create Date: 2026-06-15 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e4a1c9b2f7d8"
down_revision: str | Sequence[str] | None = "d2c8f5a1e7b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column(
            "allow_direct_upload",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )

    op.create_table(
        "upload_sessions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "node_id",
            sa.Integer(),
            sa.ForeignKey("commission_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "storage_backend",
            # The `storage_backend` enum type was created by the initial
            # migration when `storage_objects` was first defined; reuse it
            # rather than re-emitting CREATE TYPE. `create_type=False` is
            # honored by the Postgres-specific ENUM, not the generic
            # `sa.Enum`, hence the dialect-direct import.
            postgresql.ENUM(
                "local",
                "s3",
                "gcs",
                name="storage_backend",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("storage_bucket", sa.String(), nullable=True),
        sa.Column("storage_key", sa.String(), nullable=False, unique=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("expected_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "commission_file_id",
            sa.Integer(),
            sa.ForeignKey("commission_files.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_upload_sessions_node_id", "upload_sessions", ["node_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_upload_sessions_node_id", table_name="upload_sessions")
    op.drop_table("upload_sessions")
    op.drop_column("app_settings", "allow_direct_upload")
