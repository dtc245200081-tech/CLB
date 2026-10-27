import io
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models.department import Department
from app.models.fee import FeePayment, FeePeriod, FeePeriodStatus, MemberFee, MemberFeeStatus, PaymentClaim
from app.models.fund import ExpenseRequest, ExpenseRequestStatus, LedgerEntry, LedgerType
from app.models.notification import Notification
from app.models.task import Task, TaskAssignee, TaskStatus
from app.models.user import SystemRole, User
from tests.conftest import TestingSessionLocal


@pytest.fixture
async def seed_second_member(seed_department: Department) -> User:
    """Tạo thêm 1 thành viên khác trong ban truyền thông."""
    async with TestingSessionLocal() as session:
        user = User(
            email="member2.media@clb.edu.vn",
            student_id="SV2024002",
            full_name="Nguyễn Văn Thành Viên Ban",
            phone="0977889900",
            faculty="Báo chí",
            class_name="K61-BC",
            role=SystemRole.MEMBER,
            department_id=seed_department.id,
            is_active=True,
            deleted_at=None,
            password_hash=hash_password("Pass123456"),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.fixture
def member2_headers(seed_second_member: User) -> dict:
    token = create_access_token(subject=seed_second_member.id, role=seed_second_member.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def seed_second_admin() -> User:
    """Tạo Admin thứ hai để kiểm tra tách bạch tự duyệt."""
    async with TestingSessionLocal() as session:
        admin2 = User(
            email="admin2.test@clb.edu.vn",
            student_id="ADMIN002",
            full_name="Phó Chủ Nhiệm Admin",
            role=SystemRole.ADMIN,
            is_active=True,
            deleted_at=None,
            password_hash=hash_password("AdminPass2"),
        )
        session.add(admin2)
        await session.commit()
        await session.refresh(admin2)
        return admin2


@pytest.fixture
def admin2_headers(seed_second_admin: User) -> dict:
    token = create_access_token(subject=seed_second_admin.id, role=seed_second_admin.role)
    return {"Authorization": f"Bearer {token}"}


# ============================================================
# 1. TEST CỜ QUYỀN THỦ QUỸ & PHÂN QUYỀN TÀI CHÍNH
# ============================================================

@pytest.mark.asyncio
async def test_treasurer_flag_permissions(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
    treasurer_headers: dict,
    seed_member: User,
    seed_treasurer: User,
):
    # 1. Admin bật cờ thủ quỹ cho thành viên thường
    res = await async_client.patch(
        f"/api/users/{seed_member.id}/treasurer",
        headers=admin_headers,
        json={"is_treasurer": True},
    )
    assert res.status_code == 200
    assert res.json()["is_treasurer"] is True

    # 2. Thành viên không được tự bật cờ thủ quỹ
    res = await async_client.patch(
        f"/api/users/{seed_member.id}/treasurer",
        headers=member_headers,
        json={"is_treasurer": True},
    )
    assert res.status_code == 403

    # 3. Người có cờ thủ quỹ truy cập được endpoint tài chính (tạo kỳ thu)
    due_date = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    res = await async_client.post(
        "/api/fees/periods",
        headers=treasurer_headers,
        json={
            "name": "Hội phí HK1 2026",
            "amount": 100000,
            "due_date": due_date,
            "description": "Thu hội phí",
        },
    )
    assert res.status_code == 200
    period_id = res.json()["id"]

    # Tắt cờ quyền thủ quỹ của seed_member để trở về thành viên bình thường
    await async_client.patch(
        f"/api/users/{seed_member.id}/treasurer",
        headers=admin_headers,
        json={"is_treasurer": False},
    )

    # 4. Thành viên thường bị chặn khỏi endpoint quản lý tài chính
    res = await async_client.post(
        "/api/fees/periods",
        headers=member_headers,
        json={
            "name": "Hội phí bất hợp pháp",
            "amount": 50000,
            "due_date": due_date,
        },
    )
    assert res.status_code == 403

    # 5. Thủ quỹ KHÔNG được phép đóng kỳ thu (Chỉ Admin)
    res = await async_client.patch(
        f"/api/fees/periods/{period_id}/status",
        headers=treasurer_headers,
        json={"status": "closed"},
    )
    assert res.status_code == 403

    # Admin đóng kỳ thu thành công
    res = await async_client.patch(
        f"/api/fees/periods/{period_id}/status",
        headers=admin_headers,
        json={"status": "closed"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "closed"

    # 6. Gỡ cờ thủ quỹ -> lập tức mất quyền quản lý tài chính
    await async_client.patch(
        f"/api/users/{seed_treasurer.id}/treasurer",
        headers=admin_headers,
        json={"is_treasurer": False},
    )
    res = await async_client.post(
        "/api/fees/periods",
        headers=treasurer_headers,
        json={
            "name": "Hội phí HK2 2026",
            "amount": 100000,
            "due_date": due_date,
        },
    )
    assert res.status_code == 403


# ============================================================
# 2. TEST CÔNG VIỆC (TASKS WORKFLOW)
# ============================================================

@pytest.mark.asyncio
async def test_tasks_workflow(
    async_client: AsyncClient,
    admin_headers: dict,
    dept_head_headers: dict,
    member_headers: dict,
    member2_headers: dict,
    seed_department: Department,
    seed_department_head: User,
    seed_member: User,
    seed_second_member: User,
):
    # 1. Trưởng ban chỉ được giao việc cho thành viên trong ban mình
    res = await async_client.post(
        "/api/tasks",
        headers=dept_head_headers,
        json={
            "title": "Thiết kế poster sự kiện",
            "description": "Dùng Figma thiết kế poster",
            "priority": "high",
            "department_id": seed_department.id,
            "assignee_ids": [seed_second_member.id],  # Trong ban -> thành công
        },
    )
    assert res.status_code == 200
    task_id = res.json()["id"]
    assert res.json()["department_id"] == seed_department.id

    # Trưởng ban giao cho thành viên ngoài ban (seed_member không thuộc ban) -> 403
    res = await async_client.post(
        "/api/tasks",
        headers=dept_head_headers,
        json={
            "title": "Việc sai ban",
            "department_id": seed_department.id,
            "assignee_ids": [seed_member.id],
        },
    )
    assert res.status_code == 403

    # Thành viên không có quyền tạo/giao việc -> 403
    res = await async_client.post(
        "/api/tasks",
        headers=member_headers,
        json={"title": "Thành viên tự tạo việc"},
    )
    assert res.status_code == 403

    # 2. Xem công việc: Thành viên ngoài ban không liên quan không xem được
    res = await async_client.get(f"/api/tasks/{task_id}", headers=member_headers)
    assert res.status_code == 403

    # Người nhận việc xem được
    res = await async_client.get(f"/api/tasks/{task_id}", headers=member2_headers)
    assert res.status_code == 200
    assert res.json()["title"] == "Thiết kế poster sự kiện"

    # 3. Cập nhật trạng thái công việc
    # Người nhận việc cập nhật: todo -> in_progress -> done
    res = await async_client.patch(
        f"/api/tasks/{task_id}/status",
        headers=member2_headers,
        json={"status": "in_progress"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "in_progress"

    res = await async_client.patch(
        f"/api/tasks/{task_id}/status",
        headers=member2_headers,
        json={"status": "done"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "done"
    assert res.json()["completed_at"] is not None

    # Người nhận việc không được tự ý hủy việc (cancelled)
    res = await async_client.patch(
        f"/api/tasks/{task_id}/status",
        headers=member2_headers,
        json={"status": "cancelled"},
    )
    assert res.status_code == 403

    # 4. Bình luận công việc
    res = await async_client.post(
        f"/api/tasks/{task_id}/comments",
        headers=member2_headers,
        json={"content": "Em đã hoàn thành bản phác thảo ban đầu ạ."},
    )
    assert res.status_code == 200
    assert res.json()["content"] == "Em đã hoàn thành bản phác thảo ban đầu ạ."

    # Người ngoài ban không được bình luận
    res = await async_client.post(
        f"/api/tasks/{task_id}/comments",
        headers=member_headers,
        json={"content": "Spam bình luận"},
    )
    assert res.status_code == 403

    # 5. Khóa thành viên -> Các việc mở được đánh dấu cần giao lại
    # Tạo thêm 1 việc đang mở cho seed_second_member
    res = await async_client.post(
        "/api/tasks",
        headers=admin_headers,
        json={
            "title": "Chụp ảnh sự kiện",
            "assignee_ids": [seed_second_member.id],
        },
    )
    task_open_id = res.json()["id"]

    # Admin khóa tài khoản seed_second_member
    await async_client.patch(
        f"/api/users/{seed_second_member.id}",
        headers=admin_headers,
        json={"is_active": False},
    )

    # Kiểm tra task_open_id có needs_reassignment = True
    res = await async_client.get(f"/api/tasks/{task_open_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["needs_reassignment"] is True


# ============================================================
# 3. TEST THÔNG BÁO (ANNOUNCEMENTS & NOTIFICATIONS)
# ============================================================

@pytest.mark.asyncio
async def test_announcements_and_notifications(
    async_client: AsyncClient,
    admin_headers: dict,
    dept_head_headers: dict,
    member_headers: dict,
    member2_headers: dict,
    seed_department: Department,
    seed_second_member: User,
):
    # 1. Đăng thông báo toàn CLB (Admin)
    res = await async_client.post(
        "/api/announcements",
        headers=admin_headers,
        json={
            "title": "Thông báo họp toàn thể CLB đầu kỳ",
            "content": "Toàn thể thành viên có mặt lúc 19h tại Hội trường A",
            "scope": "all",
            "is_pinned": True,
            "status": "published",
        },
    )
    assert res.status_code == 200
    ann_all_id = res.json()["id"]
    assert res.json()["is_pinned"] is True

    # 2. Trưởng ban đăng thông báo cho ban mình
    res = await async_client.post(
        "/api/announcements",
        headers=dept_head_headers,
        json={
            "title": "Lịch phân công truyền thông",
            "content": "Các bạn xem lịch trực fanpage tuần này",
            "scope": "department",
            "department_id": seed_department.id,
            "status": "published",
        },
    )
    assert res.status_code == 200
    ann_dept_id = res.json()["id"]

    # 3. Quyền xem thông báo
    # Thành viên trong ban (member2) xem được cả 2 thông báo
    res = await async_client.get("/api/announcements", headers=member2_headers)
    assert res.status_code == 200
    ann_ids = [a["id"] for a in res.json()["items"]]
    assert ann_all_id in ann_ids
    assert ann_dept_id in ann_ids

    # Thành viên ngoài ban (member) KHÔNG xem được thông báo của ban truyền thông
    res = await async_client.get("/api/announcements", headers=member_headers)
    ann_ids_outside = [a["id"] for a in res.json()["items"]]
    assert ann_all_id in ann_ids_outside
    assert ann_dept_id not in ann_ids_outside

    # 4. Đánh dấu đã đọc thông báo
    res = await async_client.post(f"/api/announcements/{ann_all_id}/read", headers=member2_headers)
    assert res.status_code == 200

    # Tác giả xem danh sách người đọc
    res = await async_client.get(f"/api/announcements/{ann_all_id}/readers", headers=admin_headers)
    assert res.status_code == 200
    readers = [r["user_id"] for r in res.json()["readers"]]
    assert seed_second_member.id in readers

    # 5. Thông báo cá nhân (Notifications)
    res = await async_client.get("/api/notifications/unread-count", headers=member2_headers)
    assert res.status_code == 200
    assert res.json()["unread_count"] > 0

    # Đánh dấu đã đọc tất cả
    res = await async_client.post("/api/notifications/read-all", headers=member2_headers)
    assert res.status_code == 200

    res = await async_client.get("/api/notifications/unread-count", headers=member2_headers)
    assert res.json()["unread_count"] == 0

    # 6. Chạy nhắc hạn không sinh trùng lặp
    res1 = await async_client.post("/api/notifications/run-reminders", headers=admin_headers)
    assert res1.status_code == 200

    res2 = await async_client.post("/api/notifications/run-reminders", headers=admin_headers)
    assert res2.status_code == 200
    # Lần thứ 2 không được sinh thêm thông báo trùng
    assert res2.json()["result"]["tasks_reminded"] == 0


# ============================================================
# 4. TEST HỘI PHÍ (MEMBERSHIP FEES & IMMUTABLE PAYMENTS)
# ============================================================

@pytest.mark.asyncio
async def test_membership_fees_and_money_rules(
    async_client: AsyncClient,
    admin_headers: dict,
    treasurer_headers: dict,
    member_headers: dict,
    dept_head_headers: dict,
    seed_member: User,
    seed_department_head: User,
):
    # 1. Tạo kỳ thu hội phí
    due_date = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()
    res = await async_client.post(
        "/api/fees/periods",
        headers=treasurer_headers,
        json={
            "name": "Hội phí Học kỳ 1 2026",
            "amount": 100000,
            "due_date": due_date,
            "description": "Qũy hoạt động",
        },
    )
    assert res.status_code == 200
    period_id = res.json()["id"]

    # 2. Thành viên kiểm tra khoản phải đóng của mình
    res = await async_client.get("/api/fees/me", headers=member_headers)
    assert res.status_code == 200
    my_fees = res.json()
    assert len(my_fees) >= 1
    my_fee = next(f for f in my_fees if f["period_id"] == period_id)
    assert my_fee["amount_due"] == 100000
    assert my_fee["remaining_due"] == 100000
    assert my_fee["status"] == "unpaid"
    fee_id = my_fee["id"]

    # 3. Trưởng ban xem tình trạng ban mình: chỉ xem trạng thái, không lộ số tiền hay ghi chú
    res = await async_client.get(f"/api/fees/periods/{period_id}/dept-members", headers=dept_head_headers)
    assert res.status_code == 200
    for item in res.json():
        assert "status" in item
        assert "is_overdue" in item
        assert "amount_due" not in item  # Không được lộ số tiền

    # 4. Miễn giảm hội phí: CHỈ ADMIN mới có quyền
    res = await async_client.patch(
        f"/api/fees/member-fees/{fee_id}/discount",
        headers=treasurer_headers,  # Thủ quỹ không được miễn giảm
        json={"discount_amount": 20000, "discount_reason": "Hỗ trợ"},
    )
    assert res.status_code == 403

    # Admin miễn giảm 20.000 VND
    res = await async_client.patch(
        f"/api/fees/member-fees/{fee_id}/discount",
        headers=admin_headers,
        json={"discount_amount": 20000, "discount_reason": "Hoàn cảnh khó khăn"},
    )
    assert res.status_code == 200
    assert res.json()["discount_amount"] == 20000
    assert res.json()["net_amount_due"] == 80000
    assert res.json()["remaining_due"] == 80000

    # 5. Thanh toán nhiều lần (partial rồi paid)
    # Không được nộp vượt quá số nợ (80.000)
    res = await async_client.post(
        "/api/fees/payments",
        headers=treasurer_headers,
        json={"member_fee_id": fee_id, "amount": 90000, "method": "cash"},
    )
    assert res.status_code == 400
    assert "vượt quá" in res.json()["detail"].lower()

    # Đóng lần 1: 50.000 VND -> trạng thái partial
    res = await async_client.post(
        "/api/fees/payments",
        headers=treasurer_headers,
        json={"member_fee_id": fee_id, "amount": 50000, "method": "cash"},
    )
    assert res.status_code == 200
    payment1_id = res.json()["id"]
    receipt1_code = res.json()["receipt_code"]

    res = await async_client.get("/api/fees/me", headers=member_headers)
    my_fee = next(f for f in res.json() if f["id"] == fee_id)
    assert my_fee["total_paid"] == 50000
    assert my_fee["remaining_due"] == 30000
    assert my_fee["status"] == "partial"

    # Đóng lần 2: 30.000 VND -> trạng thái paid
    res = await async_client.post(
        "/api/fees/payments",
        headers=treasurer_headers,
        json={"member_fee_id": fee_id, "amount": 30000, "method": "cash"},
    )
    assert res.status_code == 200

    res = await async_client.get("/api/fees/me", headers=member_headers)
    my_fee = next(f for f in res.json() if f["id"] == fee_id)
    assert my_fee["total_paid"] == 80000
    assert my_fee["remaining_due"] == 0
    assert my_fee["status"] == "paid"

    # 6. Hủy thanh toán (Bất biến, không xóa, chỉ void): Hoàn nợ về đúng trạng thái
    res = await async_client.post(
        f"/api/fees/payments/{payment1_id}/void",
        headers=treasurer_headers,
        json={"void_reason": "Thu nhầm mã sinh viên"},
    )
    assert res.status_code == 200
    assert res.json()["is_voided"] is True

    # Kiểm tra lại số dư nợ sau khi hủy thanh toán 1
    res = await async_client.get("/api/fees/me", headers=member_headers)
    my_fee = next(f for f in res.json() if f["id"] == fee_id)
    assert my_fee["total_paid"] == 30000
    assert my_fee["remaining_due"] == 50000
    assert my_fee["status"] == "partial"

    # Tra cứu phiếu thu
    res = await async_client.get(f"/api/fees/payments/receipt/{receipt1_code}", headers=member_headers)
    assert res.status_code == 200
    assert res.json()["is_voided"] is True


# ============================================================
# 5. TEST THU CHI CỦA QUỸ & BÁO CÁO (FUNDS & AUDIT RULES)
# ============================================================

@pytest.mark.asyncio
async def test_funds_and_ledger_workflow(
    async_client: AsyncClient,
    admin_headers: dict,
    admin2_headers: dict,
    treasurer_headers: dict,
    dept_head_headers: dict,
    member_headers: dict,
    seed_admin: User,
    seed_department: Department,
):
    # 1. Nhập thu tiền tài trợ vào quỹ 500.000 VND
    res = await async_client.post(
        "/api/funds/income",
        headers=treasurer_headers,
        json={
            "amount": 500000,
            "category": "sponsorship",
            "description": "Doanh nghiệp tài trợ áo CLB",
        },
    )
    assert res.status_code == 200

    # 2. Đề xuất chi của Trưởng ban
    res = await async_client.post(
        "/api/funds/expense-requests",
        headers=dept_head_headers,
        json={
            "title": "Mua nước ngọt và bánh kẹo",
            "description": "Phục vụ teambuilding ban truyền thông",
            "amount_requested": 200000,
            "department_id": seed_department.id,
        },
    )
    assert res.status_code == 200
    exp_req_id = res.json()["id"]

    # 3. Nguyên tắc tách bạch: Admin tự tạo đề xuất chi không được tự duyệt khi còn admin khác
    res_admin_req = await async_client.post(
        "/api/funds/expense-requests",
        headers=admin_headers,
        json={
            "title": "Mua bảng tên và dây đeo",
            "description": "Chi cho ban chủ nhiệm",
            "amount_requested": 100000,
        },
    )
    admin_req_id = res_admin_req.json()["id"]

    # Admin 1 tự duyệt đề xuất của chính mình -> BỊ CHẶN 403
    res_self = await async_client.post(
        f"/api/funds/expense-requests/{admin_req_id}/review",
        headers=admin_headers,
        json={"status": "approved"},
    )
    assert res_self.status_code == 403
    assert "tự duyệt" in res_self.json()["detail"].lower()

    # Admin 2 duyệt đề xuất của Admin 1 -> THÀNH CÔNG
    res_other = await async_client.post(
        f"/api/funds/expense-requests/{admin_req_id}/review",
        headers=admin2_headers,
        json={"status": "approved"},
    )
    assert res_other.status_code == 200

    # Admin duyệt đề xuất của Trưởng ban
    res = await async_client.post(
        f"/api/funds/expense-requests/{exp_req_id}/review",
        headers=admin_headers,
        json={"status": "approved", "review_note": "Đồng ý duyệt chi"},
    )
    assert res.status_code == 200

    # 4. Ghi nhận chi thực tế: Quy tắc 10%
    # Đề xuất 200.000 VND, chi thực tế 230.000 VND (> 10% là 220.000) -> BỊ CHẶN
    res = await async_client.post(
        "/api/funds/expenses",
        headers=treasurer_headers,
        json={
            "expense_request_id": exp_req_id,
            "amount": 230000,
            "category": "supplies",
            "description": "Mua bánh kẹo siêu thị",
        },
    )
    assert res.status_code == 400
    assert "10%" in res.json()["detail"]

    # Chi thực tế hợp lệ: 210.000 VND (vượt 5%, trong mức cho phép 10%)
    res = await async_client.post(
        "/api/funds/expenses",
        headers=treasurer_headers,
        json={
            "expense_request_id": exp_req_id,
            "amount": 210000,
            "category": "supplies",
            "description": "Mua bánh kẹo siêu thị",
            "explanation_note": "Bánh kẹo tăng giá nhẹ",
        },
    )
    assert res.status_code == 200
    assert res.json()["amount"] == 210000

    # 5. Chặn chi làm âm quỹ:
    # Quỹ hiện có: 500.000 thu - 210.000 chi = 290.000 VND
    # Tạo đề xuất chi 350.000 VND và duyệt
    res_big_req = await async_client.post(
        "/api/funds/expense-requests",
        headers=dept_head_headers,
        json={
            "title": "Thuê hội trường lớn",
            "description": "Chi phí thuê âm thanh ánh sáng hội trường",
            "amount_requested": 350000,
            "department_id": seed_department.id,
        },
    )
    big_req_id = res_big_req.json()["id"]
    await async_client.post(
        f"/api/funds/expense-requests/{big_req_id}/review",
        headers=admin_headers,
        json={"status": "approved"},
    )

    # Cố tình chi 350.000 VND (vượt số dư quỹ 290.000) -> BỊ CHẶN VÌ ÂM QUỸ
    res = await async_client.post(
        "/api/funds/expenses",
        headers=treasurer_headers,
        json={
            "expense_request_id": big_req_id,
            "amount": 350000,
            "category": "supplies",
            "description": "Thanh toán âm thanh hội trường",
        },
    )
    assert res.status_code == 400
    assert "không đủ số dư" in res.json()["detail"].lower()

    # 6. Báo cáo tài chính & Sổ quỹ
    res = await async_client.get("/api/funds/report", headers=treasurer_headers)
    assert res.status_code == 200
    report = res.json()
    assert report["current_balance"] == 290000
    assert report["total_income"] == 500000
    assert report["total_expense"] == 210000

    # 7. Trang Tài chính CLB công khai cho thành viên
    res = await async_client.get("/api/funds/overview", headers=member_headers)
    assert res.status_code == 200
    overview = res.json()
    assert overview["fund_balance"] == 290000
    assert overview["total_income"] == 500000
    assert overview["total_expense"] == 210000
