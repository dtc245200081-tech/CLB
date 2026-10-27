from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.endpoints.auth import get_client_ip
from app.core.audit import record_audit_event
from app.core.database import get_db
from app.core.deps import (
    ensure_department_access,
    get_current_user,
    require_admin,
    require_any_authenticated,
)
from app.models.department import Department
from app.models.user import SystemRole, User
from app.schemas.common import PaginatedResponse
from app.schemas.department import (
    DepartmentCreate,
    DepartmentHeadAssign,
    DepartmentHeadOut,
    DepartmentResponse,
    DepartmentUpdate,
)
from app.schemas.user import UserResponse

router = APIRouter()


def _get_member_count_subquery():
    return (
        select(func.count(User.id))
        .where(User.department_id == Department.id, User.deleted_at.is_(None))
        .scalar_subquery()
    )


def _to_department_response(dept: Department, member_count: int) -> DepartmentResponse:
    head_out = None
    if dept.head:
        head_out = DepartmentHeadOut(
            id=dept.head.id,
            full_name=dept.head.full_name,
            email=dept.head.email,
            student_id=dept.head.student_id,
            title=dept.head.title,
            role=dept.head.role,
        )
    return DepartmentResponse(
        id=dept.id,
        name=dept.name,
        description=dept.description,
        head_id=dept.head_id,
        head_name=dept.head.full_name if dept.head else None,
        head=head_out,
        is_active=dept.is_active,
        member_count=member_count,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
    )


