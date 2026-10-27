import csv
import io
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.endpoints.auth import get_client_ip
from app.core.audit import record_audit_event
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_admin,
    require_any_authenticated,
    require_department_head,
    require_finance_manager,
)
from app.models.department import Department
from app.models.fee import (
    ClaimStatus,
    FeePayment,
    FeePeriod,
    FeePeriodStatus,
    MemberFee,
    MemberFeeStatus,
    PaymentClaim,
    PaymentMethod,
)
from app.models.fund import LedgerEntry, LedgerType
from app.models.notification import NotificationType
from app.models.user import SystemRole, User
from app.schemas.common import PaginatedResponse
from app.schemas.fee import (
    AddMemberToPeriodInput,
    DepartmentMemberFeeStatusOut,
    FeePaymentCreate,
    FeePaymentOut,
    FeePaymentVoid,
    FeePeriodCreate,
    FeePeriodOut,
    FeePeriodUpdate,
    MemberFeeDiscountUpdate,
    MemberFeeOut,
    PaymentClaimCreate,
    PaymentClaimOut,
    PaymentClaimReview,
)
from app.services.notification_service import send_notification
from app.services.storage import save_receipt_photo

router = APIRouter()


def _format_member_fee_out(mf: MemberFee) -> MemberFeeOut:
    now = datetime.now(timezone.utc)
    p_due = mf.period.due_date
    if p_due and p_due.tzinfo is None:
        p_due = p_due.replace(tzinfo=timezone.utc)

    calc_status = mf.calculated_status
    is_overdue = bool(p_due and p_due < now and calc_status not in [MemberFeeStatus.PAID, MemberFeeStatus.WAIVED])

    payments_out = [
        FeePaymentOut(
            id=p.id,
            receipt_code=p.receipt_code,
            member_fee_id=p.member_fee_id,
            amount=p.amount,
            method=p.method,
            paid_at=p.paid_at,
            received_by_id=p.received_by_id,
            receiver_name=p.receiver.full_name if p.receiver else None,
            note=p.note,
            proof_photo_path=p.proof_photo_path,
            is_voided=p.is_voided,
            voided_at=p.voided_at,
            voided_by_id=p.voided_by_id,
            voider_name=p.voider.full_name if p.voider else None,
            void_reason=p.void_reason,
            created_at=p.created_at,
        )
        for p in mf.payments
    ]

    claims_out = [
        PaymentClaimOut(
            id=c.id,
            member_fee_id=c.member_fee_id,
            period_name=mf.period.name,
            user_id=mf.user_id,
            user_name=mf.user.full_name if mf.user else None,
            student_id=mf.user.student_id if mf.user else None,
            amount=c.amount,
            transfer_time=c.transfer_time,
            proof_photo_path=c.proof_photo_path,
            note=c.note,
            status=c.status,
            reviewed_by_id=c.reviewed_by_id,
            reviewer_name=c.reviewer.full_name if c.reviewer else None,
            reviewed_at=c.reviewed_at,
            review_note=c.review_note,
            created_at=c.created_at,
        )
        for c in mf.claims
    ]

    return MemberFeeOut(
        id=mf.id,
        period_id=mf.period_id,
        period_name=mf.period.name,
        period_due_date=mf.period.due_date,
        period_status=mf.period.status,
        user_id=mf.user_id,
        user_name=mf.user.full_name if mf.user else "",
        student_id=mf.user.student_id if mf.user else "",
        department_id=mf.user.department_id if mf.user else None,
        department_name=mf.user.department.name if mf.user and mf.user.department else None,
        amount_due=mf.amount_due,
        discount_amount=mf.discount_amount,
        discount_reason=mf.discount_reason,
        net_amount_due=mf.net_amount_due,
        total_paid=mf.total_paid,
        remaining_due=mf.remaining_due,
        status=calc_status,
        is_overdue=is_overdue,
        payments=payments_out,
        claims=claims_out,
        created_at=mf.created_at,
    )


async def _generate_receipt_code(db: AsyncSession) -> str:
    """Sinh mã phiếu thu liên tục: PT-YYYYMM-XXXX."""
    now = datetime.now(timezone.utc)
    month_prefix = f"PT-{now.strftime('%Y%m')}-"
    stmt = select(func.count(FeePayment.id)).where(FeePayment.receipt_code.like(f"{month_prefix}%"))
    count = (await db.execute(stmt)).scalar_one()
    return f"{month_prefix}{count + 1:04d}"


# ============================================================
# 1. KỲ THU HỘI PHÍ (FEE PERIODS)
# ============================================================

