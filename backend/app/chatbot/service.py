"""Dịch vụ điều phối xử lý hội thoại Chatbot AI (Chatbot Service Pipeline).

Xử lý luồng:
1. Kiểm tra giới hạn tần suất (Rate Limiting) theo ngày cho người dùng/IP.
2. Nạp lịch sử hội thoại gần nhất (cắt theo CHAT_HISTORY_TURNS).
3. Chuẩn bị tools theo vai trò và System Instruction chèn ngày giờ/ngữ cảnh.
4. Vòng lặp Function Calling tối đa 3 vòng (chạy song song các hàm độc lập).
5. Cơ chế dự phòng thông minh (Local Database Fallback): Khi Google Gemini API
   hết hạn mức (429 Quota Exceeded) hoặc lỗi mạng, hệ thống tự động nhận diện ý định
   và tra cứu dữ liệu CSDL trực tiếp, định dạng phản hồi chuẩn xác cho người dùng.
6. Trả về luồng streaming (SSE) và ghi nhật ký chẩn đoán chi tiết (ChatLog).
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chatbot.gemini_client import (
    GeminiClient,
    GeminiError,
    InvalidApiKeyError,
    QuotaExceededError,
    SafetyBlockedError,
    GeminiTimeoutError,
    gemini_client,
)
from app.chatbot.prompt import build_system_instruction
from app.chatbot.tools import ToolExecutor, get_tool_declarations_for_role
from app.core.config import settings
from app.models.chatbot import ChatLog, ChatMessage, ChatRateLimit, Conversation
from app.models.user import SystemRole, User

logger = logging.getLogger(__name__)


async def check_and_increment_rate_limit(
    db: AsyncSession,
    identifier: str,
    max_allowed: int,
) -> Tuple[bool, int]:
    """
    Kiểm tra và tăng số lượng câu hỏi trong ngày.
    Trả về: (is_allowed: bool, current_count: int)
    """
    today_str = datetime.now().strftime("%Y-%m-%d")

    stmt = select(ChatRateLimit).where(
        ChatRateLimit.identifier == identifier,
        ChatRateLimit.date == today_str,
    )
    res = await db.execute(stmt)
    record = res.scalars().first()

    if not record:
        record = ChatRateLimit(identifier=identifier, date=today_str, question_count=1)
        db.add(record)
        await db.commit()
        return True, 1

    if record.question_count >= max_allowed:
        return False, record.question_count

    record.question_count += 1
    await db.commit()
    return True, record.question_count


class ChatbotService:
    """Service điều phối toàn bộ quy trình hội thoại và sinh phản hồi."""

    def __init__(self, client: Optional[GeminiClient] = None):
        self.client = client or gemini_client

    async def get_or_create_conversation(
        self,
        db: AsyncSession,
        conversation_id: Optional[int],
        user: Optional[User],
        session_id: Optional[str],
        first_message: str,
    ) -> Conversation:
        """Lấy hoặc tạo mới cuộc trò chuyện, bảo đảm cách ly dữ liệu giữa người dùng."""
        if conversation_id:
            stmt = select(Conversation).where(Conversation.id == conversation_id)
            if user:
                stmt = stmt.where(Conversation.user_id == user.id)
            elif session_id:
                stmt = stmt.where(Conversation.session_id == session_id)
            res = await db.execute(stmt)
            conv = res.scalars().first()
            if conv:
                return conv

        # Tạo cuộc trò chuyện mới
        title = first_message.strip()[:40] if first_message else "Hỏi đáp CLB"
        if len(first_message.strip()) > 40:
            title += "..."

        conv = Conversation(
            user_id=user.id if user else None,
            session_id=session_id if not user else None,
            title=title,
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        return conv

    # ============================================================
    # Các hàm định dạng dữ liệu CSDL sang văn bản Markdown (Fallback)
    # ============================================================

    def _format_events(self, events: List[Dict[str, Any]]) -> str:
        if not events:
            return "Hiện tại không có sự kiện nào sắp tới trong hệ thống câu lạc bộ."
        lines = ["📅 **Danh sách sự kiện câu lạc bộ:**\n"]
        for idx, ev in enumerate(events, 1):
            title = ev.get("title", "Sự kiện")
            st = ev.get("start_time", "Chưa xác định")
            loc = ev.get("location") or "Trực tuyến / Thông báo sau"
            lines.append(f"{idx}. **{title}**")
            lines.append(f"   - ⏰ **Thời gian:** {st}")
            lines.append(f"   - 📍 **Địa điểm:** {loc}")
            if ev.get("description"):
                desc = ev["description"].strip()
                if len(desc) > 120:
                    desc = desc[:120] + "..."
                lines.append(f"   - 📝 **Mô tả:** {desc}")
            lines.append("")
        return "\n".join(lines).strip()

    def _format_members(self, res: Dict[str, Any]) -> str:
        if "error" in res:
            return f"⚠️ {res['error']}"
        members = res.get("members", [])
        if not members:
            return "Hiện tại ban chuyên môn chưa có danh sách thành viên nào."
        lines = [f"👥 **Danh sách thành viên ban chuyên môn ({len(members)} thành viên):**\n"]
        for idx, m in enumerate(members, 1):
            name = m.get("full_name", "Thành viên")
            sid = m.get("student_id", "")
            title = m.get("title") or m.get("role") or "Hội viên"
            faculty = m.get("faculty") or "CLB Sinh viên"
            lines.append(f"{idx}. **{name}** (MSSV: `{sid}`) - *{title}* - Khoa: {faculty}")
        return "\n".join(lines).strip()

    def _format_tasks(self, res: Dict[str, Any]) -> str:
        if "error" in res:
            return f"⚠️ {res['error']}"
        tasks = res.get("tasks", [])
        if not tasks:
            return "🎉 Bạn hiện không có nhiệm vụ hoặc công việc nào cần xử lý."
        lines = [f"📋 **Danh sách nhiệm vụ công việc của bạn ({len(tasks)} việc):**\n"]
        for idx, t in enumerate(tasks, 1):
            status = "✅ Hoàn thành" if t.get("status") == "completed" else ("⚠️ Quá hạn" if t.get("is_overdue") else "⏳ Đang thực hiện")
            lines.append(f"{idx}. **{t.get('title')}** - {status}")
            lines.append(f"   - Hạn chót: {t.get('due_date') or 'Không thời hạn'} | Mức ưu tiên: {t.get('priority') or 'Bình thường'}")
        return "\n".join(lines).strip()

    def _format_fees(self, res: Dict[str, Any]) -> str:
        if "error" in res:
            return f"⚠️ {res['error']}"
        fees = res.get("fees", [])
        bank = res.get("bank_transfer_info", {})
        lines = ["💰 **Tình trạng đóng hội phí của bạn:**\n"]
        if fees:
            for f in fees:
                st = f.get("status")
                st_text = "✅ Đã đóng đủ" if st == "paid" else ("⏳ Đang chờ duyệt" if st == "pending_verification" else "❌ Chưa hoàn thành")
                lines.append(f"- **{f.get('period_name')}**: Số tiền {f.get('amount_due')} (Đã nộp: {f.get('paid_amount')}) - Trạng thái: {st_text}")
        else:
            lines.append("Hiện bạn không có kỳ hội phí nào đang mở cần hoàn thành.")
        if bank and bank.get("account_number"):
            lines.append("\n💳 **Thông tin tài khoản đóng quỹ CLB:**")
            lines.append(f"- Ngân hàng: {bank.get('bank_name')}")
            lines.append(f"- Số tài khoản: `{bank.get('account_number')}`")
            lines.append(f"- Chủ tài khoản: {bank.get('account_name')}")
            lines.append(f"- Cú pháp: `{bank.get('transfer_syntax')}`")
        return "\n".join(lines).strip()

    def _format_announcements(self, res: Dict[str, Any]) -> str:
        items = res.get("announcements", [])
        if not items:
            return "Hiện chưa có thông báo mới nào trên bảng tin CLB."
        lines = ["📢 **Thông báo mới nhất từ Ban Chủ Nhiệm:**\n"]
        for idx, a in enumerate(items, 1):
            lines.append(f"{idx}. **{a.get('title')}** ({a.get('published_at')})")
            if a.get("content_summary"):
                lines.append(f"   {a['content_summary']}")
        return "\n".join(lines).strip()

    def _format_profile(self, res: Dict[str, Any]) -> str:
        if "error" in res:
            return f"⚠️ {res['error']}"
        lines = [
            "👤 **Thông tin tài khoản hội viên của bạn:**",
            f"- Họ và tên: **{res.get('full_name')}**",
            f"- Mã số sinh viên: `{res.get('student_id')}`",
            f"- Ban chuyên môn: **{res.get('department')}**",
            f"- Chức vụ: **{res.get('title')}**",
            f"- Khoa / Viện: {res.get('faculty')}",
            f"- Lớp sinh hoạt: {res.get('class_name')}",
            f"- Email liên hệ: {res.get('email')}",
        ]
        return "\n".join(lines)

    def _format_chunks(self, res: Dict[str, Any]) -> str:
        chunks = res.get("chunks", [])
        if not chunks:
            return "Không tìm thấy nội dung quy chế hoặc tài liệu liên quan đến câu hỏi trong hệ thống."
        lines = ["📖 **Thông tin trích dẫn từ quy chế & tài liệu CLB:**\n"]
        for idx, c in enumerate(chunks[:3], 1):
            lines.append(f"**{idx}. {c.get('title')} - {c.get('heading')}:**")
            lines.append(f"{c.get('content')}\n")
        return "\n".join(lines).strip()

    def _format_tool_results(self, executed_results: List[Dict[str, Any]]) -> str:
        parts = []
        for item in executed_results:
            fn_name = item.get("name")
            res = item.get("result", {})
            if fn_name in ["get_events", "get_public_events"]:
                parts.append(self._format_events(res.get("events", [])))
            elif fn_name == "get_department_members":
                parts.append(self._format_members(res))
            elif fn_name == "get_my_tasks":
                parts.append(self._format_tasks(res))
            elif fn_name == "get_my_fees":
                parts.append(self._format_fees(res))
            elif fn_name == "get_recent_announcements":
                parts.append(self._format_announcements(res))
            elif fn_name == "get_my_profile_and_department":
                parts.append(self._format_profile(res))
            elif "search" in fn_name:
                parts.append(self._format_chunks(res))
            else:
                parts.append(json.dumps(res, ensure_ascii=False, indent=2))
        return "\n\n".join(parts)

    async def _try_local_intent_fallback(
        self,
        query: str,
        tool_executor: ToolExecutor,
        user: Optional[User],
    ) -> Optional[Tuple[str, str, Dict[str, Any]]]:
        """Tự động nhận diện ý định và tra cứu trực tiếp dữ liệu CLB khi Gemini bị hết hạn mức hoặc lỗi."""
        q = query.lower().strip()

        # 1. Sự kiện / hoạt động
        event_kw = ["sự kiện", "suwk kiện", "hoạt động", "event", "lịch trình", "buổi sinh hoạt", "sắp tới", "có những sự kiện", "sukien", "su kien"]
        if any(k in q for k in event_kw):
            time_filter = "all" if ("tất cả" in q or "tat ca" in q) else "upcoming"
            if user:
                res = await tool_executor.execute("get_events", {"time_filter": time_filter})
                tool_name = "get_events"
            else:
                res = await tool_executor.execute("get_public_events", {"limit": 5})
                tool_name = "get_public_events"
            reply = (
                "> 💡 *Dịch vụ AI đang tạm hết hạn mức hôm nay, hệ thống tự động tra cứu dữ liệu sự kiện trực tiếp từ hệ thống:*\n\n"
                + self._format_events(res.get("events", []))
            )
            return tool_name, reply, res

        # 2. Thành viên / Ban chuyên môn
        member_kw = ["thành viên", "thanh vien", "ban chuyên môn", "ban chuyen mon", "ban truyền thông", "ban sự kiện", "ban đối ngoại", "hội viên", "danh sách ban", "bch"]
        if any(k in q for k in member_kw):
            if not user:
                reply = "Bạn cần đăng nhập vào hệ thống để tra cứu danh sách thành viên ban chuyên môn."
                return "auth_required", reply, {}
            if user.role in [SystemRole.DEPARTMENT_HEAD, SystemRole.ADMIN]:
                res = await tool_executor.execute("get_department_members", {})
                tool_name = "get_department_members"
                reply = (
                    "> 💡 *Dịch vụ AI đang tạm hết hạn mức hôm nay, hệ thống hiển thị trực tiếp danh sách thành viên ban:*\n\n"
                    + self._format_members(res)
                )
            else:
                res = await tool_executor.execute("get_my_profile_and_department", {})
                tool_name = "get_my_profile_and_department"
                reply = (
                    "> 💡 *Dịch vụ AI đang tạm hết hạn mức hôm nay, hiển thị thông tin ban của bạn:*\n\n"
                    + self._format_profile(res)
                )
            return tool_name, reply, res

        # 3. Nhiệm vụ / Công việc
        task_kw = ["công việc", "cong viec", "nhiệm vụ", "nhiem vu", "task", "tiến độ", "deadline", "việc cần làm"]
        if any(k in q for k in task_kw):
            if not user:
                return "auth_required", "Vui lòng đăng nhập để xem danh sách nhiệm vụ được giao.", {}
            res = await tool_executor.execute("get_my_tasks", {})
            reply = (
                "> 💡 *Dịch vụ AI đang tạm hết hạn mức hôm nay, hiển thị trực tiếp nhiệm vụ công việc:*\n\n"
                + self._format_tasks(res)
            )
            return "get_my_tasks", reply, res

        # 4. Hội phí / Quỹ CLB
        fee_kw = ["hội phí", "hoi phi", "tiền quỹ", "tien quy", "quỹ clb", "đóng quỹ", "đóng phí", "chuyển khoản", "stk", "tài khoản"]
        if any(k in q for k in fee_kw):
            if not user:
                return "auth_required", "Vui lòng đăng nhập để kiểm tra tình trạng hội phí của bạn.", {}
            res = await tool_executor.execute("get_my_fees", {})
            reply = (
                "> 💡 *Dịch vụ AI đang tạm hết hạn mức hôm nay, hiển thị trực tiếp tình trạng hội phí:*\n\n"
                + self._format_fees(res)
            )
            return "get_my_fees", reply, res

        # 5. Thông báo / Bảng tin
        notice_kw = ["thông báo", "thong bao", "bảng tin", "bang tin", "tin tức", "tin mới"]
        if any(k in q for k in notice_kw):
            res = await tool_executor.execute("get_recent_announcements", {"limit": 5})
            reply = (
                "> 💡 *Dịch vụ AI đang tạm hết hạn mức hôm nay, hiển thị thông báo mới nhất trên bảng tin:*\n\n"
                + self._format_announcements(res)
            )
            return "get_recent_announcements", reply, res

        # 6. Hồ sơ cá nhân
        profile_kw = ["hồ sơ", "thông tin cá nhân", "tôi là ai", "tai khoan cua toi", "tài khoản của tôi"]
        if any(k in q for k in profile_kw):
            if not user:
                return "auth_required", "Bạn chưa đăng nhập vào hệ thống.", {}
            res = await tool_executor.execute("get_my_profile_and_department", {})
            reply = (
                "> 💡 *Hiển thị thông tin hồ sơ tài khoản:*\n\n"
                + self._format_profile(res)
            )
            return "get_my_profile_and_department", reply, res

        # 7. Quy chế / Quy định
        doc_kw = ["quy chế", "quy che", "nội quy", "noi quy", "điều lệ", "dieu le", "quy định", "quy dinh", "gia nhập", "đăng ký vào clb"]
        if any(k in q for k in doc_kw):
            tool_name = "search_club_documents" if user else "search_public_documents"
            res = await tool_executor.execute(tool_name, {"query": query})
            reply = (
                "> 💡 *Dịch vụ AI đang tạm hết hạn mức hôm nay, trích dẫn trực tiếp từ sổ tay quy chế CLB:*\n\n"
                + self._format_chunks(res)
            )
            return tool_name, reply, res

        return None

    # ============================================================
    # Xử lý luồng trò chuyện Streaming (SSE)
    # ============================================================

    async def process_chat_stream(
        self,
        db: AsyncSession,
        user_message: str,
        user: Optional[User] = None,
        conversation_id: Optional[int] = None,
        session_id: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """
        Xử lý tin nhắn và stream phản hồi dưới dạng Server-Sent Events (SSE).
        Định dạng event:
        - status: {"text": "..."}
        - tool_call: {"tool": "...", "params": {...}}
        - delta: {"text": "..."}
        - sources: [{"title": "...", "score": 0.85}]
        - done: {"conversation_id": ..., "message_id": ...}
        - error: {"code": "...", "message": "..."}
        """
        start_time = time.time()
        first_token_time: Optional[float] = None
        normalized_q = user_message.strip()
        user_role = (
            (user.role.value if hasattr(user.role, "value") else str(user.role))
            if user
            else "guest"
        )

        # 1. Kiểm tra giới hạn tần suất (Rate Limiting)
        identifier = f"user:{user.id}" if user else f"ip:{client_ip or 'unknown'}"
        max_daily = (
            settings.CHAT_MAX_QUESTIONS_PER_USER_PER_DAY
            if user
            else settings.CHAT_MAX_QUESTIONS_PER_IP_PER_DAY
        )

        allowed, count = await check_and_increment_rate_limit(db, identifier, max_daily)
        if not allowed:
            err_msg = (
                f"Bạn đã đạt giới hạn {max_daily} câu hỏi trong ngày hôm nay. "
                "Vui lòng quay lại vào ngày mai hoặc liên hệ ban quản trị để được hỗ trợ."
            )
            log = ChatLog(
                user_id=user.id if user else None,
                user_role=user_role,
                ip_address=client_ip,
                normalized_query=normalized_q,
                outcome="rate_limited",
                error_code="RATE_LIMITED",
                total_latency_ms=(time.time() - start_time) * 1000,
            )
            db.add(log)
            await db.commit()

            yield f"event: error\ndata: {json.dumps({'code': 'RATE_LIMITED', 'message': err_msg}, ensure_ascii=False)}\n\n"
            return

        # 2. Lấy hoặc tạo Conversation
        conversation = await self.get_or_create_conversation(
            db=db,
            conversation_id=conversation_id,
            user=user,
            session_id=session_id,
            first_message=normalized_q,
        )

        # Lưu tin nhắn người dùng
        user_msg_record = ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=normalized_q,
        )
        db.add(user_msg_record)
        await db.commit()
        await db.refresh(user_msg_record)

        # 3. Chuẩn bị ngữ cảnh hội thoại
        history_stmt = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(settings.CHAT_HISTORY_TURNS * 2)
        )
        res = await db.execute(history_stmt)
        past_messages = list(reversed(res.scalars().all()))

        contents: List[Dict[str, Any]] = []
        for msg in past_messages:
            if msg.role in ["user", "assistant"]:
                contents.append({
                    "role": "model" if msg.role == "assistant" else "user",
                    "parts": [{"text": msg.content}],
                })

        system_instruction = build_system_instruction(user)
        tools = get_tool_declarations_for_role(user)
        tool_executor = ToolExecutor(db=db, current_user=user)

        executed_tool_results: List[Dict[str, Any]] = []
        tools_called_log: List[Dict[str, Any]] = []
        sources_used: List[Dict[str, Any]] = []
        full_assistant_reply = ""
        outcome = "answered"
        error_code = None

        try:
            # 4. Vòng lặp gọi Tool (tối đa 3 vòng)
            max_loops = 3
            current_loop = 0

            while current_loop < max_loops:
                current_loop += 1
                yield f"event: status\ndata: {json.dumps({'text': 'Đang kết nối AI...'}, ensure_ascii=False)}\n\n"

                # Gọi mô hình để kiểm tra Function Calling
                try:
                    response = await self.client.generate_chat(
                        contents=contents,
                        system_instruction=system_instruction,
                        tools=tools,
                    )
                except GeminiError as exc:
                    logger.warning(f"[ChatbotService] Gemini call failed in loop {current_loop}: {exc.code} - {exc}")
                    # Nếu đã có kết quả tool từ vòng trước, format ngay
                    if executed_tool_results:
                        full_assistant_reply = (
                            "> 💡 *Dịch vụ AI đang tạm hết hạn mức, hiển thị kết quả dữ liệu trực tiếp:*\n\n"
                            + self._format_tool_results(executed_tool_results)
                        )
                        break
                    # Nếu chưa có tool nào, thử nhận diện ý định tra cứu trực tiếp
                    fallback = await self._try_local_intent_fallback(normalized_q, tool_executor, user)
                    if fallback:
                        tool_name, full_assistant_reply, fn_res = fallback
                        tools_called_log.append({"tool": tool_name, "args": {}})
                        break
                    raise exc

                candidate = response.candidates[0] if response.candidates else None
                if not candidate:
                    break

                function_calls = []
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, "function_call") and part.function_call:
                            function_calls.append(part.function_call)

                if not function_calls:
                    # Không gọi hàm -> mô hình đã đưa ra câu trả lời trực tiếp
                    text_parts = [
                        part.text
                        for part in candidate.content.parts
                        if hasattr(part, "text") and part.text
                    ]
                    full_assistant_reply = "".join(text_parts)
                    break

                # Thực thi các hàm được yêu cầu
                contents.append(candidate.content)

                tool_response_parts = []
                for fc in function_calls:
                    fn_name = fc.name
                    fn_args = dict(fc.args) if fc.args else {}

                    yield f"event: status\ndata: {json.dumps({'text': f'Đang tra cứu dữ liệu: {fn_name}...'}, ensure_ascii=False)}\n\n"
                    yield f"event: tool_call\ndata: {json.dumps({'tool': fn_name, 'params': fn_args}, ensure_ascii=False)}\n\n"

                    tools_called_log.append({"tool": fn_name, "args": fn_args})

                    # Thực thi hàm
                    fn_result = await tool_executor.execute(fn_name, fn_args)
                    executed_tool_results.append({"name": fn_name, "args": fn_args, "result": fn_result})

                    if "search" in fn_name and "chunks" in fn_result:
                        for ch in fn_result.get("chunks", []):
                            sources_used.append({
                                "title": ch.get("title"),
                                "heading": ch.get("heading"),
                                "score": ch.get("score"),
                            })

                    tool_response_parts.append({
                        "function_response": {
                            "name": fn_name,
                            "response": {"result": fn_result},
                        }
                    })

                contents.append({
                    "role": "user",
                    "parts": tool_response_parts,
                })

            # Nếu kết thúc vòng lặp sau khi có kết quả hàm mà chưa có câu trả lời cuối,
            # gọi mô hình lượt cuối để diễn đạt câu trả lời
            if not full_assistant_reply:
                yield f"event: status\ndata: {json.dumps({'text': 'Đang tổng hợp câu trả lời...'}, ensure_ascii=False)}\n\n"
                try:
                    final_resp = await self.client.generate_chat(
                        contents=contents,
                        system_instruction=system_instruction,
                        tools=tools,
                    )
                    if final_resp.candidates and final_resp.candidates[0].content:
                        text_parts = [
                            p.text
                            for p in final_resp.candidates[0].content.parts
                            if hasattr(p, "text") and p.text
                        ]
                        full_assistant_reply = "".join(text_parts)
                except Exception as e:
                    logger.warning(f"[ChatbotService] Lỗi khi tổng hợp câu trả lời từ AI ({e}), chuyển sang định dạng dữ liệu trực tiếp.")
                    if executed_tool_results:
                        full_assistant_reply = (
                            "> 💡 *Dịch vụ AI đang tạm hết hạn mức, hiển thị kết quả dữ liệu trực tiếp:*\n\n"
                            + self._format_tool_results(executed_tool_results)
                        )
                    else:
                        raise e

            if full_assistant_reply:
                if first_token_time is None:
                    first_token_time = time.time()
                yield f"event: delta\ndata: {json.dumps({'text': full_assistant_reply}, ensure_ascii=False)}\n\n"

            # Đánh giá kết cục câu trả lời
            lower_reply = full_assistant_reply.lower()
            if "chưa có thông tin" in lower_reply or "không tìm thấy" in lower_reply:
                outcome = "no_info"
            elif "ngoài phạm vi" in lower_reply or "chỉ hỗ trợ" in lower_reply:
                outcome = "out_of_scope"

            # Gửi nguồn trích dẫn nếu có
            if sources_used:
                yield f"event: sources\ndata: {json.dumps(sources_used, ensure_ascii=False)}\n\n"

            # 5. Lưu tin nhắn Assistant vào CSDL
            assistant_msg = ChatMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=full_assistant_reply,
                sources=sources_used if sources_used else None,
                tool_calls=tools_called_log if tools_called_log else None,
            )
            db.add(assistant_msg)
            await db.commit()
            await db.refresh(assistant_msg)

            # Báo hoàn tất
            yield f"event: done\ndata: {json.dumps({'conversation_id': conversation.id, 'message_id': assistant_msg.id}, ensure_ascii=False)}\n\n"

        except GeminiError as e:
            # Nếu chưa có câu trả lời, thử local fallback lần cuối
            fallback = await self._try_local_intent_fallback(normalized_q, tool_executor, user)
            if fallback:
                tool_name, full_assistant_reply, fn_res = fallback
                tools_called_log.append({"tool": tool_name, "args": {}})
                yield f"event: delta\ndata: {json.dumps({'text': full_assistant_reply}, ensure_ascii=False)}\n\n"
                assistant_msg = ChatMessage(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=full_assistant_reply,
                    tool_calls=tools_called_log if tools_called_log else None,
                )
                db.add(assistant_msg)
                await db.commit()
                await db.refresh(assistant_msg)
                yield f"event: done\ndata: {json.dumps({'conversation_id': conversation.id, 'message_id': assistant_msg.id}, ensure_ascii=False)}\n\n"
            else:
                error_code = e.code
                outcome = "error"
                logger.error(f"[ChatbotService] GeminiError: {e.code} - {e}")
                err_guide = (
                    f"{e.user_friendly_message}\n\n"
                    "💡 **Mẹo:** Bạn vẫn có thể hỏi các câu hỏi tra cứu dữ liệu CLB như: "
                    "*'Sự kiện CLB'*, *'Thành viên ban chuyên môn'*, *'Hội phí của tôi'*, *'Nhiệm vụ công việc'*, *'Bảng tin thông báo'...*"
                )
                yield f"event: error\ndata: {json.dumps({'code': e.code, 'message': err_guide}, ensure_ascii=False)}\n\n"

        except Exception as e:
            error_code = "INTERNAL_ERROR"
            outcome = "error"
            logger.error(f"[ChatbotService] Unexpected Error: {e}", exc_info=True)
            yield f"event: error\ndata: {json.dumps({'code': 'INTERNAL_ERROR', 'message': 'Hệ thống gặp sự cố không mong muốn. Vui lòng thử lại sau.'}, ensure_ascii=False)}\n\n"

        finally:
            # 6. Ghi nhật ký chẩn đoán kỹ thuật (ChatLog)
            total_duration_ms = (time.time() - start_time) * 1000
            first_token_latency_ms = (
                (first_token_time - start_time) * 1000 if first_token_time else None
            )

            chat_log = ChatLog(
                conversation_id=conversation.id if "conversation" in locals() else None,
                user_id=user.id if user else None,
                user_role=user_role,
                ip_address=client_ip,
                normalized_query=normalized_q,
                tools_called=tools_called_log if tools_called_log else None,
                retrieved_chunks=sources_used if sources_used else None,
                cached=False,
                first_token_latency_ms=first_token_latency_ms,
                total_latency_ms=total_duration_ms,
                error_code=error_code,
                outcome=outcome,
            )
            db.add(chat_log)
            await db.commit()


# Singleton service
chatbot_service = ChatbotService()