@router.get("", response_model=PaginatedResponse[DepartmentResponse], summary="Xem danh sách ban chuyên môn")
async def list_departments(
    q: Optional[str] = Query(None, description="Tìm kiếm theo tên ban"),
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động (chỉ áp dụng với Admin)"),
    page: int = Query(1, ge=1, description="Số trang (bắt đầu từ 1)"),
    page_size: int = Query(20, ge=1, le=100, description="Số lượng mục trên một trang"),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Lấy danh sách các ban chuyên môn trong CLB:
    - Admin: Xem được tất cả các ban (kể cả ban đã khóa), có thể lọc trạng thái.
    - Trưởng ban / Thành viên: Chỉ xem các ban đang hoạt động (is_active=True).
    """
    member_count_subq = _get_member_count_subquery()
    query = (
        select(Department, member_count_subq.label("member_count"))
        .options(joinedload(Department.head))
    )

    count_query = select(func.count(Department.id))

    # Nếu không phải Admin, chỉ hiển thị ban đang hoạt động
    if current_user.role != SystemRole.ADMIN:
        query = query.where(Department.is_active.is_(True))
        count_query = count_query.where(Department.is_active.is_(True))
    elif is_active is not None:
        query = query.where(Department.is_active == is_active)
        count_query = count_query.where(Department.is_active == is_active)

    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.where(Department.name.ilike(search_pattern))
        count_query = count_query.where(Department.name.ilike(search_pattern))

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Department.id.asc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    items = [_to_department_response(dept, count or 0) for dept, count in rows]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED, summary="Tạo ban mới (Admin)")
async def create_department(
    data: DepartmentCreate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin tạo ban chuyên môn mới."""
    client_ip = get_client_ip(request)
    clean_name = data.name.strip()

    # Kiểm tra trùng tên ban
    stmt_check = select(Department).where(func.lower(Department.name) == clean_name.lower())
    existing = (await db.execute(stmt_check)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên ban chuyên môn này đã tồn tại trong hệ thống",
        )

    new_dept = Department(
        name=clean_name,
        description=data.description.strip() if data.description else None,
        is_active=True,
    )

    db.add(new_dept)
    await db.commit()
    await db.refresh(new_dept)

    await record_audit_event(
        db,
        action="DEPARTMENT_CREATED",
        actor=f"admin_id:{current_user.id}",
        target=f"department_id:{new_dept.id}",
        ip_address=client_ip,
        details={"name": new_dept.name},
    )
    await db.commit()

    return _to_department_response(new_dept, 0)


@router.get("/{department_id}", response_model=DepartmentResponse, summary="Xem chi tiết ban chuyên môn")
async def get_department(
    department_id: int,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem thông tin chi tiết một ban chuyên môn."""
    member_count_subq = _get_member_count_subquery()
    query = (
        select(Department, member_count_subq.label("member_count"))
        .options(joinedload(Department.head))
        .where(Department.id == department_id)
    )
    result = await db.execute(query)
    row = result.first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ban chuyên môn yêu cầu",
        )

    dept, count = row
    if current_user.role != SystemRole.ADMIN and not dept.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ban chuyên môn yêu cầu",
        )

    return _to_department_response(dept, count or 0)


@router.patch("/{department_id}", response_model=DepartmentResponse, summary="Cập nhật ban chuyên môn (Admin)")
async def update_department(
    department_id: int,
    data: DepartmentUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin cập nhật thông tin ban hoặc khóa/mở khóa ban."""
    client_ip = get_client_ip(request)

    stmt = (
        select(Department)
        .options(joinedload(Department.head))
        .where(Department.id == department_id)
    )
    result = await db.execute(stmt)
    dept = result.scalar_one_or_none()

    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ban chuyên môn yêu cầu",
        )

    changes = {}
    if data.name is not None and data.name.strip().lower() != dept.name.lower():
        clean_name = data.name.strip()
        stmt_dup = select(Department).where(
            func.lower(Department.name) == clean_name.lower(),
            Department.id != department_id,
        )
        if (await db.execute(stmt_dup)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tên ban chuyên môn này đã tồn tại trong hệ thống",
            )
        changes["name"] = {"old": dept.name, "new": clean_name}
        dept.name = clean_name

    if data.description is not None:
        dept.description = data.description.strip() if data.description else None
        changes["description"] = "updated"

    if data.is_active is not None and data.is_active != dept.is_active:
        changes["is_active"] = {"old": dept.is_active, "new": data.is_active}
        dept.is_active = data.is_active

    await db.commit()
    await db.refresh(dept)

    action_name = "DEPARTMENT_UPDATED"
    if "is_active" in changes and len(changes) == 1:
        action_name = "DEPARTMENT_UNLOCKED" if dept.is_active else "DEPARTMENT_LOCKED"

    await record_audit_event(
        db,
        action=action_name,
        actor=f"admin_id:{current_user.id}",
        target=f"department_id:{dept.id}",
        ip_address=client_ip,
        details=changes,
    )
    await db.commit()

    count = await db.scalar(
        select(func.count(User.id)).where(User.department_id == dept.id, User.deleted_at.is_(None))
    )
    return _to_department_response(dept, count or 0)


@router.delete("/{department_id}", summary="Xóa ban chuyên môn (Admin)")
async def delete_department(
    department_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin xóa ban chuyên môn.
    Quy tắc: Không xóa cứng ban đang có thành viên; chỉ khóa hoặc phải chuyển hết thành viên trước.
    """
    client_ip = get_client_ip(request)

    stmt = select(Department).where(Department.id == department_id)
    dept = (await db.execute(stmt)).scalar_one_or_none()

    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ban chuyên môn yêu cầu",
        )

    # Kiểm tra số lượng thành viên đang thuộc ban
    member_count = await db.scalar(
        select(func.count(User.id)).where(User.department_id == department_id, User.deleted_at.is_(None))
    )
    if member_count and member_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể xóa ban đang có {member_count} thành viên. Vui lòng chuyển thành viên sang ban khác hoặc khóa ban.",
        )

    # Nếu ban có chỉ định trưởng ban, bãi nhiệm vai trò người đó
    if dept.head_id:
        head_user = (await db.execute(select(User).where(User.id == dept.head_id))).scalar_one_or_none()
        if head_user and head_user.role == SystemRole.DEPARTMENT_HEAD:
            head_user.role = SystemRole.MEMBER
        dept.head_id = None

    dept_name = dept.name
    await db.delete(dept)
    await db.commit()

    await record_audit_event(
        db,
        action="DEPARTMENT_DELETED",
        actor=f"admin_id:{current_user.id}",
        target=f"department_id:{department_id}",
        ip_address=client_ip,
        details={"name": dept_name},
    )
    await db.commit()

    return {"message": "Đã xóa ban chuyên môn thành công"}


@router.put("/{department_id}/head", response_model=DepartmentResponse, summary="Chỉ định trưởng ban (Admin)")
async def assign_department_head(
    department_id: int,
    data: DepartmentHeadAssign,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin chỉ định một thành viên làm trưởng ban:
    - Thành viên đó tự động được chuyển vào ban đó.
    - Vai trò đổi thành department_head (nếu là admin thì giữ nguyên admin).
    - Người cũ (nếu có) trở về vai trò member (trừ khi là admin).
    - Mỗi ban có tối đa 1 trưởng ban. Một người không làm trưởng của 2 ban.
    """
    client_ip = get_client_ip(request)

    # 1. Kiểm tra ban tồn tại
    dept = (
        await db.execute(
            select(Department).options(joinedload(Department.head)).where(Department.id == department_id)
        )
    ).scalar_one_or_none()

    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ban chuyên môn yêu cầu",
        )

    # 2. Kiểm tra thành viên mục tiêu
    target_user = (
        await db.execute(
            select(User).where(User.id == data.user_id, User.deleted_at.is_(None))
        )
    ).scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thành viên được chỉ định",
        )

    if not target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể chỉ định thành viên đang bị khóa tài khoản làm trưởng ban",
        )

    # 3. Kiểm tra người này đã là trưởng của ban khác chưa
    other_head_dept = (
        await db.execute(
            select(Department).where(Department.head_id == target_user.id, Department.id != department_id)
        )
    ).scalar_one_or_none()

    if other_head_dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Thành viên này hiện đang là trưởng ban của '{other_head_dept.name}'. Mỗi người chỉ được làm trưởng của 1 ban.",
        )

    # 4. Xử lý trưởng ban cũ nếu có và khác người mới
    old_head_id = dept.head_id
    if old_head_id and old_head_id != target_user.id:
        old_head = (
            await db.execute(select(User).where(User.id == old_head_id))
        ).scalar_one_or_none()
        if old_head and old_head.role == SystemRole.DEPARTMENT_HEAD:
            old_head.role = SystemRole.MEMBER

    # 5. Gán thành viên vào ban và đổi vai trò
    target_user.department_id = dept.id
    if target_user.role != SystemRole.ADMIN:
        target_user.role = SystemRole.DEPARTMENT_HEAD

    dept.head_id = target_user.id

    await db.commit()
    await db.refresh(dept)
    await db.refresh(target_user)

    await record_audit_event(
        db,
        action="DEPARTMENT_HEAD_ASSIGNED",
        actor=f"admin_id:{current_user.id}",
        target=f"department_id:{dept.id}",
        ip_address=client_ip,
        details={
            "new_head_id": target_user.id,
            "new_head_name": target_user.full_name,
            "old_head_id": old_head_id,
        },
    )
    await db.commit()

    count = await db.scalar(
        select(func.count(User.id)).where(User.department_id == dept.id, User.deleted_at.is_(None))
    )
    return _to_department_response(dept, count or 0)


