"""Tập hợp các công cụ (Function Calling) dành cho Chatbot AI theo từng vai trò.

Nguyên tắc:
- Chỉ đọc (read-only), không thực hiện thao tác ghi vào CSDL.
- Danh tính và quyền do SERVER quyết định từ token đăng nhập, không bao giờ nhận user_id từ mô hình hay prompt.
- Dữ liệu trả về gọn, định dạng chuẩn (VND, giờ Việt Nam), chỉ trường cần thiết để tối ưu độ trễ.
- Tái sử dụng các quan hệ và mô hình CSDL sẵn có.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from google.genai import types
from sqlalchemy import func, select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.announcement import Announcement, AnnouncementScope, AnnouncementStatus
from app.models.department import Department
from app.models.event import (
    Event,
    EventAttendance,
    EventRegistration,
    EventStatus,
    RegistrationStatus,
)
from app.models.fee import FeePayment, FeePeriod, FeePeriodStatus, MemberFee, MemberFeeStatus, PaymentClaim
from app.models.fund import ExpenseRequest, ExpenseRequestStatus, LedgerEntry
from app.models.join_request import JoinRequest, JoinRequestStatus
from app.models.notification import Notification
from app.models.task import Task, TaskAssignee, TaskStatus
from app.models.user import SystemRole, User
from app.chatbot.rag import search_knowledge


# ============================================================
# Định nghĩa Schema tiếng Việt cho Google Gemini Function Calling
# ============================================================

def get_tool_declarations_for_role(user: Optional[User]) -> List[types.Tool]:
    """Trả về danh sách Tool phù hợp chính xác với vai trò của người hỏi."""
    funcs: List[types.FunctionDeclaration] = []

    # 1. Dành cho khách vãng lai (chưa đăng nhập)
    if not user:
        funcs.extend([
            types.FunctionDeclaration(
                name="search_public_documents",
                description="Tìm kiếm trong các tài liệu quy định, giới thiệu và hướng dẫn công khai của CLB.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "query": types.Schema(
                            type=types.Type.STRING,
                            description="Nội dung hoặc từ khóa cần tìm kiếm về CLB, quy trình gia nhập, hoặc liên hệ.",
                        )
                    },
                    required=["query"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_public_events",
                description="Lấy danh sách các sự kiện công khai sắp diễn ra hoặc đang mở cho toàn trường tham gia.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "limit": types.Schema(
                            type=types.Type.INTEGER,
                            description="Số lượng sự kiện cần lấy (mặc định 5).",
                        )
                    },
                ),
            ),
        ])
        return [types.Tool(function_declarations=funcs)]

    # 2. Dành cho mọi người dùng đã đăng nhập (Thành viên, Trưởng ban, Admin)
    funcs.extend([
        types.FunctionDeclaration(
            name="search_club_documents",
            description="Tìm kiếm trong kho tài liệu quy định, quy chế, nội quy, hướng dẫn của CLB phù hợp với quyền hạn của tôi.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="Nội dung câu hỏi hoặc từ khóa quy định cần tra cứu.",
                    )
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_events",
            description="Lấy danh sách các sự kiện của CLB (lọc theo sắp tới, đã qua, hoặc tất cả).",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "time_filter": types.Schema(
                        type=types.Type.STRING,
                        description="Bộ lọc thời gian: 'upcoming' (sắp tới), 'past' (đã qua), hoặc 'all' (tất cả). Mặc định là 'upcoming'.",
                    )
                },
            ),
        ),
        types.FunctionDeclaration(
            name="get_event_detail",
            description="Lấy thông tin chi tiết của một sự kiện cụ thể bằng mã sự kiện (event_id).",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "event_id": types.Schema(
                        type=types.Type.INTEGER,
                        description="ID của sự kiện cần xem chi tiết.",
                    )
                },
                required=["event_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_my_event_registrations",
            description="Lấy danh sách các sự kiện mà chính tôi (người dùng đang đăng nhập) đã đăng ký tham gia.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            ),
        ),
        types.FunctionDeclaration(
            name="get_my_attendance_status",
            description="Kiểm tra trạng thái điểm danh và kết quả duyệt ảnh điểm danh của tôi trong các sự kiện.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "event_id": types.Schema(
                        type=types.Type.INTEGER,
                        description="ID sự kiện cụ thể (không bắt buộc, nếu bỏ trống sẽ lấy các sự kiện gần nhất).",
                    )
                },
            ),
        ),
        types.FunctionDeclaration(
            name="get_my_tasks",
            description="Lấy danh sách các công việc (tasks) được phân công cho tôi, có thể lọc việc quá hạn hoặc theo trạng thái.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "status": types.Schema(
                        type=types.Type.STRING,
                        description="Lọc theo trạng thái: 'todo' (cần làm), 'in_progress' (đang làm), 'completed' (đã xong). Mặc định lấy tất cả chưa hoàn thành.",
                    ),
                    "overdue_only": types.Schema(
                        type=types.Type.BOOLEAN,
                        description="True nếu chỉ muốn lấy các việc đã bị quá hạn chót (due date).",
                    ),
                },
            ),
        ),
        types.FunctionDeclaration(
            name="get_my_fees",
            description="Tra cứu tình trạng hội phí của tôi: các kỳ thu phí, số tiền còn nợ, hạn nộp, lịch sử nộp và trạng thái claim duyệt chuyển khoản.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            ),
        ),
        types.FunctionDeclaration(
            name="get_recent_announcements",
            description="Lấy danh sách các bảng tin và thông báo chung gần đây phù hợp với tôi.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "limit": types.Schema(
                        type=types.Type.INTEGER,
                        description="Số lượng bảng tin cần lấy (mặc định 5).",
                    )
                },
            ),
        ),
        types.FunctionDeclaration(
            name="get_my_unread_notifications",
            description="Lấy danh sách các thông báo cá nhân chưa đọc của tôi.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "limit": types.Schema(
                        type=types.Type.INTEGER,
                        description="Số lượng thông báo cần lấy (mặc định 5).",
                    )
                },
            ),
        ),
        types.FunctionDeclaration(
            name="get_my_profile_and_department",
            description="Lấy thông tin hồ sơ cá nhân của tôi (họ tên, mã sinh viên, email, ban chuyên môn, chức danh trong CLB).",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            ),
        ),
        types.FunctionDeclaration(
            name="get_club_finance_overview",
            description="Xem tình hình tài chính tổng quan của CLB (số dư quỹ, thu chi tháng) nếu admin bật quyền xem cho thành viên.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
            ),
        ),
    ])

    # 3. Dành cho Trưởng ban (Department Head) và Admin
    if user.role in [SystemRole.DEPARTMENT_HEAD, SystemRole.ADMIN]:
        funcs.extend([
            types.FunctionDeclaration(
                name="get_department_members",
                description="Lấy danh sách thành viên trong ban chuyên môn của tôi (họ tên, mã sinh viên, chức danh, trạng thái hoạt động).",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="get_department_fee_status",
                description="Xem tình hình hoàn thành hội phí của các thành viên trong ban của tôi (chỉ trạng thái đã nộp/còn nợ, không lộ số tiền chi tiết).",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="get_department_tasks",
                description="Lấy danh sách các công việc thuộc ban chuyên môn của tôi.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "status": types.Schema(
                            type=types.Type.STRING,
                            description="Lọc theo trạng thái: 'todo', 'in_progress', 'completed'.",
                        ),
                        "overdue_only": types.Schema(
                            type=types.Type.BOOLEAN,
                            description="True nếu chỉ muốn lấy việc quá hạn.",
                        ),
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="get_department_events",
                description="Lấy danh sách sự kiện do ban của tôi tổ chức và thống kê số người tham gia/điểm danh.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="draft_announcement_or_plan",
                description="Soạn nháp nội dung bảng tin hoặc kế hoạch sự kiện từ các ý tưởng/mô tả của người dùng (chỉ trả về bản nháp trong chat để người dùng copy, KHÔNG tự đăng hay ghi vào CSDL).",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "topic": types.Schema(
                            type=types.Type.STRING,
                            description="Chủ đề bài đăng hoặc tên sự kiện.",
                        ),
                        "draft_type": types.Schema(
                            type=types.Type.STRING,
                            description="Loại bản nháp: 'announcement' (bảng tin thông báo) hoặc 'event_plan' (kế hoạch tổ chức sự kiện).",
                        ),
                        "key_points": types.Schema(
                            type=types.Type.STRING,
                            description="Các ý chính, địa điểm, thời gian hoặc lưu ý cần có trong bản nháp.",
                        ),
                    },
                    required=["topic", "draft_type"],
                ),
            ),
        ])

    # 4. Dành cho Thủ quỹ (is_treasurer=True) hoặc Admin
    if getattr(user, "is_treasurer", False) or user.role == SystemRole.ADMIN:
        funcs.extend([
            types.FunctionDeclaration(
                name="get_treasury_summary",
                description="Báo cáo số dư tài chính: tồn quỹ tiền mặt, số dư tài khoản ngân hàng và tổng quỹ CLB.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="get_pending_expense_requests",
                description="Lấy danh sách các đề xuất chi tiền đang chờ phê duyệt hoặc chờ thủ quỹ chi trả.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="get_fee_collection_stats",
                description="Thống kê tỷ lệ thu hội phí toàn CLB: tổng số tiền đã thu, số thành viên đã nộp và số thành viên nợ.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "period_id": types.Schema(
                            type=types.Type.INTEGER,
                            description="ID kỳ hội phí (không bắt buộc, mặc định lấy kỳ gần nhất).",
                        )
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="get_overdue_fee_members",
                description="Lấy danh sách các thành viên đang nợ hội phí quá hạn để đôn đốc thu.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "period_id": types.Schema(
                            type=types.Type.INTEGER,
                            description="ID kỳ hội phí (không bắt buộc).",
                        )
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="get_recent_ledger_entries",
                description="Lấy danh sách các bút toán thu chi gần đây trong sổ quỹ.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "limit": types.Schema(
                            type=types.Type.INTEGER,
                            description="Số lượng giao dịch (mặc định 10).",
                        )
                    },
                ),
            ),
        ])

    # 5. Dành riêng cho Quản trị viên (Admin)
    if user.role == SystemRole.ADMIN:
        funcs.extend([
            types.FunctionDeclaration(
                name="get_club_overall_stats",
                description="Thống kê toàn diện CLB: tổng số thành viên, số lượng thành viên theo từng ban, tỷ lệ tham gia sự kiện chung.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="get_pending_join_requests",
                description="Lấy danh sách các đơn đăng ký gia nhập CLB đang ở trạng thái chờ duyệt.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="get_system_overdue_tasks",
                description="Lấy danh sách các công việc bị quá hạn chót trên toàn hệ thống.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={},
                ),
            ),
        ])

    return [types.Tool(function_declarations=funcs)]


# ============================================================
# Thực thi các hàm nghiệp vụ (Server-side Executor)
# ============================================================

def format_vnd(amount: Optional[int]) -> str:
    """Định dạng số tiền sang chuẩn VND."""
    if amount is None:
        return "0 VNĐ"
    return f"{amount:,} VNĐ".replace(",", ".")


def format_dt(dt: Optional[datetime]) -> str:
    """Định dạng ngày giờ sang giờ Việt Nam (GMT+7) DD/MM/YYYY HH:MM."""
    if not dt:
        return "Chưa xác định"
    # Nếu timezone-naive, coi như UTC và chuyển sang GMT+7
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    vn_tz = timezone(timedelta(hours=7))
    vn_dt = dt.astimezone(vn_tz)
    return vn_dt.strftime("%d/%m/%Y %H:%M")


class ToolExecutor:
    """Bộ điều phối thực thi hàm nghiệp vụ với xác thực và phân quyền phía Server."""

    def __init__(self, db: AsyncSession, current_user: Optional[User]):
        self.db = db
        self.user = current_user
        self.user_role = (
            (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role))
            if current_user
            else "guest"
        )

    async def execute(self, func_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Thực thi hàm theo tên và tham số an toàn."""
        method = getattr(self, f"fn_{func_name}", None)
        if not method:
            return {
                "error": f"Hàm '{func_name}' không tồn tại hoặc không được hỗ trợ trong phiên này."
            }
        try:
            return await method(**arguments)
        except Exception as e:
            return {"error": f"Lỗi khi thực thi tra cứu: {str(e)}"}

    # --- HÀM CÔNG KHAI / RAG ---
    async def fn_search_public_documents(self, query: str) -> Dict[str, Any]:
        results, _ = await search_knowledge(
            db=self.db,
            query=query,
            user_role="guest",
            top_k=settings.CHAT_RETRIEVAL_TOP_K,
            min_score=settings.CHAT_RETRIEVAL_MIN_SCORE,
        )
        if not results:
            return {
                "found": False,
                "message": "Không tìm thấy tài liệu quy định công khai nào liên quan đến câu hỏi của bạn.",
                "chunks": [],
            }
        return {
            "found": True,
            "chunks": [
                {
                    "title": r["title"],
                    "heading": r["heading"],
                    "content": r["content"],
                    "score": r["score"],
                }
                for r in results
            ],
        }

    async def fn_search_club_documents(self, query: str) -> Dict[str, Any]:
        results, _ = await search_knowledge(
            db=self.db,
            query=query,
            user_role=self.user_role,
            top_k=settings.CHAT_RETRIEVAL_TOP_K,
            min_score=settings.CHAT_RETRIEVAL_MIN_SCORE,
        )
        if not results:
            return {
                "found": False,
                "message": "Không tìm thấy tài liệu quy định nào trong hệ thống phù hợp với câu hỏi.",
                "chunks": [],
            }
        return {
            "found": True,
            "chunks": [
                {
                    "title": r["title"],
                    "heading": r["heading"],
                    "content": r["content"],
                    "score": r["score"],
                }
                for r in results
            ],
        }

    async def fn_get_public_events(self, limit: int = 5) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        stmt = (
            select(Event)
            .where(
                Event.is_public == True,
                Event.status == EventStatus.PUBLISHED,
                Event.start_time >= now,
            )
            .order_by(Event.start_time.asc())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        events = res.scalars().all()
        return {
            "count": len(events),
            "events": [
                {
                    "id": e.id,
                    "title": e.title,
                    "start_time": format_dt(e.start_time),
                    "end_time": format_dt(e.end_time),
                    "location": e.location,
                    "max_participants": e.max_participants,
                    "description": (e.description[:150] + "...") if e.description and len(e.description) > 150 else e.description,
                }
                for e in events
            ],
        }

    # --- HÀM THÀNH VIÊN ---
    async def fn_get_events(self, time_filter: str = "upcoming") -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        stmt = select(Event).where(Event.status == EventStatus.PUBLISHED)

        if time_filter == "upcoming":
            stmt = stmt.where(Event.start_time >= now).order_by(Event.start_time.asc())
        elif time_filter == "past":
            stmt = stmt.where(Event.end_time < now).order_by(Event.start_time.desc())
        else:
            stmt = stmt.order_by(Event.start_time.desc())

        stmt = stmt.limit(10)
        res = await self.db.execute(stmt)
        events = res.scalars().all()
        return {
            "filter": time_filter,
            "count": len(events),
            "events": [
                {
                    "id": e.id,
                    "title": e.title,
                    "start_time": format_dt(e.start_time),
                    "end_time": format_dt(e.end_time),
                    "location": e.location,
                    "is_public": e.is_public,
                }
                for e in events
            ],
        }

    async def fn_get_event_detail(self, event_id: int) -> Dict[str, Any]:
        stmt = select(Event).where(Event.id == event_id)
        res = await self.db.execute(stmt)
        event = res.scalars().first()
        if not event:
            return {"error": f"Không tìm thấy sự kiện với ID {event_id}"}
        return {
            "id": event.id,
            "title": event.title,
            "description": event.description,
            "start_time": format_dt(event.start_time),
            "end_time": format_dt(event.end_time),
            "location": event.location,
            "registration_deadline": format_dt(event.registration_deadline) if event.registration_deadline else "Không có",
            "max_participants": event.max_participants,
            "is_public": event.is_public,
            "status": event.status.value if hasattr(event.status, "value") else str(event.status),
        }

    async def fn_get_my_event_registrations(self) -> Dict[str, Any]:
        if not self.user:
            return {"error": "Cần đăng nhập để tra cứu."}
        stmt = (
            select(EventRegistration, Event)
            .join(Event, EventRegistration.event_id == Event.id)
            .where(EventRegistration.user_id == self.user.id)
            .order_by(Event.start_time.desc())
            .limit(10)
        )
        res = await self.db.execute(stmt)
        rows = res.all()
        return {
            "count": len(rows),
            "registrations": [
                {
                    "event_id": ev.id,
                    "event_title": ev.title,
                    "start_time": format_dt(ev.start_time),
                    "location": ev.location,
                    "status": reg.status.value if hasattr(reg.status, "value") else str(reg.status),
                    "registered_at": format_dt(reg.registered_at),
                }
                for reg, ev in rows
            ],
        }

    async def fn_get_my_attendance_status(self, event_id: Optional[int] = None) -> Dict[str, Any]:
        if not self.user:
            return {"error": "Cần đăng nhập để tra cứu."}
        stmt = (
            select(EventAttendance, Event)
            .join(Event, EventAttendance.event_id == Event.id)
            .where(EventAttendance.user_id == self.user.id)
        )
        if event_id:
            stmt = stmt.where(EventAttendance.event_id == event_id)
        stmt = stmt.order_by(EventAttendance.checked_in_at.desc()).limit(10)

        res = await self.db.execute(stmt)
        rows = res.all()
        return {
            "count": len(rows),
            "attendances": [
                {
                    "event_id": ev.id,
                    "event_title": ev.title,
                    "attendance_type": att.attendance_type.value if hasattr(att.attendance_type, "value") else str(att.attendance_type),
                    "review_status": att.review_status.value if hasattr(att.review_status, "value") else str(att.review_status),
                    "checked_in_at": format_dt(att.checked_in_at),
                    "rejection_reason": att.rejection_reason,
                }
                for att, ev in rows
            ],
        }

    async def fn_get_my_tasks(self, status: Optional[str] = None, overdue_only: bool = False) -> Dict[str, Any]:
        if not self.user:
            return {"error": "Cần đăng nhập để tra cứu."}

        stmt = (
            select(Task)
            .join(TaskAssignee, Task.id == TaskAssignee.task_id)
            .where(TaskAssignee.user_id == self.user.id)
        )
        if status:
            stmt = stmt.where(Task.status == status)
        if overdue_only:
            now = datetime.now(timezone.utc)
            stmt = stmt.where(Task.due_date < now, Task.status != TaskStatus.COMPLETED.value)

        stmt = stmt.order_by(Task.due_date.asc().nullslast()).limit(15)
        res = await self.db.execute(stmt)
        tasks = res.scalars().all()
        now = datetime.now(timezone.utc)

        return {
            "count": len(tasks),
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "priority": t.priority,
                    "status": t.status,
                    "due_date": format_dt(t.due_date),
                    "is_overdue": bool(t.due_date and t.due_date.replace(tzinfo=timezone.utc if t.due_date.tzinfo is None else t.due_date.tzinfo) < now and t.status != "completed"),
                }
                for t in tasks
            ],
        }

    async def fn_get_my_fees(self) -> Dict[str, Any]:
        if not self.user:
            return {"error": "Cần đăng nhập để tra cứu."}

        # Lấy các khoản phí của user
        stmt = (
            select(MemberFee, FeePeriod)
            .join(FeePeriod, MemberFee.fee_period_id == FeePeriod.id)
            .where(MemberFee.user_id == self.user.id)
            .order_by(FeePeriod.due_date.desc())
        )
        res = await self.db.execute(stmt)
        fee_rows = res.all()

        # Lấy các claim thanh toán gần đây
        claim_stmt = (
            select(PaymentClaim, FeePeriod)
            .join(FeePeriod, PaymentClaim.fee_period_id == FeePeriod.id)
            .where(PaymentClaim.user_id == self.user.id)
            .order_by(PaymentClaim.created_at.desc())
            .limit(5)
        )
        claim_res = await self.db.execute(claim_stmt)
        claims = claim_res.all()

        return {
            "bank_transfer_info": {
                "bank_name": settings.BANK_NAME,
                "account_number": settings.BANK_ACCOUNT_NUMBER,
                "account_name": settings.BANK_ACCOUNT_NAME,
                "transfer_syntax": f"HOIPHI {self.user.student_id} {self.user.full_name}",
            },
            "fees": [
                {
                    "period_id": p.id,
                    "period_name": p.name,
                    "amount_due": format_vnd(p.amount),
                    "paid_amount": format_vnd(mf.paid_amount),
                    "status": mf.status.value if hasattr(mf.status, "value") else str(mf.status),
                    "due_date": format_dt(p.due_date),
                }
                for mf, p in fee_rows
            ],
            "recent_claims": [
                {
                    "claim_id": c.id,
                    "period_name": p.name,
                    "amount": format_vnd(c.amount),
                    "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                    "created_at": format_dt(c.created_at),
                    "rejection_reason": c.rejection_reason,
                }
                for c, p in claims
            ],
        }

    async def fn_get_recent_announcements(self, limit: int = 5) -> Dict[str, Any]:
        stmt = (
            select(Announcement)
            .where(Announcement.status == AnnouncementStatus.PUBLISHED.value)
            .order_by(Announcement.published_at.desc().nullslast())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        items = res.scalars().all()
        return {
            "count": len(items),
            "announcements": [
                {
                    "id": a.id,
                    "title": a.title,
                    "scope": a.scope,
                    "published_at": format_dt(a.published_at),
                    "content_summary": (a.content[:150] + "...") if len(a.content) > 150 else a.content,
                }
                for a in items
            ],
        }

    async def fn_get_my_unread_notifications(self, limit: int = 5) -> Dict[str, Any]:
        if not self.user:
            return {"error": "Cần đăng nhập để tra cứu."}
        stmt = (
            select(Notification)
            .where(Notification.user_id == self.user.id, Notification.is_read == False)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        notes = res.scalars().all()
        return {
            "unread_count": len(notes),
            "notifications": [
                {
                    "id": n.id,
                    "title": n.title,
                    "content": n.content,
                    "created_at": format_dt(n.created_at),
                }
                for n in notes
            ],
        }

    async def fn_get_my_profile_and_department(self) -> Dict[str, Any]:
        if not self.user:
            return {"error": "Chưa đăng nhập."}
        dept_name = "Chưa vào ban chuyên môn"
        if self.user.department_id:
            dept = await self.db.get(Department, self.user.department_id)
            if dept:
                dept_name = dept.name

        return {
            "full_name": self.user.full_name,
            "student_id": self.user.student_id,
            "email": self.user.email,
            "faculty": self.user.faculty,
            "class_name": self.user.class_name,
            "role": self.user.role.value if hasattr(self.user.role, "value") else str(self.user.role),
            "is_treasurer": getattr(self.user, "is_treasurer", False),
            "department": dept_name,
            "title": self.user.title or "Hội viên",
        }

    async def fn_get_club_finance_overview(self) -> Dict[str, Any]:
        if not settings.SHOW_FINANCE_TO_MEMBERS and self.user_role not in ["admin", "department_head"] and not getattr(self.user, "is_treasurer", False):
            return {"error": "Hiện tại tính năng công khai tài chính đang được ban quản trị tạm ẩn."}

        stmt_income = select(func.sum(LedgerEntry.amount)).where(LedgerEntry.type == "income")
        stmt_expense = select(func.sum(LedgerEntry.amount)).where(LedgerEntry.type == "expense")

        inc_res = await self.db.execute(stmt_income)
        exp_res = await self.db.execute(stmt_expense)

        total_income = inc_res.scalar() or 0
        total_expense = exp_res.scalar() or 0
        balance = total_income - total_expense

        return {
            "total_fund_balance": format_vnd(balance),
            "total_income": format_vnd(total_income),
            "total_expense": format_vnd(total_expense),
        }

    # --- HÀM TRƯỞNG BAN ---
    async def fn_get_department_members(self) -> Dict[str, Any]:
        if not self.user or (self.user.role not in [SystemRole.DEPARTMENT_HEAD, SystemRole.ADMIN]):
            return {"error": "Bạn không có quyền xem thông tin thành viên ban."}

        dept_id = self.user.department_id
        if not dept_id and self.user.role != SystemRole.ADMIN:
            return {"error": "Bạn chưa được gán vào ban chuyên môn nào."}

        stmt = select(User).where(User.deleted_at.is_(None))
        if dept_id:
            stmt = stmt.where(User.department_id == dept_id)
        stmt = stmt.order_by(User.full_name.asc())

        res = await self.db.execute(stmt)
        members = res.scalars().all()
        return {
            "department_id": dept_id,
            "count": len(members),
            "members": [
                {
                    "id": m.id,
                    "full_name": m.full_name,
                    "student_id": m.student_id,
                    "faculty": m.faculty,
                    "title": m.title or "Hội viên",
                    "role": m.role.value if hasattr(m.role, "value") else str(m.role),
                }
                for m in members
            ],
        }

    async def fn_get_department_fee_status(self) -> Dict[str, Any]:
        if not self.user or (self.user.role not in [SystemRole.DEPARTMENT_HEAD, SystemRole.ADMIN]):
            return {"error": "Bạn không có quyền xem tình trạng hội phí của ban."}

        dept_id = self.user.department_id
        if not dept_id and self.user.role != SystemRole.ADMIN:
            return {"error": "Bạn chưa thuộc ban chuyên môn nào."}

        stmt = (
            select(User.full_name, User.student_id, MemberFee.status)
            .join(MemberFee, User.id == MemberFee.user_id)
            .where(User.deleted_at.is_(None))
        )
        if dept_id:
            stmt = stmt.where(User.department_id == dept_id)

        res = await self.db.execute(stmt)
        rows = res.all()

        paid_cnt = sum(1 for r in rows if r[2] == MemberFeeStatus.PAID.value or r[2] == "paid")
        unpaid_cnt = len(rows) - paid_cnt

        return {
            "total_members": len(rows),
            "paid_count": paid_cnt,
            "unpaid_count": unpaid_cnt,
            "members_summary": [
                {
                    "full_name": r[0],
                    "student_id": r[1],
                    "status": "Đã nộp" if r[2] == "paid" else "Chưa hoàn thành",
                }
                for r in rows
            ],
        }

    async def fn_get_department_tasks(self, status: Optional[str] = None, overdue_only: bool = False) -> Dict[str, Any]:
        if not self.user or (self.user.role not in [SystemRole.DEPARTMENT_HEAD, SystemRole.ADMIN]):
            return {"error": "Không có quyền xem công việc ban."}

        dept_id = self.user.department_id
        stmt = select(Task)
        if dept_id:
            stmt = stmt.where(Task.department_id == dept_id)
        if status:
            stmt = stmt.where(Task.status == status)
        if overdue_only:
            now = datetime.now(timezone.utc)
            stmt = stmt.where(Task.due_date < now, Task.status != TaskStatus.COMPLETED.value)

        stmt = stmt.order_by(Task.due_date.asc().nullslast()).limit(20)
        res = await self.db.execute(stmt)
        tasks = res.scalars().all()

        return {
            "count": len(tasks),
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "due_date": format_dt(t.due_date),
                }
                for t in tasks
            ],
        }

    async def fn_get_department_events(self) -> Dict[str, Any]:
        if not self.user or (self.user.role not in [SystemRole.DEPARTMENT_HEAD, SystemRole.ADMIN]):
            return {"error": "Không có quyền xem sự kiện ban."}

        dept_id = self.user.department_id
        stmt = select(Event)
        if dept_id:
            stmt = stmt.where(Event.department_id == dept_id)
        stmt = stmt.order_by(Event.start_time.desc()).limit(10)

        res = await self.db.execute(stmt)
        events = res.scalars().all()
        return {
            "count": len(events),
            "events": [
                {
                    "id": e.id,
                    "title": e.title,
                    "start_time": format_dt(e.start_time),
                    "status": e.status.value if hasattr(e.status, "value") else str(e.status),
                    "location": e.location,
                }
                for e in events
            ],
        }

    async def fn_draft_announcement_or_plan(self, topic: str, draft_type: str, key_points: Optional[str] = None) -> Dict[str, Any]:
        """Tạo bản nháp trả về trong chat để người dùng copy."""
        if not self.user or (self.user.role not in [SystemRole.DEPARTMENT_HEAD, SystemRole.ADMIN]):
            return {"error": "Tính năng trợ lý soạn thảo chỉ dành cho Trưởng ban và Quản trị viên."}

        now_str = datetime.now().strftime("%d/%m/%Y")
        if draft_type == "event_plan":
            template = (
                f"### [BẢN NHÁP KẾ HOẠCH TỔ CHỨC SỰ KIỆN]\n\n"
                f"**Tên sự kiện:** {topic}\n"
                f"**Đơn vị chủ trì:** {self.user.full_name} - Ban chuyên môn\n"
                f"**Ngày lập:** {now_str}\n\n"
                f"#### 1. Mục đích & Ý nghĩa\n"
                f"- Tạo sân chơi giao lưu, học hỏi kỹ năng cho các thành viên CLB.\n\n"
                f"#### 2. Thời gian & Địa điểm dự kiến\n"
                f"- **Thời gian:** [Cần điền ngày giờ cụ thể]\n"
                f"- **Địa điểm:** [Cần điền phòng học / hội trường]\n\n"
                f"#### 3. Nội dung & Các mốc chính\n"
                f"{key_points or '- Đón tiếp đại biểu và hội viên\n- Khai mạc và phát biểu\n- Hoạt động chính\n- Bế mạc và chụp ảnh lưu niệm'}\n\n"
                f"#### 4. Phân công nhiệm vụ dự kiến\n"
                f"- Hậu cần: Chuẩn bị thiết bị, nước uống, backdrop.\n"
                f"- Truyền thông: Chụp ảnh, viết bài đưa tin trước và sau sự kiện.\n\n"
                f"> *Lưu ý: Đây là bản nháp tự động. Bạn hãy sao chép và chỉnh sửa chi tiết trước khi tạo sự kiện chính thức trên hệ thống.*"
            )
        else:
            template = (
                f"### [BẢN NHÁP BẢNG TIN THÔNG BÁO]\n\n"
                f"📢 **THÔNG BÁO: {topic.upper()}**\n\n"
                f"Thân gửi toàn thể các thành viên CLB,\n\n"
                f"{key_points or 'Ban Chủ nhiệm xin trân trọng thông báo về hoạt động mới nhất sắp diễn ra...'}\n\n"
                f"⏰ **Thời gian:** [Điền thời gian]\n"
                f"📍 **Địa điểm:** [Điền địa điểm]\n\n"
                f"Rất mong sự tham gia đầy đủ và đúng giờ của tất cả các bạn!\n\n"
                f"Trân trọng,\n"
                f"**Ban Chủ nhiệm CLB**"
            )
        return {"draft": template}

    # --- HÀM THỦ QUỸ & ADMIN ---
    async def fn_get_treasury_summary(self) -> Dict[str, Any]:
        if not (getattr(self.user, "is_treasurer", False) or (self.user and self.user.role == SystemRole.ADMIN)):
            return {"error": "Chỉ Thủ quỹ và Quản trị viên mới có quyền tra cứu sổ quỹ."}

        stmt_inc = select(func.sum(LedgerEntry.amount)).where(LedgerEntry.type == "income")
        stmt_exp = select(func.sum(LedgerEntry.amount)).where(LedgerEntry.type == "expense")
        inc_res = await self.db.execute(stmt_inc)
        exp_res = await self.db.execute(stmt_exp)
        total_income = inc_res.scalar() or 0
        total_expense = exp_res.scalar() or 0
        balance = total_income - total_expense

        return {
            "current_balance": format_vnd(balance),
            "total_income": format_vnd(total_income),
            "total_expense": format_vnd(total_expense),
        }

    async def fn_get_pending_expense_requests(self) -> Dict[str, Any]:
        if not (getattr(self.user, "is_treasurer", False) or (self.user and self.user.role == SystemRole.ADMIN)):
            return {"error": "Không có quyền xem đề xuất chi."}

        stmt = (
            select(ExpenseRequest)
            .where(ExpenseRequest.status == ExpenseRequestStatus.PENDING_APPROVAL.value)
            .order_by(ExpenseRequest.created_at.desc())
        )
        res = await self.db.execute(stmt)
        requests = res.scalars().all()
        return {
            "count": len(requests),
            "pending_requests": [
                {
                    "id": r.id,
                    "title": r.title,
                    "amount": format_vnd(r.amount),
                    "created_at": format_dt(r.created_at),
                }
                for r in requests
            ],
        }

    async def fn_get_fee_collection_stats(self, period_id: Optional[int] = None) -> Dict[str, Any]:
        if not (getattr(self.user, "is_treasurer", False) or (self.user and self.user.role == SystemRole.ADMIN)):
            return {"error": "Không có quyền xem thống kê hội phí."}

        stmt = select(MemberFee)
        if period_id:
            stmt = stmt.where(MemberFee.fee_period_id == period_id)
        res = await self.db.execute(stmt)
        fees = res.scalars().all()

        total = len(fees)
        paid = sum(1 for f in fees if f.status == MemberFeeStatus.PAID.value or f.status == "paid")
        total_collected = sum(f.paid_amount for f in fees)

        rate = (paid / total * 100) if total > 0 else 0

        return {
            "total_members_in_period": total,
            "paid_members_count": paid,
            "unpaid_members_count": total - paid,
            "collection_rate": f"{rate:.1f}%",
            "total_amount_collected": format_vnd(total_collected),
        }

    async def fn_get_overdue_fee_members(self, period_id: Optional[int] = None) -> Dict[str, Any]:
        if not (getattr(self.user, "is_treasurer", False) or (self.user and self.user.role == SystemRole.ADMIN)):
            return {"error": "Không có quyền xem danh sách quá hạn hội phí."}

        stmt = (
            select(User.full_name, User.student_id, User.email, FeePeriod.name, MemberFee.status)
            .join(MemberFee, User.id == MemberFee.user_id)
            .join(FeePeriod, MemberFee.fee_period_id == FeePeriod.id)
            .where(
                User.deleted_at.is_(None),
                MemberFee.status.in_([MemberFeeStatus.OVERDUE.value, "overdue", MemberFeeStatus.UNPAID.value, "unpaid"]),
            )
        )
        if period_id:
            stmt = stmt.where(MemberFee.fee_period_id == period_id)
        stmt = stmt.limit(20)

        res = await self.db.execute(stmt)
        rows = res.all()
        return {
            "count": len(rows),
            "overdue_members": [
                {
                    "full_name": r[0],
                    "student_id": r[1],
                    "email": r[2],
                    "period_name": r[3],
                }
                for r in rows
            ],
        }

    async def fn_get_recent_ledger_entries(self, limit: int = 10) -> Dict[str, Any]:
        if not (getattr(self.user, "is_treasurer", False) or (self.user and self.user.role == SystemRole.ADMIN)):
            return {"error": "Không có quyền xem sổ quỹ."}

        stmt = select(LedgerEntry).order_by(LedgerEntry.created_at.desc()).limit(limit)
        res = await self.db.execute(stmt)
        entries = res.scalars().all()
        return {
            "count": len(entries),
            "entries": [
                {
                    "id": e.id,
                    "type": "Thu" if e.type == "income" else "Chi",
                    "amount": format_vnd(e.amount),
                    "description": e.description,
                    "created_at": format_dt(e.created_at),
                }
                for e in entries
            ],
        }

    # --- HÀM ADMIN TOÀN DIỆN ---
    async def fn_get_club_overall_stats(self) -> Dict[str, Any]:
        if not self.user or self.user.role != SystemRole.ADMIN:
            return {"error": "Chỉ Quản trị viên mới có quyền xem thống kê toàn CLB."}

        stmt_users = select(func.count(User.id)).where(User.deleted_at.is_(None), User.is_active == True)
        user_res = await self.db.execute(stmt_users)
        total_members = user_res.scalar() or 0

        stmt_depts = select(Department.name, func.count(User.id)).outerjoin(User, Department.id == User.department_id).group_by(Department.id)
        depts_res = await self.db.execute(stmt_depts)
        depts_data = [{"department": r[0], "member_count": r[1]} for r in depts_res.all()]

        return {
            "total_active_members": total_members,
            "departments": depts_data,
        }

    async def fn_get_pending_join_requests(self) -> Dict[str, Any]:
        if not self.user or self.user.role != SystemRole.ADMIN:
            return {"error": "Chỉ Quản trị viên mới có quyền xem đơn gia nhập."}

        stmt = (
            select(JoinRequest)
            .where(JoinRequest.status == JoinRequestStatus.PENDING)
            .order_by(JoinRequest.created_at.desc())
        )
        res = await self.db.execute(stmt)
        requests = res.scalars().all()
        return {
            "count": len(requests),
            "pending_requests": [
                {
                    "id": r.id,
                    "full_name": r.full_name,
                    "student_id": r.student_id,
                    "email": r.email,
                    "faculty": r.faculty,
                    "created_at": format_dt(r.created_at),
                }
                for r in requests
            ],
        }

    async def fn_get_system_overdue_tasks(self) -> Dict[str, Any]:
        if not self.user or self.user.role != SystemRole.ADMIN:
            return {"error": "Chỉ Quản trị viên mới có quyền xem toàn bộ việc quá hạn."}

        now = datetime.now(timezone.utc)
        stmt = (
            select(Task)
            .where(Task.due_date < now, Task.status != TaskStatus.COMPLETED.value)
            .order_by(Task.due_date.asc())
            .limit(20)
        )
        res = await self.db.execute(stmt)
        tasks = res.scalars().all()
        return {
            "count": len(tasks),
            "overdue_tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "due_date": format_dt(t.due_date),
                }
                for t in tasks
            ],
        }
