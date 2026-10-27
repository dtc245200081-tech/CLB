import pytest
from httpx import AsyncClient

from app.models.user import SystemRole, User


@pytest.mark.asyncio
async def test_member_forbidden_from_admin_user_list(async_client: AsyncClient, member_headers: dict):
    """Thành viên thông thường không được phép xem danh sách thành viên (403 Forbidden)."""
    response = await async_client.get("/api/users", headers=member_headers)
    assert response.status_code == 403
    assert "không có quyền" in response.json()["detail"]


@pytest.mark.asyncio
async def test_guest_forbidden_from_users(async_client: AsyncClient):
    """Khách chưa đăng nhập không thể truy cập /api/users (401 Unauthorized)."""
    response = await async_client.get("/api/users")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_can_list_users_with_search_and_pagination(
    async_client: AsyncClient, admin_headers: dict, seed_admin: User, seed_member: User
):
    """Admin xem danh sách thành viên có phân trang và tìm kiếm."""
    response = await async_client.get("/api/users?page=1&page_size=10", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2
    assert data["page"] == 1
    assert data["page_size"] == 10

    # Tìm kiếm theo tên
    search_res = await async_client.get("/api/users?q=Thành+Viên", headers=admin_headers)
    assert search_res.status_code == 200
    assert search_res.json()["total"] == 1
    assert search_res.json()["items"][0]["email"] == seed_member.email


@pytest.mark.asyncio
async def test_member_can_update_own_contact_info(
    async_client: AsyncClient, member_headers: dict, seed_member: User
):
    """Thành viên tự cập nhật thông tin liên hệ của mình."""
    payload = {
        "full_name": "Trần Thị Cẩm Tú",
        "phone": "0912334455",
        "faculty": "Luật",
        "class_name": "K62-Luật",
    }
    response = await async_client.patch("/api/users/me", headers=member_headers, json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "Trần Thị Cẩm Tú"
    assert data["phone"] == "0912334455"
    assert data["faculty"] == "Luật"
    assert data["class_name"] == "K62-Luật"
    # Vai trò và email vẫn giữ nguyên không đổi
    assert data["role"] == SystemRole.MEMBER
    assert data["email"] == seed_member.email


@pytest.mark.asyncio
async def test_member_cannot_read_other_user_profile(
    async_client: AsyncClient, member_headers: dict, seed_admin: User
):
    """Thành viên không được phép đọc hồ sơ của người khác (403 Forbidden)."""
    response = await async_client.get(f"/api/users/{seed_admin.id}", headers=member_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_member_cannot_elevate_role_via_self_update(
    async_client: AsyncClient, member_headers: dict
):
    """Thành viên không thể tự nâng quyền thành admin qua /users/me."""
    response = await async_client.patch(
        "/api/users/me",
        headers=member_headers,
        json={"role": "admin", "title": "Chủ tịch"},
    )
    assert response.status_code == 200
    # Role vẫn là member
    assert response.json()["role"] == SystemRole.MEMBER


@pytest.mark.asyncio
async def test_admin_create_member_success(async_client: AsyncClient, admin_headers: dict):
    """Admin thêm thành viên mới thành công."""
    payload = {
        "email": "new.member@clb.edu.vn",
        "student_id": "SV2024888",
        "full_name": "Lê Văn Mới",
        "phone": "0933221100",
        "faculty": "Cơ khí",
        "class_name": "K60-CK",
        "title": "Cộng tác viên",
        "role": "member",
        "password": "InitialPassword123",
    }
    response = await async_client.post("/api/users", headers=admin_headers, json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new.member@clb.edu.vn"
    assert data["student_id"] == "SV2024888"
    assert "password_hash" not in data  # Tuyệt đối không trả password hash


@pytest.mark.asyncio
async def test_admin_create_member_duplicate_email_or_mssv(
    async_client: AsyncClient, admin_headers: dict, seed_member: User
):
    """Không cho phép thêm thành viên bị trùng Email hoặc MSSV."""
    # Trùng email
    dup_email = {
        "email": seed_member.email,
        "student_id": "SV999999",
        "full_name": "Tên Bất Kỳ",
        "role": "member",
        "password": "Password123",
    }
    res1 = await async_client.post("/api/users", headers=admin_headers, json=dup_email)
    assert res1.status_code == 400
    assert "Email này đã được sử dụng" in res1.json()["detail"]

    # Trùng MSSV
    dup_student = {
        "email": "unique.email@clb.edu.vn",
        "student_id": seed_member.student_id,
        "full_name": "Tên Bất Kỳ",
        "role": "member",
        "password": "Password123",
    }
    res2 = await async_client.post("/api/users", headers=admin_headers, json=dup_student)
    assert res2.status_code == 400
    assert "Mã số sinh viên này đã được sử dụng" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_admin_update_member_without_password(
    async_client: AsyncClient, admin_headers: dict, seed_member: User
):
    """Admin cập nhật thông tin thành viên (không cho phép nhận mật khẩu)."""
    payload = {
        "title": "Phó chủ nhiệm",
        "role": "admin",
        "is_active": True,
    }
    response = await async_client.patch(
        f"/api/users/{seed_member.id}", headers=admin_headers, json=payload
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Phó chủ nhiệm"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_admin_cannot_delete_self(
    async_client: AsyncClient, admin_headers: dict, seed_admin: User
):
    """Admin không thể tự xóa tài khoản của chính mình."""
    response = await async_client.delete(f"/api/users/{seed_admin.id}", headers=admin_headers)
    assert response.status_code == 400
    assert "không thể tự xóa" in response.json()["detail"]


@pytest.mark.asyncio
async def test_protect_last_active_admin_from_lock_demote_delete(
    async_client: AsyncClient, admin_headers: dict, seed_admin: User
):
    """Bảo vệ Quản trị viên cuối cùng: Không cho phép khóa hoặc hạ quyền admin cuối cùng."""
    # Thử hạ quyền admin cuối cùng thành member
    demote_res = await async_client.patch(
        f"/api/users/{seed_admin.id}",
        headers=admin_headers,
        json={"role": "member"},
    )
    assert demote_res.status_code == 400
    assert "Quản trị viên đang hoạt động cuối cùng" in demote_res.json()["detail"]

    # Thử khóa admin cuối cùng
    lock_res = await async_client.patch(
        f"/api/users/{seed_admin.id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert lock_res.status_code == 400
    assert "Quản trị viên đang hoạt động cuối cùng" in lock_res.json()["detail"]


@pytest.mark.asyncio
async def test_admin_soft_delete_member_success(
    async_client: AsyncClient, admin_headers: dict, seed_member: User
):
    """Admin xóa mềm một thành viên thành công."""
    del_res = await async_client.delete(f"/api/users/{seed_member.id}", headers=admin_headers)
    assert del_res.status_code == 200
    assert "Đã xóa mềm" in del_res.json()["message"]

    # Sau khi xóa mềm, không còn tìm thấy trong danh sách hoạt động
    list_res = await async_client.get(f"/api/users?q={seed_member.student_id}", headers=admin_headers)
    assert list_res.json()["total"] == 0
