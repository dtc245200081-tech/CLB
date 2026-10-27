"""Mô hình CSDL cho Giai đoạn 5: Chatbot AI và Kho Tri Thức RAG."""
import json
from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    TypeDecorator,
    func,
)
from sqlalchemy.orm import relationship

from app.core.config import settings
from app.core.database import Base


class DocumentAudience(str, Enum):
    """Phạm vi đối tượng được phép xem tài liệu."""
    PUBLIC = "public"          # Khách chưa đăng nhập & toàn bộ thành viên
    MEMBER = "member"          # Thành viên chính thức trở lên
    DEPT_HEAD = "dept_head"    # Trưởng ban và Admin
    ADMIN = "admin"            # Chỉ Admin


class VectorType(TypeDecorator):
    """Kiểu dữ liệu Vector tương thích cả PostgreSQL (pgvector) và SQLite (khi chạy Pytest)."""
    impl = Text
    cache_ok = True

    def __init__(self, dim: int = 768, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.dim = dim

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            try:
                from pgvector.sqlalchemy import Vector
                return dialect.type_descriptor(Vector(self.dim))
            except ImportError:
                return dialect.type_descriptor(Text())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        if isinstance(value, (list, tuple)):
            return json.dumps(list(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, (list, tuple)):
            return list(value)
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return []
        return list(value)


class Document(Base):
    """Tài liệu tri thức chuẩn của CLB."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)  # Quy định, Hướng dẫn, Giới thiệu,...
    audience = Column(String(50), nullable=False, default=DocumentAudience.PUBLIC.value, index=True)
    content = Column(Text, nullable=False)  # Nội dung Markdown gốc
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    version = Column(Integer, default=1, nullable=False)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Quan hệ
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class DocumentChunk(Base):
    """Phần đoạn của tài liệu phục vụ tìm kiếm ngữ nghĩa (RAG Embedding)."""
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    heading = Column(String(255), nullable=True)  # Tiêu đề mục cha để giữ ngữ cảnh
    content = Column(Text, nullable=False)
    embedding = Column(VectorType(settings.EMBEDDING_DIM), nullable=True)
    embedding_model = Column(String(100), nullable=False, default=settings.GEMINI_EMBEDDING_MODEL)
    token_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Quan hệ
    document = relationship("Document", back_populates="chunks")


class Conversation(Base):
    """Cuộc trò chuyện giữa người dùng và Chatbot."""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)  # Dành cho khách vãng lai hoặc IP
    title = Column(String(255), nullable=False, default="Hỏi đáp CLB")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Quan hệ
    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessage.created_at")
    user = relationship("User", foreign_keys=[user_id])


class ChatMessage(Base):
    """Tin nhắn đơn lẻ trong cuộc trò chuyện."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # user, assistant, tool, system
    content = Column(Text, nullable=False)
    sources = Column(JSON, nullable=True)  # Danh sách tài liệu tham khảo: [{title, heading, score}]
    tool_calls = Column(JSON, nullable=True)  # Các hàm được gọi trong lượt
    feedback = Column(String(20), nullable=True)  # "up", "down", None
    feedback_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Quan hệ
    conversation = relationship("Conversation", back_populates="messages")


class ChatLog(Base):
    """Nhật ký chẩn đoán kỹ thuật cho mỗi lượt hỏi đáp (bảo đảm quyền riêng tư)."""
    __tablename__ = "chat_logs"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, nullable=True, index=True)
    message_id = Column(Integer, nullable=True)
    user_id = Column(Integer, nullable=True, index=True)
    user_role = Column(String(50), nullable=False, default="guest")
    ip_address = Column(String(100), nullable=True)
    normalized_query = Column(Text, nullable=False)
    tools_called = Column(JSON, nullable=True)  # Chỉ ghi tên hàm và tham số an toàn, KHÔNG ghi kết quả nhạy cảm
    retrieved_chunks = Column(JSON, nullable=True)  # Danh sách đoạn tài liệu và điểm tương đồng
    cached = Column(Boolean, default=False, nullable=False)
    first_token_latency_ms = Column(Float, nullable=True)
    total_latency_ms = Column(Float, nullable=True)
    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    error_code = Column(String(50), nullable=True)
    outcome = Column(String(50), nullable=False)  # answered, no_info, out_of_scope, error, rate_limited
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class ChatRateLimit(Base):
    """Theo dõi số lượng câu hỏi mỗi ngày theo người dùng hoặc theo IP."""
    __tablename__ = "chat_rate_limits"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String(100), nullable=False, index=True)  # "user:{id}" hoặc "ip:{ip}"
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    question_count = Column(Integer, default=0, nullable=False)
