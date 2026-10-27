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
from app.models.announcement import (
    Announcement,
    AnnouncementRead,
    AnnouncementScope,
    AnnouncementStatus,
)
from app.models.notification import NotificationType
from app.models.user import SystemRole, User
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementOut,
    AnnouncementReaderOut,
    AnnouncementStatsOut,
    AnnouncementUpdate,
)
from app.schemas.common import PaginatedResponse
from app.services.notification_service import send_bulk_notifications

router = APIRouter()


def _format_announcement_out(ann: Announcement, current_user: User) -> AnnouncementOut:
    read_user_ids = [r.user_id for r in ann.reads] if ann.reads else []
    is_read_by_me = current_user.id in read_user_ids

    return AnnouncementOut(
        id=ann.id,
        title=ann.title,
        content=ann.content,
        scope=ann.scope,
        department_id=ann.department_id,
        department_name=ann.department.name if ann.department else None,
        is_pinned=ann.is_pinned,
        status=ann.status,
        published_at=ann.published_at,
        created_by_id=ann.created_by_id,
        creator_name=ann.creator.full_name if ann.creator else None,
        read_count=len(read_user_ids),
        is_read_by_me=is_read_by_me,
        created_at=ann.created_at,
        updated_at=ann.updated_at,
    )


@router.post("", response_model=AnnouncementOut, summary="Đăng thông báo bảng tin mới")
async def create_announcement(
    data: AnnouncementCreate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Đăng thông báo mới:
    - Admin: Đăng cho toàn CLB hoặc bất kỳ ban nào.
    - Trưởng ban: Chỉ đăng cho ban của chính mình (scope='department').
    - Thành viên thông thường: Không có quyền (403).
    """
    client_ip = get_client_ip(request)

    scope = data.scope
    dept_id = data.department_id

    if current_user.role == SystemRole.DEPARTMENT_HEAD:
        if current_user.department_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tài khoản trưởng ban chưa được phân công ban cụ thể",
            )
        scope = AnnouncementScope.DEPARTMENT
        dept_id = current_user.department_id
    elif current_user.role == SystemRole.ADMIN:
        if scope == AnnouncementScope.ALL:
            dept_id = None
        elif scope == AnnouncementScope.DEPARTMENT and dept_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phạm vi ban chuyên môn bắt buộc phải chọn ban (department_id)",
            )

    now = datetime.now(timezone.utc)
    published_at = now if data.status == AnnouncementStatus.PUBLISHED else None

    ann = Announcement(
        title=data.title.strip(),
        content=data.content.strip(),
        scope=scope,
        department_id=dept_id,
        is_pinned=data.is_pinned,
        status=data.status,
        published_at=published_at,
        created_by_id=current_user.id,
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)

    # Đánh dấu tác giả đã đọc
    db.add(AnnouncementRead(announcement_id=ann.id, user_id=current_user.id, read_at=now))
    await db.commit()

    # Nếu đã xuất bản, tự động sinh thông báo cho các thành viên trong phạm vi
    if ann.status == AnnouncementStatus.PUBLISHED:
        member_stmt = select(User.id).where(User.is_active == True, User.deleted_at.is_(None), User.id != current_user.id)
        if ann.scope == AnnouncementScope.DEPARTMENT and ann.department_id is not None:
            member_stmt = member_stmt.where(User.department_id == ann.department_id)
        target_uids = (await db.execute(member_stmt)).scalars().all()

        if target_uids:
            await send_bulk_notifications(
                db,
                user_ids=target_uids,
                type=NotificationType.ANNOUNCEMENT_PUBLISHED,
                title=f"Bảng tin mới: {ann.title}",
                body=f"{current_user.full_name} đã đăng thông báo mới trên bảng tin.",
                link=f"/announcements/{ann.id}",
            )
            await db.commit()

    await record_audit_event(
        db,
        action="ANNOUNCEMENT_CREATED",
        actor=f"user_id:{current_user.id}",
        target=f"announcement_id:{ann.id}",
        ip_address=client_ip,
        details={"title": ann.title, "scope": ann.scope, "status": ann.status},
    )
    await db.commit()

    # Nạp quan hệ để trả về
    stmt = (
        select(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.department),
            selectinload(Announcement.reads),
        )
        .where(Announcement.id == ann.id)
    )
    ann = (await db.execute(stmt)).scalar_one()
    return _format_announcement_out(ann, current_user)


@router.get("", response_model=PaginatedResponse[AnnouncementOut], summary="Bảng tin thông báo")
async def list_announcements(
    scope: Optional[str] = None,
    department_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem danh sách thông báo:
    - Thành viên xem thông báo toàn CLB và của ban mình (nếu có ban).
    - Trưởng ban xem thông báo toàn CLB và của ban mình.
    - Admin xem tất cả (kể cả bản nháp nếu là tác giả hoặc admin).
    - Ghim thông báo (is_pinned) lên đầu.
    """
    conditions = []

    if current_user.role != SystemRole.ADMIN:
        # Chỉ xem bản published hoặc do chính mình tạo
        conditions.append(
            or_(
                Announcement.status == AnnouncementStatus.PUBLISHED,
                Announcement.created_by_id == current_user.id,
            )
        )
        # Chỉ xem thông báo toàn CLB hoặc thuộc ban của mình
        if current_user.department_id is not None:
            conditions.append(
                or_(
                    Announcement.scope == AnnouncementScope.ALL,
                    Announcement.department_id == current_user.department_id,
                )
            )
        else:
            conditions.append(Announcement.scope == AnnouncementScope.ALL)
    else:
        # Admin có thể lọc theo scope/ban
        if scope:
            conditions.append(Announcement.scope == scope)
        if department_id:
            conditions.append(Announcement.department_id == department_id)

    count_stmt = select(func.count(Announcement.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.department),
            selectinload(Announcement.reads),
        )
        .where(*conditions)
        .order_by(
            Announcement.is_pinned.desc(),
            Announcement.published_at.desc().nulls_last(),
            Announcement.created_at.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    anns = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse[AnnouncementOut](
        items=[_format_announcement_out(a, current_user) for a in anns],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{announcement_id}", response_model=AnnouncementOut, summary="Xem chi tiết thông báo")
async def get_announcement_detail(
    announcement_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem chi tiết thông báo và tự động đánh dấu đã đọc."""
    stmt = (
        select(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.department),
            selectinload(Announcement.reads),
        )
        .where(Announcement.id == announcement_id)
    )
    ann = (await db.execute(stmt)).scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")

    # Kiểm tra quyền xem
    if current_user.role != SystemRole.ADMIN and ann.created_by_id != current_user.id:
        if ann.status != AnnouncementStatus.PUBLISHED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Thông báo chưa được xuất bản")
        if ann.scope == AnnouncementScope.DEPARTMENT and ann.department_id != current_user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không thuộc ban nhận thông báo này")

    # Tự động đánh dấu đã đọc nếu chưa đọc
    existing_read = (
        await db.execute(
            select(AnnouncementRead).where(
                AnnouncementRead.announcement_id == ann.id,
                AnnouncementRead.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not existing_read:
        db.add(AnnouncementRead(announcement_id=ann.id, user_id=current_user.id))
        await db.commit()
        await db.refresh(ann)

    return _format_announcement_out(ann, current_user)


@router.patch("/{announcement_id}", response_model=AnnouncementOut, summary="Chỉnh sửa thông báo")
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Sửa thông báo hoặc thu hồi về bản nháp. Chỉ người đăng hoặc Admin."""
    client_ip = get_client_ip(request)

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")

    if current_user.role != SystemRole.ADMIN and ann.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền sửa thông báo này")

    if data.title is not None:
        ann.title = data.title.strip()
    if data.content is not None:
        ann.content = data.content.strip()
    if data.is_pinned is not None:
        ann.is_pinned = data.is_pinned
    if data.status is not None:
        if data.status == AnnouncementStatus.PUBLISHED and ann.status != AnnouncementStatus.PUBLISHED:
            ann.published_at = datetime.now(timezone.utc)
        ann.status = data.status

    # Quyền đổi ban/scope chỉ dành cho Admin
    if current_user.role == SystemRole.ADMIN:
        if data.scope is not None:
            ann.scope = data.scope
        if data.department_id is not None:
            ann.department_id = data.department_id

    await db.commit()
    await db.refresh(ann)

    await record_audit_event(
        db,
        action="ANNOUNCEMENT_UPDATED",
        actor=f"user_id:{current_user.id}",
        target=f"announcement_id:{ann.id}",
        ip_address=client_ip,
        details={"title": ann.title, "status": ann.status},
    )
    await db.commit()

    stmt = (
        select(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.department),
            selectinload(Announcement.reads),
        )
        .where(Announcement.id == ann.id)
    )
    ann = (await db.execute(stmt)).scalar_one()
    return _format_announcement_out(ann, current_user)


@router.post("/{announcement_id}/read", summary="Đánh dấu đã đọc thông báo")
async def mark_announcement_read(
    announcement_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên chủ động đánh dấu đã đọc thông báo."""
    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")

    existing = (
        await db.execute(
            select(AnnouncementRead).where(
                AnnouncementRead.announcement_id == ann.id,
                AnnouncementRead.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not existing:
        db.add(AnnouncementRead(announcement_id=ann.id, user_id=current_user.id))
        await db.commit()

    return {"message": "Đã đánh dấu đã đọc thông báo"}


@router.get("/{announcement_id}/readers", response_model=AnnouncementStatsOut, summary="Thống kê người đã đọc")
async def get_announcement_readers(
    announcement_id: int,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Xem danh sách chi tiết những người đã đọc thông báo. Chỉ người đăng và Admin được xem."""
    stmt = (
        select(Announcement)
        .options(selectinload(Announcement.reads).joinedload(AnnouncementRead.user))
        .where(Announcement.id == announcement_id)
    )
    ann = (await db.execute(stmt)).scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")

    if current_user.role != SystemRole.ADMIN and ann.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người đăng và Quản trị viên mới được xem danh sách người đọc")

    readers_out = [
        AnnouncementReaderOut(
            user_id=r.user_id,
            full_name=r.user.full_name,
            student_id=r.user.student_id,
            read_at=r.read_at,
        )
        for r in ann.reads
        if r.user
    ]

    return AnnouncementStatsOut(
        read_count=len(readers_out),
        readers=readers_out,
    )


@router.delete("/{announcement_id}", summary="Xóa thông báo bảng tin")
async def delete_announcement(
    announcement_id: int,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Xóa thông báo (Người đăng hoặc Admin)."""
    client_ip = get_client_ip(request)

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")

    if current_user.role != SystemRole.ADMIN and ann.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xóa thông báo này")

    title = ann.title
    await db.delete(ann)
    await db.commit()

    await record_audit_event(
        db,
        action="ANNOUNCEMENT_DELETED",
        actor=f"user_id:{current_user.id}",
        target=f"announcement_id:{announcement_id}",
        ip_address=client_ip,
        details={"title": title},
    )
    await db.commit()

    return {"message": "Đã xóa thông báo thành công"}
