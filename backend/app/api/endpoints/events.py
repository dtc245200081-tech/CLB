import csv
import io
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.endpoints.auth import get_client_ip
from app.core.audit import record_audit_event
from app.core.database import get_db
from app.core.deps import (
    ensure_department_access,
    ensure_event_manage_access,
    get_current_user,
    require_admin,
    require_any_authenticated,
    require_department_head,
)
from app.core.rate_limiter import attendance_limiter
from app.models.department import Department
from app.models.event import (
    AttendanceSource,
    AttendanceType,
    Event,
    EventAttendance,
    EventRegistration,
    EventStatus,
    RegistrationStatus,
    ReviewStatus,
)
from app.models.user import SystemRole, User
from app.schemas.common import PaginatedResponse
from app.schemas.event import (
    AttendanceReviewApprove,
    AttendanceReviewReject,
    EventAttendanceOut,
    EventCreate,
    EventRegistrationOut,
    EventReject,
    EventResponse,
    EventStatsOut,
    EventUpdate,
    ManualAttendanceCreate,
)
from app.services.storage import (
    delete_attendance_photo,
    get_photo_absolute_path,
    save_attendance_photo,
)

router = APIRouter()


def to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Đảm bảo đối tượng datetime luôn có tzinfo UTC để so sánh an toàn kể cả với SQLite."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def get_event_registered_count(db: AsyncSession, event_id: int) -> int:
    """Đếm số lượng người đang đăng ký hiệu lực của sự kiện."""
    stmt = (
        select(func.count(EventRegistration.id))
        .where(
            EventRegistration.event_id == event_id,
            EventRegistration.status == RegistrationStatus.REGISTERED,
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one() or 0


def format_registration_out(reg: EventRegistration) -> EventRegistrationOut:
    """Format đối tượng EventRegistration kèm thông tin thành viên và trạng thái điểm danh."""
    user = reg.user
    attendances = reg.attendances or []

    # Tìm lượt điểm danh đến và về hiệu lực nhất (ưu tiên approved > pending > rejected)
    check_in: Optional[EventAttendance] = None
    check_out: Optional[EventAttendance] = None

    for att in sorted(attendances, key=lambda x: (1 if x.review_status == ReviewStatus.APPROVED else (2 if x.review_status == ReviewStatus.PENDING else 3))):
        if att.type == AttendanceType.CHECK_IN and check_in is None:
            check_in = att
        elif att.type == AttendanceType.CHECK_OUT and check_out is None:
            check_out = att

    is_attended = check_in is not None and check_in.review_status == ReviewStatus.APPROVED
    is_late = check_in is not None and check_in.is_late
    is_fully_attended = is_attended and (check_out is not None and check_out.review_status == ReviewStatus.APPROVED)

    duration_minutes: Optional[float] = None
    if is_fully_attended and check_in and check_out:
        t_in = to_utc(check_in.taken_at)
        t_out = to_utc(check_out.taken_at)
        duration_minutes = round((t_out - t_in).total_seconds() / 60, 1)

    def to_att_out(a: Optional[EventAttendance]) -> Optional[EventAttendanceOut]:
        if not a:
            return None
        return EventAttendanceOut(
            id=a.id,
            registration_id=a.registration_id,
            type=a.type,
            taken_at=a.taken_at,
            photo_path=a.photo_path,
            source=a.source,
            review_status=a.review_status,
            is_late=a.is_late,
            reviewed_by_id=a.reviewed_by_id,
            reviewed_by_name=a.reviewed_by.full_name if a.reviewed_by else None,
            reviewed_at=a.reviewed_at,
            review_note=a.review_note,
            created_at=a.created_at,
        )

    return EventRegistrationOut(
        id=reg.id,
        user_id=reg.user_id,
        event_id=reg.event_id,
        status=reg.status,
        created_at=reg.created_at,
        updated_at=reg.updated_at,
        student_id=user.student_id if user else None,
        full_name=user.full_name if user else None,
        email=user.email if user else None,
        phone=user.phone if user else None,
        faculty=user.faculty if user else None,
        class_name=user.class_name if user else None,
        department_name=user.department.name if user and user.department else None,
        check_in=to_att_out(check_in),
        check_out=to_att_out(check_out),
        is_attended=is_attended,
        is_late=is_late,
        is_fully_attended=is_fully_attended,
        duration_minutes=duration_minutes,
    )


# ============================================================
# 1. QUẢN LÝ SỰ KIỆN (EVENTS CRUD)
# ============================================================


@router.get("", response_model=PaginatedResponse[EventResponse])
async def list_events(
    status_filter: Optional[str] = Query(None, alias="status"),
    department_id: Optional[int] = Query(None),
    timeline: str = Query("all", pattern="^(all|upcoming|past)$"),
    upcoming_only: Optional[bool] = Query(None, description="Lọc sự kiện sắp tới"),
    past_only: Optional[bool] = Query(None, description="Lọc sự kiện đã qua"),
    registered_only: bool = Query(False, description="Chỉ lấy sự kiện tôi đã đăng ký"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách sự kiện nội bộ:
    - Member: Chỉ xem các sự kiện published (và cancelled công khai).
    - Department Head: Xem các sự kiện published + draft của ban mình.
    - Admin: Xem toàn bộ sự kiện.
    """
    now = datetime.now(timezone.utc)

    if upcoming_only is True:
        timeline = "upcoming"
    elif past_only is True:
        timeline = "past"

    conditions = []
    if current_user.role == SystemRole.ADMIN:
        pass
    elif current_user.role == SystemRole.DEPARTMENT_HEAD:
        conditions.append(
            or_(
                Event.status.in_([EventStatus.PUBLISHED, EventStatus.CANCELLED]),
                Event.department_id == current_user.department_id,
                Event.created_by_id == current_user.id,
            )
        )
    else:
        conditions.append(
            or_(
                Event.status == EventStatus.PUBLISHED,
                Event.status == EventStatus.CANCELLED,
            )
        )

    if status_filter:
        conditions.append(Event.status == status_filter)

    if department_id is not None:
        conditions.append(Event.department_id == department_id)

    if timeline == "upcoming":
        conditions.append(Event.end_time >= now)
    elif timeline == "past":
        conditions.append(Event.end_time < now)

    if registered_only:
        reg_subquery = (
            select(EventRegistration.event_id)
            .where(
                EventRegistration.user_id == current_user.id,
                EventRegistration.status == RegistrationStatus.REGISTERED,
            )
        )
        conditions.append(Event.id.in_(reg_subquery))

    if search:
        s = f"%{search.strip()}%"
        conditions.append(
            or_(
                Event.title.ilike(s),
                Event.location.ilike(s),
                Event.description.ilike(s),
            )
        )

    count_stmt = select(func.count(Event.id))
    if conditions:
        count_stmt = count_stmt.where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    # Sắp xếp: Nếu đang xem sắp tới hoặc đã đăng ký mà timeline upcoming -> sớm nhất lên đầu
    order_clause = Event.start_time.asc() if timeline == "upcoming" else Event.start_time.desc()

    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .order_by(order_clause)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if conditions:
        stmt = stmt.where(*conditions)

    events = (await db.execute(stmt)).scalars().all()

    event_ids = [e.id for e in events]
    my_regs_map = {}
    if event_ids:
        reg_stmt = (
            select(EventRegistration)
            .options(
                joinedload(EventRegistration.user).joinedload(User.department),
                selectinload(EventRegistration.attendances).joinedload(EventAttendance.reviewed_by),
            )
            .where(
                EventRegistration.event_id.in_(event_ids),
                EventRegistration.user_id == current_user.id,
            )
        )
        my_regs = (await db.execute(reg_stmt)).scalars().all()
        for r in my_regs:
            my_regs_map[r.event_id] = format_registration_out(r)

    reg_counts_map = {}
    if event_ids:
        count_reg_stmt = (
            select(EventRegistration.event_id, func.count(EventRegistration.id))
            .where(
                EventRegistration.event_id.in_(event_ids),
                EventRegistration.status == RegistrationStatus.REGISTERED,
            )
            .group_by(EventRegistration.event_id)
        )
        counts = (await db.execute(count_reg_stmt)).all()
        for e_id, cnt in counts:
            reg_counts_map[e_id] = cnt

    items = []
    for ev in events:
        my_reg = my_regs_map.get(ev.id)
        is_reg = my_reg is not None and my_reg.status == RegistrationStatus.REGISTERED
        items.append(
            EventResponse(
                id=ev.id,
                title=ev.title,
                description=ev.description,
                location=ev.location,
                start_time=ev.start_time,
                end_time=ev.end_time,
                registration_deadline=ev.registration_deadline,
                capacity=ev.capacity,
                department_id=ev.department_id,
                is_public=ev.is_public,
                status=ev.status,
                rejection_reason=ev.rejection_reason,
                created_by_id=ev.created_by_id,
                checkin_open_minutes_before=ev.checkin_open_minutes_before,
                late_after_minutes=ev.late_after_minutes,
                checkin_close_minutes_after_start=ev.checkin_close_minutes_after_start,
                checkout_open_after_minutes=ev.checkout_open_after_minutes,
                checkout_close_minutes_after_end=ev.checkout_close_minutes_after_end,
                created_at=ev.created_at,
                updated_at=ev.updated_at,
                department_name=ev.department.name if ev.department else None,
                creator_name=ev.creator.full_name if ev.creator else None,
                registered_count=reg_counts_map.get(ev.id, 0),
                is_registered=is_reg,
                my_registration_status=my_reg.status if my_reg else None,
                my_registration=my_reg,
            )
        )

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Tạo sự kiện mới:
    - Sự kiện toàn CLB (department_id = null): Chỉ Quản trị viên mới được tạo.
    - Sự kiện của Ban: Trưởng ban của ban đó hoặc Quản trị viên được tạo.
    """
    if data.department_id is not None:
        dept = await db.get(Department, data.department_id)
        if not dept:
            raise HTTPException(status_code=404, detail="Ban chuyên môn không tồn tại")
        if not dept.is_active:
            raise HTTPException(status_code=400, detail="Không thể tạo sự kiện cho ban đang bị vô hiệu hóa")
        ensure_department_access(current_user, data.department_id)
    else:
        if current_user.role != SystemRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên mới có quyền tạo sự kiện cấp toàn CLB",
            )

    new_event = Event(
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        location=data.location.strip(),
        start_time=data.start_time,
        end_time=data.end_time,
        registration_deadline=data.registration_deadline,
        capacity=data.capacity,
        department_id=data.department_id,
        is_public=data.is_public,
        status=EventStatus.DRAFT,
        created_by_id=current_user.id,
        checkin_open_minutes_before=data.checkin_open_minutes_before,
        late_after_minutes=data.late_after_minutes,
        checkin_close_minutes_after_start=data.checkin_close_minutes_after_start,
        checkout_open_after_minutes=data.checkout_open_after_minutes,
        checkout_close_minutes_after_end=data.checkout_close_minutes_after_end,
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_CREATED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{new_event.id}",
        ip_address=client_ip,
        details={
            "title": new_event.title,
            "department_id": new_event.department_id,
            "start_time": new_event.start_time.isoformat(),
            "end_time": new_event.end_time.isoformat(),
        },
    )
    await db.commit()

    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .where(Event.id == new_event.id)
    )
    loaded_event = (await db.execute(stmt)).scalar_one()

    return EventResponse(
        id=loaded_event.id,
        title=loaded_event.title,
        description=loaded_event.description,
        location=loaded_event.location,
        start_time=loaded_event.start_time,
        end_time=loaded_event.end_time,
        registration_deadline=loaded_event.registration_deadline,
        capacity=loaded_event.capacity,
        department_id=loaded_event.department_id,
        is_public=loaded_event.is_public,
        status=loaded_event.status,
        rejection_reason=loaded_event.rejection_reason,
        created_by_id=loaded_event.created_by_id,
        checkin_open_minutes_before=loaded_event.checkin_open_minutes_before,
        late_after_minutes=loaded_event.late_after_minutes,
        checkin_close_minutes_after_start=loaded_event.checkin_close_minutes_after_start,
        checkout_open_after_minutes=loaded_event.checkout_open_after_minutes,
        checkout_close_minutes_after_end=loaded_event.checkout_close_minutes_after_end,
        created_at=loaded_event.created_at,
        updated_at=loaded_event.updated_at,
        department_name=loaded_event.department.name if loaded_event.department else None,
        creator_name=loaded_event.creator.full_name if loaded_event.creator else None,
        registered_count=0,
        my_registration=None,
    )


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem chi tiết sự kiện nội bộ:
    - Sự kiện draft chỉ người tạo, Trưởng ban của ban đó và Admin thấy.
    """
    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    if event.status in [EventStatus.DRAFT, EventStatus.PENDING_APPROVAL, EventStatus.REJECTED]:
        if current_user.role != SystemRole.ADMIN and current_user.id != event.created_by_id:
            if (
                current_user.role != SystemRole.DEPARTMENT_HEAD
                or current_user.department_id is None
                or event.department_id != current_user.department_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền xem sự kiện này",
                )

    registered_count = await get_event_registered_count(db, event.id)

    reg_stmt = (
        select(EventRegistration)
        .options(
            joinedload(EventRegistration.user).joinedload(User.department),
            selectinload(EventRegistration.attendances).joinedload(EventAttendance.reviewed_by),
        )
        .where(
            EventRegistration.event_id == event.id,
            EventRegistration.user_id == current_user.id,
        )
    )
    my_reg = (await db.execute(reg_stmt)).scalars().first()
    my_reg_out = format_registration_out(my_reg) if my_reg else None
    is_reg = my_reg_out is not None and my_reg_out.status == RegistrationStatus.REGISTERED

    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        registration_deadline=event.registration_deadline,
        capacity=event.capacity,
        department_id=event.department_id,
        is_public=event.is_public,
        status=event.status,
        rejection_reason=event.rejection_reason,
        created_by_id=event.created_by_id,
        checkin_open_minutes_before=event.checkin_open_minutes_before,
        late_after_minutes=event.late_after_minutes,
        checkin_close_minutes_after_start=event.checkin_close_minutes_after_start,
        checkout_open_after_minutes=event.checkout_open_after_minutes,
        checkout_close_minutes_after_end=event.checkout_close_minutes_after_end,
        created_at=event.created_at,
        updated_at=event.updated_at,
        department_name=event.department.name if event.department else None,
        creator_name=event.creator.full_name if event.creator else None,
        registered_count=registered_count,
        is_registered=is_reg,
        my_registration_status=my_reg_out.status if my_reg_out else None,
        my_registration=my_reg_out,
    )


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: int,
    data: EventUpdate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Cập nhật sự kiện:
    - Quản trị viên hoặc Trưởng ban phụ trách ban của sự kiện.
    - Không sửa sự kiện đã bị hủy.
    - Sửa sự kiện đã có người đăng ký:
      + Không giảm capacity dưới số người đã đăng ký.
      + Chỉ đổi thời gian khi sự kiện chưa kết thúc.
      + Không sửa tham số điểm danh sau khi sự kiện kết thúc.
    """
    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    if event.status == EventStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể chỉnh sửa sự kiện đã bị hủy",
        )

    now = datetime.now(timezone.utc)
    event_end = to_utc(event.end_time)
    registered_count = await get_event_registered_count(db, event.id)

    if data.capacity is not None and registered_count > 0:
        if data.capacity < registered_count:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể giảm số lượng tối đa ({data.capacity}) thấp hơn số người đã đăng ký hiện tại ({registered_count})",
            )

    is_changing_time = (data.start_time is not None and data.start_time != event.start_time) or (
        data.end_time is not None and data.end_time != event.end_time
    )
    if is_changing_time and now > event_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể thay đổi thời gian cho sự kiện đã kết thúc",
        )

    is_changing_params = any(
        x is not None
        for x in [
            data.checkin_open_minutes_before,
            data.late_after_minutes,
            data.checkin_close_minutes_after_start,
            data.checkout_open_after_minutes,
            data.checkout_close_minutes_after_end,
        ]
    )
    if is_changing_params and now > event_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể sửa tham số điểm danh sau khi sự kiện đã kết thúc",
        )

    update_dict = data.model_dump(exclude_unset=True)

    if "department_id" in update_dict and update_dict["department_id"] != event.department_id:
        new_dept_id = update_dict["department_id"]
        if new_dept_id is None:
            if current_user.role != SystemRole.ADMIN:
                raise HTTPException(status_code=403, detail="Chỉ Quản trị viên mới được chuyển sự kiện thành cấp toàn CLB")
        else:
            ensure_department_access(current_user, new_dept_id)

    for key, value in update_dict.items():
        if key in ["title", "location", "description"] and isinstance(value, str):
            setattr(event, key, value.strip())
        else:
            setattr(event, key, value)

    if event.end_time <= event.start_time:
        raise HTTPException(status_code=400, detail="Thời gian kết thúc phải sau thời gian bắt đầu")
    if event.registration_deadline and event.registration_deadline > event.start_time:
        raise HTTPException(status_code=400, detail="Hạn chót đăng ký không được muộn hơn thời gian bắt đầu sự kiện")

    await db.commit()
    await db.refresh(event)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_UPDATED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"updated_fields": list(update_dict.keys())},
    )
    await db.commit()

    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        registration_deadline=event.registration_deadline,
        capacity=event.capacity,
        department_id=event.department_id,
        is_public=event.is_public,
        status=event.status,
        rejection_reason=event.rejection_reason,
        created_by_id=event.created_by_id,
        checkin_open_minutes_before=event.checkin_open_minutes_before,
        late_after_minutes=event.late_after_minutes,
        checkin_close_minutes_after_start=event.checkin_close_minutes_after_start,
        checkout_open_after_minutes=event.checkout_open_after_minutes,
        checkout_close_minutes_after_end=event.checkout_close_minutes_after_end,
        created_at=event.created_at,
        updated_at=event.updated_at,
        department_name=event.department.name if event.department else None,
        creator_name=event.creator.full_name if event.creator else None,
        registered_count=registered_count,
        my_registration=None,
    )


