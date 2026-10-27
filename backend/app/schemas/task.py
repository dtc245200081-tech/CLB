from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TaskAssigneeOut(BaseModel):
    user_id: int
    full_name: str
    student_id: str
    assigned_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, description="Nội dung bình luận")


class TaskCommentOut(BaseModel):
    id: int
    task_id: int
    user_id: int
    user_name: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255, description="Tiêu đề công việc")
    description: Optional[str] = Field(None, description="Mô tả chi tiết công việc")
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")
    due_date: Optional[datetime] = Field(None, description="Hạn hoàn thành")
    department_id: Optional[int] = Field(None, description="ID ban (nếu là việc nội bộ ban)")
    event_id: Optional[int] = Field(None, description="ID sự kiện (nếu là việc chuẩn bị sự kiện)")
    assignee_ids: List[int] = Field(default_factory=list, description="Danh sách ID người nhận việc")


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    priority: Optional[str] = Field(None, pattern="^(low|normal|high)$")
    due_date: Optional[datetime] = None
    department_id: Optional[int] = None
    event_id: Optional[int] = None
    assignee_ids: Optional[List[int]] = None


class TaskStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(todo|in_progress|done|cancelled)$", description="Trạng thái công việc")


class TaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    priority: str
    status: str
    due_date: Optional[datetime] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    event_id: Optional[int] = None
    event_title: Optional[str] = None
    created_by_id: int
    creator_name: Optional[str] = None
    completed_at: Optional[datetime] = None
    needs_reassignment: bool = False
    is_overdue: bool = False
    assignees: List[TaskAssigneeOut] = []
    comments_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
