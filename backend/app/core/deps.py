from typing import Any, Callable, List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import SystemRole, User

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
) -> User:
    """Dependency trung tâm xác thực người dùng từ JWT.
    Kiểm tra tính hợp lệ của token, tài khoản tồn tại, chưa bị xóa mềm và đang hoạt động.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Thông tin xác thực không hợp lệ hoặc đã hết hạn",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    try:
        payload = decode_token(token)
        user_id: Optional[str] = payload.get("sub")
        token_type: Optional[str] = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    # Lấy thông tin user từ CSDL cùng quan hệ phòng ban
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(User).options(joinedload(User.department)).where(User.id == int(user_id))
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    # Kiểm tra xóa mềm
    if user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản đã bị xóa khỏi hệ thống",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Kiểm tra trạng thái khóa tài khoản
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản đã bị vô hiệu hóa hoặc khóa",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_roles(*allowed_roles: str) -> Callable:
    """Dependency factory dùng chung để kiểm tra phân quyền RBAC.
    Các giai đoạn sau nếu bổ sung role (ví dụ trưởng ban) chỉ cần truyền thêm vào danh sách allowed_roles.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thực hiện hành động này",
            )
        return current_user

    return role_checker


# Shortcuts thông dụng cho endpoint
require_admin = require_roles(SystemRole.ADMIN)
require_department_head = require_roles(SystemRole.ADMIN, SystemRole.DEPARTMENT_HEAD)
require_any_authenticated = require_roles(
    SystemRole.ADMIN, SystemRole.DEPARTMENT_HEAD, SystemRole.MEMBER
)


def require_finance_manager(current_user: User = Depends(get_current_user)) -> User:
    """Dependency trung tâm dùng chung cho mọi endpoint quản lý tài chính:
    - Quyền tài chính = Admin HOẶC có cờ is_treasurer (thủ quỹ).
    - Cờ được đọc trực tiếp từ CSDL mỗi request qua get_current_user.
    - Tài khoản bị khóa/xóa tự động bị chặn 401.
    - Thủ quỹ bị gỡ cờ thì lập tức mất quyền 403.
    """
    if current_user.role == SystemRole.ADMIN or current_user.is_treasurer:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền quản lý tài chính CLB",
    )


def ensure_same_department(current_user: User, target_user: User) -> None:
    """Hàm kiểm tra phân quyền phạm vi ban dùng chung (tái sử dụng cho giai đoạn sau):
    - Admin: Toàn quyền truy cập mọi thành viên.
    - Trưởng ban (DEPARTMENT_HEAD): Chỉ được phép xem/thao tác với thành viên trong ban của mình.
      (Nếu truy cập thành viên ngoài ban -> trả về 403 Forbidden).
    - Thành viên thông thường (MEMBER): Chỉ được phép truy cập hồ sơ của chính mình.
    """
    if current_user.role == SystemRole.ADMIN:
        return

    if current_user.role == SystemRole.DEPARTMENT_HEAD:
        if (
            current_user.department_id is not None
            and target_user.department_id == current_user.department_id
        ):
            return
        if current_user.id == target_user.id:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập thông tin của thành viên ngoài ban",
        )

    # Thành viên thông thường
    if current_user.id == target_user.id:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền xem thông tin của thành viên khác",
    )


def ensure_department_access(current_user: User, department_id: int) -> None:
    """Hàm kiểm tra quyền thao tác trên một ban cụ thể (dùng chung cho các giai đoạn sau):
    - Admin: Toàn quyền với mọi ban.
    - Trưởng ban (DEPARTMENT_HEAD): Chỉ được thao tác với ban của mình.
    - Thành viên khác: 403 Forbidden.
    """
    if current_user.role == SystemRole.ADMIN:
        return

    if (
        current_user.role == SystemRole.DEPARTMENT_HEAD
        and current_user.department_id == department_id
    ):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền truy cập dữ liệu ban này",
    )


def ensure_event_manage_access(current_user: User, event: Any) -> None:
    """Hàm dùng chung kiểm tra người dùng có quyền quản lý sự kiện này hay không:
    - Admin: Toàn quyền quản lý mọi sự kiện (toàn CLB và của mọi ban).
    - Trưởng ban (DEPARTMENT_HEAD): Chỉ được quản lý sự kiện thuộc ban của chính mình.
      Không được quản lý sự kiện toàn CLB (department_id is None) hoặc ban khác.
    - Thành viên / người dùng khác: 403 Forbidden.
    """
    if current_user.role == SystemRole.ADMIN:
        return

    if current_user.role == SystemRole.DEPARTMENT_HEAD:
        if (
            event.department_id is not None
            and current_user.department_id is not None
            and event.department_id == current_user.department_id
        ):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền quản lý sự kiện này",
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền quản lý sự kiện này",
    )


async def check_not_last_admin(db: AsyncSession, target_user: User) -> None:
    """Kiểm tra quy tắc nghiệp vụ: Hệ thống luôn phải duy trì ít nhất 1 admin đang hoạt động.
    Không cho phép khóa, xóa hoặc hạ quyền admin cuối cùng.
    """
    if target_user.role == SystemRole.ADMIN and target_user.is_active and target_user.deleted_at is None:
        stmt = (
            select(func.count(User.id))
            .where(User.role == SystemRole.ADMIN)
            .where(User.is_active.is_(True))
            .where(User.deleted_at.is_(None))
        )
        result = await db.execute(stmt)
        active_admin_count = result.scalar_one()

        if active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể thực hiện hành động này với Quản trị viên đang hoạt động cuối cùng của hệ thống",
            )
