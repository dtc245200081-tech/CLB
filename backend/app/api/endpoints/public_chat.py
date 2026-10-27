"""Endpoint hỏi đáp công khai dành cho khách vãng lai (Public Guest Chat)."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.chatbot.service import chatbot_service
from app.core.database import get_db
from app.schemas.chatbot import PublicChatRequest

router = APIRouter()


@router.post("")
async def public_chat(
    payload: PublicChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Hỏi đáp công khai cho khách chưa đăng nhập.
    Giới hạn tần suất chặt chẽ theo địa chỉ IP.
    Chỉ cho phép tra cứu thông tin công khai (giới thiệu CLB, quy trình gia nhập, sự kiện mở).
    """
    client_ip = request.client.host if request.client else "unknown"

    stream = chatbot_service.process_chat_stream(
        db=db,
        user_message=payload.content,
        user=None,
        conversation_id=None,
        session_id=payload.session_id,
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
