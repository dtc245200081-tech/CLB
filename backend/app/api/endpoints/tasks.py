from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.endpoints.auth import get_client_ip
from app.core.audit import record_audit_event
from app.core.database import get_db
from app.core.deps import (
    ensure_department_access,
    get_current_user,
    require_admin,
    require_any_authenticated,
    require_department_head,
)
from app.models.department import Department
from app.models.event import Event
from app.models.notification import NotificationType
from app.models.task import (
    Task,
    TaskAssignee,
    TaskComment,
    TaskPriority,
    TaskStatus,
)
from app.models.user import SystemRole, User
from app.schemas.common import PaginatedResponse
from app.schemas.task import (
    TaskAssigneeOut,
    TaskCommentCreate,
    TaskCommentOut,
    TaskCreate,
    TaskOut,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.services.notification_service import send_bulk_notifications, send_notification

router = APIRouter()


def _format_task_out(task: Task) -> TaskOut:
    now = datetime.now(timezone.utc)
    due = task.due_date
    if due and due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)

    is_overdue = bool(
        due and due < now and task.status not in [TaskStatus.DONE, TaskStatus.CANCELLED]
    )

    assignees_out = [
        TaskAssigneeOut(
            user_id=a.user_id,
            full_name=a.user.full_name,
            student_id=a.user.student_id,
            assigned_at=a.assigned_at,
        )
        for a in task.assignees
        if a.user
    ]

    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        status=task.status,
        due_date=task.due_date,
        department_id=task.department_id,
        department_name=task.department.name if task.department else None,
        event_id=task.event_id,
        event_title=task.event.title if task.event else None,
        created_by_id=task.created_by_id,
        creator_name=task.creator.full_name if task.creator else None,
        completed_at=task.completed_at,
        needs_reassignment=task.needs_reassignment,
        is_overdue=is_overdue,
        assignees=assignees_out,
        comments_count=len(task.comments) if task.comments is not None else 0,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _check_task_read_access(current_user: User, task: Task) -> None:
    if current_user.role == SystemRole.ADMIN:
        return
    if (
        current_user.role == SystemRole.DEPARTMENT_HEAD
        and task.department_id is not None
        and task.department_id == current_user.department_id
    ):
        return
    if task.created_by_id == current_user.id:
        return
    assignee_ids = [a.user_id for a in task.assignees]
    if current_user.id in assignee_ids:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền xem công việc này",
    )


def _check_task_manage_access(current_user: User, task: Task) -> None:
    if current_user.role == SystemRole.ADMIN:
        return
    if task.created_by_id == current_user.id:
        return
    if (
        current_user.role == SystemRole.DEPARTMENT_HEAD
        and task.department_id is not None
        and task.department_id == current_user.department_id
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Chỉ người giao việc, trưởng ban phụ trách hoặc Quản trị viên mới được sửa công việc này",
    )


