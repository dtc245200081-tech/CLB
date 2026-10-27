import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.department import Department
from app.models.user import SystemRole, User
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_create_department_success(async_client: AsyncClient, admin_headers: dict):
    """Admin tạo ban chuyên môn mới thành công."""
    res = await async_client.post(
        "/api/departments",
        json={"name": "Ban Học thuật", "description": "Tổ chức các hoạt động học thuật và nghiên cứu"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Ban Học thuật"
    assert data["description"] == "Tổ chức các hoạt động học thuật và nghiên cứu"
    assert data["is_active"] is True
    assert data["head_id"] is None
    assert data["member_count"] == 0


@pytest.mark.asyncio
async def test_create_department_duplicate_name(async_client: AsyncClient, admin_headers: dict):
    """Không cho phép tạo ban trùng tên (kể cả chữ hoa chữ thường)."""
    await async_client.post(
        "/api/departments",
        json={"name": "Ban Sự kiện", "description": "Tổ chức sự kiện"},
        headers=admin_headers,
    )
    res = await async_client.post(
        "/api/departments",
        json={"name": "ban sự kiện", "description": "Mô tả khác"},
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "đã tồn tại" in res.json()["detail"]


@pytest.mark.asyncio
async def test_department_management_forbidden_for_members_and_guests(
    async_client: AsyncClient, member_headers: dict
):
    """Thành viên và khách bị chặn khỏi các endpoint quản lý ban."""
    # Khách không có token
    res_guest = await async_client.post(
        "/api/departments",
        json={"name": "Ban Thể thao", "description": "Thể thao"},
    )
    assert res_guest.status_code == 401

    # Thành viên có token nhưng không phải admin
    res_member = await async_client.post(
        "/api/departments",
        json={"name": "Ban Thể thao", "description": "Thể thao"},
        headers=member_headers,
    )
    assert res_member.status_code == 403


@pytest.mark.asyncio
async def test_list_and_get_departments(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
    seed_department: Department,
):
    """Xem danh sách và chi tiết ban chuyên môn."""
    # Admin xem danh sách
    res_admin = await async_client.get("/api/departments", headers=admin_headers)
    assert res_admin.status_code == 200
    data = res_admin.json()
    assert data["total"] >= 1
    assert any(d["id"] == seed_department.id for d in data["items"])

    # Thành viên xem danh sách (chỉ ban đang hoạt động)
    res_member = await async_client.get("/api/departments", headers=member_headers)
    assert res_member.status_code == 200

    # Xem chi tiết ban
    res_detail = await async_client.get(f"/api/departments/{seed_department.id}", headers=member_headers)
    assert res_detail.status_code == 200
    assert res_detail.json()["name"] == seed_department.name


@pytest.mark.asyncio
async def test_update_department(async_client: AsyncClient, admin_headers: dict, seed_department: Department):
    """Admin cập nhật tên, mô tả và khóa/mở khóa ban."""
    res = await async_client.patch(
        f"/api/departments/{seed_department.id}",
        json={"name": "Ban Truyền thông & Kỹ thuật", "is_active": False},
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Ban Truyền thông & Kỹ thuật"
    assert data["is_active"] is False


@pytest.mark.asyncio
async def test_cannot_delete_department_with_members(
    async_client: AsyncClient, admin_headers: dict, seed_department: Department, seed_member: User
):
    """Không được xóa cứng ban đang có thành viên."""
    # Gán seed_member vào seed_department
    await async_client.patch(
        f"/api/users/{seed_member.id}/department",
        json={"department_id": seed_department.id},
        headers=admin_headers,
    )

    # Thử xóa ban
    res = await async_client.delete(f"/api/departments/{seed_department.id}", headers=admin_headers)
    assert res.status_code == 400
    assert "đang có" in res.json()["detail"] or "thành viên" in res.json()["detail"]


@pytest.mark.asyncio
async def test_delete_empty_department(async_client: AsyncClient, admin_headers: dict):
    """Xóa thành công ban chuyên môn khi không còn thành viên."""
    # Tạo ban mới rỗng
    create_res = await async_client.post(
        "/api/departments",
        json={"name": "Ban Tạm thời", "description": "Ban test xóa"},
        headers=admin_headers,
    )
    dept_id = create_res.json()["id"]

    # Xóa ban
    del_res = await async_client.delete(f"/api/departments/{dept_id}", headers=admin_headers)
    assert del_res.status_code == 200

    # Lấy lại phải 404
    get_res = await async_client.get(f"/api/departments/{dept_id}", headers=admin_headers)
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_assign_and_dismiss_department_head(
    async_client: AsyncClient, admin_headers: dict, seed_department: Department, seed_member: User
):
    """Chỉ định trưởng ban: người đó tự vào ban và đổi vai trò; bãi nhiệm trả về member."""
    # 1. Chỉ định trưởng ban
    assign_res = await async_client.put(
        f"/api/departments/{seed_department.id}/head",
        json={"user_id": seed_member.id},
        headers=admin_headers,
    )
    assert assign_res.status_code == 200
    data = assign_res.json()
    assert data["head_id"] == seed_member.id
    assert data["head_name"] == seed_member.full_name

    # Kiểm tra user trong DB: role đổi thành department_head, department_id gán đúng
    async with TestingSessionLocal() as session:
        user_in_db = await session.get(User, seed_member.id)
        assert user_in_db.role == SystemRole.DEPARTMENT_HEAD
        assert user_in_db.department_id == seed_department.id

    # 2. Bãi nhiệm trưởng ban
    dismiss_res = await async_client.delete(
        f"/api/departments/{seed_department.id}/head",
        headers=admin_headers,
    )
    assert dismiss_res.status_code == 200

    # Kiểm tra user trong DB: role trả về member
    async with TestingSessionLocal() as session:
        user_in_db = await session.get(User, seed_member.id)
        assert user_in_db.role == SystemRole.MEMBER
        assert user_in_db.department_id == seed_department.id  # Vẫn ở trong ban


@pytest.mark.asyncio
async def test_change_department_head_demotes_old_head(
    async_client: AsyncClient, admin_headers: dict, seed_department: Department, seed_member: User
):
    """Đổi trưởng ban: người cũ trở về vai trò member, người mới thành department_head."""
    # Tạo thêm 1 member thứ hai
    create_res = await async_client.post(
        "/api/users",
        json={
            "email": "member2@clb.edu.vn",
            "student_id": "SV2024002",
            "full_name": "Nguyễn Thành Viên Hai",
            "password": "Password123",
        },
        headers=admin_headers,
    )
    member2_id = create_res.json()["id"]

    # Chỉ định seed_member làm trưởng ban
    await async_client.put(
        f"/api/departments/{seed_department.id}/head",
        json={"user_id": seed_member.id},
        headers=admin_headers,
    )

    # Đổi trưởng ban sang member2
    change_res = await async_client.put(
        f"/api/departments/{seed_department.id}/head",
        json={"user_id": member2_id},
        headers=admin_headers,
    )
    assert change_res.status_code == 200
    assert change_res.json()["head_id"] == member2_id

    # Kiểm tra: seed_member trở về member, member2 thành department_head
    async with TestingSessionLocal() as session:
        user1 = await session.get(User, seed_member.id)
        user2 = await session.get(User, member2_id)
        assert user1.role == SystemRole.MEMBER
        assert user2.role == SystemRole.DEPARTMENT_HEAD


@pytest.mark.asyncio
async def test_one_person_cannot_head_two_departments(
    async_client: AsyncClient, admin_headers: dict, seed_department: Department, seed_member: User
):
    """Một người không thể làm trưởng của 2 ban cùng lúc."""
    # Tạo ban thứ hai
    dept2_res = await async_client.post(
        "/api/departments",
        json={"name": "Ban Đối ngoại", "description": "Đối ngoại"},
        headers=admin_headers,
    )
    dept2_id = dept2_res.json()["id"]

    # Chỉ định seed_member làm trưởng ban thứ nhất
    await async_client.put(
        f"/api/departments/{seed_department.id}/head",
        json={"user_id": seed_member.id},
        headers=admin_headers,
    )

    # Thử chỉ định seed_member làm trưởng ban thứ hai -> phải bị từ chối 400
    res = await async_client.put(
        f"/api/departments/{dept2_id}/head",
        json={"user_id": seed_member.id},
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "trưởng ban của" in res.json()["detail"]


@pytest.mark.asyncio
async def test_department_head_permissions_on_members(
    async_client: AsyncClient,
    admin_headers: dict,
    seed_department: Department,
    seed_department_head: User,
    dept_head_headers: dict,
    seed_member: User,
):
    """Trưởng ban: xem được thành viên trong ban mình, KHÔNG xem được thành viên ban khác."""
    # 1. Đưa seed_member vào cùng ban với Trưởng ban
    await async_client.patch(
        f"/api/users/{seed_member.id}/department",
        json={"department_id": seed_department.id},
        headers=admin_headers,
    )

    # 2. Tạo ban khác và thành viên thuộc ban khác
    other_dept_res = await async_client.post(
        "/api/departments",
        json={"name": "Ban Hậu cần", "description": "Hậu cần"},
        headers=admin_headers,
    )
    other_dept_id = other_dept_res.json()["id"]

    user_other_res = await async_client.post(
        "/api/users",
        json={
            "email": "other.user@clb.edu.vn",
            "student_id": "OTHER001",
            "full_name": "Nguyễn Người Ngoài Ban",
            "password": "Password123",
        },
        headers=admin_headers,
    )
    other_user_id = user_other_res.json()["id"]
    await async_client.patch(
        f"/api/users/{other_user_id}/department",
        json={"department_id": other_dept_id},
        headers=admin_headers,
    )

    # 3. Trưởng ban gọi GET /api/users -> Chỉ thấy seed_department_head và seed_member, KHÔNG thấy other_user
    res_list = await async_client.get("/api/users", headers=dept_head_headers)
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    user_ids = [u["id"] for u in items]
    assert seed_department_head.id in user_ids
    assert seed_member.id in user_ids
    assert other_user_id not in user_ids

    # 4. Trưởng ban truy cập trực tiếp thành viên trong ban mình -> 200 OK
    res_same = await async_client.get(f"/api/users/{seed_member.id}", headers=dept_head_headers)
    assert res_same.status_code == 200
    assert res_same.json()["id"] == seed_member.id

    # 5. Trưởng ban truy cập trực tiếp thành viên ban khác bằng ID -> 403 Forbidden
    res_diff = await async_client.get(f"/api/users/{other_user_id}", headers=dept_head_headers)
    assert res_diff.status_code == 403
    assert "ngoài ban" in res_diff.json()["detail"]


@pytest.mark.asyncio
async def test_department_head_cannot_self_elevate_or_manage_departments(
    async_client: AsyncClient,
    dept_head_headers: dict,
    seed_department: Department,
    seed_department_head: User,
):
    """Trưởng ban không được tự tạo/sửa ban và không tự nâng quyền."""
    # Không tạo được ban
    res_create = await async_client.post(
        "/api/departments",
        json={"name": "Ban Trưởng Ban Tạo", "description": "Test"},
        headers=dept_head_headers,
    )
    assert res_create.status_code == 403

    # Không sửa được ban
    res_edit = await async_client.patch(
        f"/api/departments/{seed_department.id}",
        json={"name": "Ban Đổi Tên"},
        headers=dept_head_headers,
    )
    assert res_edit.status_code == 403

    # Không tự nâng quyền qua PATCH /api/users/{id}
    res_admin_update = await async_client.patch(
        f"/api/users/{seed_department_head.id}",
        json={"role": "admin"},
        headers=dept_head_headers,
    )
    assert res_admin_update.status_code == 403

    # Tự sửa hồ sơ qua /api/users/me chỉ cập nhật được thông tin cá nhân
    res_self = await async_client.patch(
        "/api/users/me",
        json={"full_name": "Trưởng Ban Tên Mới"},
        headers=dept_head_headers,
    )
    assert res_self.status_code == 200
    assert res_self.json()["role"] == SystemRole.DEPARTMENT_HEAD


@pytest.mark.asyncio
async def test_transfer_member_and_handle_head_resignation(
    async_client: AsyncClient,
    admin_headers: dict,
    seed_department: Department,
    seed_department_head: User,
):
    """Khi chuyển ban thành viên đang là trưởng ban: tự động bãi nhiệm trưởng ban ban cũ."""
    # Tạo ban mới
    new_dept_res = await async_client.post(
        "/api/departments",
        json={"name": "Ban Nghiên cứu", "description": "R&D"},
        headers=admin_headers,
    )
    new_dept_id = new_dept_res.json()["id"]

    # Admin chuyển seed_department_head sang ban mới
    transfer_res = await async_client.patch(
        f"/api/users/{seed_department_head.id}/department",
        json={"department_id": new_dept_id},
        headers=admin_headers,
    )
    assert transfer_res.status_code == 200
    assert transfer_res.json()["department_id"] == new_dept_id

    # Kiểm tra ban cũ: head_id đã được bãi nhiệm về None
    async with TestingSessionLocal() as session:
        old_dept = await session.get(Department, seed_department.id)
        assert old_dept.head_id is None

        transferred_user = await session.get(User, seed_department_head.id)
        assert transferred_user.role == SystemRole.MEMBER


@pytest.mark.asyncio
async def test_get_department_members_endpoint(
    async_client: AsyncClient,
    admin_headers: dict,
    dept_head_headers: dict,
    member_headers: dict,
    seed_department: Department,
    seed_department_head: User,
):
    """Kiểm tra GET /departments/{id}/members:
    - Admin: xem được mọi ban.
    - Trưởng ban: xem được ban mình, bị chặn khỏi ban khác.
    - Thành viên: 403.
    """
    # Tạo ban khác
    other_dept = await async_client.post(
        "/api/departments",
        json={"name": "Ban Phong trào", "description": "Phong trào"},
        headers=admin_headers,
    )
    other_dept_id = other_dept.json()["id"]

    # 1. Trưởng ban xem ban mình -> 200 OK
    res_head_own = await async_client.get(
        f"/api/departments/{seed_department.id}/members",
        headers=dept_head_headers,
    )
    assert res_head_own.status_code == 200
    assert res_head_own.json()["total"] >= 1

    # 2. Trưởng ban xem ban khác -> 403 Forbidden
    res_head_other = await async_client.get(
        f"/api/departments/{other_dept_id}/members",
        headers=dept_head_headers,
    )
    assert res_head_other.status_code == 403

    # 3. Admin xem ban khác -> 200 OK
    res_admin = await async_client.get(
        f"/api/departments/{other_dept_id}/members",
        headers=admin_headers,
    )
    assert res_admin.status_code == 200

    # 4. Thành viên thường xem ban -> 403 Forbidden
    res_member = await async_client.get(
        f"/api/departments/{seed_department.id}/members",
        headers=member_headers,
    )
    assert res_member.status_code == 403
