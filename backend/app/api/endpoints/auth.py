from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit, record_audit_event
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limiter import login_limiter
from app.core.security import (
    create_access_token,
    dummy_verify_password,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, TokenResponse
from app.schemas.user import UserResponse

router = APIRouter()


def get_client_ip(request: Request) -> str:
    """Lấy IP thực tế của client, ưu tiên header X-Forwarded-For khi qua proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse, summary="Đăng nhập hệ thống")
async def login(
    login_data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Đăng nhập bằng Email và Mật khẩu.
    - Giới hạn tối đa 5 lần thử sai trong 15 phút theo email và IP.
    - Thông báo lỗi chung 'Email hoặc mật khẩu không đúng' và chống timing attacks.
    - Ghi audit log khi đăng nhập thất bại / thành công.
    """
    client_ip = get_client_ip(request)
    email_clean = login_data.email.strip().lower()

    # 1. Kiểm tra rate limit chống brute-force
    login_limiter.check_rate_limit(email_clean, client_ip)

    # 2. Tìm kiếm user
    stmt = select(User).where(User.email == email_clean)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # 3. User không tồn tại -> thực thi dummy verify để cùng thời gian và ghi nhận lỗi
    if user is None:
        dummy_verify_password(login_data.password)
        attempts = login_limiter.record_failed_attempt(email_clean, client_ip)
        await record_audit_event(
            db,
            action="LOGIN_FAILED",
            actor=f"guest:{email_clean}",
            ip_address=client_ip,
            details={"reason": "user_not_found_or_bad_password", "failed_attempts": attempts},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
        )

    # 4. Mật khẩu không đúng
    if not verify_password(login_data.password, user.password_hash):
        attempts = login_limiter.record_failed_attempt(email_clean, client_ip)
        await record_audit_event(
            db,
            action="LOGIN_FAILED",
            actor=f"user_id:{user.id}",
            ip_address=client_ip,
            details={"email": email_clean, "reason": "incorrect_password", "failed_attempts": attempts},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
        )

    # 5. Kiểm tra tài khoản bị xóa mềm hoặc khóa
    if user.deleted_at is not None or not user.is_active:
        await record_audit_event(
            db,
            action="LOGIN_FAILED_BLOCKED",
            actor=f"user_id:{user.id}",
            ip_address=client_ip,
            details={"email": email_clean, "is_active": user.is_active, "is_deleted": user.deleted_at is not None},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản đã bị khóa hoặc không còn hoạt động trong hệ thống",
        )

    # 6. Đăng nhập thành công -> xóa bộ đếm thất bại và ghi log
    login_limiter.record_success(email_clean, client_ip)
    await record_audit_event(
        db,
        action="LOGIN_SUCCESS",
        actor=f"user_id:{user.id}",
        ip_address=client_ip,
        details={"email": user.email, "role": user.role},
    )
    await db.commit()

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        subject=user.id,
        role=user.role,
        expires_delta=access_token_expires,
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse, summary="Xem thông tin bản thân")
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """Lấy thông tin tài khoản hiện tại từ JWT access token."""
    return current_user


@router.post("/change-password", summary="Đổi mật khẩu tài khoản")
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Đổi mật khẩu cho người dùng hiện tại."""
    client_ip = get_client_ip(request)

    if not verify_password(data.old_password, current_user.password_hash):
        log_audit(
            action="PASSWORD_CHANGE_FAILED",
            actor=f"user_id:{current_user.id}",
            ip_address=client_ip,
            details={"reason": "old_password_incorrect"},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không chính xác",
        )

    if data.old_password == data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được trùng với mật khẩu cũ",
        )

    current_user.password_hash = hash_password(data.new_password)
    await record_audit_event(
        db,
        action="PASSWORD_CHANGED",
        actor=f"user_id:{current_user.id}",
        ip_address=client_ip,
    )
    await db.commit()
    await db.refresh(current_user)

    return {"message": "Đổi mật khẩu thành công"}
