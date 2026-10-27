import secrets
import string
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.endpoints.auth import get_client_ip
from app.core.audit import log_audit, record_audit_event
from app.core.database import get_db
from app.core.deps import (
    check_not_last_admin,
    ensure_same_department,
    get_current_user,
    require_admin,
    require_department_head,
)
from app.core.security import hash_password
from app.models.department import Department
from app.models.user import SystemRole, User
from app.schemas.common import PaginatedResponse
from app.schemas.user import (
    UserAdminUpdate,
    UserCreate,
    UserDepartmentUpdate,
    UserResponse,
    UserSelfUpdate,
    UserTreasurerToggle,
)
from app.schemas.event import EventAttendanceOut, UserEventHistoryItem
from app.services.storage import (
    delete_avatar_photo,
    get_avatar_photo_absolute_path,
    save_avatar_photo,
)

router = APIRouter()


@router.get("/me", response_model=UserResponse, summary="Xem hồ sơ cá nhân")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    """Thành viên xem hồ sơ của chính mình."""
    return current_user


@router.patch("/me", response_model=UserResponse, summary="Cập nhật hồ sơ cá nhân")
async def update_my_profile(
    data: UserSelfUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên tự cập nhật thông tin liên hệ của mình (Họ tên, SĐT, Khoa, Lớp).
    Không cho phép đổi vai trò, chức danh, MSSV hay email.
    """
    if data.full_name is not None:
        current_user.full_name = data.full_name.strip()
    if data.phone is not None:
        current_user.phone = data.phone.strip() if data.phone else None
    if data.faculty is not None:
        current_user.faculty = data.faculty.strip() if data.faculty else None
    if data.class_name is not None:
        current_user.class_name = data.class_name.strip() if data.class_name else None
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url.strip() if data.avatar_url else None

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/avatar", response_model=UserResponse, summary="Tải lên ảnh đại diện cá nhân")
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên tải lên ảnh đại diện cá nhân (JPEG, PNG, WebP tối đa 2MB)."""
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp ảnh tải lên trống",
        )

    # Xóa ảnh avatar cũ trên ổ đĩa nếu là ảnh do hệ thống quản lý
    if current_user.avatar_url and "/api/users/" in current_user.avatar_url:
        old_filename = current_user.avatar_url.split("/")[-1]
        delete_avatar_photo(old_filename)

    saved_filename = save_avatar_photo(content)
    current_user.avatar_url = f"/api/users/{current_user.id}/avatar/{saved_filename}"

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.delete("/me/avatar", response_model=UserResponse, summary="Gỡ ảnh đại diện cá nhân")
async def delete_my_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên gỡ bỏ ảnh đại diện cá nhân hiện tại."""
    if current_user.avatar_url and "/api/users/" in current_user.avatar_url:
        old_filename = current_user.avatar_url.split("/")[-1]
        delete_avatar_photo(old_filename)

    current_user.avatar_url = None
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/{user_id}/avatar/{filename}", summary="Xem ảnh đại diện")
async def get_user_avatar(
    user_id: int,
    filename: str,
):
    """Truy xuất tệp ảnh đại diện của người dùng."""
    file_path = get_avatar_photo_absolute_path(filename)
    if not file_path or not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ảnh đại diện yêu cầu",
        )

    ext = file_path.suffix.lstrip(".").lower()
    media_type = f"image/{ext}" if ext in ["jpeg", "png", "webp"] else ("image/jpeg" if ext == "jpg" else "application/octet-stream")
    return FileResponse(file_path, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})



@router.get("/me/registrations", response_model=PaginatedResponse[UserEventHistoryItem], summary="Lịch sử tham gia sự kiện của tôi")
async def get_my_event_registrations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên xem lịch sử đăng ký và điểm danh các sự kiện của chính mình."""
    from app.models.event import AttendanceType, Event, EventAttendance, EventRegistration, ReviewStatus

    conditions = [
        EventRegistration.user_id == current_user.id,
    ]

    count_stmt = select(func.count(EventRegistration.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    from sqlalchemy.orm import selectinload
    stmt = (
        select(EventRegistration)
        .options(
            joinedload(EventRegistration.event).joinedload(Event.department),
            selectinload(EventRegistration.attendances).joinedload(EventAttendance.reviewed_by),
        )
        .where(*conditions)
        .order_by(EventRegistration.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    regs = (await db.execute(stmt)).scalars().all()

    items = []
    for r in regs:
        ev = r.event
        attendances = r.attendances or []
        check_in = None
        check_out = None
        for a in sorted(attendances, key=lambda x: (1 if x.review_status == ReviewStatus.APPROVED else (2 if x.review_status == ReviewStatus.PENDING else 3))):
            if a.type == AttendanceType.CHECK_IN and check_in is None:
                check_in = a
            elif a.type == AttendanceType.CHECK_OUT and check_out is None:
                check_out = a

        is_attended = check_in is not None and check_in.review_status == ReviewStatus.APPROVED
        is_late = check_in is not None and check_in.is_late
        is_fully_attended = is_attended and (check_out is not None and check_out.review_status == ReviewStatus.APPROVED)

        dur: Optional[float] = None
        if is_fully_attended and check_in and check_out:
            t_in = check_in.taken_at if check_in.taken_at.tzinfo else check_in.taken_at.replace(tzinfo=timezone.utc)
            t_out = check_out.taken_at if check_out.taken_at.tzinfo else check_out.taken_at.replace(tzinfo=timezone.utc)
            dur = round((t_out - t_in).total_seconds() / 60, 1)

        def to_att_out(att_model):
            if not att_model:
                return None
            return EventAttendanceOut(
                id=att_model.id,
                registration_id=att_model.registration_id,
                type=att_model.type,
                taken_at=att_model.taken_at,
                photo_path=att_model.photo_path,
                source=att_model.source,
                review_status=att_model.review_status,
                is_late=att_model.is_late,
                reviewed_by_id=att_model.reviewed_by_id,
                reviewed_by_name=att_model.reviewed_by.full_name if att_model.reviewed_by else None,
                reviewed_at=att_model.reviewed_at,
                review_note=att_model.review_note,
                created_at=att_model.created_at,
            )

        items.append(
            UserEventHistoryItem(
                id=r.id,
                event_id=ev.id,
                event_title=ev.title,
                event_location=ev.location,
                event_start_time=ev.start_time,
                event_end_time=ev.end_time,
                event_status=ev.status,
                department_name=ev.department.name if ev.department else None,
                registration_status=r.status,
                registered_at=r.created_at,
                checkin_open_minutes_before=ev.checkin_open_minutes_before,
                late_after_minutes=ev.late_after_minutes,
                checkin_close_minutes_after_start=ev.checkin_close_minutes_after_start,
                checkout_open_after_minutes=ev.checkout_open_after_minutes,
                checkout_close_minutes_after_end=ev.checkout_close_minutes_after_end,
                check_in=to_att_out(check_in),
                check_out=to_att_out(check_out),
                is_attended=is_attended,
                is_late=is_late,
                is_fully_attended=is_fully_attended,
                duration_minutes=dur,
            )
        )

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("", response_model=PaginatedResponse[UserResponse], summary="Danh sách thành viên (Admin & Trưởng ban)")
async def list_users(
    q: Optional[str] = Query(None, description="Tìm kiếm theo Tên, Email hoặc MSSV"),
    role: Optional[str] = Query(None, pattern="^(admin|department_head|member)$", description="Lọc theo vai trò"),
    department_id: Optional[int] = Query(None, description="Lọc theo ban chuyên môn (dành cho Admin)"),
    page: int = Query(1, ge=1, description="Số trang (bắt đầu từ 1)"),
    page_size: int = Query(10, ge=1, le=100, description="Số lượng mục trên một trang"),
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Xem danh sách thành viên trong CLB:
    - Admin: Xem toàn bộ thành viên, có thể lọc theo ban (department_id) và vai trò (role).
    - Trưởng ban: Tự động bị lọc theo ban của mình, chỉ xem được thành viên trong ban mình.
    """
    # Nếu là Trưởng ban và chưa được gán ban nào -> trả về danh sách rỗng
    if current_user.role == SystemRole.DEPARTMENT_HEAD and current_user.department_id is None:
        return PaginatedResponse(items=[], total=0, page=page, page_size=page_size)

    query = select(User).options(joinedload(User.department)).where(User.deleted_at.is_(None))

    # Phân quyền phạm vi ban
    if current_user.role == SystemRole.DEPARTMENT_HEAD:
        query = query.where(User.department_id == current_user.department_id)
    elif department_id is not None:
        query = query.where(User.department_id == department_id)

    if role:
        query = query.where(User.role == role)

    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                User.full_name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.student_id.ilike(search_pattern),
            )
        )

    # Đếm tổng số bản ghi
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Phân trang và sắp xếp mới nhất
    offset = (page - 1) * page_size
    items_query = query.order_by(User.id.desc()).offset(offset).limit(page_size)
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[UserResponse.model_validate(u) for u in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Thêm thành viên mới (Admin)")
async def create_user(
    data: UserCreate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin trực tiếp thêm thành viên mới vào CLB."""
    client_ip = get_client_ip(request)
    email_clean = data.email.strip().lower()
    student_id_clean = data.student_id.strip().upper()

    # Kiểm tra trùng email (kể cả đã xóa mềm)
    stmt_email = select(User).where(User.email == email_clean)
    if (await db.execute(stmt_email)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email này đã được sử dụng trong hệ thống",
        )

    # Kiểm tra trùng MSSV
    stmt_student = select(User).where(User.student_id == student_id_clean)
    if (await db.execute(stmt_student)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã số sinh viên này đã được sử dụng trong hệ thống",
        )

    new_user = User(
        email=email_clean,
        student_id=student_id_clean,
        full_name=data.full_name.strip(),
        phone=data.phone.strip() if data.phone else None,
        faculty=data.faculty.strip() if data.faculty else None,
        class_name=data.class_name.strip() if data.class_name else None,
        title=data.title.strip() if data.title else None,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
        deleted_at=None,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    await record_audit_event(
        db,
        action="USER_CREATED_BY_ADMIN",
        actor=f"admin_id:{current_user.id}",
        target=f"user_id:{new_user.id}",
        ip_address=client_ip,
        details={"email": new_user.email, "role": new_user.role},
    )
    await db.commit()

    return new_user


@router.get("/{user_id}", response_model=UserResponse, summary="Xem chi tiết người dùng")
async def get_user_by_id(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Xem thông tin chi tiết một người dùng:
    - Admin: Xem được mọi người dùng.
    - Trưởng ban: Chỉ xem được người trong ban của mình (hoặc chính mình).
    - Thành viên thông thường: Chỉ xem được hồ sơ của chính mình.
    """
    stmt = (
        select(User)
        .options(joinedload(User.department))
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thành viên yêu cầu",
        )

    # Kiểm tra phân quyền truy cập thông tin thành viên dùng chung
    ensure_same_department(current_user, target_user)

    return target_user


@router.patch("/{user_id}", response_model=UserResponse, summary="Cập nhật thành viên (Admin)")
async def update_user_by_admin(
    user_id: int,
    data: UserAdminUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin cập nhật thông tin thành viên.
    Tuyệt đối không nhận mật khẩu. Bảo vệ admin hoạt động cuối cùng.
    Ghi log các hành vi đổi vai trò hoặc khóa/mở khóa tài khoản.
    """
    client_ip = get_client_ip(request)

    stmt = select(User).options(joinedload(User.department)).where(User.id == user_id, User.deleted_at.is_(None))
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thành viên yêu cầu",
        )

    # Kiểm tra bảo vệ admin cuối cùng nếu hạ quyền hoặc khóa tài khoản
    will_demote = data.role is not None and data.role != SystemRole.ADMIN and target_user.role == SystemRole.ADMIN
    will_lock = data.is_active is False and target_user.is_active

    if will_demote or will_lock:
        await check_not_last_admin(db, target_user)

    old_role = target_user.role
    old_active = target_user.is_active
    old_treasurer = target_user.is_treasurer

    if data.full_name is not None:
        target_user.full_name = data.full_name.strip()
    if data.phone is not None:
        target_user.phone = data.phone.strip() if data.phone else None
    if data.faculty is not None:
        target_user.faculty = data.faculty.strip() if data.faculty else None
    if data.class_name is not None:
        target_user.class_name = data.class_name.strip() if data.class_name else None
    if data.title is not None:
        target_user.title = data.title.strip() if data.title else None
    if data.role is not None:
        target_user.role = data.role
    if data.is_active is not None:
        target_user.is_active = data.is_active
    if data.is_treasurer is not None:
        target_user.is_treasurer = data.is_treasurer

    # Nếu người dùng bị khóa hoặc bị đổi vai trò khỏi trưởng ban, giải phóng vị trí trưởng ban
    if (data.is_active is False and old_active) or (data.role is not None and data.role != SystemRole.DEPARTMENT_HEAD and old_role == SystemRole.DEPARTMENT_HEAD):
        headed_dept = (
            await db.execute(select(Department).where(Department.head_id == target_user.id))
        ).scalar_one_or_none()
        if headed_dept:
            headed_dept.head_id = None

    # Khi thành viên bị khóa, đánh dấu các công việc đang mở của họ cần giao lại
    if data.is_active is False and old_active:
        from app.models.task import Task, TaskAssignee, TaskStatus
        task_subquery = select(TaskAssignee.task_id).where(TaskAssignee.user_id == target_user.id)
        open_tasks = (await db.execute(
            select(Task).where(Task.id.in_(task_subquery), Task.status.in_([TaskStatus.TODO, TaskStatus.IN_PROGRESS]))
        )).scalars().all()
        for t in open_tasks:
            t.needs_reassignment = True

    await db.commit()
    await db.refresh(target_user)

    # Ghi audit log nếu có thay đổi vai trò hoặc trạng thái khóa
    if data.role is not None and data.role != old_role:
        await record_audit_event(
            db,
            action="USER_ROLE_CHANGED",
            actor=f"admin_id:{current_user.id}",
            target=f"user_id:{target_user.id}",
            ip_address=client_ip,
            details={"old_role": old_role, "new_role": target_user.role},
        )
    if data.is_active is not None and data.is_active != old_active:
        action_name = "USER_UNLOCKED" if target_user.is_active else "USER_LOCKED"
        await record_audit_event(
            db,
            action=action_name,
            actor=f"admin_id:{current_user.id}",
            target=f"user_id:{target_user.id}",
            ip_address=client_ip,
            details={"old_active": old_active, "new_active": target_user.is_active},
        )
    if data.is_treasurer is not None and data.is_treasurer != old_treasurer:
        await record_audit_event(
            db,
            action="USER_TREASURER_FLAG_CHANGED",
            actor=f"admin_id:{current_user.id}",
            target=f"user_id:{target_user.id}",
            ip_address=client_ip,
            details={"old_is_treasurer": old_treasurer, "new_is_treasurer": target_user.is_treasurer},
        )
    await db.commit()

    return target_user


@router.patch("/{user_id}/treasurer", response_model=UserResponse, summary="Bật/tắt cờ quyền thủ quỹ (Admin)")
async def toggle_user_treasurer(
    user_id: int,
    data: UserTreasurerToggle,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin bật hoặc tắt cờ quyền thủ quỹ cho thành viên.
    Ghi nhật ký kiểm toán bắt buộc. Quyền có hiệu lực ngay lập tức.
    """
    client_ip = get_client_ip(request)

    stmt = select(User).options(joinedload(User.department)).where(User.id == user_id, User.deleted_at.is_(None))
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thành viên yêu cầu",
        )

    old_treasurer = target_user.is_treasurer
    target_user.is_treasurer = data.is_treasurer
    await db.commit()
    await db.refresh(target_user)

    if old_treasurer != target_user.is_treasurer:
        await record_audit_event(
            db,
            action="USER_TREASURER_FLAG_CHANGED",
            actor=f"admin_id:{current_user.id}",
            target=f"user_id:{target_user.id}",
            ip_address=client_ip,
            details={"old_is_treasurer": old_treasurer, "new_is_treasurer": target_user.is_treasurer},
        )
        await db.commit()

    return target_user


@router.post("/{user_id}/reset-password", summary="Đặt lại mật khẩu tạm thời (Admin)")
async def admin_reset_password(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin đặt lại mật khẩu tạm thời ngẫu nhiên cho thành viên."""
    client_ip = get_client_ip(request)

    stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thành viên yêu cầu",
        )

    # Sinh mật khẩu tạm thời ngẫu nhiên 10 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt
    upper = "".join(secrets.choice(string.ascii_uppercase) for _ in range(2))
    lower = "".join(secrets.choice(string.ascii_lowercase) for _ in range(4))
    digits = "".join(secrets.choice(string.digits) for _ in range(3))
    specials = secrets.choice("!@#$%&*")
    temp_chars = list(upper + lower + digits + specials)
    secrets.SystemRandom().shuffle(temp_chars)
    temp_password = "".join(temp_chars)

    target_user.password_hash = hash_password(temp_password)
    await db.commit()
    await db.refresh(target_user)

    await record_audit_event(
        db,
        action="PASSWORD_RESET_BY_ADMIN",
        actor=f"admin_id:{current_user.id}",
        target=f"user_id:{target_user.id}",
        ip_address=client_ip,
        details={"email": target_user.email},
    )
    await db.commit()

    return {
        "message": "Đặt lại mật khẩu tạm thời thành công",
        "temporary_password": temp_password,
    }


@router.delete("/{user_id}", summary="Xóa mềm thành viên (Admin)")
async def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin xóa mềm một thành viên.
    Không cho phép tự xóa chính mình và không xóa admin hoạt động cuối cùng.
    Ghi audit log khi xóa thành viên.
    """
    client_ip = get_client_ip(request)

    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn không thể tự xóa tài khoản của chính mình",
        )

    stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thành viên yêu cầu",
        )

    # Bảo vệ admin cuối cùng
    await check_not_last_admin(db, target_user)

    target_user.deleted_at = datetime.now(timezone.utc)
    target_user.is_active = False

    # Nếu người bị xóa đang là trưởng ban, bãi nhiệm khỏi vị trí trưởng ban
    headed_dept = (
        await db.execute(select(Department).where(Department.head_id == target_user.id))
    ).scalar_one_or_none()
    if headed_dept:
        headed_dept.head_id = None

    # Khi thành viên bị xóa, đánh dấu các công việc đang mở của họ cần giao lại
    from app.models.task import Task, TaskAssignee, TaskStatus
    task_subquery = select(TaskAssignee.task_id).where(TaskAssignee.user_id == target_user.id)
    open_tasks = (await db.execute(
        select(Task).where(Task.id.in_(task_subquery), Task.status.in_([TaskStatus.TODO, TaskStatus.IN_PROGRESS]))
    )).scalars().all()
    for t in open_tasks:
        t.needs_reassignment = True

    await record_audit_event(
        db,
        action="USER_SOFT_DELETED",
        actor=f"admin_id:{current_user.id}",
        target=f"user_id:{target_user.id}",
        ip_address=client_ip,
        details={"email": target_user.email, "student_id": target_user.student_id},
    )
    await db.commit()

    return {"message": "Đã xóa mềm thành viên thành công"}


@router.patch("/{user_id}/department", response_model=UserResponse, summary="Gán, chuyển hoặc xóa khỏi ban (Admin)")
async def update_user_department(
    user_id: int,
    data: UserDepartmentUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin gán, chuyển hoặc xóa thành viên khỏi ban chuyên môn:
    - Nếu thành viên đang là trưởng ban cũ mà bị chuyển/xóa khỏi ban: tự động bãi nhiệm trưởng ban ban cũ.
    - Ghi nhận nhật ký an toàn cho mọi hành động gán/chuyển ban.
    """
    client_ip = get_client_ip(request)

    stmt = (
        select(User)
        .options(joinedload(User.department))
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thành viên yêu cầu",
        )

    old_department_id = target_user.department_id

    # Nếu gán vào ban mới
    if data.department_id is not None:
        dept = (
            await db.execute(
                select(Department).where(Department.id == data.department_id)
            )
        ).scalar_one_or_none()
        if dept is None or not dept.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ban chuyên môn không tồn tại hoặc đã bị khóa",
            )

    # Kiểm tra nếu thành viên đang là trưởng ban của một ban nào đó
    headed_dept = (
        await db.execute(
            select(Department).where(Department.head_id == target_user.id)
        )
    ).scalar_one_or_none()

    auto_dismissed_dept_id = None
    if headed_dept and headed_dept.id != data.department_id:
        headed_dept.head_id = None
        auto_dismissed_dept_id = headed_dept.id
        if target_user.role == SystemRole.DEPARTMENT_HEAD:
            target_user.role = SystemRole.MEMBER

    target_user.department_id = data.department_id
    await db.commit()
    await db.refresh(target_user)

    audit_details = {
        "old_department_id": old_department_id,
        "new_department_id": data.department_id,
    }
    if auto_dismissed_dept_id:
        audit_details["auto_dismissed_from_head_of_department"] = auto_dismissed_dept_id

    await record_audit_event(
        db,
        action="USER_DEPARTMENT_CHANGED",
        actor=f"admin_id:{current_user.id}",
        target=f"user_id:{target_user.id}",
        ip_address=client_ip,
        details=audit_details,
    )
    await db.commit()

    return target_user
