import csv
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, status
from fastapi.responses import FileResponse, StreamingResponse
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
from app.models.event import Event
from app.models.fee import FeePayment, FeePeriod, MemberFee, MemberFeeStatus, PaymentClaim
from app.models.fund import (
    ExpenseRequest,
    ExpenseRequestStatus,
    LedgerEntry,
    LedgerType,
)
from app.models.notification import NotificationType
from app.models.user import SystemRole, User
from app.schemas.common import PaginatedResponse
from app.schemas.fund import (
    ExpenseRequestCreate,
    ExpenseRequestOut,
    ExpenseRequestReview,
    FeePeriodReportOut,
    FinanceOverviewOut,
    FundReportOut,
    LedgerEntryOut,
    LedgerEntryVoid,
    RecordExpenseInput,
    RecordOtherIncomeInput,
)
from app.services.notification_service import send_notification
from app.services.storage import get_receipt_photo_absolute_path, save_receipt_photo

router = APIRouter()


async def get_current_fund_balance(db: AsyncSession) -> int:
    """Tính toán số dư quỹ tiền mặt hiện tại từ tất cả các bút toán chưa bị hủy (unvoided).
    Số dư = Tổng Thu (Income) - Tổng Chi (Expense).
    Không lưu cứng số dư.
    """
    income_stmt = select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
        LedgerEntry.type == LedgerType.INCOME,
        LedgerEntry.voided_at.is_(None),
    )
    expense_stmt = select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
        LedgerEntry.type == LedgerType.EXPENSE,
        LedgerEntry.voided_at.is_(None),
    )
    total_income = (await db.execute(income_stmt)).scalar_one()
    total_expense = (await db.execute(expense_stmt)).scalar_one()
    return int(total_income or 0) - int(total_expense or 0)


def _format_ledger_out(entry: LedgerEntry) -> LedgerEntryOut:
    return LedgerEntryOut(
        id=entry.id,
        type=entry.type,
        amount=entry.amount,
        category=entry.category,
        description=entry.description,
        occurred_at=entry.occurred_at,
        event_id=entry.event_id,
        event_title=entry.event.title if entry.event else None,
        department_id=entry.department_id,
        department_name=entry.department.name if entry.department else None,
        fee_payment_id=entry.fee_payment_id,
        expense_request_id=entry.expense_request_id,
        recorded_by_id=entry.recorded_by_id,
        recorded_by_name=entry.recorded_by.full_name if entry.recorded_by else None,
        receipt_photo_path=entry.receipt_photo_path,
        is_voided=entry.is_voided,
        voided_at=entry.voided_at,
        voided_by_id=entry.voided_by_id,
        voider_name=entry.voider.full_name if entry.voider else None,
        void_reason=entry.void_reason,
        created_at=entry.created_at,
    )


# ============================================================
# 1. ĐỀ XUẤT CHI (EXPENSE REQUESTS)
# ============================================================

