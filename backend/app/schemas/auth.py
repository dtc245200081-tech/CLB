from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from app.schemas.user import UserResponse
from app.core.security import validate_password_complexity


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email đăng nhập")
    password: str = Field(..., description="Mật khẩu")

    @field_validator("email")
    @classmethod
    def email_to_lower(cls, v: str) -> str:
        return v.strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., description="Mật khẩu hiện tại")
    new_password: str = Field(..., min_length=8, description="Mật khẩu mới (tối thiểu 8 ký tự, có chữ hoa và ký tự đặc biệt)")

    @field_validator("new_password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        return validate_password_complexity(v)

