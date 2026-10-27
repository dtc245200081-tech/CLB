from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.models.event import Event, EventRegistration, EventStatus, RegistrationStatus
from app.schemas.common import PaginatedResponse
from app.schemas.event import EventPublicResponse

router = APIRouter()


@router.get("", response_model=PaginatedResponse[EventPublicResponse], summary="Danh sách sự kiện công khai cho khách")
async def list_public_events(
    department_id: Optional[int] = Query(None, description="Lọc theo ban chuyên môn"),
    timeline: str = Query("upcoming", pattern="^(all|upcoming|past)$", description="Lọc theo thời gian"),
    search: Optional[str] = Query(None, description="Tìm kiếm theo tiêu đề hoặc địa điểm"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Khách vãng lai xem danh sách sự kiện công khai (is_public = True và status = published).
    Chỉ trả về thông tin chung, không trả về danh sách người đăng ký hoặc thông tin nội bộ.
    """
    now = datetime.now(timezone.utc)

    conditions = [
        Event.status == EventStatus.PUBLISHED,
        Event.is_public.is_(True),
    ]

    if department_id is not None:
        conditions.append(Event.department_id == department_id)

    if timeline == "upcoming":
        conditions.append(Event.end_time >= now)
    elif timeline == "past":
        conditions.append(Event.end_time < now)

    if search:
        s = f"%{search.strip()}%"
        conditions.append(
            or_(
                Event.title.ilike(s),
                Event.location.ilike(s),
                Event.description.ilike(s),
            )
        )

    count_stmt = select(func.count(Event.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Event)
        .options(joinedload(Event.department))
        .where(*conditions)
        .order_by(Event.start_time.asc() if timeline == "upcoming" else Event.start_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    events = (await db.execute(stmt)).scalars().all()

    # Đếm số người đã đăng ký
    event_ids = [e.id for e in events]
    counts_map = {}
    if event_ids:
        c_stmt = (
            select(EventRegistration.event_id, func.count(EventRegistration.id))
            .where(
                EventRegistration.event_id.in_(event_ids),
                EventRegistration.status == RegistrationStatus.REGISTERED,
            )
            .group_by(EventRegistration.event_id)
        )
        counts = (await db.execute(c_stmt)).all()
        for e_id, cnt in counts:
            counts_map[e_id] = cnt

    items = [
        EventPublicResponse(
            id=e.id,
            title=e.title,
            description=e.description,
            location=e.location,
            start_time=e.start_time,
            end_time=e.end_time,
            registration_deadline=e.registration_deadline,
            capacity=e.capacity,
            department_id=e.department_id,
            department_name=e.department.name if e.department else None,
            is_public=e.is_public,
            status=e.status,
            registered_count=counts_map.get(e.id, 0),
        )
        for e in events
    ]

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{event_id}", response_model=EventPublicResponse, summary="Xem chi tiết sự kiện công khai")
async def get_public_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Khách xem chi tiết sự kiện công khai.
    Nếu sự kiện không công khai hoặc không ở trạng thái published -> 404 Not Found.
    """
    stmt = (
        select(Event)
        .options(joinedload(Event.department))
        .where(
            Event.id == event_id,
            Event.status == EventStatus.PUBLISHED,
            Event.is_public.is_(True),
        )
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(
            status_code=404,
            detail="Sự kiện không tồn tại hoặc không được công khai",
        )

    count_stmt = (
        select(func.count(EventRegistration.id))
        .where(
            EventRegistration.event_id == event.id,
            EventRegistration.status == RegistrationStatus.REGISTERED,
        )
    )
    registered_count = (await db.execute(count_stmt)).scalar_one() or 0

    return EventPublicResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        registration_deadline=event.registration_deadline,
        capacity=event.capacity,
        department_id=event.department_id,
        department_name=event.department.name if event.department else None,
        is_public=event.is_public,
        status=event.status,
        registered_count=registered_count,
    )