@router.post("/{event_id}/submit", response_model=EventResponse)
async def submit_event(
    event_id: int,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Gửi duyệt sự kiện:
    - Trưởng ban phụ trách ban của sự kiện (hoặc Admin) gửi duyệt sự kiện.
    - Chuyển trạng thái từ draft hoặc rejected -> pending_approval.
    - Sự kiện toàn CLB do Admin tạo và publish trực tiếp, không cần gửi duyệt.
    """
    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    if event.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sự kiện toàn CLB do Quản trị viên trực tiếp công bố, không cần gửi duyệt",
        )

    if event.status == EventStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sự kiện đã được gửi duyệt và đang chờ phê duyệt",
        )
    if event.status == EventStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sự kiện đã được công bố, không thể gửi duyệt",
        )
    if event.status == EventStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể gửi duyệt sự kiện đã bị hủy",
        )
    if event.status not in [EventStatus.DRAFT, EventStatus.REJECTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ sự kiện ở trạng thái bản nháp hoặc bị từ chối mới có thể gửi duyệt",
        )

    event.status = EventStatus.PENDING_APPROVAL
    event.rejection_reason = None
    await db.commit()
    await db.refresh(event)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_SUBMITTED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"title": event.title},
    )
    await db.commit()

    registered_count = await get_event_registered_count(db, event.id)

    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        registration_deadline=event.registration_deadline,
        capacity=event.capacity,
        department_id=event.department_id,
        is_public=event.is_public,
        status=event.status,
        rejection_reason=event.rejection_reason,
        created_by_id=event.created_by_id,
        checkin_open_minutes_before=event.checkin_open_minutes_before,
        late_after_minutes=event.late_after_minutes,
        checkin_close_minutes_after_start=event.checkin_close_minutes_after_start,
        checkout_open_after_minutes=event.checkout_open_after_minutes,
        checkout_close_minutes_after_end=event.checkout_close_minutes_after_end,
        created_at=event.created_at,
        updated_at=event.updated_at,
        department_name=event.department.name if event.department else None,
        creator_name=event.creator.full_name if event.creator else None,
        registered_count=registered_count,
        my_registration=None,
    )


@router.post("/{event_id}/publish", response_model=EventResponse)
@router.post("/{event_id}/approve", response_model=EventResponse)
async def publish_event(
    event_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Công bố / phê duyệt sự kiện (status -> published).
    - Chỉ Quản trị viên (Admin) mới có quyền duyệt và công bố sự kiện.
    - Sự kiện toàn CLB (department_id is None): Admin duyệt công bố trực tiếp từ draft.
    - Sự kiện của Ban: Phải ở trạng thái pending_approval mới được duyệt công bố.
    """
    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    if event.status == EventStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Sự kiện đã được công bố trước đó")
    if event.status == EventStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Không thể công bố lại sự kiện đã bị hủy")
    if event.status == EventStatus.REJECTED:
        raise HTTPException(
            status_code=400,
            detail="Sự kiện đang bị từ chối, cần được chỉnh sửa và gửi duyệt lại trước khi phê duyệt",
        )
    if event.department_id is not None and event.status == EventStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Sự kiện của ban chuyên môn cần được gửi duyệt (pending_approval) trước khi phê duyệt",
        )
    if event.status not in [EventStatus.DRAFT, EventStatus.PENDING_APPROVAL]:
        raise HTTPException(
            status_code=400,
            detail="Trạng thái sự kiện không hợp lệ để phê duyệt công bố",
        )

    event.status = EventStatus.PUBLISHED
    event.rejection_reason = None
    await db.commit()
    await db.refresh(event)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_PUBLISHED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"title": event.title},
    )
    await db.commit()

    registered_count = await get_event_registered_count(db, event.id)

    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        registration_deadline=event.registration_deadline,
        capacity=event.capacity,
        department_id=event.department_id,
        is_public=event.is_public,
        status=event.status,
        rejection_reason=event.rejection_reason,
        created_by_id=event.created_by_id,
        checkin_open_minutes_before=event.checkin_open_minutes_before,
        late_after_minutes=event.late_after_minutes,
        checkin_close_minutes_after_start=event.checkin_close_minutes_after_start,
        checkout_open_after_minutes=event.checkout_open_after_minutes,
        checkout_close_minutes_after_end=event.checkout_close_minutes_after_end,
        created_at=event.created_at,
        updated_at=event.updated_at,
        department_name=event.department.name if event.department else None,
        creator_name=event.creator.full_name if event.creator else None,
        registered_count=registered_count,
        my_registration=None,
    )


