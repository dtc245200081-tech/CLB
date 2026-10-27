from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User


class AnnouncementScope:
    ALL = "all"
    DEPARTMENT = "department"
    ALL_SCOPES = [ALL, DEPARTMENT]


class AnnouncementStatus:
    DRAFT = "draft"
    PUBLISHED = "published"
    ALL = [DRAFT, PUBLISHED]


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"

    announcement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("announcements.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    announcement: Mapped["Announcement"] = relationship("Announcement", back_populates="reads")
    user: Mapped["User"] = relationship("User", lazy="joined")


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(String(20), default=AnnouncementScope.ALL, nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=AnnouncementStatus.DRAFT, nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="joined")
    department: Mapped[Optional["Department"]] = relationship("Department", lazy="joined")
    reads: Mapped[List["AnnouncementRead"]] = relationship(
        "AnnouncementRead", back_populates="announcement", cascade="all, delete-orphan", lazy="selectin"
    )
