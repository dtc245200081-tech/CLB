"""Endpoints xử lý hội thoại Chatbot AI cho người dùng và khách vãng lai."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.chatbot.service import chatbot_service
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_any_authenticated
from app.models.chatbot import ChatLog, ChatMessage, Conversation
from app.models.user import User
from app.schemas.chatbot import (
    ChatFeedbackRequest,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatbotAdminStats,
    ConversationDetailResponse,
    ConversationSummaryResponse,
    PublicChatRequest,
    UnansweredQueryItem,
)

router = APIRouter()


@router.post("/messages")
async def send_chat_message(
    payload: ChatMessageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """
    Gửi câu hỏi tới Chatbot AI (dành cho người dùng đã đăng nhập).
    Trả về luồng Server-Sent Events (SSE) theo thời gian thực.
    """
    client_ip = request.client.host if request.client else None

    # Gọi stream từ ChatbotService
    stream = chatbot_service.process_chat_stream(
        db=db,
        user_message=payload.content,
        user=current_user,
        conversation_id=payload.conversation_id,
        client_ip=client_ip,
    )

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations", response_model=List[ConversationSummaryResponse])
async def list_my_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Lấy danh sách các cuộc trò chuyện của chính người dùng đang đăng nhập."""
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(30)
    )
    res = await db.execute(stmt)
    convs = res.scalars().all()

    # Đếm số lượng tin nhắn cho mỗi conversation
    items = []
    for c in convs:
        cnt_stmt = select(func.count(ChatMessage.id)).where(ChatMessage.conversation_id == c.id)
        cnt_res = await db.execute(cnt_stmt)
        msg_count = cnt_res.scalar() or 0
        items.append(
            ConversationSummaryResponse(
                id=c.id,
                title=c.title,
                created_at=c.created_at,
                updated_at=c.updated_at,
                message_count=msg_count,
            )
        )
    return items


@router.delete("/conversations", summary="Xóa toàn bộ lịch sử trò chuyện của chính mình (Tất cả vai trò)")
async def clear_my_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Bất kỳ tác nhân nào (Thành viên, Trưởng ban, Admin) cũng có thể xóa toàn bộ lịch sử trò chuyện của chính mình."""
    stmt = delete(Conversation).where(Conversation.user_id == current_user.id)
    res = await db.execute(stmt)
    deleted_count = res.rowcount or 0
    await db.commit()
    return {"message": f"Đã xóa toàn bộ {deleted_count} cuộc trò chuyện thành công.", "deleted_count": deleted_count}


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation_detail(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Lấy chi tiết cuộc trò chuyện và lịch sử tin nhắn (chỉ xem được của chính mình)."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    res = await db.execute(stmt)
    conv = res.scalars().first()

    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc trò chuyện này.",
        )

    # Kiểm tra phân quyền: thành viên chỉ đọc được hội thoại của chính mình
    if conv.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập cuộc trò chuyện của người khác.",
        )

    return conv


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Xóa một cuộc trò chuyện của chính mình."""
    stmt = select(Conversation).where(Conversation.id == conversation_id)
    res = await db.execute(stmt)
    conv = res.scalars().first()

    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc trò chuyện cần xóa.",
        )

    if conv.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không thể xóa cuộc trò chuyện của người khác.",
        )

    await db.delete(conv)
    await db.commit()
    return None


