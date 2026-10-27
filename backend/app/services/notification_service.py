import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.event import Event, EventRegistration, EventStatus, RegistrationStatus
from app.models.fee import FeePeriod, FeePeriodStatus, MemberFee
from app.models.notification import Notification, NotificationType
from app.models.task import Task, TaskAssignee, TaskStatus

logger = logging.getLogger(__name__)


async def send_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    body: str,
    link: Optional[str] = None,
) -> Notification:
    """Tạo một thông báo cá nhân mới cho người dùng."""
    noti = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        link=link,
        is_read=False,
    )
    db.add(noti)
    return noti


async def send_bulk_notifications(
    db: AsyncSession,
    user_ids: List[int],
    type: str,
    title: str,
    body: str,
    link: Optional[str] = None,
) -> int:
    """Tạo thông báo hàng loạt cho danh sách người dùng."""
    count = 0
    for uid in set(user_ids):
        db.add(
            Notification(
                user_id=uid,
                type=type,
                title=title,
                body=body,
                link=link,
                is_read=False,
            )
        )
        count += 1
    return count


async def run_deadline_reminders(db: AsyncSession) -> dict:
    """Tiến trình kiểm tra và tự sinh thông báo nhắc hạn (an toàn khi chạy lặp, không sinh trùng):
    1. Công việc: Sắp đến hạn (<= 24h) hoặc Quá hạn (chưa done/cancelled).
    2. Sự kiện: Sắp diễn ra (<= 24h) đối với thành viên đã đăng ký.
    3. Hội phí: Sắp đến hạn (<= 24h) hoặc Quá hạn đối với thành viên chưa hoàn tất đóng phí.
    """
    now = datetime.now(timezone.utc)
    in_24h = now + timedelta(hours=24)

    tasks_reminded = 0
    events_reminded = 0
    fees_reminded = 0

    # 1. NHẮC HẠN CÔNG VIỆC
    task_stmt = (
        select(Task)
        .options(selectinload(Task.assignees))
        .where(
            Task.status.in_([TaskStatus.TODO, TaskStatus.IN_PROGRESS]),
            Task.due_date.is_not(None),
        )
    )
    tasks = (await db.execute(task_stmt)).scalars().all()

    for task in tasks:
        due = task.due_date
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)

        task_link = f"/tasks/{task.id}"

        # Sắp đến hạn: trong vòng 24 giờ tới
        if now < due <= in_24h:
            for assignee in task.assignees:
                # Kiểm tra trùng lặp
                exists_stmt = select(func.count(Notification.id)).where(
                    Notification.user_id == assignee.user_id,
                    Notification.type == NotificationType.TASK_DUE,
                    Notification.link == task_link,
                )
                if (await db.execute(exists_stmt)).scalar_one() == 0:
                    await send_notification(
                        db,
                        user_id=assignee.user_id,
                        type=NotificationType.TASK_DUE,
                        title=f"Công việc sắp đến hạn: {task.title}",
                        body=f"Công việc '{task.title}' sắp đến hạn vào {due.strftime('%H:%M %d/%m/%Y')}. Vui lòng kiểm tra tiến độ.",
                        link=task_link,
                    )
                    tasks_reminded += 1

        # Quá hạn
        elif due < now:
            for assignee in task.assignees:
                exists_stmt = select(func.count(Notification.id)).where(
                    Notification.user_id == assignee.user_id,
                    Notification.type == NotificationType.TASK_OVERDUE,
                    Notification.link == task_link,
                )
                if (await db.execute(exists_stmt)).scalar_one() == 0:
                    await send_notification(
                        db,
                        user_id=assignee.user_id,
                        type=NotificationType.TASK_OVERDUE,
                        title=f"Công việc quá hạn: {task.title}",
                        body=f"Công việc '{task.title}' đã quá hạn vào {due.strftime('%H:%M %d/%m/%Y')}.",
                        link=task_link,
                    )
                    tasks_reminded += 1

    # 2. NHẮC HẠN SỰ KIỆN SẮP DIỄN RA
    event_stmt = (
        select(Event)
        .where(
            Event.status == EventStatus.PUBLISHED,
            Event.start_time > now,
            Event.start_time <= in_24h,
        )
    )
    events = (await db.execute(event_stmt)).scalars().all()

    for ev in events:
        ev_link = f"/events/{ev.id}"
        st_time = ev.start_time
        if st_time.tzinfo is None:
            st_time = st_time.replace(tzinfo=timezone.utc)

        # Lấy danh sách đăng ký còn hiệu lực
        reg_stmt = select(EventRegistration.user_id).where(
            EventRegistration.event_id == ev.id,
            EventRegistration.status == RegistrationStatus.REGISTERED,
        )
        registered_uids = (await db.execute(reg_stmt)).scalars().all()

        for uid in registered_uids:
            exists_stmt = select(func.count(Notification.id)).where(
                Notification.user_id == uid,
                Notification.type == NotificationType.EVENT_REMINDER,
                Notification.link == ev_link,
            )
            if (await db.execute(exists_stmt)).scalar_one() == 0:
                await send_notification(
                    db,
                    user_id=uid,
                    type=NotificationType.EVENT_REMINDER,
                    title=f"Sự kiện sắp diễn ra: {ev.title}",
                    body=f"Sự kiện '{ev.title}' sẽ bắt đầu vào {st_time.strftime('%H:%M %d/%m/%Y')} tại {ev.location}.",
                    link=ev_link,
                )
                events_reminded += 1

    # 3. NHẮC HẠN HỘI PHÍ
    period_stmt = (
        select(FeePeriod)
        .options(selectinload(FeePeriod.member_fees).selectinload(MemberFee.payments))
        .where(FeePeriod.status == FeePeriodStatus.OPEN)
    )
    periods = (await db.execute(period_stmt)).scalars().all()

    for period in periods:
        due = period.due_date
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)

        # Sắp đến hạn
        if now < due <= in_24h:
            for mf in period.member_fees:
                if mf.calculated_status in ["unpaid", "partial"]:
                    check_title = f"Hội phí sắp đến hạn: {period.name}"
                    exists_stmt = select(func.count(Notification.id)).where(
                        Notification.user_id == mf.user_id,
                        Notification.type == NotificationType.FEE_DUE,
                        Notification.title == check_title,
                    )
                    if (await db.execute(exists_stmt)).scalar_one() == 0:
                        await send_notification(
                            db,
                            user_id=mf.user_id,
                            type=NotificationType.FEE_DUE,
                            title=check_title,
                            body=f"Kỳ thu '{period.name}' sẽ hết hạn vào {due.strftime('%d/%m/%Y')}. Số tiền còn lại: {mf.remaining_due:,} VND.",
                            link="/my-fees",
                        )
                        fees_reminded += 1

        # Quá hạn
        elif due < now:
            for mf in period.member_fees:
                if mf.calculated_status in ["unpaid", "partial"]:
                    check_title = f"Hội phí đã quá hạn: {period.name}"
                    exists_stmt = select(func.count(Notification.id)).where(
                        Notification.user_id == mf.user_id,
                        Notification.type == NotificationType.FEE_OVERDUE,
                        Notification.title == check_title,
                    )
                    if (await db.execute(exists_stmt)).scalar_one() == 0:
                        await send_notification(
                            db,
                            user_id=mf.user_id,
                            type=NotificationType.FEE_OVERDUE,
                            title=check_title,
                            body=f"Kỳ thu '{period.name}' đã quá hạn vào {due.strftime('%d/%m/%Y')}. Vui lòng sớm hoàn tất nghĩa vụ hội phí.",
                            link="/my-fees",
                        )
                        fees_reminded += 1

    await db.commit()
    logger.info(
        f"Deadline reminders executed: {tasks_reminded} tasks, {events_reminded} events, {fees_reminded} fees notified."
    )
    return {
        "tasks_reminded": tasks_reminded,
        "events_reminded": events_reminded,
        "fees_reminded": fees_reminded,
    }