@router.post("", response_model=TaskOut, summary="Giao công việc mới")
async def create_task(
    data: TaskCreate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Giao công việc mới:
    - Admin: Có thể giao việc toàn CLB hoặc bất kỳ ban nào, cho bất kỳ ai.
    - Trưởng ban: Chỉ giao việc cho thành viên trong ban mình, bắt buộc gắn department_id của ban mình.
    - Thành viên: Không có quyền giao việc (403).
    """
    client_ip = get_client_ip(request)

    # Kiểm tra phân quyền ban cho người tạo việc
    dept_id = data.department_id
    if current_user.role == SystemRole.DEPARTMENT_HEAD:
        if current_user.department_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tài khoản trưởng ban chưa được phân công quản lý ban nào",
            )
        if dept_id is not None and dept_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Trưởng ban chỉ được giao việc thuộc ban của mình",
            )
        dept_id = current_user.department_id

    # Kiểm tra danh sách người nhận việc
    assignee_users: List[User] = []
    if data.assignee_ids:
        stmt = select(User).where(User.id.in_(data.assignee_ids), User.deleted_at.is_(None))
        assignee_users = (await db.execute(stmt)).scalars().all()
        if len(assignee_users) != len(set(data.assignee_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Một số người nhận việc không tồn tại hoặc đã bị xóa khỏi hệ thống",
            )

        # Trưởng ban chỉ được giao cho thành viên trong ban mình
        if current_user.role == SystemRole.DEPARTMENT_HEAD:
            for u in assignee_users:
                if u.department_id != current_user.department_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Thành viên {u.full_name} ({u.student_id}) không thuộc ban của bạn",
                    )

    new_task = Task(
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        priority=data.priority,
        status=TaskStatus.TODO,
        due_date=data.due_date,
        department_id=dept_id,
        event_id=data.event_id,
        created_by_id=current_user.id,
    )
    db.add(new_task)
    await db.flush()

    for u in assignee_users:
        db.add(TaskAssignee(task_id=new_task.id, user_id=u.id))

    await db.commit()

    # Tải lại đầy đủ quan hệ để trả về
    stmt = (
        select(Task)
        .options(
            joinedload(Task.creator),
            joinedload(Task.department),
            joinedload(Task.event),
            selectinload(Task.assignees).joinedload(TaskAssignee.user),
            selectinload(Task.comments),
        )
        .where(Task.id == new_task.id)
    )
    task = (await db.execute(stmt)).scalar_one()

    # Gửi thông báo cho những người được giao việc
    if assignee_users:
        assignee_ids = [u.id for u in assignee_users if u.id != current_user.id]
        if assignee_ids:
            await send_bulk_notifications(
                db,
                user_ids=assignee_ids,
                type=NotificationType.TASK_ASSIGNED,
                title=f"Bạn được giao công việc: {task.title}",
                body=f"{current_user.full_name} đã giao cho bạn công việc '{task.title}'.",
                link=f"/tasks/{task.id}",
            )
            await db.commit()

    await record_audit_event(
        db,
        action="TASK_CREATED",
        actor=f"user_id:{current_user.id}",
        target=f"task_id:{task.id}",
        ip_address=client_ip,
        details={"title": task.title, "priority": task.priority, "assignees_count": len(assignee_users)},
    )
    await db.commit()

    return _format_task_out(task)


@router.get("", response_model=PaginatedResponse[TaskOut], summary="Danh sách công việc")
async def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    department_id: Optional[int] = None,
    assignee_id: Optional[int] = None,
    event_id: Optional[int] = None,
    is_overdue: Optional[bool] = None,
    needs_reassignment: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem danh sách công việc:
    - Admin: Xem tất cả.
    - Trưởng ban: Xem mọi việc trong ban của mình hoặc việc giao cho mình.
    - Thành viên: Xem việc được giao cho mình hoặc do mình tạo.
    """
    conditions = []

    # Phân quyền theo vai trò
    if current_user.role == SystemRole.ADMIN:
        if department_id is not None:
            conditions.append(Task.department_id == department_id)
    elif current_user.role == SystemRole.DEPARTMENT_HEAD:
        # Trưởng ban xem việc trong ban mình hoặc việc được giao cho mình
        dept_id = current_user.department_id
        assignee_subquery = select(TaskAssignee.task_id).where(TaskAssignee.user_id == current_user.id)
        conditions.append(
            or_(
                Task.department_id == dept_id,
                Task.created_by_id == current_user.id,
                Task.id.in_(assignee_subquery),
            )
        )
    else:
        # Thành viên chỉ xem việc được giao hoặc do mình tạo
        assignee_subquery = select(TaskAssignee.task_id).where(TaskAssignee.user_id == current_user.id)
        conditions.append(
            or_(
                Task.created_by_id == current_user.id,
                Task.id.in_(assignee_subquery),
            )
        )

    if status_filter:
        conditions.append(Task.status == status_filter)
    if priority:
        conditions.append(Task.priority == priority)
    if event_id:
        conditions.append(Task.event_id == event_id)
    if assignee_id:
        subquery = select(TaskAssignee.task_id).where(TaskAssignee.user_id == assignee_id)
        conditions.append(Task.id.in_(subquery))
    if needs_reassignment is not None:
        conditions.append(Task.needs_reassignment == needs_reassignment)

    now = datetime.now(timezone.utc)
    if is_overdue is True:
        conditions.append(Task.due_date < now)
        conditions.append(Task.status.notin_([TaskStatus.DONE, TaskStatus.CANCELLED]))
    elif is_overdue is False:
        conditions.append(
            or_(
                Task.due_date.is_(None),
                Task.due_date >= now,
                Task.status.in_([TaskStatus.DONE, TaskStatus.CANCELLED]),
            )
        )

    count_stmt = select(func.count(Task.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Task)
        .options(
            joinedload(Task.creator),
            joinedload(Task.department),
            joinedload(Task.event),
            selectinload(Task.assignees).joinedload(TaskAssignee.user),
            selectinload(Task.comments),
        )
        .where(*conditions)
        .order_by(Task.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    tasks = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse[TaskOut](
        items=[_format_task_out(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/me", response_model=PaginatedResponse[TaskOut], summary="Công việc của tôi")
async def get_my_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên xem danh sách các công việc được giao cho chính mình."""
    assignee_subquery = select(TaskAssignee.task_id).where(TaskAssignee.user_id == current_user.id)
    conditions = [Task.id.in_(assignee_subquery)]
    if status_filter:
        conditions.append(Task.status == status_filter)

    count_stmt = select(func.count(Task.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Task)
        .options(
            joinedload(Task.creator),
            joinedload(Task.department),
            joinedload(Task.event),
            selectinload(Task.assignees).joinedload(TaskAssignee.user),
            selectinload(Task.comments),
        )
        .where(*conditions)
        .order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    tasks = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse[TaskOut](
        items=[_format_task_out(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{task_id}", response_model=TaskOut, summary="Xem chi tiết công việc")
async def get_task_detail(
    task_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem chi tiết một công việc."""
    stmt = (
        select(Task)
        .options(
            joinedload(Task.creator),
            joinedload(Task.department),
            joinedload(Task.event),
            selectinload(Task.assignees).joinedload(TaskAssignee.user),
            selectinload(Task.comments),
        )
        .where(Task.id == task_id)
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy công việc")

    _check_task_read_access(current_user, task)
    return _format_task_out(task)


@router.patch("/{task_id}", response_model=TaskOut, summary="Chỉnh sửa công việc")
async def update_task(
    task_id: int,
    data: TaskUpdate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Chỉnh sửa thông tin công việc (tiêu đề, hạn, ban, người nhận).
    Chỉ người giao việc, trưởng ban phụ trách hoặc Admin mới được thực hiện.
    """
    client_ip = get_client_ip(request)

    stmt = (
        select(Task)
        .options(
            joinedload(Task.creator),
            joinedload(Task.department),
            joinedload(Task.event),
            selectinload(Task.assignees).joinedload(TaskAssignee.user),
            selectinload(Task.comments),
        )
        .where(Task.id == task_id)
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy công việc")

    _check_task_manage_access(current_user, task)

    if data.title is not None:
        task.title = data.title.strip()
    if data.description is not None:
        task.description = data.description.strip() if data.description else None
    if data.priority is not None:
        task.priority = data.priority
    if data.due_date is not None:
        task.due_date = data.due_date
    if data.event_id is not None:
        task.event_id = data.event_id

    # Cập nhật ban nếu có quyền
    if data.department_id is not None and current_user.role == SystemRole.ADMIN:
        task.department_id = data.department_id

    # Cập nhật danh sách người nhận
    if data.assignee_ids is not None:
        stmt_users = select(User).where(User.id.in_(data.assignee_ids), User.deleted_at.is_(None))
        assignee_users = (await db.execute(stmt_users)).scalars().all()
        if len(assignee_users) != len(set(data.assignee_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Một số người nhận việc không tồn tại hoặc đã bị xóa khỏi hệ thống",
            )
        if current_user.role == SystemRole.DEPARTMENT_HEAD:
            for u in assignee_users:
                if u.department_id != current_user.department_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Thành viên {u.full_name} không thuộc ban của bạn",
                    )

        # Xóa các phân công cũ và gán mới
        task.assignees.clear()
        for u in assignee_users:
            task.assignees.append(TaskAssignee(task_id=task.id, user_id=u.id))
        task.needs_reassignment = False

    await db.commit()
    await db.refresh(task)

    await record_audit_event(
        db,
        action="TASK_UPDATED",
        actor=f"user_id:{current_user.id}",
        target=f"task_id:{task.id}",
        ip_address=client_ip,
        details={"title": task.title},
    )
    await db.commit()

    return _format_task_out(task)


@router.patch("/{task_id}/status", response_model=TaskOut, summary="Cập nhật trạng thái công việc")
async def update_task_status(
    task_id: int,
    data: TaskStatusUpdate,
    request: Request,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Cập nhật trạng thái công việc:
    - Người nhận việc: Có thể cập nhật tiến độ (todo -> in_progress -> done).
    - Người giao và Admin: Có thể đóng, hủy hoặc mở lại (done/cancelled/todo/in_progress).
    - Không ai được sửa tiêu đề/hạn nếu không phải người giao hoặc Admin.
    """
    client_ip = get_client_ip(request)

    stmt = (
        select(Task)
        .options(
            joinedload(Task.creator),
            joinedload(Task.department),
            joinedload(Task.event),
            selectinload(Task.assignees).joinedload(TaskAssignee.user),
            selectinload(Task.comments),
        )
        .where(Task.id == task_id)
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy công việc")

    is_admin = current_user.role == SystemRole.ADMIN
    is_creator = task.created_by_id == current_user.id
    is_dept_head = (
        current_user.role == SystemRole.DEPARTMENT_HEAD
        and task.department_id is not None
        and task.department_id == current_user.department_id
    )
    assignee_ids = [a.user_id for a in task.assignees]
    is_assignee = current_user.id in assignee_ids

    if not (is_admin or is_creator or is_dept_head or is_assignee):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền cập nhật trạng thái công việc này",
        )

    # Nếu là assignee thông thường (không phải admin/creator/dept_head): chỉ được đổi todo, in_progress, done.
    if is_assignee and not (is_admin or is_creator or is_dept_head):
        if data.status == TaskStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ người giao việc, trưởng ban hoặc Quản trị viên mới được hủy công việc",
            )

    old_status = task.status
    task.status = data.status

    if data.status == TaskStatus.DONE and old_status != TaskStatus.DONE:
        task.completed_at = datetime.now(timezone.utc)
    elif data.status != TaskStatus.DONE:
        task.completed_at = None

    await db.commit()
    await db.refresh(task)

    await record_audit_event(
        db,
        action="TASK_STATUS_CHANGED",
        actor=f"user_id:{current_user.id}",
        target=f"task_id:{task.id}",
        ip_address=client_ip,
        details={"old_status": old_status, "new_status": task.status},
    )
    await db.commit()

    return _format_task_out(task)


@router.get("/{task_id}/comments", response_model=List[TaskCommentOut], summary="Danh sách bình luận công việc")
async def list_task_comments(
    task_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Bình luận chỉ người liên quan (người giao, người nhận, trưởng ban của ban đó, admin) được xem."""
    stmt = (
        select(Task)
        .options(
            selectinload(Task.assignees),
            selectinload(Task.comments).joinedload(TaskComment.user),
        )
        .where(Task.id == task_id)
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy công việc")

    _check_task_read_access(current_user, task)

    return [
        TaskCommentOut(
            id=c.id,
            task_id=c.task_id,
            user_id=c.user_id,
            user_name=c.user.full_name if c.user else "Thành viên",
            content=c.content,
            created_at=c.created_at,
        )
        for c in task.comments
    ]


@router.post("/{task_id}/comments", response_model=TaskCommentOut, summary="Thêm bình luận công việc")
async def add_task_comment(
    task_id: int,
    data: TaskCommentCreate,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Thêm bình luận vào công việc. Chỉ người liên quan được viết."""
    stmt = (
        select(Task)
        .options(
            selectinload(Task.assignees),
            joinedload(Task.creator),
        )
        .where(Task.id == task_id)
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy công việc")

    _check_task_read_access(current_user, task)

    comment = TaskComment(
        task_id=task.id,
        user_id=current_user.id,
        content=data.content.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    # Thông báo cho người giao việc và các người nhận việc khác
    recipient_ids = set()
    if task.created_by_id != current_user.id:
        recipient_ids.add(task.created_by_id)
    for a in task.assignees:
        if a.user_id != current_user.id:
            recipient_ids.add(a.user_id)

    if recipient_ids:
        await send_bulk_notifications(
            db,
            user_ids=list(recipient_ids),
            type=NotificationType.COMMENT_ADDED,
            title=f"Bình luận mới trong công việc: {task.title}",
            body=f"{current_user.full_name} đã bình luận: \"{data.content[:80]}\"",
            link=f"/tasks/{task.id}",
        )
        await db.commit()

    return TaskCommentOut(
        id=comment.id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        user_name=current_user.full_name,
        content=comment.content,
        created_at=comment.created_at,
    )


@router.delete("/{task_id}", summary="Xóa công việc")
async def delete_task(
    task_id: int,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Xóa công việc (Chỉ người giao việc hoặc Admin)."""
    client_ip = get_client_ip(request)

    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy công việc")

    _check_task_manage_access(current_user, task)

    task_title = task.title
    await db.delete(task)
    await db.commit()

    await record_audit_event(
        db,
        action="TASK_DELETED",
        actor=f"user_id:{current_user.id}",
        target=f"task_id:{task_id}",
        ip_address=client_ip,
        details={"title": task_title},
    )
    await db.commit()

    return {"message": "Đã xóa công việc thành công"}
