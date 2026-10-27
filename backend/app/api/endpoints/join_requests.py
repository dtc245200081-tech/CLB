from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints.auth import get_client_ip
from app.core.audit import log_audit, record_audit_event
from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.join_request import JoinRequest, JoinRequestStatus
from app.models.user import SystemRole, User
from app.schemas.common import PaginatedResponse
from app.schemas.join_request import (
    JoinRequestCreate,
    JoinRequestReject,
    JoinRequestResponse,
)

router = APIRouter()


@router.post("", response_model=JoinRequestResponse, status_code=status.HTTP_201_CREATED, summary="Nộp đơn gia nhập CLB (Công khai)")
async def submit_join_request(
    data: JoinRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Khách nộp đơn xin gia nhập CLB và tự thiết lập mật khẩu cho tài khoản.
    Bảo mật: Thông báo chung chung khi trùng lặp, không tiết lộ email hay MSSV đã có trong hệ thống.
    """
    client_ip = get_client_ip(request)
    email_clean = data.email.strip().lower()
    student_id_clean = data.student_id.strip().upper()

    # 1. Kiểm tra xem email hoặc MSSV đã tồn tại trong bảng users chưa (kể cả xóa mềm)
    stmt_user = select(User).where(
        (User.email == email_clean) | (User.student_id == student_id_clean)
    )
    existing_user = (await db.execute(stmt_user)).scalar_one_or_none()
    if existing_user is not None:
        log_audit(
            action="JOIN_REQUEST_REJECTED_DUPLICATE_USER",
            actor=f"guest:{email_clean}",
            ip_address=client_ip,
            details={"email": email_clean, "student_id": student_id_clean},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thông tin đăng ký không hợp lệ hoặc đã được ghi nhận trong hệ thống",
        )

    # 2. Kiểm tra xem có đơn gia nhập nào đang chờ duyệt (pending) với email hoặc MSSV này không
    stmt_pending = select(JoinRequest).where(
        JoinRequest.status == JoinRequestStatus.PENDING,
        (JoinRequest.email == email_clean) | (JoinRequest.student_id == student_id_clean),
    )
    existing_pending = (await db.execute(stmt_pending)).scalar_one_or_none()
    if existing_pending is not None:
        log_audit(
            action="JOIN_REQUEST_REJECTED_DUPLICATE_PENDING",
            actor=f"guest:{email_clean}",
            ip_address=client_ip,
            details={"email": email_clean, "student_id": student_id_clean},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thông tin đăng ký không hợp lệ hoặc đã được ghi nhận trong hệ thống",
        )

    # 3. Tạo mới đơn gia nhập
    join_req = JoinRequest(
        email=email_clean,
        student_id=student_id_clean,
        full_name=data.full_name.strip(),
        phone=data.phone.strip() if data.phone else None,
        faculty=data.faculty.strip() if data.faculty else None,
        class_name=data.class_name.strip() if data.class_name else None,
        reason=data.reason.strip() if data.reason else None,
        password_hash=hash_password(data.password),
        status=JoinRequestStatus.PENDING,
        review_note=None,
        reviewed_by_id=None,
        reviewed_at=None,
        user_id=None,
    )

    db.add(join_req)
    await db.commit()
    await db.refresh(join_req)

    await record_audit_event(
        db,
        action="JOIN_REQUEST_SUBMITTED",
        actor=f"guest:{email_clean}",
        target=f"join_request_id:{join_req.id}",
        ip_address=client_ip,
        details={"email": email_clean, "student_id": student_id_clean},
    )
    await db.commit()

    return join_req


@router.get("", response_model=PaginatedResponse[JoinRequestResponse], summary="Danh sách đơn gia nhập (Admin)")
async def list_join_requests(
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(pending|approved|rejected)$", description="Lọc theo trạng thái đơn"),
    page: int = Query(1, ge=1, description="Số trang (từ 1)"),
    page_size: int = Query(10, ge=1, le=100, description="Số lượng mục trên trang"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin xem danh sách đơn gia nhập lọc theo trạng thái (pending/approved/rejected) và phân trang."""
    query = select(JoinRequest)

    if status_filter:
        query = query.where(JoinRequest.status == status_filter)

    # Đếm tổng số
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    # Phân trang và sắp xếp mới nhất
    offset = (page - 1) * page_size
    items_query = query.order_by(JoinRequest.id.desc()).offset(offset).limit(page_size)
    items = (await db.execute(items_query)).scalars().all()

    return PaginatedResponse(
        items=[JoinRequestResponse.model_validate(req) for req in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{request_id}/approve", response_model=JoinRequestResponse, summary="Duyệt đơn gia nhập (Admin)")
async def approve_join_request(
    request_id: int,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin duyệt đơn gia nhập.
    Tự động tạo tài khoản Thành viên với mật khẩu người nộp đã thiết lập sẵn.
    """
    client_ip = get_client_ip(request)

    stmt = select(JoinRequest).where(JoinRequest.id == request_id)
    join_req = (await db.execute(stmt)).scalar_one_or_none()

    if join_req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đơn gia nhập yêu cầu",
        )

    if join_req.status != JoinRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đơn gia nhập này đã được xử lý trước đó với trạng thái: {join_req.status}",
        )

    # Kiểm tra lại xem email hoặc MSSV có bị trùng với tài khoản mới được tạo hay không
    stmt_check = select(User).where(
        (User.email == join_req.email) | (User.student_id == join_req.student_id)
    )
    if (await db.execute(stmt_check)).scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email hoặc MSSV của đơn này đã tồn tại tài khoản trong hệ thống",
        )

    # Tạo tài khoản thành viên mới
    new_user = User(
        email=join_req.email,
        student_id=join_req.student_id,
        full_name=join_req.full_name,
        phone=join_req.phone,
        faculty=join_req.faculty,
        class_name=join_req.class_name,
        title=None,
        password_hash=join_req.password_hash,
        role=SystemRole.MEMBER,
        is_active=True,
        deleted_at=None,
    )
    db.add(new_user)
    await db.flush()  # Sinh id cho new_user

    # Cập nhật trạng thái đơn gia nhập
    now = datetime.now(timezone.utc)
    join_req.status = JoinRequestStatus.APPROVED
    join_req.reviewed_by_id = current_user.id
    join_req.reviewed_at = now
    join_req.user_id = new_user.id

    await record_audit_event(
        db,
        action="JOIN_REQUEST_APPROVED",
        actor=f"admin_id:{current_user.id}",
        target=f"join_request_id:{join_req.id}",
        ip_address=client_ip,
        details={"created_user_id": new_user.id, "email": new_user.email},
    )
    await db.commit()
    await db.refresh(join_req)

    return join_req


@router.post("/{request_id}/reject", response_model=JoinRequestResponse, summary="Từ chối đơn gia nhập (Admin)")
async def reject_join_request(
    request_id: int,
    data: JoinRequestReject,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin từ chối đơn gia nhập kèm ghi chú lý do."""
    client_ip = get_client_ip(request)

    stmt = select(JoinRequest).where(JoinRequest.id == request_id)
    join_req = (await db.execute(stmt)).scalar_one_or_none()

    if join_req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đơn gia nhập yêu cầu",
        )

    if join_req.status != JoinRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đơn gia nhập này đã được xử lý trước đó với trạng thái: {join_req.status}",
        )

    now = datetime.now(timezone.utc)
    join_req.status = JoinRequestStatus.REJECTED
    join_req.review_note = data.review_note.strip() if data.review_note else None
    join_req.reviewed_by_id = current_user.id
    join_req.reviewed_at = now

    await record_audit_event(
        db,
        action="JOIN_REQUEST_REJECTED",
        actor=f"admin_id:{current_user.id}",
        target=f"join_request_id:{join_req.id}",
        ip_address=client_ip,
        details={"review_note": join_req.review_note},
    )
    await db.commit()
    await db.refresh(join_req)

    return join_req