@router.delete("/{department_id}/head", summary="Bãi nhiệm trưởng ban (Admin)")
async def dismiss_department_head(
    department_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin bãi nhiệm trưởng ban:
    - Người cũ trở về vai trò member (trừ khi là admin).
    - Ban chuyển về trạng thái chưa có trưởng ban (head_id=None).
    """
    client_ip = get_client_ip(request)

    dept = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()

    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ban chuyên môn yêu cầu",
        )

    if dept.head_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ban này hiện chưa có trưởng ban để bãi nhiệm",
        )

    old_head_id = dept.head_id
    old_head = (
        await db.execute(select(User).where(User.id == old_head_id))
    ).scalar_one_or_none()

    if old_head and old_head.role == SystemRole.DEPARTMENT_HEAD:
        old_head.role = SystemRole.MEMBER

    dept.head_id = None
    await db.commit()

    await record_audit_event(
        db,
        action="DEPARTMENT_HEAD_DISMISSED",
        actor=f"admin_id:{current_user.id}",
        target=f"department_id:{department_id}",
        ip_address=client_ip,
        details={"dismissed_head_id": old_head_id},
    )
    await db.commit()

    return {"message": "Đã bãi nhiệm trưởng ban thành công"}


@router.get("/{department_id}/members", response_model=PaginatedResponse[UserResponse], summary="Xem thành viên trong ban")
async def list_department_members(
    department_id: int,
    q: Optional[str] = Query(None, description="Tìm kiếm theo Tên, Email hoặc MSSV"),
    page: int = Query(1, ge=1, description="Số trang (bắt đầu từ 1)"),
    page_size: int = Query(20, ge=1, le=100, description="Số lượng mục trên một trang"),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem danh sách thành viên thuộc một ban:
    - Admin: Được xem thành viên của mọi ban.
    - Trưởng ban: Chỉ được xem thành viên thuộc ban của chính mình.
    - Thành viên thông thường: 403 Forbidden.
    """
    # Kiểm tra phân quyền phạm vi ban
    ensure_department_access(current_user, department_id)

    # Kiểm tra ban tồn tại
    dept = (await db.execute(select(Department).where(Department.id == department_id))).scalar_one_or_none()
    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ban chuyên môn yêu cầu",
        )

    query = (
        select(User)
        .options(joinedload(User.department))
        .where(User.department_id == department_id, User.deleted_at.is_(None))
    )

    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                User.full_name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.student_id.ilike(search_pattern),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(User.id.asc()).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[UserResponse.model_validate(u) for u in items],
        total=total,
        page=page,
        page_size=page_size,
    )
