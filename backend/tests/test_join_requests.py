import pytest
from httpx import AsyncClient

from app.models.join_request import JoinRequestStatus
from app.models.user import User


@pytest.mark.asyncio
async def test_submit_join_request_success(async_client: AsyncClient):
    """Khách nộp đơn gia nhập công khai thành công."""
    payload = {
        "email": "applicant.new@clb.edu.vn",
        "student_id": "SV2025001",
        "full_name": "Phạm Quốc Dũng",
        "phone": "0911223344",
        "faculty": "Công nghệ thông tin",
        "class_name": "K63-CNTT",
        "reason": "Em muốn học hỏi thêm kiến thức lập trình và tham gia hoạt động xã hội",
        "password": "ApplicantPass@123",
    }
    response = await async_client.post("/api/join-requests", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "applicant.new@clb.edu.vn"
    assert data["student_id"] == "SV2025001"
    assert data["status"] == JoinRequestStatus.PENDING
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_submit_join_request_duplicate_user_generic_error(
    async_client: AsyncClient, seed_member: User
):
    """Nộp đơn trùng email/MSSV của tài khoản đã có trả về thông báo lỗi chung chung."""
    payload = {
        "email": seed_member.email,
        "student_id": "SV999888",
        "full_name": "Người Nộp Khác",
        "password": "Password12345",
    }
    response = await async_client.post("/api/join-requests", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Thông tin đăng ký không hợp lệ hoặc đã được ghi nhận trong hệ thống"


@pytest.mark.asyncio
async def test_submit_join_request_duplicate_pending_generic_error(async_client: AsyncClient):
    """Nộp trùng email/MSSV với đơn khác đang chờ duyệt (pending) cũng trả về lỗi chung chung."""
    payload = {
        "email": "pending.applicant@clb.edu.vn",
        "student_id": "SV_PENDING_01",
        "full_name": "Hồ Đăng Khoa",
        "password": "Password12345",
    }
    # Nộp lần 1 thành công
    res1 = await async_client.post("/api/join-requests", json=payload)
    assert res1.status_code == 201

    # Nộp lần 2 bị chặn
    res2 = await async_client.post("/api/join-requests", json=payload)
    assert res2.status_code == 400
    assert res2.json()["detail"] == "Thông tin đăng ký không hợp lệ hoặc đã được ghi nhận trong hệ thống"


@pytest.mark.asyncio
async def test_member_forbidden_from_admin_join_requests(
    async_client: AsyncClient, member_headers: dict
):
    """Thành viên không có quyền xem hoặc duyệt đơn gia nhập (403 Forbidden)."""
    response = await async_client.get("/api/join-requests", headers=member_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_approve_join_request_flow_and_login(
    async_client: AsyncClient, admin_headers: dict
):
    """Quy trình duyệt đơn: Admin duyệt -> Tạo user thành viên -> Đăng nhập bằng mật khẩu đã tự đặt."""
    raw_password = "MySecurePassword2026!"
    req_payload = {
        "email": "hoang.nam@clb.edu.vn",
        "student_id": "SV2025999",
        "full_name": "Hoàng Nam",
        "phone": "0909090909",
        "faculty": "Toán - Tin",
        "class_name": "K63-TT",
        "reason": "Yêu thích câu lạc bộ",
        "password": raw_password,
    }
    submit_res = await async_client.post("/api/join-requests", json=req_payload)
    assert submit_res.status_code == 201
    request_id = submit_res.json()["id"]

    # 1. Admin duyệt đơn
    approve_res = await async_client.post(
        f"/api/join-requests/{request_id}/approve", headers=admin_headers
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == JoinRequestStatus.APPROVED
    assert approve_res.json()["user_id"] is not None

    # 2. Không cho phép duyệt lần thứ 2
    double_approve_res = await async_client.post(
        f"/api/join-requests/{request_id}/approve", headers=admin_headers
    )
    assert double_approve_res.status_code == 400
    assert "đã được xử lý trước đó" in double_approve_res.json()["detail"]

    # 3. Đăng nhập ngay lập tức với tài khoản mới tạo và mật khẩu đã đặt khi nộp đơn
    login_res = await async_client.post(
        "/api/auth/login",
        json={"email": "hoang.nam@clb.edu.vn", "password": raw_password},
    )
    assert login_res.status_code == 200
    assert login_res.json()["user"]["email"] == "hoang.nam@clb.edu.vn"
    assert login_res.json()["user"]["role"] == "member"


@pytest.mark.asyncio
async def test_admin_reject_join_request_flow(
    async_client: AsyncClient, admin_headers: dict
):
    """Admin từ chối đơn gia nhập kèm ghi chú lý do."""
    req_payload = {
        "email": "rejected.applicant@clb.edu.vn",
        "student_id": "SV_REJECT_01",
        "full_name": "Người Không Đạt",
        "password": "Password12345",
    }
    submit_res = await async_client.post("/api/join-requests", json=req_payload)
    assert submit_res.status_code == 201
    request_id = submit_res.json()["id"]

    # Từ chối đơn
    reject_res = await async_client.post(
        f"/api/join-requests/{request_id}/reject",
        headers=admin_headers,
        json={"review_note": "Chưa đủ điều kiện tham gia phỏng vấn vòng 1"},
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == JoinRequestStatus.REJECTED
    assert reject_res.json()["review_note"] == "Chưa đủ điều kiện tham gia phỏng vấn vòng 1"

    # Không cho phép từ chối lại
    double_reject = await async_client.post(
        f"/api/join-requests/{request_id}/reject",
        headers=admin_headers,
        json={"review_note": "Lý do khác"},
    )
    assert double_reject.status_code == 400
    assert "đã được xử lý trước đó" in double_reject.json()["detail"]