@router.post("/expense-requests", response_model=ExpenseRequestOut, summary="Tạo đề xuất chi")
async def create_expense_request(
    data: ExpenseRequestCreate,
    request: Request,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Tạo đề xuất chi:
    - Trưởng ban: Chỉ tạo đề xuất cho ban của chính mình (bắt buộc gắn department_id ban mình).
    - Admin / Thủ quỹ: Có thể tạo đề xuất cho toàn CLB hoặc bất kỳ ban nào.
    """
    client_ip = get_client_ip(request)

    dept_id = data.department_id
    if current_user.role == SystemRole.DEPARTMENT_HEAD:
        if current_user.department_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tài khoản trưởng ban chưa được phân công quản lý ban nào",
            )
        dept_id = current_user.department_id

    desc = (data.description or data.title).strip()
    req = ExpenseRequest(
        title=data.title.strip(),
        description=desc,
        amount_requested=data.amount_requested,
        department_id=dept_id,
        event_id=data.event_id,
        requested_by_id=current_user.id,
        status=ExpenseRequestStatus.REQUESTED,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    await record_audit_event(
        db,
        action="EXPENSE_REQUEST_CREATED",
        actor=f"user_id:{current_user.id}",
        target=f"expense_request_id:{req.id}",
        ip_address=client_ip,
        details={"title": req.title, "amount": req.amount_requested, "department_id": dept_id},
    )
    await db.commit()

    stmt = (
        select(ExpenseRequest)
        .options(
            joinedload(ExpenseRequest.requested_by),
            joinedload(ExpenseRequest.reviewer),
            joinedload(ExpenseRequest.department),
            joinedload(ExpenseRequest.event),
        )
        .where(ExpenseRequest.id == req.id)
    )
    req = (await db.execute(stmt)).scalar_one()

    return ExpenseRequestOut(
        id=req.id,
        title=req.title,
        description=req.description,
        amount_requested=req.amount_requested,
        department_id=req.department_id,
        department_name=req.department.name if req.department else None,
        event_id=req.event_id,
        event_title=req.event.title if req.event else None,
        requested_by_id=req.requested_by_id,
        requested_by_name=req.requested_by.full_name,
        status=req.status,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.get("/expense-requests", response_model=List[ExpenseRequestOut], summary="Danh sách đề xuất chi")
async def list_expense_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    department_id: Optional[int] = None,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách các đề xuất chi:
    - Admin & Thủ quỹ: Xem tất cả.
    - Trưởng ban: Chỉ xem đề xuất thuộc ban mình hoặc do mình tạo.
    """
    conditions = []
    is_finance_mgr = current_user.role == SystemRole.ADMIN or current_user.is_treasurer

    if not is_finance_mgr:
        conditions.append(
            or_(
                ExpenseRequest.department_id == current_user.department_id,
                ExpenseRequest.requested_by_id == current_user.id,
            )
        )
    else:
        if department_id:
            conditions.append(ExpenseRequest.department_id == department_id)

    if status_filter:
        conditions.append(ExpenseRequest.status == status_filter)

    stmt = (
        select(ExpenseRequest)
        .options(
            joinedload(ExpenseRequest.requested_by),
            joinedload(ExpenseRequest.reviewer),
            joinedload(ExpenseRequest.department),
            joinedload(ExpenseRequest.event),
        )
        .where(*conditions)
        .order_by(ExpenseRequest.created_at.desc())
    )
    reqs = (await db.execute(stmt)).scalars().all()

    return [
        ExpenseRequestOut(
            id=r.id,
            title=r.title,
            description=r.description,
            amount_requested=r.amount_requested,
            department_id=r.department_id,
            department_name=r.department.name if r.department else None,
            event_id=r.event_id,
            event_title=r.event.title if r.event else None,
            requested_by_id=r.requested_by_id,
            requested_by_name=r.requested_by.full_name,
            status=r.status,
            reviewed_by_id=r.reviewed_by_id,
            reviewer_name=r.reviewer.full_name if r.reviewer else None,
            reviewed_at=r.reviewed_at,
            review_note=r.review_note,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in reqs
    ]


@router.post("/expense-requests/{request_id}/review", response_model=ExpenseRequestOut, summary="Duyệt hoặc từ chối đề xuất chi (Admin)")
async def review_expense_request(
    request_id: int,
    data: ExpenseRequestReview,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """CHỈ ADMIN được duyệt chi hoặc từ chối đề xuất chi.
    NGUYÊN TẮC TÁCH BẠCH & TỰ DUYỆT:
    - Người tạo đề xuất KHÔNG được tự duyệt đề xuất của chính mình nếu hệ thống còn Admin khác đang hoạt động.
    - Nếu chỉ còn 1 Admin duy nhất trong hệ thống: cho phép nhưng ghi nhật ký kiểm toán đặc biệt.
    """
    client_ip = get_client_ip(request)

    stmt = (
        select(ExpenseRequest)
        .options(
            joinedload(ExpenseRequest.requested_by),
            joinedload(ExpenseRequest.department),
            joinedload(ExpenseRequest.event),
        )
        .where(ExpenseRequest.id == request_id)
    )
    req = (await db.execute(stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề xuất chi")

    if req.status != ExpenseRequestStatus.REQUESTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đề xuất chi này đã được xử lý với trạng thái: '{req.status}'",
        )

    # Kiểm tra nguyên tắc tách bạch: tự duyệt đề xuất
    self_approved_special_log = False
    if req.requested_by_id == current_user.id:
        active_admin_count_stmt = select(func.count(User.id)).where(
            User.role == SystemRole.ADMIN,
            User.is_active == True,
            User.deleted_at.is_(None),
        )
        active_admin_count = (await db.execute(active_admin_count_stmt)).scalar_one()
        if active_admin_count > 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nguyên tắc tách bạch: Người tạo đề xuất không được tự duyệt đề xuất của chính mình khi hệ thống còn Quản trị viên khác",
            )
        else:
            self_approved_special_log = True

    now = datetime.now(timezone.utc)
    req.status = data.status
    req.reviewed_by_id = current_user.id
    req.reviewed_at = now
    req.review_note = data.review_note.strip() if data.review_note else None

    # Gửi thông báo cho người tạo đề xuất
    noti_type = NotificationType.EXPENSE_APPROVED if data.status == ExpenseRequestStatus.APPROVED else NotificationType.EXPENSE_REJECTED
    noti_title = f"Đề xuất chi '{req.title}' đã được duyệt" if data.status == ExpenseRequestStatus.APPROVED else f"Đề xuất chi '{req.title}' bị từ chối"
    noti_body = f"Đề xuất chi {req.amount_requested:,} VND của bạn đã được {current_user.full_name} xử lý: {data.status}."
    if req.review_note:
        noti_body += f" Ghi chú: {req.review_note}"

    await send_notification(
        db,
        user_id=req.requested_by_id,
        type=noti_type,
        title=noti_title,
        body=noti_body,
        link="/funds",
    )

    audit_action = "EXPENSE_REQUEST_APPROVED" if data.status == ExpenseRequestStatus.APPROVED else "EXPENSE_REQUEST_REJECTED"
    details_dict = {
        "title": req.title,
        "amount": req.amount_requested,
        "status": req.status,
        "note": req.review_note,
        "self_approved_warning": self_approved_special_log,
    }

    await record_audit_event(
        db,
        action=audit_action,
        actor=f"admin_id:{current_user.id}",
        target=f"expense_request_id:{req.id}",
        ip_address=client_ip,
        details=details_dict,
    )
    await db.commit()
    await db.refresh(req)

    return ExpenseRequestOut(
        id=req.id,
        title=req.title,
        description=req.description,
        amount_requested=req.amount_requested,
        department_id=req.department_id,
        department_name=req.department.name if req.department else None,
        event_id=req.event_id,
        event_title=req.event.title if req.event else None,
        requested_by_id=req.requested_by_id,
        requested_by_name=req.requested_by.full_name,
        status=req.status,
        reviewed_by_id=req.reviewed_by_id,
        reviewer_name=current_user.full_name,
        reviewed_at=req.reviewed_at,
        review_note=req.review_note,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


# ============================================================
# 2. GHI NHẬN THỰC CHI & THU KHÁC (LEDGER IN/OUT)
# ============================================================

@router.post("/expenses", response_model=LedgerEntryOut, summary="Ghi nhận chi thực tế")
async def record_actual_expense(
    data: RecordExpenseInput,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý quỹ ghi nhận khoản chi thực tế sau khi đề xuất đã được duyệt:
    - Bắt buộc kiểm tra số dư quỹ: Không cho chi làm âm quỹ.
    - Quy tắc 10%: Chi thực tế vượt số duyệt quá 10% bắt buộc phải tạo đề xuất mới hoặc duyệt lại.
    - Kèm ảnh hóa đơn/chứng từ (JPEG/PNG <= 2MB).
    - Đề xuất chi được chuyển sang trạng thái 'paid'.
    """
    client_ip = get_client_ip(request)

    req = await db.get(ExpenseRequest, data.expense_request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề xuất chi")

    if req.status != ExpenseRequestStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ được ghi nhận chi cho các đề xuất đã được Quản trị viên duyệt (Trạng thái hiện tại: {req.status})",
        )

    # Kiểm tra quy tắc 10%
    approved_limit = int(req.amount_requested * 1.10)
    if data.amount > approved_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Số tiền chi thực tế ({data.amount:,} VND) vượt quá 10% số tiền đã duyệt ({req.amount_requested:,} VND, trần cho phép: {approved_limit:,} VND). Yêu cầu duyệt lại đề xuất chi.",
        )

    # Kiểm tra số dư quỹ
    current_balance = await get_current_fund_balance(db)
    if current_balance - data.amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quỹ không đủ số dư để chi! Số dư hiện tại: {current_balance:,} VND, số tiền cần chi: {data.amount:,} VND.",
        )

    now = datetime.now(timezone.utc)
    occurred_time = data.occurred_at or now

    desc = (data.description or req.title).strip()
    if data.explanation_note:
        desc += f" (Giải trình: {data.explanation_note.strip()})"

    entry = LedgerEntry(
        type=LedgerType.EXPENSE,
        amount=data.amount,
        category=data.category,
        description=desc,
        occurred_at=occurred_time,
        event_id=req.event_id,
        department_id=req.department_id,
        expense_request_id=req.id,
        recorded_by_id=current_user.id,
        receipt_photo_path=data.receipt_photo_path,
    )
    db.add(entry)

    # Đánh dấu đề xuất chi đã thanh toán
    req.status = ExpenseRequestStatus.PAID

    await db.commit()
    await db.refresh(entry)

    await record_audit_event(
        db,
        action="EXPENSE_RECORDED",
        actor=f"user_id:{current_user.id}",
        target=f"ledger_entry_id:{entry.id}",
        ip_address=client_ip,
        details={
            "expense_request_id": req.id,
            "amount": entry.amount,
            "category": entry.category,
            "balance_after": current_balance - data.amount,
        },
    )
    await db.commit()

    stmt = (
        select(LedgerEntry)
        .options(
            joinedload(LedgerEntry.recorded_by),
            joinedload(LedgerEntry.voider),
            joinedload(LedgerEntry.event),
            joinedload(LedgerEntry.department),
        )
        .where(LedgerEntry.id == entry.id)
    )
    entry = (await db.execute(stmt)).scalar_one()
    return _format_ledger_out(entry)


@router.post("/income", response_model=LedgerEntryOut, summary="Ghi nhận khoản thu khác")
async def record_other_income(
    data: RecordOtherIncomeInput,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Người quản lý quỹ nhập tay các khoản thu khác (tài trợ, bán vé, hỗ trợ trường...)."""
    client_ip = get_client_ip(request)

    now = datetime.now(timezone.utc)
    entry = LedgerEntry(
        type=LedgerType.INCOME,
        amount=data.amount,
        category=data.category.strip(),
        description=data.description.strip(),
        occurred_at=data.occurred_at or now,
        event_id=data.event_id,
        recorded_by_id=current_user.id,
        receipt_photo_path=data.receipt_photo_path,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    await record_audit_event(
        db,
        action="INCOME_RECORDED",
        actor=f"user_id:{current_user.id}",
        target=f"ledger_entry_id:{entry.id}",
        ip_address=client_ip,
        details={"amount": entry.amount, "category": entry.category, "description": entry.description},
    )
    await db.commit()

    stmt = (
        select(LedgerEntry)
        .options(
            joinedload(LedgerEntry.recorded_by),
            joinedload(LedgerEntry.voider),
            joinedload(LedgerEntry.event),
            joinedload(LedgerEntry.department),
        )
        .where(LedgerEntry.id == entry.id)
    )
    entry = (await db.execute(stmt)).scalar_one()
    return _format_ledger_out(entry)


@router.post("/ledger/{entry_id}/void", response_model=LedgerEntryOut, summary="Hủy bút toán sổ quỹ")
async def void_ledger_entry(
    entry_id: int,
    data: LedgerEntryVoid,
    request: Request,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Hủy bút toán trong sổ quỹ (bất biến, không xóa, chỉ đánh dấu void)."""
    client_ip = get_client_ip(request)

    entry = await db.get(LedgerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bút toán sổ quỹ")

    if entry.is_voided:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bút toán này đã bị hủy trước đó")

    now = datetime.now(timezone.utc)
    entry.voided_at = now
    entry.voided_by_id = current_user.id
    entry.void_reason = data.void_reason.strip()

    await db.commit()
    await db.refresh(entry)

    await record_audit_event(
        db,
        action="LEDGER_ENTRY_VOIDED",
        actor=f"user_id:{current_user.id}",
        target=f"ledger_entry_id:{entry.id}",
        ip_address=client_ip,
        details={"amount": entry.amount, "type": entry.type, "reason": entry.void_reason},
    )
    await db.commit()

    stmt = (
        select(LedgerEntry)
        .options(
            joinedload(LedgerEntry.recorded_by),
            joinedload(LedgerEntry.voider),
            joinedload(LedgerEntry.event),
            joinedload(LedgerEntry.department),
        )
        .where(LedgerEntry.id == entry.id)
    )
    entry = (await db.execute(stmt)).scalar_one()
    return _format_ledger_out(entry)


@router.get("/ledger", response_model=PaginatedResponse[LedgerEntryOut], summary="Tra cứu sổ quỹ chi tiết")
async def list_ledger_entries(
    type_filter: Optional[str] = Query(None, alias="type"),
    category: Optional[str] = None,
    department_id: Optional[int] = None,
    event_id: Optional[int] = None,
    include_voided: bool = True,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Tra cứu chi tiết sổ quỹ (Người quản lý quỹ)."""
    conditions = []
    if type_filter:
        conditions.append(LedgerEntry.type == type_filter)
    if category:
        conditions.append(LedgerEntry.category == category)
    if department_id:
        conditions.append(LedgerEntry.department_id == department_id)
    if event_id:
        conditions.append(LedgerEntry.event_id == event_id)
    if not include_voided:
        conditions.append(LedgerEntry.voided_at.is_(None))

    count_stmt = select(func.count(LedgerEntry.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(LedgerEntry)
        .options(
            joinedload(LedgerEntry.recorded_by),
            joinedload(LedgerEntry.voider),
            joinedload(LedgerEntry.event),
            joinedload(LedgerEntry.department),
        )
        .where(*conditions)
        .order_by(LedgerEntry.occurred_at.desc(), LedgerEntry.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    entries = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse[LedgerEntryOut](
        items=[_format_ledger_out(e) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/ledger/export-csv", summary="Xuất file CSV sổ quỹ")
async def export_ledger_csv(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Xuất file CSV sổ quỹ theo khoảng thời gian."""
    conditions = [LedgerEntry.voided_at.is_(None)]
    if start_date:
        conditions.append(LedgerEntry.occurred_at >= start_date)
    if end_date:
        conditions.append(LedgerEntry.occurred_at <= end_date)

    stmt = (
        select(LedgerEntry)
        .options(
            joinedload(LedgerEntry.recorded_by),
            joinedload(LedgerEntry.event),
            joinedload(LedgerEntry.department),
        )
        .where(*conditions)
        .order_by(LedgerEntry.occurred_at.asc())
    )
    entries = (await db.execute(stmt)).scalars().all()

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow([
        "Mã bút toán",
        "Loại",
        "Hạng mục",
        "Số tiền (VND)",
        "Nội dung",
        "Thời điểm phát sinh",
        "Ban liên quan",
        "Sự kiện",
        "Người ghi nhận",
    ])

    for e in entries:
        writer.writerow([
            e.id,
            "Thu" if e.type == "income" else "Chi",
            e.category,
            e.amount,
            e.description,
            e.occurred_at.strftime("%d/%m/%Y %H:%M"),
            e.department.name if e.department else "",
            e.event.title if e.event else "",
            e.recorded_by.full_name if e.recorded_by else "",
        ])

    output.seek(0)
    filename = f"So_quy_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ============================================================
# 3. BÁO CÁO TÀI CHÍNH & TRANG CÔNG KHAI THÀNH VIÊN
# ============================================================

def build_period_summaries(entries: List[LedgerEntry]) -> Dict[str, List[Dict[str, Any]]]:
    """Tổng hợp thu/chi/dư lũy kế theo 4 chu kỳ thời gian: Tuần, Tháng, Kỳ học, Năm."""
    sorted_entries = sorted(entries, key=lambda e: e.occurred_at)

    weeks_dict: Dict[str, Dict[str, Any]] = {}
    months_dict: Dict[str, Dict[str, Any]] = {}
    semesters_dict: Dict[str, Dict[str, Any]] = {}
    years_dict: Dict[str, Dict[str, Any]] = {}

    for e in sorted_entries:
        dt = e.occurred_at
        amt = e.amount
        is_inc = (e.type == LedgerType.INCOME)

        # 1. TUẦN (ISO Week)
        iso_year, iso_week, _ = dt.isocalendar()
        w_key = f"{iso_year}-W{iso_week:02d}"
        if w_key not in weeks_dict:
            weeks_dict[w_key] = {
                "period_key": w_key,
                "label": f"Tuần {iso_week} ({dt.strftime('%m/%Y')})",
                "income": 0,
                "expense": 0,
                "sort_key": w_key,
            }
        if is_inc:
            weeks_dict[w_key]["income"] += amt
        else:
            weeks_dict[w_key]["expense"] += amt

        # 2. THÁNG (Month)
        m_key = dt.strftime("%Y-%m")
        if m_key not in months_dict:
            months_dict[m_key] = {
                "period_key": m_key,
                "label": f"Tháng {dt.strftime('%m/%Y')}",
                "income": 0,
                "expense": 0,
                "sort_key": m_key,
            }
        if is_inc:
            months_dict[m_key]["income"] += amt
        else:
            months_dict[m_key]["expense"] += amt

        # 3. KỲ HỌC (Semester: HK1: 9-1, HK2: 2-6, HK Hè: 7-8)
        month = dt.month
        year = dt.year
        if month >= 9:
            acad_year = f"{year}-{year + 1}"
            sem_name = "HK1"
            sem_sort = f"{year}-1"
        elif month == 1:
            acad_year = f"{year - 1}-{year}"
            sem_name = "HK1"
            sem_sort = f"{year - 1}-1"
        elif 2 <= month <= 6:
            acad_year = f"{year - 1}-{year}"
            sem_name = "HK2"
            sem_sort = f"{year - 1}-2"
        else:
            acad_year = f"{year - 1}-{year}"
            sem_name = "HK Hè"
            sem_sort = f"{year - 1}-3"

        s_key = f"{acad_year}_{sem_name}"
        if s_key not in semesters_dict:
            semesters_dict[s_key] = {
                "period_key": s_key,
                "label": f"{sem_name} ({acad_year})",
                "income": 0,
                "expense": 0,
                "sort_key": sem_sort,
            }
        if is_inc:
            semesters_dict[s_key]["income"] += amt
        else:
            semesters_dict[s_key]["expense"] += amt

        # 4. NĂM (Year)
        y_key = str(year)
        if y_key not in years_dict:
            years_dict[y_key] = {
                "period_key": y_key,
                "label": f"Năm {year}",
                "income": 0,
                "expense": 0,
                "sort_key": y_key,
            }
        if is_inc:
            years_dict[y_key]["income"] += amt
        else:
            years_dict[y_key]["expense"] += amt

    def finalize(groups_dict: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        items = sorted(groups_dict.values(), key=lambda x: x["sort_key"])
        running = 0
        res = []
        for it in items:
            net = it["income"] - it["expense"]
            running += net
            res.append({
                "period_key": it["period_key"],
                "label": it["label"],
                "income": it["income"],
                "expense": it["expense"],
                "net": net,
                "running_balance": running,
                "month": it["period_key"],
            })
        return res

    return {
        "weekly_summary": finalize(weeks_dict),
        "monthly_summary": finalize(months_dict),
        "semester_summary": finalize(semesters_dict),
        "yearly_summary": finalize(years_dict),
    }


@router.get("/report", response_model=FundReportOut, summary="Báo cáo tài chính tổng hợp")
async def get_fund_report(
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Báo cáo tài chính chi tiết:
    - Số dư hiện tại, tổng thu, tổng chi.
    - Thu/chi/dư lũy kế theo tuần, theo tháng, theo kỳ học, theo năm.
    - Thu/chi theo hạng mục, theo sự kiện, theo ban, và tiến độ các kỳ thu hội phí.
    """
    balance = await get_current_fund_balance(db)

    # Lấy các bút toán hợp lệ
    stmt = (
        select(LedgerEntry)
        .options(joinedload(LedgerEntry.department), joinedload(LedgerEntry.event))
        .where(LedgerEntry.voided_at.is_(None))
    )
    entries = (await db.execute(stmt)).scalars().all()

    total_income = sum(e.amount for e in entries if e.type == LedgerType.INCOME)
    total_expense = sum(e.amount for e in entries if e.type == LedgerType.EXPENSE)

    # 4 chu kỳ thời gian (Tuần, Tháng, Kỳ học, Năm)
    period_summaries = build_period_summaries(entries)

    # Thống kê theo hạng mục
    cat_dict: Dict[str, Dict[str, int]] = {}
    for e in entries:
        cat = e.category
        if cat not in cat_dict:
            cat_dict[cat] = {"income": 0, "expense": 0}
        if e.type == LedgerType.INCOME:
            cat_dict[cat]["income"] += e.amount
        else:
            cat_dict[cat]["expense"] += e.amount

    category_summary = [
        {"category": k, "income": v["income"], "expense": v["expense"], "total": v["income"] + v["expense"]}
        for k, v in sorted(cat_dict.items())
    ]

    # Thống kê theo sự kiện
    ev_dict: Dict[str, Dict[str, int]] = {}
    for e in entries:
        if e.event:
            ev_title = e.event.title
            if ev_title not in ev_dict:
                ev_dict[ev_title] = {"income": 0, "expense": 0}
            if e.type == LedgerType.INCOME:
                ev_dict[ev_title]["income"] += e.amount
            else:
                ev_dict[ev_title]["expense"] += e.amount

    event_summary = [
        {"event": k, "income": v["income"], "expense": v["expense"]}
        for k, v in sorted(ev_dict.items())
    ]

    # Thống kê theo ban
    dept_dict: Dict[str, Dict[str, int]] = {}
    for e in entries:
        if e.department:
            d_name = e.department.name
            if d_name not in dept_dict:
                dept_dict[d_name] = {"income": 0, "expense": 0}
            if e.type == LedgerType.INCOME:
                dept_dict[d_name]["income"] += e.amount
            else:
                dept_dict[d_name]["expense"] += e.amount

    department_summary = [
        {"department": k, "income": v["income"], "expense": v["expense"]}
        for k, v in sorted(dept_dict.items())
    ]

    # Báo cáo các kỳ hội phí
    periods_stmt = (
        select(FeePeriod)
        .options(selectinload(FeePeriod.member_fees))
        .order_by(FeePeriod.created_at.desc())
    )
    fee_periods_res = (await db.execute(periods_stmt)).scalars().all()
    fee_periods_data = []
    for fp in fee_periods_res:
        t_exp = sum(mf.net_amount_due for mf in fp.member_fees)
        t_col = sum(mf.total_paid for mf in fp.member_fees)
        rate = round((t_col / t_exp * 100), 1) if t_exp > 0 else 100.0
        fee_periods_data.append({
            "period_id": fp.id,
            "period_name": fp.name,
            "total_expected": t_exp,
            "total_collected": t_col,
            "total_debt": max(0, t_exp - t_col),
            "collection_rate_percent": rate,
        })

    return FundReportOut(
        current_balance=balance,
        total_income=total_income,
        total_expense=total_expense,
        weekly_summary=period_summaries["weekly_summary"],
        monthly_summary=period_summaries["monthly_summary"],
        semester_summary=period_summaries["semester_summary"],
        yearly_summary=period_summaries["yearly_summary"],
        category_summary=category_summary,
        event_summary=event_summary,
        department_summary=department_summary,
        fee_periods=fee_periods_data,
    )



@router.get("/period-report/{period_id}", response_model=FeePeriodReportOut, summary="Báo cáo tiến độ kỳ thu hội phí")
async def get_fee_period_report(
    period_id: int,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    """Báo cáo chi tiết từng kỳ thu hội phí (phải thu, đã thu, còn nợ, tỷ lệ thu, số lượng trạng thái)."""
    period = await db.get(FeePeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy kỳ thu hội phí")

    stmt = (
        select(MemberFee)
        .options(selectinload(MemberFee.payments))
        .where(MemberFee.period_id == period_id)
    )
    member_fees = (await db.execute(stmt)).scalars().all()

    total_m = len(member_fees)
    total_exp = sum(mf.net_amount_due for mf in member_fees)
    total_col = sum(mf.total_paid for mf in member_fees)
    total_rem = max(0, total_exp - total_col)
    rate = round((total_col / total_exp * 100), 1) if total_exp > 0 else 100.0

    counts = {"paid": 0, "partial": 0, "unpaid": 0, "waived": 0}
    for mf in member_fees:
        st = mf.calculated_status
        counts[st] = counts.get(st, 0) + 1

    return FeePeriodReportOut(
        period_id=period.id,
        period_name=period.name,
        amount_per_member=period.amount,
        total_members=total_m,
        total_expected=total_exp,
        total_collected=total_col,
        total_remaining=total_rem,
        collection_rate_percent=rate,
        paid_count=counts["paid"],
        partial_count=counts["partial"],
        unpaid_count=counts["unpaid"],
        waived_count=counts["waived"],
    )


@router.get("/overview", response_model=FinanceOverviewOut, summary="Trang Tài chính CLB (Minh bạch cho thành viên)")
async def get_finance_overview_for_members(
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Trang minh bạch tài chính cho mọi thành viên CLB:
    - Hiển thị tổng thu, tổng chi, số dư và các khoản chi theo hạng mục.
    - KHÔNG lộ thông tin cá nhân của người đóng / chưa đóng.
    - Admin có thể tắt tính năng này bằng cài đặt hệ thống.
    """
    is_finance_mgr = current_user.role == SystemRole.ADMIN or current_user.is_treasurer
    if not settings.SHOW_FINANCE_TO_MEMBERS and not is_finance_mgr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tính năng công khai tài chính cho thành viên đang tạm thời bị khóa bởi Quản trị viên",
        )

    balance = await get_current_fund_balance(db)

    stmt = (
        select(LedgerEntry)
        .where(LedgerEntry.voided_at.is_(None))
        .order_by(LedgerEntry.occurred_at.desc())
    )
    entries = (await db.execute(stmt)).scalars().all()

    total_income = sum(e.amount for e in entries if e.type == LedgerType.INCOME)
    total_expense = sum(e.amount for e in entries if e.type == LedgerType.EXPENSE)

    # Phân nhóm theo hạng mục
    cat_dict: Dict[str, int] = {}
    for e in entries:
        if e.type == LedgerType.EXPENSE:
            cat_dict[e.category] = cat_dict.get(e.category, 0) + e.amount

    by_category = [{"category": k, "amount": v} for k, v in cat_dict.items()]

    # 4 chu kỳ thời gian (Tuần, Tháng, Kỳ học, Năm)
    period_summaries = build_period_summaries(entries)

    recent_entries = [
        {
            "id": e.id,
            "type": e.type,
            "category": e.category,
            "description": e.description,
            "amount": e.amount,
            "occurred_at": e.occurred_at.isoformat(),
        }
        for e in entries[:20]
    ]

    return FinanceOverviewOut(
        fund_balance=balance,
        current_balance=balance,
        total_income=total_income,
        total_expense=total_expense,
        by_category=by_category,
        weekly_summary=period_summaries["weekly_summary"],
        monthly_summary=period_summaries["monthly_summary"],
        semester_summary=period_summaries["semester_summary"],
        yearly_summary=period_summaries["yearly_summary"],
        recent_entries=recent_entries,
    )



# ============================================================
# 4. QUẢN LÝ LƯU TRỮ VÀ XEM ẢNH CHỨNG TỪ (RECEIPT PHOTOS)
# ============================================================

@router.post("/upload-receipt", summary="Tải lên ảnh chứng từ / hóa đơn")
async def upload_receipt_image(
    file: UploadFile = File(..., description="Ảnh chứng từ hóa đơn (JPEG/PNG <= 2MB)"),
    current_user: User = Depends(require_any_authenticated),
):
    """Tải lên tệp ảnh chứng từ/biên lai/hóa đơn an toàn."""
    content = await file.read()
    filename = save_receipt_photo(content)
    return {"filename": filename, "message": "Tải lên ảnh chứng từ thành công"}


@router.get("/receipt-photos/{filename}", summary="Xem ảnh chứng từ / biên lai tài chính")
async def get_receipt_photo(
    filename: str,
    request: Request,
    current_user: User = Depends(require_any_authenticated),
    db: AsyncSession = Depends(get_db),
):
    """Truy cập và xem tệp ảnh chứng từ / biên lai:
    - Người quản lý quỹ và Quản trị viên: Được xem mọi ảnh chứng từ.
    - Thành viên: Được xem ảnh của claim do chính mình gửi.
    - Ghi nhận nhật ký kiểm toán cho hành vi xem ảnh biên lai.
    """
    client_ip = get_client_ip(request)

    is_finance_mgr = current_user.role == SystemRole.ADMIN or current_user.is_treasurer
    if not is_finance_mgr:
        # Kiểm tra xem có phải ảnh của claim do chính user này gửi
        claim_stmt = (
            select(PaymentClaim)
            .join(PaymentClaim.member_fee)
            .where(
                PaymentClaim.proof_photo_path == filename,
                MemberFee.user_id == current_user.id,
            )
        )
        user_claim = (await db.execute(claim_stmt)).scalar_one_or_none()
        if not user_claim:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền xem ảnh chứng từ này",
            )

    file_path = get_receipt_photo_absolute_path(filename)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp ảnh chứng từ")

    # Ghi nhật ký kiểm toán xem ảnh biên lai (không lưu nội dung ảnh)
    await record_audit_event(
        db,
        action="RECEIPT_PHOTO_VIEWED",
        actor=f"user_id:{current_user.id}",
        target=f"filename:{filename}",
        ip_address=client_ip,
        details={"filename": filename},
    )
    await db.commit()

    media_type = "image/png" if file_path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(file_path, media_type=media_type)
