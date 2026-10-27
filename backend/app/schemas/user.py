from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from app.core.security import validate_password_complexity


class UserBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150, description="Họ và tên")
    phone: Optional[str] = Field(None, max_length=20, description="Số điện thoại liên hệ")
    faculty: Optional[str] = Field(None, max_length=150, description="Khoa / Viện")
    class_name: Optional[str] = Field(None, max_length=100, description="Lớp sinh hoạt")


class UserResponse(UserBase):
    id: int
    email: str
    student_id: str
    title: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    is_active: bool
    is_treasurer: bool = False
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


UserOut = UserResponse


class UserCreate(UserBase):
    email: EmailStr
    student_id: str = Field(..., min_length=2, max_length=50)
    title: Optional[str] = Field(None, max_length=100)
    role: str = Field(default="member", pattern="^(admin|department_head|member)$")
    password: str = Field(..., min_length=8, description="Mật khẩu khởi tạo")

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


class UserSelfUpdate(BaseModel):
    """Schema dành cho Thành viên tự cập nhật thông tin liên hệ của chính mình.
    Tuyệt đối không cho phép sửa role, title, email, student_id hay is_active.
    """
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    phone: Optional[str] = Field(None, max_length=20)
    faculty: Optional[str] = Field(None, max_length=150)
    class_name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)


class UserAdminUpdate(BaseModel):
    """Schema dành cho Admin cập nhật thông tin thành viên.
    Tuyệt đối không nhận mật khẩu ở endpoint này theo quy định bảo mật.
    """
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    phone: Optional[str] = Field(None, max_length=20)
    faculty: Optional[str] = Field(None, max_length=150)
    class_name: Optional[str] = Field(None, max_length=100)
    title: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field(None, pattern="^(admin|department_head|member)$")
    is_active: Optional[bool] = None
    is_treasurer: Optional[bool] = None


class UserTreasurerToggle(BaseModel):
    """Schema bật/tắt cờ quyền thủ quỹ."""
    is_treasurer: bool = Field(..., description="Cờ quyền thủ quỹ (True/False)")


class UserDepartmentUpdate(BaseModel):
    """Schema dành cho Admin gán, chuyển hoặc đưa thành viên ra khỏi ban."""
    department_id: Optional[int] = Field(None, description="ID ban cần gán/chuyển. Gửi null để xóa khỏi ban.")
