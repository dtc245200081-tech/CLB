from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from app.core.security import validate_password_complexity


class JoinRequestCreate(BaseModel):
    email: EmailStr
    student_id: str = Field(..., min_length=2, max_length=50, description="Mã số sinh viên")
    full_name: str = Field(..., min_length=2, max_length=150, description="Họ và tên")
    phone: Optional[str] = Field(None, max_length=20, description="Số điện thoại")
    faculty: Optional[str] = Field(None, max_length=150, description="Khoa / Viện")
    class_name: Optional[str] = Field(None, max_length=100, description="Lớp sinh hoạt")
    reason: Optional[str] = Field(None, description="Lý do muốn tham gia CLB")
    password: str = Field(..., min_length=8, description="Mật khẩu tự đặt cho tài khoản sau khi được duyệt")

    @field_validator("email")
    @classmethod
    def email_to_lower(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("student_id")
    @classmethod
    def clean_student_id(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        return validate_password_complexity(v)



class JoinRequestReject(BaseModel):
    review_note: Optional[str] = Field(None, description="Ghi chú / lý do từ chối đơn")


class JoinRequestResponse(BaseModel):
    id: int
    email: str
    student_id: str
    full_name: str
    phone: Optional[str] = None
    faculty: Optional[str] = None
    class_name: Optional[str] = None
    reason: Optional[str] = None
    status: str
    review_note: Optional[str] = None
    reviewed_by_id: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
