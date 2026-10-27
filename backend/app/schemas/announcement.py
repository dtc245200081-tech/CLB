from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255, description="Tiêu đề bảng tin")
    content: str = Field(..., min_length=1, description="Nội dung thông báo")
    scope: str = Field(default="all", pattern="^(all|department)$", description="Phạm vi thông báo")
    department_id: Optional[int] = Field(None, description="ID ban (nếu scope là department)")
    is_pinned: bool = Field(default=False, description="Ghim lên đầu bảng tin")
    status: str = Field(default="published", pattern="^(draft|published)$", description="Trạng thái xuất bản")


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    scope: Optional[str] = Field(None, pattern="^(all|department)$")
    department_id: Optional[int] = None
    is_pinned: Optional[bool] = None
    status: Optional[str] = Field(None, pattern="^(draft|published)$")


class AnnouncementReaderOut(BaseModel):
    user_id: int
    full_name: str
    student_id: str
    read_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnnouncementOut(BaseModel):
    id: int
    title: str
    content: str
    scope: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    is_pinned: bool = False
    status: str
    published_at: Optional[datetime] = None
    created_by_id: int
    creator_name: Optional[str] = None
    read_count: int = 0
    is_read_by_me: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnnouncementStatsOut(BaseModel):
    read_count: int
    readers: List[AnnouncementReaderOut]
