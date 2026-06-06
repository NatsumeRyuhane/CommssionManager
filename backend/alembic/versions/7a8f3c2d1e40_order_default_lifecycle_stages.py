"""Order default lifecycle stages chronologically.

Revision ID: 7a8f3c2d1e40
Revises: 9d6f4c1b2a83
"""

from alembic import op

revision: str = "7a8f3c2d1e40"
down_revision: str | None = "9d6f4c1b2a83"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Only correct the untouched factory rows; preserve customized stage defaults.
    op.execute(
        """
        UPDATE visibility_stage_defaults
        SET position = CASE lower(stage_name)
            WHEN 'sketching' THEN 0
            WHEN 'lineart' THEN 1
            WHEN 'color' THEN 2
            WHEN 'delivered' THEN 3
        END
        WHERE (
            SELECT array_agg(lower(stage_name) ORDER BY position)
            FROM visibility_stage_defaults
        ) = ARRAY['delivered', 'color', 'lineart', 'sketching']::text[]
        AND (
            SELECT array_agg(visibility::text ORDER BY position)
            FROM visibility_stage_defaults
        ) = ARRAY['public', 'private', 'private', 'private']::text[]
        AND (
            SELECT array_agg(note::text ORDER BY position)
            FROM visibility_stage_defaults
        ) = ARRAY[
            'final deliverables - public by default',
            'WIP - private by default',
            'WIP - private by default',
            'WIP - private by default'
        ]::text[]
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE visibility_stage_defaults
        SET position = CASE lower(stage_name)
            WHEN 'delivered' THEN 0
            WHEN 'color' THEN 1
            WHEN 'lineart' THEN 2
            WHEN 'sketching' THEN 3
        END
        WHERE (
            SELECT array_agg(lower(stage_name) ORDER BY position)
            FROM visibility_stage_defaults
        ) = ARRAY['sketching', 'lineart', 'color', 'delivered']::text[]
        AND (
            SELECT array_agg(visibility::text ORDER BY position)
            FROM visibility_stage_defaults
        ) = ARRAY['private', 'private', 'private', 'public']::text[]
        AND (
            SELECT array_agg(note::text ORDER BY position)
            FROM visibility_stage_defaults
        ) = ARRAY[
            'WIP - private by default',
            'WIP - private by default',
            'WIP - private by default',
            'final deliverables - public by default'
        ]::text[]
        """
    )
