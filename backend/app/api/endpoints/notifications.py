from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_any_authenticated
from app.models.notification import Notification
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.notification import NotificationOut, UnreadNotificationCount
from app.services.notification_service import run_deadline_reminders

router = APIRouter()


@router.get("", response_model=PaginatedResponse[NotificationOut], summary="Danh sách thông báo cá nhân")
async def list_my_notifications(
    is_read: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Lấy danh sách thông báo cá nhân của người dùng hiện tại."""
    conditions = [Notification.user_id == current_user.id]
    if is_read is not None:
        conditions.append(Notification.is_read == is_read)

    count_stmt = select(func.count(Notification.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    notis = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse[NotificationOut](
        items=[
            NotificationOut(
                id=n.id,
                user_id=n.user_id,
                type=n.type,
                title=n.title,
                body=n.body,
                link=n.link,
                is_read=n.is_read,
                created_at=n.created_at,
            )
            for n in notis
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", response_model=UnreadNotificationCount, summary="Số lượng thông báo chưa đọc")
async def get_unread_notification_count(
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Lấy số thông báo chưa đọc của người dùng hiện tại để hiển thị trên biểu tượng chuông."""
    stmt = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    )
    count = (await db.execute(stmt)).scalar_one()
    return UnreadNotificationCount(unread_count=count)


@router.patch("/{notification_id}/read", summary="Đánh dấu một thông báo đã đọc")
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Đánh dấu một thông báo đã đọc."""
    noti = await db.get(Notification, notification_id)
    if not noti or noti.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")

    noti.is_read = True
    await db.commit()
    return {"message": "Đã đánh dấu thông báo là đã đọc"}


@router.post("/read-all", summary="Đánh dấu tất cả thông báo là đã đọc")
async def mark_all_notifications_read(
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Đánh dấu tất cả thông báo của người dùng là đã đọc."""
    stmt = (
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {"message": "Đã đánh dấu tất cả thông báo là đã đọc"}


@router.post("/run-reminders", summary="Chạy tiến trình nhắc hạn (Admin)")
async def trigger_deadline_reminders(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Chạy ngay tiến trình nhắc hạn công việc, sự kiện và hội phí (an toàn khi chạy nhiều lần)."""
    result = await run_deadline_reminders(db)
    return {"message": "Đã thực hiện xong tiến trình nhắc hạn", "result": result}