@router.post("/{event_id}/reject", response_model=EventResponse)
async def reject_event(
    event_id: int,
    data: EventReject,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Từ chối duyệt sự kiện:
    - Chỉ Quản trị viên (Admin) mới có quyền từ chối sự kiện kèm lý do.
    - Chuyển trạng thái từ pending_approval -> rejected.
    """
    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    if event.status == EventStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể từ chối sự kiện đã được công bố",
        )
    if event.status == EventStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể từ chối sự kiện đã bị hủy",
        )
    if event.status == EventStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sự kiện đã bị từ chối trước đó",
        )
    if event.status != EventStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ có thể từ chối sự kiện đang ở trạng thái chờ duyệt (pending_approval)",
        )

    event.status = EventStatus.REJECTED
    event.rejection_reason = data.reason
    await db.commit()
    await db.refresh(event)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_REJECTED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"title": event.title, "reason": data.reason},
    )
    await db.commit()

    registered_count = await get_event_registered_count(db, event.id)

    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        registration_deadline=event.registration_deadline,
        capacity=event.capacity,
        department_id=event.department_id,
        is_public=event.is_public,
        status=event.status,
        rejection_reason=event.rejection_reason,
        created_by_id=event.created_by_id,
        checkin_open_minutes_before=event.checkin_open_minutes_before,
        late_after_minutes=event.late_after_minutes,
        checkin_close_minutes_after_start=event.checkin_close_minutes_after_start,
        checkout_open_after_minutes=event.checkout_open_after_minutes,
        checkout_close_minutes_after_end=event.checkout_close_minutes_after_end,
        created_at=event.created_at,
        updated_at=event.updated_at,
        department_name=event.department.name if event.department else None,
        creator_name=event.creator.full_name if event.creator else None,
        registered_count=registered_count,
        my_registration=None,
    )


@router.post("/{event_id}/cancel", response_model=EventResponse)
async def cancel_event(
    event_id: int,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Hủy sự kiện: Giữ nguyên dữ liệu, không cho phép đăng ký hoặc điểm danh mới."""
    stmt = (
        select(Event)
        .options(joinedload(Event.department), joinedload(Event.creator))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    if event.status == EventStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Sự kiện đã ở trạng thái bị hủy")

    event.status = EventStatus.CANCELLED
    await db.commit()
    await db.refresh(event)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_CANCELLED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"title": event.title},
    )
    await db.commit()

    registered_count = await get_event_registered_count(db, event.id)

    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        registration_deadline=event.registration_deadline,
        capacity=event.capacity,
        department_id=event.department_id,
        is_public=event.is_public,
        status=event.status,
        rejection_reason=event.rejection_reason,
        created_by_id=event.created_by_id,
        checkin_open_minutes_before=event.checkin_open_minutes_before,
        late_after_minutes=event.late_after_minutes,
        checkin_close_minutes_after_start=event.checkin_close_minutes_after_start,
        checkout_open_after_minutes=event.checkout_open_after_minutes,
        checkout_close_minutes_after_end=event.checkout_close_minutes_after_end,
        created_at=event.created_at,
        updated_at=event.updated_at,
        department_name=event.department.name if event.department else None,
        creator_name=event.creator.full_name if event.creator else None,
        registered_count=registered_count,
        my_registration=None,
    )


