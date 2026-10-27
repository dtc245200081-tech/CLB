from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class DepartmentBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Tên ban chuyên môn")
    description: Optional[str] = Field(None, description="Mô tả chức năng nhiệm vụ của ban")


class DepartmentCreate(DepartmentBase):
    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Tên ban phải có ít nhất 2 ký tự")
        return cleaned


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if len(cleaned) < 2:
                raise ValueError("Tên ban phải có ít nhất 2 ký tự")
            return cleaned
        return v


class DepartmentHeadAssign(BaseModel):
    user_id: int = Field(..., description="ID thành viên được chỉ định làm trưởng ban")


class DepartmentHeadOut(BaseModel):
    id: int
    full_name: str
    email: str
    student_id: str
    title: Optional[str] = None
    role: str

    model_config = ConfigDict(from_attributes=True)


class DepartmentResponse(DepartmentBase):
    id: int
    head_id: Optional[int] = None
    head_name: Optional[str] = None
    head: Optional[DepartmentHeadOut] = None
    is_active: bool
    member_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
