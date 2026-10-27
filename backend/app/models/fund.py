from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.event import Event
    from app.models.fee import FeePayment
    from app.models.user import User


class ExpenseRequestStatus:
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"
    CANCELLED = "cancelled"
    ALL = [REQUESTED, APPROVED, REJECTED, PAID, CANCELLED]


class LedgerType:
    INCOME = "income"
    EXPENSE = "expense"
    ALL = [INCOME, EXPENSE]


class ExpenseRequest(Base):
    __tablename__ = "expense_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount_requested: Mapped[int] = mapped_column(BigInteger, nullable=False)

    department_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True
    )
    requested_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    status: Mapped[str] = mapped_column(
        String(20), default=ExpenseRequestStatus.REQUESTED, nullable=False, index=True
    )

    reviewed_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    requested_by: Mapped["User"] = relationship("User", foreign_keys=[requested_by_id], lazy="joined")
    reviewer: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reviewed_by_id], lazy="joined")
    department: Mapped[Optional["Department"]] = relationship("Department", lazy="joined")
    event: Mapped[Optional["Event"]] = relationship("Event", lazy="joined")
    ledger_entry: Mapped[Optional["LedgerEntry"]] = relationship("LedgerEntry", back_populates="expense_request", uselist=False)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # 'income' hoặc 'expense'
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    event_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True
    )
    department_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    fee_payment_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("fee_payments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    expense_request_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("expense_requests.id", ondelete="SET NULL"), nullable=True, index=True
    )

    recorded_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    receipt_photo_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Đánh dấu hủy bút toán (Bất biến)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    recorded_by: Mapped["User"] = relationship("User", foreign_keys=[recorded_by_id], lazy="joined")
    voider: Mapped[Optional["User"]] = relationship("User", foreign_keys=[voided_by_id], lazy="joined")
    event: Mapped[Optional["Event"]] = relationship("Event", lazy="joined")
    department: Mapped[Optional["Department"]] = relationship("Department", lazy="joined")
    fee_payment: Mapped[Optional["FeePayment"]] = relationship("FeePayment", back_populates="ledger_entry", lazy="joined")
    expense_request: Mapped[Optional["ExpenseRequest"]] = relationship("ExpenseRequest", back_populates="ledger_entry", lazy="joined")

    @property
    def is_voided(self) -> bool:
        return self.voided_at is not None
