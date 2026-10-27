from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.join_request import JoinRequest


class SystemRole:
    ADMIN = "admin"
    DEPARTMENT_HEAD = "department_head"
    MEMBER = "member"
    ALL_ROLES = [ADMIN, DEPARTMENT_HEAD, MEMBER]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    student_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    faculty: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    class_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Chức danh hiển thị nội bộ
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Lưu dạng VARCHAR để sau này thêm vai trò mới (như trưởng ban) không cần migrate type của Postgres
    role: Mapped[str] = mapped_column(String(20), default=SystemRole.MEMBER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_treasurer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Khóa ngoại tới Ban chuyên môn (department_id)
    department_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
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

    # Quan hệ với Ban chuyên môn
    department: Mapped[Optional["Department"]] = relationship(
        "Department",
        foreign_keys=[department_id],
        lazy="joined",
        back_populates="members",
    )

    # Quan hệ với đơn gia nhập đã duyệt hoặc đã tạo tài khoản
    reviewed_join_requests: Mapped[List["JoinRequest"]] = relationship(
        "JoinRequest",
        foreign_keys="JoinRequest.reviewed_by_id",
        back_populates="reviewer",
    )
    created_from_join_request: Mapped[Optional["JoinRequest"]] = relationship(
        "JoinRequest",
        foreign_keys="JoinRequest.user_id",
        back_populates="created_user",
        uselist=False,
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def department_name(self) -> Optional[str]:
        return self.department.name if self.department else None
