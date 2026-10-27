from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
async def test_login_success(async_client: AsyncClient, seed_admin: User):
    """Đăng nhập thành công với thông tin chính xác."""
    response = await async_client.post(
        "/api/auth/login",
        json={"email": "admin.test@clb.edu.vn", "password": "AdminPassword123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "admin.test@clb.edu.vn"
    assert data["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password_generic_error(async_client: AsyncClient, seed_admin: User):
    """Đăng nhập sai mật khẩu trả về lỗi chung, không tiết lộ mật khẩu."""
    response = await async_client.post(
        "/api/auth/login",
        json={"email": "admin.test@clb.edu.vn", "password": "WrongPassword999"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Email hoặc mật khẩu không đúng"


@pytest.mark.asyncio
async def test_login_nonexistent_email_generic_error(async_client: AsyncClient):
    """Email không tồn tại trả về thông báo lỗi giống hệt khi sai mật khẩu."""
    response = await async_client.post(
        "/api/auth/login",
        json={"email": "nonexistent@clb.edu.vn", "password": "AnyPassword123"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Email hoặc mật khẩu không đúng"


@pytest.mark.asyncio
async def test_login_rate_limiting(async_client: AsyncClient, seed_admin: User):
    """Sau 5 lần đăng nhập sai, lần thứ 6 bị khóa tạm thời với mã HTTP 429."""
    for i in range(5):
        res = await async_client.post(
            "/api/auth/login",
            json={"email": "admin.test@clb.edu.vn", "password": f"Wrong_{i}"},
        )
        assert res.status_code == 401

    # Lần thứ 6 sẽ bị chặn bởi rate limiter
    blocked_res = await async_client.post(
        "/api/auth/login",
        json={"email": "admin.test@clb.edu.vn", "password": "AdminPassword123"},
    )
    assert blocked_res.status_code == 429
    assert "tạm thời bị khóa" in blocked_res.json()["detail"]


@pytest.mark.asyncio
async def test_login_locked_account(async_client: AsyncClient, seed_member: User):
    """Tài khoản bị khóa (is_active=False) không thể đăng nhập."""
    from tests.conftest import TestingSessionLocal
    async with TestingSessionLocal() as session:
        member = await session.get(User, seed_member.id)
        member.is_active = False
        await session.commit()

    response = await async_client.post(
        "/api/auth/login",
        json={"email": "member.test@clb.edu.vn", "password": "MemberPassword123"},
    )
    assert response.status_code == 401
    assert "khóa" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_soft_deleted_account(async_client: AsyncClient, seed_member: User):
    """Tài khoản đã bị xóa mềm không thể đăng nhập."""
    from tests.conftest import TestingSessionLocal
    async with TestingSessionLocal() as session:
        member = await session.get(User, seed_member.id)
        member.deleted_at = datetime.now(timezone.utc)
        await session.commit()

    response = await async_client.post(
        "/api/auth/login",
        json={"email": "member.test@clb.edu.vn", "password": "MemberPassword123"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_success(async_client: AsyncClient, member_headers: dict, seed_member: User):
    """Xem thông tin bản thân từ token."""
    response = await async_client.get("/api/auth/me", headers=member_headers)
    assert response.status_code == 200
    assert response.json()["email"] == seed_member.email
    assert response.json()["student_id"] == seed_member.student_id


@pytest.mark.asyncio
async def test_get_me_unauthorized(async_client: AsyncClient):
    """Khách không có token bị từ chối truy cập 401."""
    response = await async_client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_invalid_token(async_client: AsyncClient):
    """Token giả mạo hoặc hết hạn bị từ chối truy cập 401."""
    response = await async_client.get("/api/auth/me", headers={"Authorization": "Bearer fake.invalid.token"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_change_password_success(async_client: AsyncClient, member_headers: dict, seed_member: User):
    """Đổi mật khẩu thành công và có thể đăng nhập bằng mật khẩu mới."""
    change_res = await async_client.post(
        "/api/auth/change-password",
        headers=member_headers,
        json={"old_password": "MemberPassword123", "new_password": "NewMemberPass456"},
    )
    assert change_res.status_code == 200

    # Đăng nhập bằng mật khẩu mới
    login_res = await async_client.post(
        "/api/auth/login",
        json={"email": seed_member.email, "password": "NewMemberPass456"},
    )
    assert login_res.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_old(async_client: AsyncClient, member_headers: dict):
    """Nhập sai mật khẩu cũ trả về lỗi 400."""
    response = await async_client.post(
        "/api/auth/change-password",
        headers=member_headers,
        json={"old_password": "IncorrectOldPass", "new_password": "NewMemberPass456"},
    )
    assert response.status_code == 400
    assert "Mật khẩu hiện tại không chính xác" in response.json()["detail"]


@pytest.mark.asyncio
async def test_change_password_too_short(async_client: AsyncClient, member_headers: dict):
    """Mật khẩu mới ngắn hơn 8 ký tự bị chặn bởi validation 422."""
    response = await async_client.post(
        "/api/auth/change-password",
        headers=member_headers,
        json={"old_password": "MemberPassword123", "new_password": "short"},
    )
    assert response.status_code == 422
