from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ExpenseRequestCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255, description="Tiêu đề đề xuất chi")
    description: Optional[str] = Field(None, description="Mục đích chi tiết khoản chi")
    amount_requested: int = Field(..., gt=0, description="Số tiền đề xuất chi (VND, > 0)")
    department_id: Optional[int] = Field(None, description="ID ban đề xuất (nếu là chi của ban)")
    event_id: Optional[int] = Field(None, description="ID sự kiện (nếu chi cho sự kiện)")


class ExpenseRequestReview(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$", description="Duyệt hoặc từ chối đề xuất")
    review_note: Optional[str] = Field(None, description="Lý do từ chối hoặc ghi chú duyệt")


class ExpenseRequestOut(BaseModel):
    id: int
    title: str
    description: str
    amount_requested: int
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    event_id: Optional[int] = None
    event_title: Optional[str] = None
    requested_by_id: int
    requested_by_name: Optional[str] = None
    status: str
    reviewed_by_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecordExpenseInput(BaseModel):
    expense_request_id: int = Field(..., description="ID đề xuất chi đã được duyệt")
    amount: int = Field(..., gt=0, description="Số tiền chi thực tế (VND, > 0)")
    category: str = Field(default="supplies", description="Hạng mục chi")
    description: Optional[str] = Field(None, description="Nội dung thực chi")
    occurred_at: Optional[datetime] = Field(None, description="Thời điểm phát sinh chi")
    receipt_photo_path: Optional[str] = Field(None, description="Đường dẫn ảnh chứng từ/hóa đơn")
    explanation_note: Optional[str] = Field(None, description="Giải trình nếu số tiền chi khác số duyệt")


class RecordOtherIncomeInput(BaseModel):
    amount: int = Field(..., gt=0, description="Số tiền thu (VND, > 0)")
    category: str = Field(..., min_length=2, description="Hạng mục thu (tài trợ, bán vé, đóng góp...)")
    description: str = Field(..., min_length=3, description="Mô tả nguồn thu")
    occurred_at: Optional[datetime] = Field(None, description="Thời điểm thu")
    event_id: Optional[int] = Field(None, description="ID sự kiện liên quan nếu có")
    receipt_photo_path: Optional[str] = Field(None, description="Đường dẫn ảnh biên lai/chứng từ")


class LedgerEntryVoid(BaseModel):
    void_reason: str = Field(..., min_length=3, description="Lý do hủy bút toán (bắt buộc)")


class LedgerEntryOut(BaseModel):
    id: int
    type: str  # 'income' hoặc 'expense'
    amount: int
    category: str
    description: str
    occurred_at: datetime
    event_id: Optional[int] = None
    event_title: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    fee_payment_id: Optional[int] = None
    expense_request_id: Optional[int] = None
    recorded_by_id: int
    recorded_by_name: Optional[str] = None
    receipt_photo_path: Optional[str] = None
    is_voided: bool = False
    voided_at: Optional[datetime] = None
    voided_by_id: Optional[int] = None
    voider_name: Optional[str] = None
    void_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FinanceOverviewOut(BaseModel):
    fund_balance: int
    current_balance: Optional[int] = None
    total_income: int
    total_expense: int
    by_category: List[Dict[str, Any]] = []
    weekly_summary: List[Dict[str, Any]] = []
    monthly_summary: List[Dict[str, Any]] = []
    semester_summary: List[Dict[str, Any]] = []
    yearly_summary: List[Dict[str, Any]] = []
    recent_entries: List[Dict[str, Any]] = []


class FundReportOut(BaseModel):
    current_balance: int
    total_income: int
    total_expense: int
    weekly_summary: List[Dict[str, Any]] = []
    monthly_summary: List[Dict[str, Any]] = []
    semester_summary: List[Dict[str, Any]] = []
    yearly_summary: List[Dict[str, Any]] = []
    category_summary: List[Dict[str, Any]] = []
    event_summary: List[Dict[str, Any]] = []
    department_summary: List[Dict[str, Any]] = []
    fee_periods: List[Dict[str, Any]] = []



class FeePeriodReportOut(BaseModel):
    period_id: int
    period_name: str
    amount_per_member: int
    total_members: int
    total_expected: int
    total_collected: int
    total_remaining: int
    collection_rate_percent: float
    paid_count: int
    partial_count: int
    unpaid_count: int
    waived_count: int
