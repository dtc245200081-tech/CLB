from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User


class EventStatus:
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    PUBLISHED = "published"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    ALL = [DRAFT, PENDING_APPROVAL, PUBLISHED, REJECTED, CANCELLED]


class RegistrationStatus:
    REGISTERED = "registered"
    CANCELLED = "cancelled"
    ALL = [REGISTERED, CANCELLED]


class AttendanceType:
    CHECK_IN = "check_in"
    CHECK_OUT = "check_out"
    ALL = [CHECK_IN, CHECK_OUT]


class AttendanceSource:
    CAMERA = "camera"
    UPLOAD = "upload"
    MANUAL = "manual"
    ALL = [CAMERA, UPLOAD, MANUAL]


class ReviewStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ALL = [PENDING, APPROVED, REJECTED]


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    registration_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Null = không giới hạn
    department_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default=EventStatus.DRAFT,
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Các tham số cấu hình khung giờ điểm danh
    checkin_open_minutes_before: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    late_after_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    checkin_close_minutes_after_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Null = đến hết giờ kết thúc
    checkout_open_after_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Null = từ nửa thời lượng
    checkout_close_minutes_after_end: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Ràng buộc cơ sở dữ liệu
    __table_args__ = (
        CheckConstraint("end_time > start_time", name="chk_event_end_after_start"),
        CheckConstraint("capacity IS NULL OR capacity > 0", name="chk_event_capacity_positive"),
        CheckConstraint("checkin_open_minutes_before >= 0", name="chk_event_checkin_open_non_neg"),
        CheckConstraint("late_after_minutes >= 0", name="chk_event_late_after_non_neg"),
        CheckConstraint(
            "checkin_close_minutes_after_start IS NULL OR checkin_close_minutes_after_start >= 0",
            name="chk_event_checkin_close_non_neg",
        ),
        CheckConstraint(
            "checkout_open_after_minutes IS NULL OR checkout_open_after_minutes >= 0",
            name="chk_event_checkout_open_non_neg",
        ),
        CheckConstraint("checkout_close_minutes_after_end >= 0", name="chk_event_checkout_close_non_neg"),
    )

    # Relationships
    department: Mapped[Optional["Department"]] = relationship("Department", lazy="selectin")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id], lazy="selectin")
    registrations: Mapped[List["EventRegistration"]] = relationship(
        "EventRegistration",
        back_populates="event",
        cascade="all, delete-orphan",
    )


class EventRegistration(Base):
    __tablename__ = "event_registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default=RegistrationStatus.REGISTERED,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_event_registration_user_event"),
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="joined")
    event: Mapped["Event"] = relationship("Event", foreign_keys=[event_id], back_populates="registrations", lazy="joined")
    attendances: Mapped[List["EventAttendance"]] = relationship(
        "EventAttendance",
        back_populates="registration",
        cascade="all, delete-orphan",
    )


class EventAttendance(Base):
    __tablename__ = "event_attendances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    registration_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("event_registrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # check_in / check_out
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Giờ server ghi nhận
    photo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # camera / upload / manual
    review_status: Mapped[str] = mapped_column(
        String(20),
        default=ReviewStatus.PENDING,
        nullable=False,
    )  # pending / approved / rejected
    is_late: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # Chỉ áp dụng cho check_in
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_event_attendances_reg_type", "registration_id", "type"),
        Index(
            "uq_active_attendance",
            "registration_id",
            "type",
            unique=True,
            postgresql_where=text("review_status IN ('pending', 'approved')"),
            sqlite_where=text("review_status IN ('pending', 'approved')"),
        ),
    )

    # Relationships
    registration: Mapped["EventRegistration"] = relationship(
        "EventRegistration",
        foreign_keys=[registration_id],
        back_populates="attendances",
        lazy="joined",
    )
    reviewed_by: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[reviewed_by_id],
        lazy="joined",
    )
