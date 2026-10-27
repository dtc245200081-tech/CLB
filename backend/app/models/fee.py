from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.fund import LedgerEntry
    from app.models.user import User


class FeePeriodStatus:
    OPEN = "open"
    CLOSED = "closed"
    ALL = [OPEN, CLOSED]


class MemberFeeStatus:
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"
    WAIVED = "waived"
    ALL = [UNPAID, PARTIAL, PAID, WAIVED]


class PaymentMethod:
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    ALL = [CASH, BANK_TRANSFER]


class ClaimStatus:
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    ALL = [PENDING, CONFIRMED, REJECTED]


class FeePeriod(Base):
    __tablename__ = "fee_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)  # Mức thu cơ bản mỗi người (VND)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=FeePeriodStatus.OPEN, nullable=False)

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
    member_fees: Mapped[List["MemberFee"]] = relationship(
        "MemberFee", back_populates="period", cascade="all, delete-orphan", lazy="selectin"
    )


class MemberFee(Base):
    __tablename__ = "member_fees"
    __table_args__ = (UniqueConstraint("period_id", "user_id", name="uq_period_user_fee"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("fee_periods.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount_due: Mapped[int] = mapped_column(BigInteger, nullable=False)
    discount_amount: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    discount_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    period: Mapped["FeePeriod"] = relationship("FeePeriod", back_populates="member_fees", lazy="joined")
    user: Mapped["User"] = relationship("User", lazy="joined")
    payments: Mapped[List["FeePayment"]] = relationship(
        "FeePayment", back_populates="member_fee", cascade="all, delete-orphan", lazy="selectin"
    )
    claims: Mapped[List["PaymentClaim"]] = relationship(
        "PaymentClaim", back_populates="member_fee", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def net_amount_due(self) -> int:
        return max(0, self.amount_due - self.discount_amount)

    @property
    def total_paid(self) -> int:
        """Tổng tiền thanh toán hợp lệ (chưa bị hủy)."""
        return sum(p.amount for p in self.payments if p.voided_at is None)

    @property
    def remaining_due(self) -> int:
        return max(0, self.net_amount_due - self.total_paid)

    @property
    def calculated_status(self) -> str:
        if self.discount_amount >= self.amount_due:
            return MemberFeeStatus.WAIVED
        paid = self.total_paid
        net = self.net_amount_due
        if paid >= net:
            return MemberFeeStatus.PAID
        elif paid > 0:
            return MemberFeeStatus.PARTIAL
        return MemberFeeStatus.UNPAID


class FeePayment(Base):
    __tablename__ = "fee_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    receipt_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    member_fee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("member_fees.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    method: Mapped[str] = mapped_column(String(20), default=PaymentMethod.CASH, nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    received_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proof_photo_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Hủy thanh toán (Bất biến, không xóa, chỉ đánh dấu void)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    member_fee: Mapped["MemberFee"] = relationship("MemberFee", back_populates="payments", lazy="joined")
    receiver: Mapped["User"] = relationship("User", foreign_keys=[received_by_id], lazy="joined")
    voider: Mapped[Optional["User"]] = relationship("User", foreign_keys=[voided_by_id], lazy="joined")
    ledger_entry: Mapped[Optional["LedgerEntry"]] = relationship("LedgerEntry", back_populates="fee_payment", uselist=False)

    @property
    def is_voided(self) -> bool:
        return self.voided_at is not None


class PaymentClaim(Base):
    __tablename__ = "payment_claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_fee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("member_fees.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    transfer_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    proof_photo_path: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default=ClaimStatus.PENDING, nullable=False, index=True)
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

    member_fee: Mapped["MemberFee"] = relationship("MemberFee", back_populates="claims", lazy="joined")
    reviewer: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reviewed_by_id], lazy="joined")
