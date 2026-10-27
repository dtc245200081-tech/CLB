import pytest
from httpx import AsyncClient

from app.models.user import User


@pytest.mark.asyncio
async def test_member_forbidden_from_audit_logs(
    async_client: AsyncClient, member_headers: dict
):
    """Thành viên thông thường không có quyền xem nhật ký hoạt động (403 Forbidden)."""
    response = await async_client.get("/api/audit-logs", headers=member_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_view_and_filter_audit_logs(
    async_client: AsyncClient, admin_headers: dict, seed_member: User
):
    """Admin xem nhật ký hệ thống và có thể tìm kiếm."""
    # Thực hiện 1 hành động tạo audit log: Admin khóa tài khoản thành viên
    lock_res = await async_client.patch(
        f"/api/users/{seed_member.id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert lock_res.status_code == 200

    # Admin đọc danh sách audit logs
    logs_res = await async_client.get("/api/audit-logs?page=1&page_size=20", headers=admin_headers)
    assert logs_res.status_code == 200
    data = logs_res.json()
    assert data["total"] >= 1
    assert any(log["action"] == "USER_LOCKED" for log in data["items"])


@pytest.mark.asyncio
async def test_admin_reset_member_password_temporary(
    async_client: AsyncClient, admin_headers: dict, seed_member: User
):
    """Admin đặt lại mật khẩu tạm thời cho thành viên và thành viên đăng nhập được bằng mật khẩu đó."""
    reset_res = await async_client.post(
        f"/api/users/{seed_member.id}/reset-password",
        headers=admin_headers,
    )
    assert reset_res.status_code == 200
    data = reset_res.json()
    assert "temporary_password" in data
    temp_pass = data["temporary_password"]
    assert len(temp_pass) >= 10

    # Thành viên đăng nhập bằng mật khẩu tạm thời vừa cấp
    login_res = await async_client.post(
        "/api/auth/login",
        json={"email": seed_member.email, "password": temp_pass},
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()
