from fastapi import APIRouter

from app.api.endpoints import (
    announcements,
    attendances,
    audit_logs,
    auth,
    departments,
    events,
    fees,
    funds,
    join_requests,
    notifications,
    public_events,
    tasks,
    users,
    chat,
    public_chat,
    knowledge,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Xác thực (Auth)"])
api_router.include_router(departments.router, prefix="/departments", tags=["Ban Chuyên Môn (Departments)"])
api_router.include_router(users.router, prefix="/users", tags=["Quản lý Thành viên (Users)"])
api_router.include_router(join_requests.router, prefix="/join-requests", tags=["Đơn Gia Nhập (Join Requests)"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["Nhật ký hoạt động (Audit Logs)"])
api_router.include_router(events.router, prefix="/events", tags=["Sự kiện & Điểm danh (Events & Attendance)"])
api_router.include_router(attendances.router, prefix="/attendances", tags=["Duyệt Điểm Danh & Ảnh (Attendances)"])
api_router.include_router(public_events.router, prefix="/public/events", tags=["Sự kiện Công khai (Public Events)"])

# Giai đoạn 4: Công việc, Thông báo, Hội phí, Thu chi quỹ
api_router.include_router(tasks.router, prefix="/tasks", tags=["Công việc (Tasks)"])
api_router.include_router(announcements.router, prefix="/announcements", tags=["Bảng tin (Announcements)"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Thông báo cá nhân (Notifications)"])
api_router.include_router(fees.router, prefix="/fees", tags=["Hội phí (Fees)"])
api_router.include_router(funds.router, prefix="/funds", tags=["Thu chi & Sổ quỹ (Funds & Treasury)"])

# Giai đoạn 5: Chatbot AI & Kho Tri Thức RAG
api_router.include_router(chat.router, prefix="/chat", tags=["Trợ lý Chatbot AI (Chatbot)"])
api_router.include_router(public_chat.router, prefix="/public/chat", tags=["Hỏi đáp công khai (Public Chat)"])
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["Kho Tri Thức RAG (Knowledge)"])
