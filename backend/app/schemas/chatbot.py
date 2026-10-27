"""Pydantic schemas cho module Chatbot AI và Kho Tri Thức RAG."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ChatMessageRequest(BaseModel):
    """Yêu cầu gửi tin nhắn trò chuyện với Chatbot (người dùng đã đăng nhập)."""
    content: str = Field(..., min_length=1, max_length=2000, description="Nội dung câu hỏi của người dùng")
    conversation_id: Optional[int] = Field(None, description="ID cuộc hội thoại (nếu muốn tiếp tục cuộc trò chuyện cũ)")


class PublicChatRequest(BaseModel):
    """Yêu cầu hỏi đáp cho khách vãng lai (chưa đăng nhập)."""
    content: str = Field(..., min_length=1, max_length=1000, description="Nội dung câu hỏi công khai")
    session_id: Optional[str] = Field(None, description="Định danh phiên của khách trên trình duyệt")


class ChatFeedbackRequest(BaseModel):
    """Gửi phản hồi đánh giá chất lượng câu trả lời (thumbs up / thumbs down)."""
    feedback: str = Field(..., pattern="^(up|down)$", description="Đánh giá: 'up' hoặc 'down'")
    note: Optional[str] = Field(None, max_length=500, description="Lý do hoặc góp ý thêm từ người dùng")


class ChatMessageResponse(BaseModel):
    """Thông tin một tin nhắn trong cuộc trò chuyện."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    sources: Optional[List[Dict[str, Any]]] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    feedback: Optional[str] = None
    feedback_note: Optional[str] = None
    created_at: datetime


class ConversationSummaryResponse(BaseModel):
    """Tóm tắt cuộc trò chuyện cho danh sách lịch sử."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: Optional[int] = 0


class ConversationDetailResponse(BaseModel):
    """Chi tiết một cuộc trò chuyện bao gồm toàn bộ tin nhắn."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageResponse] = []


# --- Schemas Quản lý Kho tài liệu (Admin) ---

class DocumentCreate(BaseModel):
    """Tạo tài liệu tri thức mới."""
    title: str = Field(..., min_length=3, max_length=255)
    category: str = Field(..., min_length=2, max_length=100)
    audience: str = Field(..., pattern="^(public|member|dept_head|admin)$")
    content: str = Field(..., min_length=10)


class DocumentUpdate(BaseModel):
    """Cập nhật tài liệu tri thức."""
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    category: Optional[str] = Field(None, min_length=2, max_length=100)
    audience: Optional[str] = Field(None, pattern="^(public|member|dept_head|admin)$")
    content: Optional[str] = Field(None, min_length=10)
    is_active: Optional[bool] = None


class DocumentResponse(BaseModel):
    """Thông tin trả về của tài liệu tri thức."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category: str
    audience: str
    content: str
    is_active: bool
    version: int
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    chunks_count: Optional[int] = 0


# --- Schemas Thống kê Chất lượng Chatbot (Admin) ---

class ChatbotAdminStats(BaseModel):
    """Số liệu thống kê chất lượng phục vụ của Chatbot."""
    total_queries: int
    answered_count: int
    no_info_count: int
    out_of_scope_count: int
    error_count: int
    rate_limited_count: int
    no_info_rate: float
    negative_feedback_rate: float
    avg_first_token_latency_ms: Optional[float] = None
    avg_total_latency_ms: Optional[float] = None


class UnansweredQueryItem(BaseModel):
    """Một câu hỏi chưa trả lời được hoặc bị đánh giá kém (đã ẩn danh)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    normalized_query: str
    user_role: str
    outcome: str
    feedback: Optional[str] = None
    feedback_note: Optional[str] = None
    created_at: datetime