@router.post("/periods", response_model=FeePeriodOut, summary="Tạo kỳ thu hội phí mới")
async def create_fee_period(
    data: FeePeriodCreate,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý quỹ (Admin hoặc Thủ quỹ) tạo kỳ thu hội phí mới.
    Hệ thống tự động sinh khoản phải đóng (MemberFee) cho tất cả thành viên đang hoạt động tại thời điểm này.
    """
    client_ip = get_client_ip(request)

    period = FeePeriod(
        name=data.name.strip(),
        amount=data.amount,
        due_date=data.due_date,
        description=data.description.strip() if data.description else None,
        status=FeePeriodStatus.OPEN,
        created_by_id=current_user.id,
    )
    db.add(period)
    await db.flush()

    # Tự động tạo khoản phải đóng cho mọi thành viên đang hoạt động (chưa bị khóa, chưa xóa mềm)
    user_stmt = select(User).where(User.is_active == True, User.deleted_at.is_(None))
    active_users = (await db.execute(user_stmt)).scalars().all()

    for u in active_users:
        member_fee = MemberFee(
            period_id=period.id,
            user_id=u.id,
            amount_due=period.amount,
            discount_amount=0,
            discount_reason=None,
        )
        db.add(member_fee)

    await db.commit()
    await db.refresh(period)

    await record_audit_event(
        db,
        action="FEE_PERIOD_CREATED",
        actor=f"user_id:{current_user.id}",
        target=f"period_id:{period.id}",
        ip_address=client_ip,
        details={"name": period.name, "amount": period.amount, "members_count": len(active_users)},
    )
    await db.commit()

    return FeePeriodOut(
        id=period.id,
        name=period.name,
        amount=period.amount,
        due_date=period.due_date,
        description=period.description,
        status=period.status,
        created_by_id=period.created_by_id,
        creator_name=current_user.full_name,
        total_members=len(active_users),
        total_collected=0,
        total_expected=len(active_users) * period.amount,
        created_at=period.created_at,
        updated_at=period.updated_at,
    )


@router.get("/periods", response_model=List[FeePeriodOut], summary="Danh sách các kỳ thu hội phí")
async def list_fee_periods(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách các kỳ thu hội phí."""
    conditions = []
    if status_filter:
        conditions.append(FeePeriod.status == status_filter)

    stmt = (
        select(FeePeriod)
        .options(
            joinedload(FeePeriod.creator),
            selectinload(FeePeriod.member_fees).selectinload(MemberFee.payments),
        )
        .where(*conditions)
        .order_by(FeePeriod.created_at.desc())
    )
    periods = (await db.execute(stmt)).scalars().all()

    items = []
    for p in periods:
        total_m = len(p.member_fees)
        total_exp = sum(mf.net_amount_due for mf in p.member_fees)
        total_col = sum(mf.total_paid for mf in p.member_fees)
        items.append(
            FeePeriodOut(
                id=p.id,
                name=p.name,
                amount=p.amount,
                due_date=p.due_date,
                description=p.description,
                status=p.status,
                created_by_id=p.created_by_id,
                creator_name=p.creator.full_name if p.creator else None,
                total_members=total_m,
                total_collected=total_col,
                total_expected=total_exp,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    return items


@router.patch("/periods/{period_id}/status", response_model=FeePeriodOut, summary="Đóng hoặc mở lại kỳ thu (Admin)")
async def update_period_status(
    period_id: int,
    data: FeePeriodUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """CHỈ ADMIN được phép đóng hoặc mở lại kỳ thu hội phí."""
    client_ip = get_client_ip(request)

    period = await db.get(FeePeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy kỳ thu hội phí")

    old_status = period.status
    if data.name is not None:
        period.name = data.name.strip()
    if data.description is not None:
        period.description = data.description.strip() if data.description else None
    if data.due_date is not None:
        period.due_date = data.due_date
    if data.status is not None:
        period.status = data.status

    await db.commit()
    await db.refresh(period)

    if data.status is not None and data.status != old_status:
        action = "FEE_PERIOD_CLOSED" if period.status == FeePeriodStatus.CLOSED else "FEE_PERIOD_REOPENED"
        await record_audit_event(
            db,
            action=action,
            actor=f"admin_id:{current_user.id}",
            target=f"period_id:{period.id}",
            ip_address=client_ip,
            details={"old_status": old_status, "new_status": period.status},
        )
        await db.commit()

    return FeePeriodOut(
        id=period.id,
        name=period.name,
        amount=period.amount,
        due_date=period.due_date,
        description=period.description,
        status=period.status,
        created_by_id=period.created_by_id,
        creator_name=current_user.full_name,
        created_at=period.created_at,
        updated_at=period.updated_at,
    )


@router.post("/periods/{period_id}/members", response_model=MemberFeeOut, summary="Thêm thành viên vào kỳ thu")
async def add_member_to_period(
    period_id: int,
    data: AddMemberToPeriodInput,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Thêm một thành viên vào kỳ thu hội phí (dành cho thành viên mới gia nhập sau khi tạo kỳ)."""
    client_ip = get_client_ip(request)

    period = await db.get(FeePeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy kỳ thu hội phí")
    if period.status == FeePeriodStatus.CLOSED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kỳ thu này đã đóng, không thể thêm thành viên")

    target_user = await db.get(User, data.user_id)
    if not target_user or target_user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thành viên không tồn tại hoặc đã bị xóa")

    # Kiểm tra xem đã tồn tại khoản thu này chưa
    existing = (
        await db.execute(
            select(MemberFee).where(MemberFee.period_id == period_id, MemberFee.user_id == data.user_id)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Thành viên này đã có trong danh sách của kỳ thu")

    amt = data.amount_due if data.amount_due is not None else period.amount
    mf = MemberFee(
        period_id=period.id,
        user_id=target_user.id,
        amount_due=amt,
        discount_amount=data.discount_amount,
        discount_reason=data.discount_reason,
    )
    db.add(mf)
    await db.commit()

    await record_audit_event(
        db,
        action="MEMBER_ADDED_TO_FEE_PERIOD",
        actor=f"user_id:{current_user.id}",
        target=f"member_fee_id:{mf.id}",
        ip_address=client_ip,
        details={"period_id": period.id, "user_id": target_user.id, "amount_due": amt},
    )
    await db.commit()

    stmt = (
        select(MemberFee)
        .options(
            joinedload(MemberFee.period),
            joinedload(MemberFee.user).joinedload(User.department),
            selectinload(MemberFee.payments),
            selectinload(MemberFee.claims),
        )
        .where(MemberFee.id == mf.id)
    )
    mf = (await db.execute(stmt)).scalar_one()
    return _format_member_fee_out(mf)


@router.get("/periods/{period_id}/members", response_model=PaginatedResponse[MemberFeeOut], summary="Danh sách khoản thu của kỳ")
async def list_period_member_fees(
    period_id: int,
    department_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    is_overdue: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý quỹ xem toàn bộ danh sách thành viên và các khoản đóng theo kỳ."""
    period = await db.get(FeePeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy kỳ thu hội phí")

    conditions = [MemberFee.period_id == period_id]
    if department_id:
        conditions.append(User.department_id == department_id)

    # Lấy danh sách kèm eager load
    stmt = (
        select(MemberFee)
        .join(MemberFee.user)
        .options(
            joinedload(MemberFee.period),
            joinedload(MemberFee.user).joinedload(User.department),
            selectinload(MemberFee.payments).joinedload(FeePayment.receiver),
            selectinload(MemberFee.payments).joinedload(FeePayment.voider),
            selectinload(MemberFee.claims).joinedload(PaymentClaim.reviewer),
        )
        .where(*conditions)
        .order_by(User.full_name.asc())
    )
    all_fees = (await db.execute(stmt)).scalars().all()

    # Lọc bộ nhớ theo status tính toán và quá hạn
    now = datetime.now(timezone.utc)
    filtered = []
    for mf in all_fees:
        c_status = mf.calculated_status
        if status_filter and c_status != status_filter:
            continue
        p_due = mf.period.due_date
        if p_due and p_due.tzinfo is None:
            p_due = p_due.replace(tzinfo=timezone.utc)
        overdue = bool(p_due and p_due < now and c_status not in [MemberFeeStatus.PAID, MemberFeeStatus.WAIVED])
        if is_overdue is not None and overdue != is_overdue:
            continue
        filtered.append(mf)

    total = len(filtered)
    start_idx = (page - 1) * page_size
    page_items = filtered[start_idx : start_idx + page_size]

    return PaginatedResponse[MemberFeeOut](
        items=[_format_member_fee_out(mf) for mf in page_items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/periods/{period_id}/dept-members", response_model=List[DepartmentMemberFeeStatusOut], summary="Trưởng ban xem tình trạng đóng hội phí")
async def list_dept_member_fee_statuses(
    period_id: int,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Trưởng ban chỉ xem tình trạng (đã đóng / chưa đóng / quá hạn) của thành viên trong ban mình để đôn đốc.
    BẢO MẬT: Tuyệt đối không trả về số tiền chi tiết, ghi chú hay lý do miễn giảm.
    """
    if current_user.role == SystemRole.DEPARTMENT_HEAD and current_user.department_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tài khoản chưa được gán ban")

    dept_id = current_user.department_id

    period = await db.get(FeePeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy kỳ thu hội phí")

    stmt = (
        select(MemberFee)
        .join(MemberFee.user)
        .options(
            joinedload(MemberFee.period),
            joinedload(MemberFee.user),
            selectinload(MemberFee.payments),
        )
        .where(
            MemberFee.period_id == period_id,
            User.department_id == dept_id,
            User.deleted_at.is_(None),
        )
        .order_by(User.full_name.asc())
    )
    fees = (await db.execute(stmt)).scalars().all()

    now = datetime.now(timezone.utc)
    items = []
    for mf in fees:
        p_due = mf.period.due_date
        if p_due and p_due.tzinfo is None:
            p_due = p_due.replace(tzinfo=timezone.utc)
        c_status = mf.calculated_status
        overdue = bool(p_due and p_due < now and c_status not in [MemberFeeStatus.PAID, MemberFeeStatus.WAIVED])
        items.append(
            DepartmentMemberFeeStatusOut(
                user_id=mf.user_id,
                full_name=mf.user.full_name,
                student_id=mf.user.student_id,
                department_id=mf.user.department_id,
                status=c_status,
                is_overdue=overdue,
            )
        )
    return items


@router.get("/periods/{period_id}/export-csv", summary="Xuất danh sách hội phí ra CSV")
async def export_fee_period_csv(
    period_id: int,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Xuất file CSV danh sách thành viên đóng/chưa đóng của kỳ thu."""
    period = await db.get(FeePeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy kỳ thu hội phí")

    stmt = (
        select(MemberFee)
        .join(MemberFee.user)
        .options(
            joinedload(MemberFee.period),
            joinedload(MemberFee.user).joinedload(User.department),
            selectinload(MemberFee.payments),
        )
        .where(MemberFee.period_id == period_id)
        .order_by(User.student_id.asc())
    )
    fees = (await db.execute(stmt)).scalars().all()

    output = io.StringIO()
    # Thêm BOM UTF-8 để Excel đọc tiếng Việt không lỗi font
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow([
        "MSSV",
        "Họ và tên",
        "Ban chuyên môn",
        "Mức phải đóng (VND)",
        "Miễn giảm (VND)",
        "Lý do miễn giảm",
        "Đã đóng (VND)",
        "Còn nợ (VND)",
        "Trạng thái",
    ])

    for mf in fees:
        writer.writerow([
            mf.user.student_id,
            mf.user.full_name,
            mf.user.department.name if mf.user.department else "Chưa gán ban",
            mf.amount_due,
            mf.discount_amount,
            mf.discount_reason or "",
            mf.total_paid,
            mf.remaining_due,
            mf.calculated_status,
        ])

    output.seek(0)
    filename = f"Hoi_phi_{period.name.replace(' ', '_')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ============================================================
# 2. MIỄN GIẢM HỘI PHÍ (ADMIN ONLY)
# ============================================================

@router.patch("/member-fees/{member_fee_id}/discount", response_model=MemberFeeOut, summary="Miễn giảm hội phí (Admin)")
async def update_member_fee_discount(
    member_fee_id: int,
    data: MemberFeeDiscountUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """CHỈ ADMIN được quyết định miễn giảm hội phí. Bắt buộc có lý do và ghi log kiểm toán.
    Miễn toàn phần sẽ tự động chuyển trạng thái waived.
    """
    client_ip = get_client_ip(request)

    stmt = (
        select(MemberFee)
        .options(
            joinedload(MemberFee.period),
            joinedload(MemberFee.user).joinedload(User.department),
            selectinload(MemberFee.payments),
            selectinload(MemberFee.claims),
        )
        .where(MemberFee.id == member_fee_id)
    )
    mf = (await db.execute(stmt)).scalar_one_or_none()
    if not mf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản đóng hội phí")

    if data.discount_amount > mf.amount_due:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Số tiền miễn giảm ({data.discount_amount:,} VND) không được vượt quá số tiền phải đóng ({mf.amount_due:,} VND)",
        )

    old_discount = mf.discount_amount
    mf.discount_amount = data.discount_amount
    mf.discount_reason = data.discount_reason.strip()

    await db.commit()
    await db.refresh(mf)

    await record_audit_event(
        db,
        action="FEE_DISCOUNT_APPLIED",
        actor=f"admin_id:{current_user.id}",
        target=f"member_fee_id:{mf.id}",
        ip_address=client_ip,
        details={
            "user_id": mf.user_id,
            "period_id": mf.period_id,
            "old_discount": old_discount,
            "new_discount": mf.discount_amount,
            "reason": mf.discount_reason,
        },
    )
    await db.commit()

    return _format_member_fee_out(mf)


# ============================================================
# 3. GHI NHẬN & HỦY THANH TOÁN (PAYMENTS)
# ============================================================

@router.post("/payments", response_model=FeePaymentOut, summary="Ghi nhận thanh toán hội phí")
async def record_fee_payment(
    data: FeePaymentCreate,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý quỹ ghi nhận thanh toán tiền mặt hoặc chuyển khoản trực tiếp:
    - Bất biến, không sửa, sai thì hủy (void).
    - Tự động sinh mã phiếu thu liên tục.
    - Tự động sinh bút toán thu (income) trong sổ quỹ.
    - Chặn thanh toán vượt quá số còn nợ. Chặn thanh toán vào kỳ đã closed.
    """
    client_ip = get_client_ip(request)

    stmt = (
        select(MemberFee)
        .options(
            joinedload(MemberFee.period),
            selectinload(MemberFee.payments),
        )
        .where(MemberFee.id == data.member_fee_id)
    )
    mf = (await db.execute(stmt)).scalar_one_or_none()
    if not mf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản đóng hội phí")

    if mf.period.status == FeePeriodStatus.CLOSED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kỳ thu này đã đóng, không nhận thêm thanh toán")

    rem_due = mf.remaining_due
    if data.amount > rem_due:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Số tiền nộp ({data.amount:,} VND) vượt quá số tiền còn nợ ({rem_due:,} VND)",
        )

    receipt_code = await _generate_receipt_code(db)
    now = datetime.now(timezone.utc)
    paid_time = data.paid_at or now

    payment = FeePayment(
        receipt_code=receipt_code,
        member_fee_id=mf.id,
        amount=data.amount,
        method=data.method,
        paid_at=paid_time,
        received_by_id=current_user.id,
        note=data.note.strip() if data.note else None,
        proof_photo_path=data.proof_photo_path,
    )
    db.add(payment)
    await db.flush()

    # Tự động sinh bút toán income trong sổ quỹ ledger_entries
    ledger_entry = LedgerEntry(
        type=LedgerType.INCOME,
        amount=payment.amount,
        category="membership_fee",
        description=f"Thu hội phí kỳ '{mf.period.name}' - Phiếu thu {receipt_code} ({data.method})",
        occurred_at=paid_time,
        fee_payment_id=payment.id,
        recorded_by_id=current_user.id,
        receipt_photo_path=payment.proof_photo_path,
    )
    db.add(ledger_entry)

    await db.commit()
    await db.refresh(payment)

    await record_audit_event(
        db,
        action="FEE_PAYMENT_RECORDED",
        actor=f"user_id:{current_user.id}",
        target=f"payment_id:{payment.id}",
        ip_address=client_ip,
        details={
            "receipt_code": payment.receipt_code,
            "member_fee_id": mf.id,
            "amount": payment.amount,
            "method": payment.method,
        },
    )
    await db.commit()

    return FeePaymentOut(
        id=payment.id,
        receipt_code=payment.receipt_code,
        member_fee_id=payment.member_fee_id,
        amount=payment.amount,
        method=payment.method,
        paid_at=payment.paid_at,
        received_by_id=payment.received_by_id,
        receiver_name=current_user.full_name,
        note=payment.note,
        proof_photo_path=payment.proof_photo_path,
        is_voided=False,
        created_at=payment.created_at,
    )


@router.post("/payments/{payment_id}/void", response_model=FeePaymentOut, summary="Hủy phiếu thu thanh toán")
async def void_fee_payment(
    payment_id: int,
    data: FeePaymentVoid,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Hủy thanh toán sai sót:
    - Bất biến: Không xóa bản ghi, chỉ đánh dấu void kèm lý do và thời điểm.
    - Tự động void bút toán sổ quỹ liên quan tương ứng.
    - Khoản nợ của thành viên tự động khôi phục số dư.
    """
    client_ip = get_client_ip(request)

    payment = await db.get(FeePayment, payment_id)
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiếu thu thanh toán")

    if payment.is_voided:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phiếu thu này đã bị hủy trước đó")

    now = datetime.now(timezone.utc)
    payment.voided_at = now
    payment.voided_by_id = current_user.id
    payment.void_reason = data.void_reason.strip()

    # Tự động void bút toán sổ quỹ liên kết
    ledger_stmt = select(LedgerEntry).where(LedgerEntry.fee_payment_id == payment.id, LedgerEntry.voided_at.is_(None))
    ledger_entry = (await db.execute(ledger_stmt)).scalar_one_or_none()
    if ledger_entry:
        ledger_entry.voided_at = now
        ledger_entry.voided_by_id = current_user.id
        ledger_entry.void_reason = f"Hủy theo phiếu thu {payment.receipt_code}: {data.void_reason.strip()}"

    await db.commit()
    await db.refresh(payment)

    await record_audit_event(
        db,
        action="FEE_PAYMENT_VOIDED",
        actor=f"user_id:{current_user.id}",
        target=f"payment_id:{payment.id}",
        ip_address=client_ip,
        details={
            "receipt_code": payment.receipt_code,
            "amount": payment.amount,
            "reason": payment.void_reason,
        },
    )
    await db.commit()

    return FeePaymentOut(
        id=payment.id,
        receipt_code=payment.receipt_code,
        member_fee_id=payment.member_fee_id,
        amount=payment.amount,
        method=payment.method,
        paid_at=payment.paid_at,
        received_by_id=payment.received_by_id,
        note=payment.note,
        proof_photo_path=payment.proof_photo_path,
        is_voided=True,
        voided_at=payment.voided_at,
        voided_by_id=payment.voided_by_id,
        voider_name=current_user.full_name,
        void_reason=payment.void_reason,
        created_at=payment.created_at,
    )


@router.get("/payments/receipt/{receipt_code}", response_model=FeePaymentOut, summary="Xem chi tiết phiếu thu theo mã")
async def get_receipt_by_code(
    receipt_code: str,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Xem và in phiếu thu theo mã số liên tục."""
    stmt = (
        select(FeePayment)
        .options(
            joinedload(FeePayment.receiver),
            joinedload(FeePayment.voider),
            joinedload(FeePayment.member_fee).joinedload(MemberFee.user),
        )
        .where(FeePayment.receipt_code == receipt_code)
    )
    payment = (await db.execute(stmt)).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiếu thu")

    # Kiểm tra quyền: Người quản lý quỹ HOẶC chính chủ sở hữu phiếu thu
    is_owner = payment.member_fee.user_id == current_user.id
    is_mgr = current_user.role == SystemRole.ADMIN or current_user.is_treasurer
    if not (is_owner or is_mgr):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xem phiếu thu này")

    return FeePaymentOut(
        id=payment.id,
        receipt_code=payment.receipt_code,
        member_fee_id=payment.member_fee_id,
        amount=payment.amount,
        method=payment.method,
        paid_at=payment.paid_at,
        received_by_id=payment.received_by_id,
        receiver_name=payment.receiver.full_name if payment.receiver else None,
        note=payment.note,
        proof_photo_path=payment.proof_photo_path,
        is_voided=payment.is_voided,
        voided_at=payment.voided_at,
        voided_by_id=payment.voided_by_id,
        voider_name=payment.voider.full_name if payment.voider else None,
        void_reason=payment.void_reason,
        created_at=payment.created_at,
    )


# ============================================================
# 4. YÊU CẦU XÁC NHẬN CHUYỂN KHOẢN (PAYMENT CLAIMS)
# ============================================================

@router.post("/payment-claims", response_model=PaymentClaimOut, summary="Gửi báo cáo chuyển khoản kèm ảnh biên lai")
async def create_payment_claim(
    member_fee_id: int = Query(...),
    amount: int = Query(..., gt=0),
    transfer_time: Optional[datetime] = Query(None),
    note: Optional[str] = Query(None),
    file: UploadFile = File(..., description="Ảnh chụp biên lai chuyển khoản (JPEG/PNG <= 2MB)"),
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên nộp báo cáo chuyển khoản (kèm ảnh chụp biên lai ngân hàng):
    - Kiểm tra đúng khoản nợ của chính mình.
    - Lưu ảnh an toàn, kiểm tra magic bytes, chống path traversal.
    """
    mf = await db.get(MemberFee, member_fee_id)
    if not mf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản đóng hội phí")

    if mf.user_id != current_user.id and current_user.role != SystemRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn chỉ được nộp claim cho chính mình")

    content = await file.read()
    photo_filename = save_receipt_photo(content)

    claim = PaymentClaim(
        member_fee_id=mf.id,
        amount=amount,
        transfer_time=transfer_time or datetime.now(timezone.utc),
        proof_photo_path=photo_filename,
        note=note.strip() if note else None,
        status=ClaimStatus.PENDING,
    )
    db.add(claim)
    await db.commit()
    await db.refresh(claim)

    return PaymentClaimOut(
        id=claim.id,
        member_fee_id=claim.member_fee_id,
        period_name=mf.period.name if mf.period else None,
        user_id=current_user.id,
        user_name=current_user.full_name,
        student_id=current_user.student_id,
        amount=claim.amount,
        transfer_time=claim.transfer_time,
        proof_photo_path=claim.proof_photo_path,
        note=claim.note,
        status=claim.status,
        created_at=claim.created_at,
    )


@router.get("/payment-claims", response_model=List[PaymentClaimOut], summary="Danh sách hàng đợi duyệt claim (Thủ quỹ/Admin)")
async def list_payment_claims(
    status_filter: Optional[str] = Query(None, alias="status"),
    period_id: Optional[int] = None,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý quỹ xem danh sách yêu cầu xác nhận chuyển khoản cần duyệt."""
    conditions = []
    if status_filter:
        conditions.append(PaymentClaim.status == status_filter)
    if period_id:
        conditions.append(MemberFee.period_id == period_id)

    stmt = (
        select(PaymentClaim)
        .join(PaymentClaim.member_fee)
        .join(MemberFee.period)
        .join(MemberFee.user)
        .options(
            joinedload(PaymentClaim.member_fee).joinedload(MemberFee.period),
            joinedload(PaymentClaim.member_fee).joinedload(MemberFee.user),
            joinedload(PaymentClaim.reviewer),
        )
        .where(*conditions)
        .order_by(PaymentClaim.created_at.desc())
    )
    claims = (await db.execute(stmt)).scalars().all()

    return [
        PaymentClaimOut(
            id=c.id,
            member_fee_id=c.member_fee_id,
            period_name=c.member_fee.period.name,
            user_id=c.member_fee.user_id,
            user_name=c.member_fee.user.full_name,
            student_id=c.member_fee.user.student_id,
            amount=c.amount,
            transfer_time=c.transfer_time,
            proof_photo_path=c.proof_photo_path,
            note=c.note,
            status=c.status,
            reviewed_by_id=c.reviewed_by_id,
            reviewer_name=c.reviewer.full_name if c.reviewer else None,
            reviewed_at=c.reviewed_at,
            review_note=c.review_note,
            created_at=c.created_at,
        )
        for c in claims
    ]


@router.post("/payment-claims/{claim_id}/review", response_model=PaymentClaimOut, summary="Xác nhận hoặc từ chối claim")
async def review_payment_claim(
    claim_id: int,
    data: PaymentClaimReview,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý quỹ đối chiếu sao kê ngân hàng và xác nhận/từ chối claim:
    - IDEMPOTENCY: Mỗi claim chỉ được xác nhận DUY NHẤT một lần. Xác nhận lại bị chặn ngay.
    - Nếu xác nhận: Tự động tạo FeePayment (method='bank_transfer') và ghi nhận bút toán thu trong sổ quỹ.
    - Gửi thông báo kết quả cho thành viên.
    """
    client_ip = get_client_ip(request)

    stmt = (
        select(PaymentClaim)
        .options(
            joinedload(PaymentClaim.member_fee).joinedload(MemberFee.period),
            joinedload(PaymentClaim.member_fee).joinedload(MemberFee.user),
            joinedload(PaymentClaim.member_fee).selectinload(MemberFee.payments),
        )
        .where(PaymentClaim.id == claim_id)
    )
    claim = (await db.execute(stmt)).scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu xác nhận chuyển khoản")

    if claim.status != ClaimStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Yêu cầu này đã được xử lý trước đó với trạng thái: '{claim.status}'. Không thể thao tác lại",
        )

    mf = claim.member_fee
    now = datetime.now(timezone.utc)

    if data.status == ClaimStatus.CONFIRMED:
        if mf.period.status == FeePeriodStatus.CLOSED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kỳ thu này đã đóng, không thể xác nhận thêm thanh toán",
            )
        if claim.amount > mf.remaining_due:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số tiền claim ({claim.amount:,} VND) vượt quá số tiền còn nợ ({mf.remaining_due:,} VND)",
            )

        # Cập nhật claim
        claim.status = ClaimStatus.CONFIRMED
        claim.reviewed_by_id = current_user.id
        claim.reviewed_at = now
        claim.review_note = data.review_note.strip() if data.review_note else None

        # Tạo FeePayment
        receipt_code = await _generate_receipt_code(db)
        payment = FeePayment(
            receipt_code=receipt_code,
            member_fee_id=mf.id,
            amount=claim.amount,
            method=PaymentMethod.BANK_TRANSFER,
            paid_at=claim.transfer_time,
            received_by_id=current_user.id,
            note=f"Xác nhận claim #{claim.id}: {claim.note or ''}",
            proof_photo_path=claim.proof_photo_path,
        )
        db.add(payment)
        await db.flush()

        # Tạo LedgerEntry
        ledger_entry = LedgerEntry(
            type=LedgerType.INCOME,
            amount=payment.amount,
            category="membership_fee",
            description=f"Hội phí '{mf.period.name}' - {mf.user.full_name} ({mf.user.student_id}) chuyển khoản - Phiếu thu {receipt_code}",
            occurred_at=claim.transfer_time,
            fee_payment_id=payment.id,
            recorded_by_id=current_user.id,
            receipt_photo_path=payment.proof_photo_path,
        )
        db.add(ledger_entry)

        # Gửi thông báo cho thành viên
        await send_notification(
            db,
            user_id=mf.user_id,
            type=NotificationType.PAYMENT_CONFIRMED,
            title="Thanh toán hội phí đã được xác nhận",
            body=f"Khoản nộp {claim.amount:,} VND cho kỳ '{mf.period.name}' đã được xác nhận (Mã phiếu thu: {receipt_code}).",
            link="/my-fees",
        )

        await record_audit_event(
            db,
            action="PAYMENT_CLAIM_CONFIRMED",
            actor=f"user_id:{current_user.id}",
            target=f"claim_id:{claim.id}",
            ip_address=client_ip,
            details={"receipt_code": receipt_code, "amount": claim.amount, "user_id": mf.user_id},
        )

    else:
        # Từ chối
        claim.status = ClaimStatus.REJECTED
        claim.reviewed_by_id = current_user.id
        claim.reviewed_at = now
        claim.review_note = data.review_note.strip() if data.review_note else "Chứng từ không hợp lệ hoặc chưa nhận được tiền"

        await send_notification(
            db,
            user_id=mf.user_id,
            type=NotificationType.PAYMENT_REJECTED,
            title="Thanh toán hội phí bị từ chối",
            body=f"Yêu cầu nộp {claim.amount:,} VND cho kỳ '{mf.period.name}' bị từ chối: {claim.review_note}.",
            link="/my-fees",
        )

        await record_audit_event(
            db,
            action="PAYMENT_CLAIM_REJECTED",
            actor=f"user_id:{current_user.id}",
            target=f"claim_id:{claim.id}",
            ip_address=client_ip,
            details={"amount": claim.amount, "reason": claim.review_note, "user_id": mf.user_id},
        )

    await db.commit()
    await db.refresh(claim)

    return PaymentClaimOut(
        id=claim.id,
        member_fee_id=claim.member_fee_id,
        period_name=mf.period.name,
        user_id=mf.user_id,
        user_name=mf.user.full_name,
        student_id=mf.user.student_id,
        amount=claim.amount,
        transfer_time=claim.transfer_time,
        proof_photo_path=claim.proof_photo_path,
        note=claim.note,
        status=claim.status,
        reviewed_by_id=claim.reviewed_by_id,
        reviewer_name=current_user.full_name,
        reviewed_at=claim.reviewed_at,
        review_note=claim.review_note,
        created_at=claim.created_at,
    )


# ============================================================
# 5. HỘI PHÍ CỦA TÔI (MY FEES) & THÔNG TIN CHUYỂN KHOẢN
# ============================================================

@router.get("/me", response_model=List[MemberFeeOut], summary="Hội phí của tôi")
async def get_my_fees(
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Thành viên xem các khoản hội phí, lịch sử thanh toán và các claim của chính mình."""
    stmt = (
        select(MemberFee)
        .options(
            joinedload(MemberFee.period),
            joinedload(MemberFee.user).joinedload(User.department),
            selectinload(MemberFee.payments).joinedload(FeePayment.receiver),
            selectinload(MemberFee.payments).joinedload(FeePayment.voider),
            selectinload(MemberFee.claims).joinedload(PaymentClaim.reviewer),
        )
        .where(MemberFee.user_id == current_user.id)
        .order_by(MemberFee.created_at.desc())
    )
    fees = (await db.execute(stmt)).scalars().all()
    return [_format_member_fee_out(mf) for mf in fees]


@router.get("/bank-instructions", summary="Hướng dẫn thông tin chuyển khoản chuẩn của CLB")
async def get_bank_instructions(
    period_id: Optional[int] = None,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Trả về thông tin tài khoản ngân hàng CLB và cấu trúc cú pháp chuyển khoản chuẩn."""
    period_name = "HOIPHI"
    if period_id:
        p = await db.get(FeePeriod, period_id)
        if p:
            period_name = f"K{p.id}"

    transfer_syntax = f"{current_user.student_id} {period_name}"

    return {
        "bank_name": settings.BANK_NAME,
        "bank_account_number": settings.BANK_ACCOUNT_NUMBER,
        "bank_account_name": settings.BANK_ACCOUNT_NAME,
        "transfer_syntax": transfer_syntax,
        "student_id": current_user.student_id,
        "full_name": current_user.full_name,
    }
