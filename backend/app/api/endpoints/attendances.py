from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.endpoints.auth import get_client_ip
from app.core.audit import record_audit_event
from app.core.database import get_db
from app.core.deps import (
    ensure_event_manage_access,
    get_current_user,
    require_any_authenticated,
    require_department_head,
)
from app.models.event import (
    EventAttendance,
    EventRegistration,
    ReviewStatus,
)
from app.models.user import SystemRole, User
from app.schemas.event import (
    AttendanceReviewApprove,
    AttendanceReviewReject,
    EventAttendanceOut,
)
from app.services.storage import get_photo_absolute_path

router = APIRouter()


@router.get("/{attendance_id}/photo", summary="Tải và xem ảnh điểm danh")
async def get_attendance_photo(
    attendance_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Tải và xem ảnh điểm danh:
    - Quyền: Chỉ người tổ chức sự kiện (Admin / Trưởng ban phụ trách sự kiện) hoặc chính chủ sở hữu ảnh.
    - Người ngoài bị chặn 403 Forbidden.
    """
    stmt = (
        select(EventAttendance)
        .options(joinedload(EventAttendance.registration).joinedload(EventRegistration.event))
        .where(EventAttendance.id == attendance_id)
    )
    att = (await db.execute(stmt)).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Bản ghi điểm danh không tồn tại")

    reg = att.registration
    event = reg.event

    # Kiểm tra quyền: Chủ ảnh hoặc Người quản lý sự kiện
    is_owner = (reg.user_id == current_user.id)
    is_admin = (current_user.role == SystemRole.ADMIN)
    is_dept_head = (
        current_user.role == SystemRole.DEPARTMENT_HEAD
        and event.department_id is not None
        and event.department_id == current_user.department_id
    )

    if not (is_owner or is_admin or is_dept_head):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem ảnh điểm danh này",
        )

    if not att.photo_path:
        raise HTTPException(status_code=404, detail="Bản ghi điểm danh không có tệp ảnh kèm theo")

    file_path = get_photo_absolute_path(att.photo_path)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Tệp ảnh không tồn tại trên hệ thống lưu trữ")

    media_type = "image/png" if file_path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(file_path, media_type=media_type)


@router.post("/{attendance_id}/approve", response_model=EventAttendanceOut, summary="Duyệt ảnh điểm danh")
async def approve_attendance(
    attendance_id: int,
    data: Optional[AttendanceReviewApprove] = None,
    request: Request = None,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý duyệt lượt điểm danh."""
    stmt = (
        select(EventAttendance)
        .options(
            joinedload(EventAttendance.registration).joinedload(EventRegistration.event),
            joinedload(EventAttendance.reviewed_by),
        )
        .where(EventAttendance.id == attendance_id)
    )
    att = (await db.execute(stmt)).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Lượt điểm danh không tồn tại")

    event = att.registration.event
    ensure_event_manage_access(current_user, event)

    now = datetime.now(timezone.utc)
    att.review_status = ReviewStatus.APPROVED
    att.reviewed_by_id = current_user.id
    att.reviewed_at = now
    if data and data.note:
        att.review_note = data.note
    elif not att.review_note:
        att.review_note = f"Đã duyệt bởi {current_user.full_name}"

    await db.commit()
    await db.refresh(att)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="ATTENDANCE_APPROVED",
        actor=f"user_id:{current_user.id}",
        target=f"attendance_id:{att.id}",
        ip_address=client_ip,
        details={"registration_id": att.registration_id, "type": att.type},
    )
    await db.commit()

    return EventAttendanceOut(
        id=att.id,
        registration_id=att.registration_id,
        type=att.type,
        taken_at=att.taken_at,
        photo_path=att.photo_path,
        source=att.source,
        review_status=att.review_status,
        is_late=att.is_late,
        reviewed_by_id=att.reviewed_by_id,
        reviewed_by_name=current_user.full_name,
        reviewed_at=att.reviewed_at,
        review_note=att.review_note,
        created_at=att.created_at,
    )


@router.post("/{attendance_id}/reject", response_model=EventAttendanceOut, summary="Từ chối ảnh điểm danh")
async def reject_attendance(
    attendance_id: int,
    data: AttendanceReviewReject,
    request: Request = None,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý từ chối lượt điểm danh kèm lý do."""
    stmt = (
        select(EventAttendance)
        .options(
            joinedload(EventAttendance.registration).joinedload(EventRegistration.event),
            joinedload(EventAttendance.reviewed_by),
        )
        .where(EventAttendance.id == attendance_id)
    )
    att = (await db.execute(stmt)).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Lượt điểm danh không tồn tại")

    event = att.registration.event
    ensure_event_manage_access(current_user, event)

    now = datetime.now(timezone.utc)
    att.review_status = ReviewStatus.REJECTED
    att.reviewed_by_id = current_user.id
    att.reviewed_at = now
    att.review_note = data.note.strip()

    await db.commit()
    await db.refresh(att)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="ATTENDANCE_REJECTED",
        actor=f"user_id:{current_user.id}",
        target=f"attendance_id:{att.id}",
        ip_address=client_ip,
        details={"reason": data.note.strip()},
    )
    await db.commit()

    return EventAttendanceOut(
        id=att.id,
        registration_id=att.registration_id,
        type=att.type,
        taken_at=att.taken_at,
        photo_path=att.photo_path,
        source=att.source,
        review_status=att.review_status,
        is_late=att.is_late,
        reviewed_by_id=att.reviewed_by_id,
        reviewed_by_name=current_user.full_name,
        reviewed_at=att.reviewed_at,
        review_note=att.review_note,
        created_at=att.created_at,
    )