# ============================================================
# 2. ĐĂNG KÝ VÀ HỦY ĐĂNG KÝ THAM GIA
# ============================================================


@router.post("/{event_id}/register", response_model=EventRegistrationOut, status_code=status.HTTP_201_CREATED)
async def register_event(
    event_id: int,
    request: Request,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Đăng ký tham gia sự kiện:
    - Sự kiện phải ở trạng thái published.
    - Chưa quá hạn đăng ký.
    - An toàn khi đăng ký đồng thời (with_for_update).
    - Đăng ký lại sau khi hủy -> Cập nhật lại dòng cũ.
    """
    now = datetime.now(timezone.utc)

    stmt = select(Event).where(Event.id == event_id).with_for_update(of=Event)
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    if event.status != EventStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ có thể đăng ký tham gia sự kiện đã được công bố",
        )

    deadline = to_utc(event.registration_deadline or event.start_time)
    if now > deadline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đã hết hạn đăng ký tham gia sự kiện này",
        )

    reg_stmt = (
        select(EventRegistration)
        .options(
            joinedload(EventRegistration.user).joinedload(User.department),
            selectinload(EventRegistration.attendances).joinedload(EventAttendance.reviewed_by),
        )
        .where(
            EventRegistration.event_id == event.id,
            EventRegistration.user_id == current_user.id,
        )
    )
    existing_reg = (await db.execute(reg_stmt)).scalars().first()

    if existing_reg and existing_reg.status == RegistrationStatus.REGISTERED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn đã đăng ký tham gia sự kiện này rồi",
        )

    if event.capacity is not None:
        count_stmt = (
            select(func.count(EventRegistration.id))
            .where(
                EventRegistration.event_id == event.id,
                EventRegistration.status == RegistrationStatus.REGISTERED,
            )
        )
        current_registered = (await db.execute(count_stmt)).scalar_one() or 0
        if current_registered >= event.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sự kiện đã hết chỗ đăng ký (giới hạn {event.capacity} người)",
            )

    if existing_reg:
        existing_reg.status = RegistrationStatus.REGISTERED
        reg_to_return = existing_reg
    else:
        new_reg = EventRegistration(
            event_id=event.id,
            user_id=current_user.id,
            status=RegistrationStatus.REGISTERED,
        )
        db.add(new_reg)
        reg_to_return = new_reg

    await db.commit()

    refreshed_stmt = (
        select(EventRegistration)
        .options(
            joinedload(EventRegistration.user).joinedload(User.department),
            selectinload(EventRegistration.attendances).joinedload(EventAttendance.reviewed_by),
        )
        .where(EventRegistration.id == reg_to_return.id)
    )
    final_reg = (await db.execute(refreshed_stmt)).scalar_one()

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_REGISTERED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"registration_id": final_reg.id},
    )
    await db.commit()

    return format_registration_out(final_reg)


@router.delete("/{event_id}/register")
async def cancel_registration(
    event_id: int,
    request: Request,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Hủy đăng ký tham gia sự kiện:
    - Chỉ cho phép hủy khi sự kiện chưa bắt đầu.
    - Chưa có bất kỳ lượt điểm danh nào.
    """
    now = datetime.now(timezone.utc)
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    event_start = to_utc(event.start_time)
    if now >= event_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể hủy đăng ký khi sự kiện đã bắt đầu diễn ra",
        )

    reg_stmt = (
        select(EventRegistration)
        .options(selectinload(EventRegistration.attendances))
        .where(
            EventRegistration.event_id == event.id,
            EventRegistration.user_id == current_user.id,
            EventRegistration.status == RegistrationStatus.REGISTERED,
        )
    )
    reg = (await db.execute(reg_stmt)).scalar_one_or_none()
    if not reg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bạn chưa có bản ghi đăng ký hiệu lực cho sự kiện này",
        )

    if reg.attendances and len(reg.attendances) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể hủy đăng ký sau khi đã ghi nhận lượt điểm danh",
        )

    reg.status = RegistrationStatus.CANCELLED
    await db.commit()

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_REGISTRATION_CANCELLED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"registration_id": reg.id},
    )
    await db.commit()

    return {"message": "Hủy đăng ký tham gia sự kiện thành công"}


