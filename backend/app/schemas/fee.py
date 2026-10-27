from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class FeePeriodCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Tên kỳ thu (ví dụ: Hội phí HK1 2026-2027)")
    amount: int = Field(..., gt=0, description="Mức thu tiêu chuẩn mỗi người (VND, số nguyên > 0)")
    due_date: datetime = Field(..., description="Hạn hoàn thành đóng phí")
    description: Optional[str] = Field(None, description="Ghi chú thêm về kỳ thu")


class FeePeriodUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    amount: Optional[int] = Field(None, gt=0)
    due_date: Optional[datetime] = None
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|closed)$")


class FeePeriodOut(BaseModel):
    id: int
    name: str
    amount: int
    due_date: datetime
    description: Optional[str] = None
    status: str
    created_by_id: int
    creator_name: Optional[str] = None
    total_members: int = 0
    total_collected: int = 0
    total_expected: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemberFeeDiscountUpdate(BaseModel):
    discount_amount: int = Field(..., ge=0, description="Số tiền miễn giảm (VND, >= 0)")
    discount_reason: str = Field(..., min_length=3, description="Lý do miễn giảm (bắt buộc ghi nhận kiểm toán)")


class FeePaymentCreate(BaseModel):
    member_fee_id: int = Field(..., description="ID khoản phải đóng")
    amount: int = Field(..., gt=0, description="Số tiền thanh toán (VND, > 0)")
    method: str = Field(default="cash", pattern="^(cash|bank_transfer)$")
    paid_at: Optional[datetime] = Field(None, description="Thời điểm thanh toán (mặc định hiện tại)")
    note: Optional[str] = Field(None, description="Ghi chú phiếu thu")
    proof_photo_path: Optional[str] = Field(None, description="Đường dẫn ảnh chứng từ/biên lai nếu có")


class FeePaymentVoid(BaseModel):
    void_reason: str = Field(..., min_length=3, description="Lý do hủy thanh toán (bắt buộc)")


class FeePaymentOut(BaseModel):
    id: int
    receipt_code: str
    member_fee_id: int
    amount: int
    method: str
    paid_at: datetime
    received_by_id: int
    receiver_name: Optional[str] = None
    note: Optional[str] = None
    proof_photo_path: Optional[str] = None
    is_voided: bool = False
    voided_at: Optional[datetime] = None
    voided_by_id: Optional[int] = None
    voider_name: Optional[str] = None
    void_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentClaimCreate(BaseModel):
    member_fee_id: int = Field(..., description="ID khoản phải đóng")
    amount: int = Field(..., gt=0, description="Số tiền đã chuyển khoản (VND, > 0)")
    transfer_time: datetime = Field(..., description="Thời gian giao dịch chuyển khoản")
    note: Optional[str] = Field(None, description="Ghi chú người gửi")


class PaymentClaimReview(BaseModel):
    status: str = Field(..., pattern="^(confirmed|rejected)$", description="Xác nhận hoặc từ chối")
    review_note: Optional[str] = Field(None, description="Ghi chú hoặc lý do từ chối")


class PaymentClaimOut(BaseModel):
    id: int
    member_fee_id: int
    period_name: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    student_id: Optional[str] = None
    amount: int
    transfer_time: datetime
    proof_photo_path: str
    note: Optional[str] = None
    status: str
    reviewed_by_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemberFeeOut(BaseModel):
    id: int
    period_id: int
    period_name: str
    period_due_date: datetime
    period_status: str
    user_id: int
    user_name: str
    student_id: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    amount_due: int
    discount_amount: int = 0
    discount_reason: Optional[str] = None
    net_amount_due: int
    total_paid: int
    remaining_due: int
    status: str
    is_overdue: bool = False
    payments: List[FeePaymentOut] = []
    claims: List[PaymentClaimOut] = []
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DepartmentMemberFeeStatusOut(BaseModel):
    """Schema hạn chế dành riêng cho Trưởng ban xem tình trạng đóng hội phí của thành viên ban mình.
    KHÔNG hiển thị số tiền, ghi chú hay lý do miễn giảm theo yêu cầu bảo mật tài chính.
    """
    user_id: int
    full_name: str
    student_id: str
    department_id: Optional[int] = None
    status: str
    is_overdue: bool = False

    model_config = ConfigDict(from_attributes=True)


class AddMemberToPeriodInput(BaseModel):
    user_id: int = Field(..., description="ID thành viên cần thêm vào kỳ")
    amount_due: Optional[int] = Field(None, gt=0, description="Số tiền phải đóng (mặc định lấy theo kỳ)")
    discount_amount: int = Field(default=0, ge=0, description="Miễn giảm ban đầu nếu có")
    discount_reason: Optional[str] = Field(None, description="Lý do miễn giảm nếu có")
