"""Add events, event_registrations and event_attendances tables

Revision ID: 004_add_events_and_attendance
Revises: 003_add_departments
Create Date: 2026-10-24 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004_add_events_and_attendance"
down_revision: Union[str, None] = "003_add_departments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tạo bảng events
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("registration_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("is_public", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("checkin_open_minutes_before", sa.Integer(), server_default="30", nullable=False),
        sa.Column("late_after_minutes", sa.Integer(), server_default="15", nullable=False),
        sa.Column("checkin_close_minutes_after_start", sa.Integer(), nullable=True),
        sa.Column("checkout_open_after_minutes", sa.Integer(), nullable=True),
        sa.Column("checkout_close_minutes_after_end", sa.Integer(), server_default="60", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("end_time > start_time", name="chk_event_end_after_start"),
        sa.CheckConstraint("capacity IS NULL OR capacity > 0", name="chk_event_capacity_positive"),
        sa.CheckConstraint("checkin_open_minutes_before >= 0", name="chk_event_checkin_open_non_neg"),
        sa.CheckConstraint("late_after_minutes >= 0", name="chk_event_late_after_non_neg"),
        sa.CheckConstraint(
            "checkin_close_minutes_after_start IS NULL OR checkin_close_minutes_after_start >= 0",
            name="chk_event_checkin_close_non_neg",
        ),
        sa.CheckConstraint(
            "checkout_open_after_minutes IS NULL OR checkout_open_after_minutes >= 0",
            name="chk_event_checkout_open_non_neg",
        ),
        sa.CheckConstraint("checkout_close_minutes_after_end >= 0", name="chk_event_checkout_close_non_neg"),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name=op.f("fk_events_department_id_departments"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_events_created_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_events")),
    )
    op.create_index(op.f("ix_events_id"), "events", ["id"], unique=False)
    op.create_index(op.f("ix_events_start_time"), "events", ["start_time"], unique=False)
    op.create_index(op.f("ix_events_status"), "events", ["status"], unique=False)
    op.create_index(op.f("ix_events_department_id"), "events", ["department_id"], unique=False)

    # 2. Tạo bảng event_registrations
    op.create_table(
        "event_registrations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="registered", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_event_registrations_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name=op.f("fk_event_registrations_event_id_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_registrations")),
        sa.UniqueConstraint("user_id", "event_id", name="uq_event_registration_user_event"),
    )
    op.create_index(op.f("ix_event_registrations_id"), "event_registrations", ["id"], unique=False)
    op.create_index(op.f("ix_event_registrations_user_id"), "event_registrations", ["user_id"], unique=False)
    op.create_index(op.f("ix_event_registrations_event_id"), "event_registrations", ["event_id"], unique=False)

    # 3. Tạo bảng event_attendances
    op.create_table(
        "event_attendances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registration_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("photo_path", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("review_status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("is_late", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["registration_id"],
            ["event_registrations.id"],
            name=op.f("fk_event_attendances_registration_id_event_registrations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_id"],
            ["users.id"],
            name=op.f("fk_event_attendances_reviewed_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_attendances")),
    )
    op.create_index(op.f("ix_event_attendances_id"), "event_attendances", ["id"], unique=False)
    op.create_index(op.f("ix_event_attendances_registration_id"), "event_attendances", ["registration_id"], unique=False)
    op.create_index(
        "ix_event_attendances_reg_type",
        "event_attendances",
        ["registration_id", "type"],
        unique=False,
    )
    # Ràng buộc: Tối đa 1 bản ghi "đang hiệu lực" (pending hoặc approved) mỗi loại cho mỗi đăng ký
    op.create_index(
        "uq_active_attendance",
        "event_attendances",
        ["registration_id", "type"],
        unique=True,
        postgresql_where=sa.text("review_status IN ('pending', 'approved')"),
        sqlite_where=sa.text("review_status IN ('pending', 'approved')"),
    )


def downgrade() -> None:
    op.drop_index("uq_active_attendance", table_name="event_attendances")
    op.drop_index("ix_event_attendances_reg_type", table_name="event_attendances")
    op.drop_index(op.f("ix_event_attendances_registration_id"), table_name="event_attendances")
    op.drop_index(op.f("ix_event_attendances_id"), table_name="event_attendances")
    op.drop_table("event_attendances")

    op.drop_index(op.f("ix_event_registrations_event_id"), table_name="event_registrations")
    op.drop_index(op.f("ix_event_registrations_user_id"), table_name="event_registrations")
    op.drop_index(op.f("ix_event_registrations_id"), table_name="event_registrations")
    op.drop_table("event_registrations")

    op.drop_index(op.f("ix_events_department_id"), table_name="events")
    op.drop_index(op.f("ix_events_status"), table_name="events")
    op.drop_index(op.f("ix_events_start_time"), table_name="events")
    op.drop_index(op.f("ix_events_id"), table_name="events")
    op.drop_table("events")