@router.get("/{event_id}/registrations", response_model=PaginatedResponse[EventRegistrationOut])
async def list_event_registrations(
    event_id: int,
    q: Optional[str] = Query(None, description="Tìm theo tên hoặc mã sinh viên"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách người đăng ký và trạng thái tham dự của sự kiện (người quản lý)."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    conditions = [
        EventRegistration.event_id == event.id,
        EventRegistration.status == RegistrationStatus.REGISTERED,
    ]

    if q:
        search_term = f"%{q.strip()}%"
        conditions.append(
            EventRegistration.user.has(
                or_(
                    User.full_name.ilike(search_term),
                    User.student_id.ilike(search_term),
                    User.email.ilike(search_term),
                )
            )
        )

    count_stmt = select(func.count(EventRegistration.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(EventRegistration)
        .options(
            joinedload(EventRegistration.user).joinedload(User.department),
            selectinload(EventRegistration.attendances).joinedload(EventAttendance.reviewed_by),
        )
        .where(*conditions)
        .order_by(EventRegistration.created_at.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    regs = (await db.execute(stmt)).scalars().all()

    items = [format_registration_out(r) for r in regs]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


# ============================================================
# 3. ĐIỂM DANH BẰNG ẢNH (CHECK-IN & CHECK-OUT)
# ============================================================


def get_checkin_window(event: Event) -> tuple[datetime, datetime]:
    """Tính khung giờ điểm danh đến (check-in):
    - Mở: start_time - checkin_open_minutes_before
    - Đóng: start_time + checkin_close_minutes_after_start (hoặc end_time nếu null)
    """
    start = to_utc(event.start_time)
    end = to_utc(event.end_time)
    open_time = start - timedelta(minutes=event.checkin_open_minutes_before)
    if event.checkin_close_minutes_after_start is not None:
        close_time = start + timedelta(minutes=event.checkin_close_minutes_after_start)
    else:
        close_time = end
    return open_time, close_time


def get_checkout_window(event: Event) -> tuple[datetime, datetime]:
    """Tính khung giờ điểm danh về (check-out):
    - Mở: start_time + checkout_open_after_minutes (hoặc nửa thời lượng nếu null)
    - Đóng: end_time + checkout_close_minutes_after_end
    """
    start = to_utc(event.start_time)
    end = to_utc(event.end_time)
    if event.checkout_open_after_minutes is not None:
        open_time = start + timedelta(minutes=event.checkout_open_after_minutes)
    else:
        duration = end - start
        open_time = start + (duration / 2)

    close_time = end + timedelta(minutes=event.checkout_close_minutes_after_end)
    return open_time, close_time


@router.post("/{event_id}/attendance/check-in", response_model=EventAttendanceOut, status_code=status.HTTP_201_CREATED)
async def submit_check_in(
    event_id: int,
    request: Request,
    file: UploadFile = File(..., description="Tệp ảnh điểm danh đến (JPEG/PNG)"),
    source: str = Form(..., description="Nguồn ảnh: 'camera' hoặc 'upload'"),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Điểm danh đến bằng ảnh:
    - Giới hạn tần suất gửi ảnh theo người dùng.
    - Giờ ghi nhận là giờ server.
    - Kiểm tra trong khung giờ điểm danh đến.
    - Nếu trễ hơn late_after_minutes: is_late = True.
    - source = camera: Tự động approved.
    - source = upload: ReviewStatus = pending.
    """
    now = datetime.now(timezone.utc)
    attendance_limiter.check_and_record(current_user.id)

    if source not in [AttendanceSource.CAMERA, AttendanceSource.UPLOAD]:
        raise HTTPException(status_code=400, detail="Nguồn ảnh phải là 'camera' hoặc 'upload'")

    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    if event.status != EventStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Sự kiện không ở trạng thái mở điểm danh")

    reg_stmt = select(EventRegistration).where(
        EventRegistration.event_id == event.id,
        EventRegistration.user_id == current_user.id,
        EventRegistration.status == RegistrationStatus.REGISTERED,
    )
    reg = (await db.execute(reg_stmt)).scalar_one_or_none()
    if not reg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn chưa đăng ký tham gia sự kiện này hoặc đã hủy đăng ký",
        )

    open_time, close_time = get_checkin_window(event)
    if now < open_time:
        open_vn = (open_time + timedelta(hours=7)).strftime("%H:%M %d/%m/%Y")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm danh đến chưa mở (thời gian mở: {open_vn})",
        )
    if now > close_time:
        close_vn = (close_time + timedelta(hours=7)).strftime("%H:%M %d/%m/%Y")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm danh đến đã kết thúc lúc {close_vn}",
        )

    existing_att_stmt = select(EventAttendance).where(
        EventAttendance.registration_id == reg.id,
        EventAttendance.type == AttendanceType.CHECK_IN,
        EventAttendance.review_status.in_([ReviewStatus.PENDING, ReviewStatus.APPROVED]),
    )
    existing_att = (await db.execute(existing_att_stmt)).scalar_one_or_none()
    if existing_att:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn đã có lượt điểm danh đến đang chờ duyệt hoặc đã được duyệt",
        )

    photo_bytes = await file.read()
    saved_filename = save_attendance_photo(photo_bytes)

    event_start = to_utc(event.start_time)
    late_threshold = event_start + timedelta(minutes=event.late_after_minutes)
    is_late = now > late_threshold

    if source == AttendanceSource.CAMERA:
        review_status = ReviewStatus.APPROVED
        reviewed_by_id = None
        reviewed_at = now
        review_note = "Tự động duyệt qua camera"
    else:
        review_status = ReviewStatus.PENDING
        reviewed_by_id = None
        reviewed_at = None
        review_note = None

    att = EventAttendance(
        registration_id=reg.id,
        type=AttendanceType.CHECK_IN,
        taken_at=now,
        photo_path=saved_filename,
        source=source,
        review_status=review_status,
        is_late=is_late,
        reviewed_by_id=reviewed_by_id,
        reviewed_at=reviewed_at,
        review_note=review_note,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_CHECKIN_SUBMITTED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={
            "attendance_id": att.id,
            "source": source,
            "is_late": is_late,
            "review_status": review_status,
        },
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
        reviewed_by_name=None,
        reviewed_at=att.reviewed_at,
        review_note=att.review_note,
        created_at=att.created_at,
    )


@router.post("/{event_id}/attendance/check-out", response_model=EventAttendanceOut, status_code=status.HTTP_201_CREATED)
async def submit_check_out(
    event_id: int,
    request: Request,
    file: UploadFile = File(..., description="Tệp ảnh điểm danh về (JPEG/PNG)"),
    source: str = Form(..., description="Nguồn ảnh: 'camera' hoặc 'upload'"),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Điểm danh về bằng ảnh:
    - Bắt buộc đã có lượt điểm danh đến đang hiệu lực (pending hoặc approved).
    - Kiểm tra trong khung giờ điểm danh về.
    - source = camera: Tự động approved.
    - source = upload: ReviewStatus = pending.
    """
    now = datetime.now(timezone.utc)
    attendance_limiter.check_and_record(current_user.id)

    if source not in [AttendanceSource.CAMERA, AttendanceSource.UPLOAD]:
        raise HTTPException(status_code=400, detail="Nguồn ảnh phải là 'camera' hoặc 'upload'")

    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    if event.status != EventStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Sự kiện không ở trạng thái mở điểm danh")

    reg_stmt = select(EventRegistration).where(
        EventRegistration.event_id == event.id,
        EventRegistration.user_id == current_user.id,
        EventRegistration.status == RegistrationStatus.REGISTERED,
    )
    reg = (await db.execute(reg_stmt)).scalar_one_or_none()
    if not reg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn chưa đăng ký tham gia sự kiện này hoặc đã hủy đăng ký",
        )

    # BẮT BUỘC ĐÃ CÓ LƯỢT ĐIỂM DANH ĐẾN ĐANG HIỆU LỰC
    checkin_stmt = select(EventAttendance).where(
        EventAttendance.registration_id == reg.id,
        EventAttendance.type == AttendanceType.CHECK_IN,
        EventAttendance.review_status.in_([ReviewStatus.PENDING, ReviewStatus.APPROVED]),
    )
    valid_checkin = (await db.execute(checkin_stmt)).scalar_one_or_none()
    if not valid_checkin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn cần điểm danh đến trước khi điểm danh về",
        )

    open_time, close_time = get_checkout_window(event)
    if now < open_time:
        open_vn = (open_time + timedelta(hours=7)).strftime("%H:%M %d/%m/%Y")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm danh về chưa mở (thời gian mở: {open_vn})",
        )
    if now > close_time:
        close_vn = (close_time + timedelta(hours=7)).strftime("%H:%M %d/%m/%Y")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm danh về đã kết thúc lúc {close_vn}",
        )

    existing_checkout_stmt = select(EventAttendance).where(
        EventAttendance.registration_id == reg.id,
        EventAttendance.type == AttendanceType.CHECK_OUT,
        EventAttendance.review_status.in_([ReviewStatus.PENDING, ReviewStatus.APPROVED]),
    )
    existing_checkout = (await db.execute(existing_checkout_stmt)).scalar_one_or_none()
    if existing_checkout:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn đã có lượt điểm danh về đang chờ duyệt hoặc đã được duyệt",
        )

    photo_bytes = await file.read()
    saved_filename = save_attendance_photo(photo_bytes)

    if source == AttendanceSource.CAMERA:
        review_status = ReviewStatus.APPROVED
        reviewed_by_id = None
        reviewed_at = now
        review_note = "Tự động duyệt qua camera"
    else:
        review_status = ReviewStatus.PENDING
        reviewed_by_id = None
        reviewed_at = None
        review_note = None

    att = EventAttendance(
        registration_id=reg.id,
        type=AttendanceType.CHECK_OUT,
        taken_at=now,
        photo_path=saved_filename,
        source=source,
        review_status=review_status,
        is_late=False,
        reviewed_by_id=reviewed_by_id,
        reviewed_at=reviewed_at,
        review_note=review_note,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="EVENT_CHECKOUT_SUBMITTED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={
            "attendance_id": att.id,
            "source": source,
            "review_status": review_status,
        },
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
        reviewed_by_name=None,
        reviewed_at=att.reviewed_at,
        review_note=att.review_note,
        created_at=att.created_at,
    )


