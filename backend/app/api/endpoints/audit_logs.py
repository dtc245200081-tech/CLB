from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogResponse
from app.schemas.common import PaginatedResponse

router = APIRouter()


@router.get("", response_model=PaginatedResponse[AuditLogResponse], summary="Xem nhật ký hoạt động (Admin)")
async def list_audit_logs(
    action: Optional[str] = Query(None, description="Lọc theo hành động"),
    actor: Optional[str] = Query(None, description="Lọc theo người thực hiện"),
    q: Optional[str] = Query(None, description="Tìm kiếm trong actor, target hoặc details"),
    page: int = Query(1, ge=1, description="Số trang (từ 1)"),
    page_size: int = Query(20, ge=1, le=100, description="Số lượng mục trên trang"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin xem danh sách nhật ký hoạt động của hệ thống có phân trang và bộ lọc."""
    query = select(AuditLog)

    if action:
        query = query.where(AuditLog.action == action.strip())

    if actor:
        query = query.where(AuditLog.actor.ilike(f"%{actor.strip()}%"))

    if q:
        kw = f"%{q.strip()}%"
        query = query.where(
            (AuditLog.action.ilike(kw))
            | (AuditLog.actor.ilike(kw))
            | (AuditLog.target.ilike(kw))
            | (AuditLog.details.ilike(kw))
        )

    # Đếm tổng
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    # Sắp xếp mới nhất trước
    offset = (page - 1) * page_size
    items_query = query.order_by(AuditLog.id.desc()).offset(offset).limit(page_size)
    items = (await db.execute(items_query)).scalars().all()

    return PaginatedResponse(
        items=[AuditLogResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.delete("/cleanup", summary="Dọn dẹp nhật ký cũ hơn số ngày quy định (Admin)")
async def cleanup_audit_logs(
    days: int = Query(7, ge=1, description="Số ngày lưu giữ (mặc định xóa log cũ hơn 7 ngày)"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin xóa các bản ghi nhật ký hoạt động cũ hơn số ngày quy định (mặc định 7 ngày)."""
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = delete(AuditLog).where(AuditLog.created_at < cutoff_date)
    result = await db.execute(stmt)
    deleted_count = result.rowcount or 0
    await db.commit()
    return {
        "message": f"Đã dọn dẹp thành công {deleted_count} bản ghi nhật ký cũ hơn {days} ngày.",
        "deleted_count": deleted_count,
        "days": days,
    }


@router.delete("/{log_id}", summary="Xóa một bản ghi nhật ký hoạt động (Admin)")
async def delete_audit_log(
    log_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin xóa một bản ghi nhật ký hoạt động theo ID."""
    log_item = await db.get(AuditLog, log_id)
    if not log_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bản ghi nhật ký cần xóa.",
        )
    await db.delete(log_item)
    await db.commit()
    return {"message": "Đã xóa bản ghi nhật ký thành công."}