@router.post("/messages/{message_id}/feedback", response_model=ChatMessageResponse)
async def submit_message_feedback(
    message_id: int,
    payload: ChatFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Đánh giá chất lượng câu trả lời (thumbs up / thumbs down) kèm lý do tùy chọn."""
    stmt = (
        select(ChatMessage)
        .join(Conversation, ChatMessage.conversation_id == Conversation.id)
        .where(ChatMessage.id == message_id)
    )
    res = await db.execute(stmt)
    msg = res.scalars().first()

    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tin nhắn cần đánh giá.",
        )

    # Kiểm tra quyền sở hữu cuộc trò chuyện
    conv = await db.get(Conversation, msg.conversation_id)
    if conv and conv.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có thể đánh giá tin nhắn trong cuộc trò chuyện của chính mình.",
        )

    msg.feedback = payload.feedback
    msg.feedback_note = payload.note
    await db.commit()
    await db.refresh(msg)
    return msg


# --- Endpoints Thống kê dành cho Admin ---

@router.get("/admin/stats", response_model=ChatbotAdminStats)
async def get_chatbot_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Thống kê chất lượng phục vụ của Chatbot AI (chỉ Quản trị viên)."""
    # Tổng số lượt
    total_q = await db.execute(select(func.count(ChatLog.id)))
    total_queries = total_q.scalar() or 0

    # Phân loại outcomes
    answered_q = await db.execute(select(func.count(ChatLog.id)).where(ChatLog.outcome == "answered"))
    answered_count = answered_q.scalar() or 0

    no_info_q = await db.execute(select(func.count(ChatLog.id)).where(ChatLog.outcome == "no_info"))
    no_info_count = no_info_q.scalar() or 0

    out_scope_q = await db.execute(select(func.count(ChatLog.id)).where(ChatLog.outcome == "out_of_scope"))
    out_of_scope_count = out_scope_q.scalar() or 0

    err_q = await db.execute(select(func.count(ChatLog.id)).where(ChatLog.outcome == "error"))
    error_count = err_q.scalar() or 0

    rate_q = await db.execute(select(func.count(ChatLog.id)).where(ChatLog.outcome == "rate_limited"))
    rate_limited_count = rate_q.scalar() or 0

    # Tỷ lệ phản hồi kém
    down_q = await db.execute(select(func.count(ChatMessage.id)).where(ChatMessage.feedback == "down"))
    down_count = down_q.scalar() or 0

    fb_total_q = await db.execute(select(func.count(ChatMessage.id)).where(ChatMessage.feedback.isnot(None)))
    fb_total = fb_total_q.scalar() or 0

    no_info_rate = (no_info_count / total_queries * 100) if total_queries > 0 else 0.0
    negative_feedback_rate = (down_count / fb_total * 100) if fb_total > 0 else 0.0

    # Độ trễ trung bình
    lat_q = await db.execute(
        select(
            func.avg(ChatLog.first_token_latency_ms),
            func.avg(ChatLog.total_latency_ms),
        ).where(ChatLog.total_latency_ms.isnot(None))
    )
    lat_row = lat_q.first()
    avg_first = round(lat_row[0], 2) if lat_row and lat_row[0] else None
    avg_total = round(lat_row[1], 2) if lat_row and lat_row[1] else None

    return ChatbotAdminStats(
        total_queries=total_queries,
        answered_count=answered_count,
        no_info_count=no_info_count,
        out_of_scope_count=out_of_scope_count,
        error_count=error_count,
        rate_limited_count=rate_limited_count,
        no_info_rate=round(no_info_rate, 2),
        negative_feedback_rate=round(negative_feedback_rate, 2),
        avg_first_token_latency_ms=avg_first,
        avg_total_latency_ms=avg_total,
    )


@router.get("/admin/unanswered", response_model=List[UnansweredQueryItem])
async def get_unanswered_or_negative_queries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Danh sách các câu hỏi chưa trả lời được (no_info / error) hoặc bị đánh giá thumbs down.
    Đã ẩn danh hóa hoàn toàn danh tính người dùng để admin bổ sung tài liệu.
    """
    stmt = (
        select(ChatLog)
        .where(
            (ChatLog.outcome.in_(["no_info", "error"]))
        )
        .order_by(ChatLog.created_at.desc())
        .limit(50)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    items = []
    for l in logs:
        # Lấy feedback nếu có
        fb = None
        fb_note = None
        if l.message_id:
            m = await db.get(ChatMessage, l.message_id)
            if m:
                fb = m.feedback
                fb_note = m.feedback_note

        items.append(
            UnansweredQueryItem(
                id=l.id,
                normalized_query=l.normalized_query,
                user_role=l.user_role,
                outcome=l.outcome,
                feedback=fb,
                feedback_note=fb_note,
                created_at=l.created_at,
            )
        )
    return items


@router.delete("/admin/unanswered", summary="Dọn dẹp nhật ký câu hỏi chưa giải đáp / đánh giá kém (Admin)")
async def clear_unanswered_queries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin xóa tất cả các bản ghi nhật ký câu hỏi chưa được giải đáp hoặc bị đánh giá kém của tất cả tác nhân."""
    stmt = delete(ChatLog).where(ChatLog.outcome.in_(["no_info", "error"]))
    res = await db.execute(stmt)
    deleted_count = res.rowcount or 0
    await db.commit()
    return {"message": f"Đã dọn dẹp {deleted_count} bản ghi nhật ký câu hỏi.", "deleted_count": deleted_count}


@router.delete("/admin/unanswered/{log_id}", summary="Xóa một bản ghi nhật ký câu hỏi (Admin)")
async def delete_unanswered_query(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin xóa một bản ghi nhật ký câu hỏi cụ thể."""
    log_item = await db.get(ChatLog, log_id)
    if not log_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bản ghi nhật ký câu hỏi cần xóa.",
        )
    await db.delete(log_item)
    await db.commit()
    return {"message": "Đã xóa bản ghi nhật ký câu hỏi thành công."}


@router.delete("/admin/conversations", summary="Xóa toàn bộ cuộc trò chuyện của hệ thống (Admin)")
async def clear_all_system_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin có quyền xóa toàn bộ lịch sử trò chuyện của tất cả tác nhân trong hệ thống."""
    stmt = delete(Conversation)
    res = await db.execute(stmt)
    deleted_count = res.rowcount or 0
    await db.commit()
    return {"message": f"Đã xóa toàn bộ {deleted_count} cuộc trò chuyện của tất cả tác nhân.", "deleted_count": deleted_count}


@router.delete("/admin/conversations/{conversation_id}", summary="Admin xóa cuộc trò chuyện bất kỳ")
async def admin_delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin xóa một cuộc trò chuyện bất kỳ của bất kỳ tác nhân nào."""
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc trò chuyện cần xóa.",
        )
    await db.delete(conv)
    await db.commit()
    return {"message": "Đã xóa cuộc trò chuyện thành công."}