# ============================================================
# 4. DUYỆT / TỪ CHỐI / ĐIỂM DANH THỦ CÔNG & XEM ẢNH
# ============================================================


@router.get("/{event_id}/attendances", response_model=PaginatedResponse[EventAttendanceOut])
async def list_event_attendances(
    event_id: int,
    review_status: Optional[str] = Query(None),
    att_type: Optional[str] = Query(None, alias="type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách ảnh điểm danh cần duyệt của sự kiện (người quản lý)."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    conditions = [
        EventAttendance.registration.has(EventRegistration.event_id == event.id),
    ]

    if review_status:
        conditions.append(EventAttendance.review_status == review_status)

    if att_type:
        conditions.append(EventAttendance.type == att_type)

    count_stmt = select(func.count(EventAttendance.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(EventAttendance)
        .options(
            joinedload(EventAttendance.registration).joinedload(EventRegistration.user),
            joinedload(EventAttendance.reviewed_by),
        )
        .where(*conditions)
        .order_by(EventAttendance.taken_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    records = (await db.execute(stmt)).scalars().all()

    items = [
        EventAttendanceOut(
            id=a.id,
            registration_id=a.registration_id,
            type=a.type,
            taken_at=a.taken_at,
            photo_path=a.photo_path,
            source=a.source,
            review_status=a.review_status,
            is_late=a.is_late,
            reviewed_by_id=a.reviewed_by_id,
            reviewed_by_name=a.reviewed_by.full_name if a.reviewed_by else None,
            reviewed_at=a.reviewed_at,
            review_note=a.review_note,
            created_at=a.created_at,
        )
        for a in records
    ]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/attendances/{attendance_id}/approve", response_model=EventAttendanceOut)
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


@router.post("/attendances/{attendance_id}/reject", response_model=EventAttendanceOut)
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


@router.get("/attendances/{attendance_id}/photo")
async def get_attendance_photo(
    attendance_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Tải và xem ảnh điểm danh."""
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


@router.post("/{event_id}/registrations/{user_id}/attendance", response_model=EventAttendanceOut)
async def manual_attendance(
    event_id: int,
    user_id: int,
    data: ManualAttendanceCreate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Điểm danh thủ công cho người không chụp được ảnh (source = manual, review_status = approved)."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    if data.type not in [AttendanceType.CHECK_IN, AttendanceType.CHECK_OUT]:
        raise HTTPException(status_code=400, detail="Loại điểm danh phải là 'check_in' hoặc 'check_out'")

    reg_stmt = select(EventRegistration).where(
        EventRegistration.event_id == event.id,
        EventRegistration.user_id == user_id,
    )
    reg = (await db.execute(reg_stmt)).scalar_one_or_none()

    if not reg:
        target_user = await db.get(User, user_id)
        if not target_user:
            raise HTTPException(status_code=404, detail="Thành viên không tồn tại")
        reg = EventRegistration(
            event_id=event.id,
            user_id=user_id,
            status=RegistrationStatus.REGISTERED,
        )
        db.add(reg)
        await db.commit()
        await db.refresh(reg)
    elif reg.status == RegistrationStatus.CANCELLED:
        reg.status = RegistrationStatus.REGISTERED
        await db.commit()

    att_stmt = select(EventAttendance).where(
        EventAttendance.registration_id == reg.id,
        EventAttendance.type == data.type,
        EventAttendance.review_status.in_([ReviewStatus.PENDING, ReviewStatus.APPROVED]),
    )
    existing_att = (await db.execute(att_stmt)).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    note_content = data.note or f"Điểm danh thủ công bởi {current_user.full_name}"

    if existing_att:
        existing_att.source = AttendanceSource.MANUAL
        existing_att.review_status = ReviewStatus.APPROVED
        existing_att.reviewed_by_id = current_user.id
        existing_att.reviewed_at = now
        existing_att.review_note = note_content
        if data.type == AttendanceType.CHECK_IN:
            existing_att.is_late = data.is_late
        final_att = existing_att
    else:
        new_att = EventAttendance(
            registration_id=reg.id,
            type=data.type,
            taken_at=now,
            photo_path=None,
            source=AttendanceSource.MANUAL,
            review_status=ReviewStatus.APPROVED,
            is_late=data.is_late if data.type == AttendanceType.CHECK_IN else False,
            reviewed_by_id=current_user.id,
            reviewed_at=now,
            review_note=note_content,
        )
        db.add(new_att)
        final_att = new_att

    await db.commit()
    await db.refresh(final_att)

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="ATTENDANCE_MANUAL_RECORDED",
        actor=f"user_id:{current_user.id}",
        target=f"registration_id:{reg.id}",
        ip_address=client_ip,
        details={"type": data.type, "is_late": data.is_late, "user_id": user_id},
    )
    await db.commit()

    return EventAttendanceOut(
        id=final_att.id,
        registration_id=final_att.registration_id,
        type=final_att.type,
        taken_at=final_att.taken_at,
        photo_path=final_att.photo_path,
        source=final_att.source,
        review_status=final_att.review_status,
        is_late=final_att.is_late,
        reviewed_by_id=final_att.reviewed_by_id,
        reviewed_by_name=current_user.full_name,
        reviewed_at=final_att.reviewed_at,
        review_note=final_att.review_note,
        created_at=final_att.created_at,
    )


@router.delete("/{event_id}/registrations/{user_id}/attendance")
async def cancel_attendance_record(
    event_id: int,
    user_id: int,
    att_type: str = Query(..., alias="type", pattern="^(check_in|check_out)$"),
    request: Request = None,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý hủy một lượt điểm danh (check-in hoặc check-out) của thành viên."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    reg_stmt = select(EventRegistration).where(
        EventRegistration.event_id == event.id,
        EventRegistration.user_id == user_id,
    )
    reg = (await db.execute(reg_stmt)).scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=404, detail="Bản ghi đăng ký không tồn tại")

    att_stmt = select(EventAttendance).where(
        EventAttendance.registration_id == reg.id,
        EventAttendance.type == att_type,
        EventAttendance.review_status.in_([ReviewStatus.PENDING, ReviewStatus.APPROVED]),
    )
    att = (await db.execute(att_stmt)).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt điểm danh đang hiệu lực của loại này")

    if att.photo_path:
        delete_attendance_photo(att.photo_path)

    await db.delete(att)
    await db.commit()

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="ATTENDANCE_CANCELLED",
        actor=f"user_id:{current_user.id}",
        target=f"registration_id:{reg.id}",
        ip_address=client_ip,
        details={"type": att_type, "user_id": user_id},
    )
    await db.commit()

    return {"message": f"Đã hủy lượt điểm danh {att_type} thành công"}


# ============================================================
# 5. THỐNG KÊ THAM DỰ VÀ XUẤT CSV
# ============================================================


@router.get("/{event_id}/stats", response_model=EventStatsOut)
async def get_event_stats(
    event_id: int,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Thống kê tham dự sự kiện."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    reg_stmt = (
        select(EventRegistration)
        .options(selectinload(EventRegistration.attendances))
        .where(
            EventRegistration.event_id == event.id,
            EventRegistration.status == RegistrationStatus.REGISTERED,
        )
    )
    regs = (await db.execute(reg_stmt)).scalars().all()

    total_registered = len(regs)
    total_attended = 0
    total_late = 0
    total_fully_attended = 0
    total_pending_reviews = 0

    for r in regs:
        has_approved_checkin = False
        is_checkin_late = False
        has_approved_checkout = False

        for a in r.attendances:
            if a.review_status == ReviewStatus.PENDING:
                total_pending_reviews += 1

            if a.type == AttendanceType.CHECK_IN and a.review_status == ReviewStatus.APPROVED:
                has_approved_checkin = True
                if a.is_late:
                    is_checkin_late = True

            if a.type == AttendanceType.CHECK_OUT and a.review_status == ReviewStatus.APPROVED:
                has_approved_checkout = True

        if has_approved_checkin:
            total_attended += 1
            if is_checkin_late:
                total_late += 1
            if has_approved_checkout:
                total_fully_attended += 1

    return EventStatsOut(
        event_id=event.id,
        total_registered=total_registered,
        total_attended=total_attended,
        total_late=total_late,
        total_fully_attended=total_fully_attended,
        total_pending_reviews=total_pending_reviews,
        capacity=event.capacity,
    )


@router.get("/{event_id}/registrations/export")
async def export_event_registrations_csv(
    event_id: int,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Xuất danh sách đăng ký và điểm danh sự kiện dạng CSV (có UTF-8 BOM chuẩn hiển thị tiếng Việt trong Excel)."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    ensure_event_manage_access(current_user, event)

    reg_stmt = (
        select(EventRegistration)
        .options(
            joinedload(EventRegistration.user).joinedload(User.department),
            selectinload(EventRegistration.attendances),
        )
        .where(
            EventRegistration.event_id == event.id,
            EventRegistration.status == RegistrationStatus.REGISTERED,
        )
        .order_by(EventRegistration.created_at.asc())
    )
    regs = (await db.execute(reg_stmt)).scalars().all()

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)

    writer.writerow([
        "STT",
        "Mã sinh viên",
        "Họ và tên",
        "Email",
        "Số điện thoại",
        "Khoa",
        "Lớp",
        "Ban chuyên môn",
        "Thời gian đăng ký (VN)",
        "Điểm danh đến",
        "Giờ đến (VN)",
        "Đến muộn",
        "Điểm danh về",
        "Giờ về (VN)",
        "Thời lượng tham gia (phút)",
        "Đánh giá tham dự",
    ])

    for idx, r in enumerate(regs, start=1):
        u = r.user
        check_in = None
        check_out = None
        for a in r.attendances:
            if a.type == AttendanceType.CHECK_IN and (check_in is None or a.review_status == ReviewStatus.APPROVED):
                check_in = a
            elif a.type == AttendanceType.CHECK_OUT and (check_out is None or a.review_status == ReviewStatus.APPROVED):
                check_out = a

        checkin_status_str = "Chưa điểm danh"
        checkin_time_str = ""
        is_late_str = "Không"
        if check_in:
            if check_in.review_status == ReviewStatus.APPROVED:
                checkin_status_str = "Đã duyệt"
            elif check_in.review_status == ReviewStatus.PENDING:
                checkin_status_str = "Chờ duyệt"
            else:
                checkin_status_str = "Bị từ chối"

            checkin_vn = to_utc(check_in.taken_at) + timedelta(hours=7)
            checkin_time_str = checkin_vn.strftime("%H:%M:%S %d/%m/%Y")
            if check_in.is_late:
                is_late_str = "Có (Đến muộn)"

        checkout_status_str = "Chưa điểm danh"
        checkout_time_str = ""
        if check_out:
            if check_out.review_status == ReviewStatus.APPROVED:
                checkout_status_str = "Đã duyệt"
            elif check_out.review_status == ReviewStatus.PENDING:
                checkout_status_str = "Chờ duyệt"
            else:
                checkout_status_str = "Bị từ chối"

            checkout_vn = to_utc(check_out.taken_at) + timedelta(hours=7)
            checkout_time_str = checkout_vn.strftime("%H:%M:%S %d/%m/%Y")

        duration_str = ""
        eval_str = "Vắng mặt"
        if check_in and check_in.review_status == ReviewStatus.APPROVED:
            if check_out and check_out.review_status == ReviewStatus.APPROVED:
                t_in = to_utc(check_in.taken_at)
                t_out = to_utc(check_out.taken_at)
                dur = round((t_out - t_in).total_seconds() / 60, 1)
                duration_str = str(dur)
                eval_str = "Tham dự đầy đủ"
            else:
                eval_str = "Có mặt (Chưa về)"

        reg_vn = to_utc(r.created_at) + timedelta(hours=7)
        reg_time_str = reg_vn.strftime("%H:%M:%S %d/%m/%Y")

        writer.writerow([
            idx,
            u.student_id if u else "",
            u.full_name if u else "",
            u.email if u else "",
            u.phone or "" if u else "",
            u.faculty or "" if u else "",
            u.class_name or "" if u else "",
            u.department.name if u and u.department else "Chưa phân ban",
            reg_time_str,
            checkin_status_str,
            checkin_time_str,
            is_late_str,
            checkout_status_str,
            checkout_time_str,
            duration_str,
            eval_str,
        ])

    csv_content = output.getvalue()
    # Sử dụng tên tệp ASCII an toàn cho Content-Disposition header
    filename = f"event_{event.id}_attendees.csv"

    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================
# 6. DỌN DẸP ẢNH ĐIỂM DANH (ADMIN CLEANUP)
# ============================================================


@router.post("/{event_id}/photos/cleanup")
async def cleanup_event_photos(
    event_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Quản trị viên dọn dẹp các tệp ảnh điểm danh của sự kiện đã kết thúc hoặc bị hủy để tiết kiệm dung lượng."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    stmt = (
        select(EventAttendance)
        .where(
            EventAttendance.registration.has(EventRegistration.event_id == event.id),
            EventAttendance.photo_path.isnot(None),
        )
    )
    attendances = (await db.execute(stmt)).scalars().all()

    deleted_count = 0
    for a in attendances:
        if a.photo_path:
            if delete_attendance_photo(a.photo_path):
                deleted_count += 1
            a.photo_path = None

    await db.commit()

    client_ip = get_client_ip(request)
    await record_audit_event(
        db,
        action="ATTENDANCE_PHOTOS_CLEANED",
        actor=f"user_id:{current_user.id}",
        target=f"event_id:{event.id}",
        ip_address=client_ip,
        details={"deleted_photos_count": deleted_count},
    )
    await db.commit()

    return {"message": f"Đã dọn dẹp {deleted_count} tệp ảnh điểm danh của sự kiện"}
