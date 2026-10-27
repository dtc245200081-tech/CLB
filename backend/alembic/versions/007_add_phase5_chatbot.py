"""Add Phase 5: Chatbot AI, Documents, Document Chunks with Vector, Conversations, Messages, Chat Logs, and Rate Limits

Revision ID: 007_add_phase5_chatbot
Revises: 006_add_phase4_features
Create Date: 2026-10-26 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "007_add_phase5_chatbot"
down_revision: Union[str, None] = "006_add_phase4_features"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    # 1. Bật extension pgvector nếu đang chạy trên PostgreSQL
    if dialect_name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Bảng documents (Tài liệu tri thức chuẩn của CLB)
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("title", sa.String(length=255), nullable=False, index=True),
        sa.Column("category", sa.String(length=100), nullable=False, index=True),
        sa.Column("audience", sa.String(length=50), server_default="public", nullable=False, index=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False, index=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 3. Bảng document_chunks (Đoạn tài liệu kèm Vector Embedding)
    if dialect_name == "postgresql":
        try:
            from pgvector.sqlalchemy import Vector
            vector_col = Vector(768)
        except ImportError:
            vector_col = sa.Text()
    else:
        vector_col = sa.Text()

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("heading", sa.String(length=255), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", vector_col, nullable=True),
        sa.Column("embedding_model", sa.String(length=100), server_default="gemini-embedding-001", nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Tạo HNSW index trên PostgreSQL cho tìm kiếm vector nhanh
    if dialect_name == "postgresql":
        try:
            op.execute(
                "CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw "
                "ON document_chunks USING hnsw (embedding vector_cosine_ops);"
            )
        except Exception:
            pass

    # 4. Bảng conversations
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("session_id", sa.String(length=100), nullable=True, index=True),
        sa.Column("title", sa.String(length=255), server_default="Hỏi đáp CLB", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # 5. Bảng chat_messages
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=True),
        sa.Column("tool_calls", sa.JSON(), nullable=True),
        sa.Column("feedback", sa.String(length=20), nullable=True),
        sa.Column("feedback_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 6. Bảng chat_logs (Nhật ký chẩn đoán kỹ thuật)
    op.create_table(
        "chat_logs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("conversation_id", sa.Integer(), nullable=True, index=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True, index=True),
        sa.Column("user_role", sa.String(length=50), server_default="guest", nullable=False),
        sa.Column("ip_address", sa.String(length=100), nullable=True),
        sa.Column("normalized_query", sa.Text(), nullable=False),
        sa.Column("tools_called", sa.JSON(), nullable=True),
        sa.Column("retrieved_chunks", sa.JSON(), nullable=True),
        sa.Column("cached", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("first_token_latency_ms", sa.Float(), nullable=True),
        sa.Column("total_latency_ms", sa.Float(), nullable=True),
        sa.Column("tokens_input", sa.Integer(), nullable=True),
        sa.Column("tokens_output", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(length=50), nullable=True),
        sa.Column("outcome", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    # 7. Bảng chat_rate_limits
    op.create_table(
        "chat_rate_limits",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("identifier", sa.String(length=100), nullable=False, index=True),
        sa.Column("date", sa.String(length=10), nullable=False, index=True),
        sa.Column("question_count", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_table("chat_rate_limits")
    op.drop_table("chat_logs")
    op.drop_table("chat_messages")
    op.drop_table("conversations")
    op.drop_table("document_chunks")
    op.drop_table("documents")
