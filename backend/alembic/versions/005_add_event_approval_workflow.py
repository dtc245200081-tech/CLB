"""Add rejection_reason to events table for approval workflow

Revision ID: 005_add_event_approval_workflow
Revises: 004_add_events_and_attendance
Create Date: 2026-10-25 15:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005_add_event_approval_workflow"
down_revision: Union[str, None] = "004_add_events_and_attendance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("rejection_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "rejection_reason")
