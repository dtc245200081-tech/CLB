import io
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient

from app.models.department import Department
from app.models.event import AttendanceSource, AttendanceType, EventStatus, RegistrationStatus, ReviewStatus
from app.models.user import SystemRole, User
from tests.conftest import TestingSessionLocal


VALID_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + b"\x00" * 200
VALID_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 200
INVALID_FILE = b"Hello, this is just plain text, not an image!"


@pytest.mark.asyncio
async def test_event_crud_and_permissions(
    async_client: AsyncClient,
    admin_headers: dict,
    dept_head_headers: dict,
    member_headers: dict,
    seed_department: Department,
):
    """Kiểm tra CRUD sự kiện và phân quyền Admin vs Trưởng ban vs Thành viên:
    - Admin tạo sự kiện cấp toàn CLB (department_id=null) thành công.
    - Trưởng ban tạo sự kiện ban mình thành công.
    - Trưởng ban không được tạo sự kiện toàn CLB (403).
    - Thành viên không được tạo sự kiện (403).
    """
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=2)
    end = start + timedelta(hours=3)

    # 1. Admin tạo sự kiện cấp toàn CLB
    res_admin = await async_client.post(
        "/api/events",
        json={
            "title": "Hội Nghị Thường Niên Toàn CLB",
            "description": "Tổng kết năm học",
            "location": "Hội trường A1",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "department_id": None,
            "is_public": True,
            "capacity": 100,
        },
        headers=admin_headers,
    )
    assert res_admin.status_code == 201
    event_data = res_admin.json()
    assert event_data["title"] == "Hội Nghị Thường Niên Toàn CLB"
    assert event_data["status"] == "draft"
    assert event_data["department_id"] is None

    # 2. Trưởng ban tạo sự kiện ban mình
    res_head = await async_client.post(
        "/api/events",
        json={
            "title": "Workshop Kỹ Năng Báo Chí",
            "description": "Nội bộ ban truyền thông",
            "location": "Phòng 302",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "department_id": seed_department.id,
            "is_public": False,
            "capacity": 30,
        },
        headers=dept_head_headers,
    )
    assert res_head.status_code == 201
    assert res_head.json()["department_id"] == seed_department.id

    # 3. Trưởng ban tạo sự kiện cấp toàn CLB -> Bị chặn 403
    res_forbidden_whole = await async_client.post(
        "/api/events",
        json={
            "title": "Sự kiện vượt quyền",
            "location": "Sân trường",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "department_id": None,
        },
        headers=dept_head_headers,
    )
    assert res_forbidden_whole.status_code == 403

    # 4. Thành viên tạo sự kiện -> Bị chặn 403
    res_member = await async_client.post(
        "/api/events",
        json={
            "title": "Sự kiện của thành viên",
            "location": "Sân trường",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
        },
        headers=member_headers,
    )
    assert res_member.status_code == 403


@pytest.mark.asyncio
async def test_event_validation_constraints(
    async_client: AsyncClient,
    admin_headers: dict,
):
    """Kiểm tra validation: end_time trước start_time, capacity không âm, tham số phút."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=2)
    end = start - timedelta(hours=1)  # end_time trước start_time

    # 1. end_time trước start_time
    res1 = await async_client.post(
        "/api/events",
        json={
            "title": "Sự kiện thời gian lỗi",
            "location": "Phòng 101",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
        },
        headers=admin_headers,
    )
    assert res1.status_code in [400, 422]

    # 2. capacity âm hoặc = 0
    res2 = await async_client.post(
        "/api/events",
        json={
            "title": "Sự kiện capacity lỗi",
            "location": "Phòng 101",
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=2)).isoformat(),
            "capacity": 0,
        },
        headers=admin_headers,
    )
    assert res2.status_code in [400, 422]

    # 3. tham số phút âm
    res3 = await async_client.post(
        "/api/events",
        json={
            "title": "Sự kiện phút lỗi",
            "location": "Phòng 101",
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=2)).isoformat(),
            "checkin_open_minutes_before": -10,
        },
        headers=admin_headers,
    )
    assert res3.status_code in [400, 422]


@pytest.mark.asyncio
async def test_event_visibility_guest_member_admin(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
    dept_head_headers: dict,
    seed_department: Department,
):
    """Khách chỉ thấy sự kiện công khai đã published; Draft không lộ."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=1)
    end = start + timedelta(hours=2)

    # Tạo 1 sự kiện draft công khai
    res_draft = await async_client.post(
        "/api/events",
        json={
            "title": "Sự kiện Draft Public",
            "location": "Sảnh",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "is_public": True,
        },
        headers=admin_headers,
    )
    draft_id = res_draft.json()["id"]

    # Khách xem public events -> Không thấy sự kiện draft
    res_pub = await async_client.get("/api/public/events")
    assert res_pub.status_code == 200
    assert not any(e["id"] == draft_id for e in res_pub.json()["items"])

    # Khách xem chi tiết draft -> 404
    res_pub_detail = await async_client.get(f"/api/public/events/{draft_id}")
    assert res_pub_detail.status_code == 404

    # Thành viên xem danh sách sự kiện nội bộ -> Không thấy draft của Admin
    res_mem_list = await async_client.get("/api/events", headers=member_headers)
    assert not any(e["id"] == draft_id for e in res_mem_list.json()["items"])

    # Admin công bố sự kiện
    res_pub_action = await async_client.post(f"/api/events/{draft_id}/publish", headers=admin_headers)
    assert res_pub_action.status_code == 200
    assert res_pub_action.json()["status"] == "published"

    # Giờ khách đã thấy trên trang công khai
    res_pub2 = await async_client.get("/api/public/events")
    assert any(e["id"] == draft_id for e in res_pub2.json()["items"])

    # Khách xem chi tiết chỉ thấy trường công khai, không thấy thông tin nhạy cảm
    res_pub_detail2 = await async_client.get(f"/api/public/events/{draft_id}")
    assert res_pub_detail2.status_code == 200
    pub_data = res_pub_detail2.json()
    assert "registered_count" in pub_data
    assert "created_by_id" not in pub_data  # Public schema không chứa created_by_id


@pytest.mark.asyncio
async def test_event_registration_flow(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
):
    """Đăng ký tham gia, hủy, đăng ký lại sau khi hủy, và giới hạn capacity."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=1)
    end = start + timedelta(hours=2)

    # 1. Tạo sự kiện với capacity = 1
    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Workshop Giới Hạn Chỗ",
            "location": "Phòng Lab",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "capacity": 1,
        },
        headers=admin_headers,
    )
    event_id = create_res.json()["id"]

    # Không thể đăng ký khi sự kiện còn draft
    res_reg_draft = await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)
    assert res_reg_draft.status_code == 400

    # Admin publish
    await async_client.post(f"/api/events/{event_id}/publish", headers=admin_headers)

    # Thành viên đăng ký thành công
    res_reg = await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)
    assert res_reg.status_code == 201
    assert res_reg.json()["status"] == "registered"

    # Đăng ký trùng -> 400
    res_dup = await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)
    assert res_dup.status_code == 400

    # Người khác (admin) đăng ký -> Báo hết chỗ vì capacity = 1
    res_full = await async_client.post(f"/api/events/{event_id}/register", headers=admin_headers)
    assert res_full.status_code == 400
    assert "hết chỗ" in res_full.json()["detail"].lower()

    # Thành viên hủy đăng ký
    res_cancel_reg = await async_client.delete(f"/api/events/{event_id}/register", headers=member_headers)
    assert res_cancel_reg.status_code == 200

    # Đăng ký lại sau khi hủy -> cập nhật dòng cũ, thành công
    res_re_reg = await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)
    assert res_re_reg.status_code == 201
    assert res_re_reg.json()["status"] == "registered"


@pytest.mark.asyncio
async def test_attendance_time_windows_and_validation(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
):
    """Kiểm tra khung giờ điểm danh:
    - Trước giờ mở báo lỗi với thông báo tiếng Việt.
    - Điểm danh về trước khi đến -> báo lỗi.
    - Sai loại ảnh -> báo lỗi.
    """
    now = datetime.now(timezone.utc)
    # Sự kiện diễn ra trong tương lai xa (ngày mai) -> điểm danh đến chưa mở
    start = now + timedelta(days=1)
    end = start + timedelta(hours=2)

    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Sự Kiện Tương Lai",
            "location": "Sân vận động",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "checkin_open_minutes_before": 30,
        },
        headers=admin_headers,
    )
    event_id = create_res.json()["id"]
    await async_client.post(f"/api/events/{event_id}/publish", headers=admin_headers)
    await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)

    # 1. Điểm danh đến khi chưa tới giờ mở
    files = {"file": ("photo.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    data = {"source": "camera"}
    res_too_early = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files,
        data=data,
        headers=member_headers,
    )
    assert res_too_early.status_code == 400
    assert "chưa mở" in res_too_early.json()["detail"]


@pytest.mark.asyncio
async def test_attendance_checkin_checkout_camera_flow(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
):
    """Điểm danh đến và về thành công trong khung giờ bằng camera:
    - Camera tự động approved.
    - Check-out chỉ cho phép sau khi đã có check-in.
    """
    now = datetime.now(timezone.utc)
    # Khởi tạo sự kiện 15 phút sau để thành viên đăng ký hợp lệ
    start = now + timedelta(minutes=15)
    end = start + timedelta(hours=2)

    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Sự Kiện Đang Diễn Ra",
            "location": "Hội trường lớn",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "checkin_open_minutes_before": 30,
            "late_after_minutes": 15,
            "checkout_open_after_minutes": 0,
        },
        headers=admin_headers,
    )
    event_id = create_res.json()["id"]
    await async_client.post(f"/api/events/{event_id}/publish", headers=admin_headers)
    await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)

    # Sau khi đăng ký thành công, cập nhật start_time thành 10 phút trước
    from app.models.event import Event
    async with TestingSessionLocal() as session:
        ev = await session.get(Event, event_id)
        ev.start_time = now - timedelta(minutes=10)
        await session.commit()

    # 1. Thử checkout trước khi checkin -> Bị từ chối
    files_co = {"file": ("checkout.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res_co_early = await async_client.post(
        f"/api/events/{event_id}/attendance/check-out",
        files=files_co,
        data={"source": "camera"},
        headers=member_headers,
    )
    assert res_co_early.status_code == 400
    assert "trước khi điểm danh về" in res_co_early.json()["detail"]

    # 2. Check-in hợp lệ qua camera
    from app.core.rate_limiter import attendance_limiter
    attendance_limiter.reset_all()
    files_ci = {"file": ("checkin.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res_ci = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files_ci,
        data={"source": "camera"},
        headers=member_headers,
    )
    assert res_ci.status_code == 201
    ci_data = res_ci.json()
    assert ci_data["type"] == "check_in"
    assert ci_data["review_status"] == "approved"
    assert ci_data["is_late"] is False

    # 3. Check-in lần 2 -> Bị từ chối vì đã có bản ghi hiệu lực
    from app.core.rate_limiter import attendance_limiter
    attendance_limiter.reset_all()
    files_ci2 = {"file": ("checkin2.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res_ci2 = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files_ci2,
        data={"source": "camera"},
        headers=member_headers,
    )
    assert res_ci2.status_code == 400

    # 4. Check-out hợp lệ qua camera
    attendance_limiter.reset_all()
    files_co_valid = {"file": ("checkout.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res_co = await async_client.post(
        f"/api/events/{event_id}/attendance/check-out",
        files=files_co_valid,
        data={"source": "camera"},
        headers=member_headers,
    )
    assert res_co.status_code == 201
    co_data = res_co.json()
    assert co_data["type"] == "check_out"
    assert co_data["review_status"] == "approved"

    # 5. Kiểm tra thống kê
    res_stats = await async_client.get(f"/api/events/{event_id}/stats", headers=admin_headers)
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert stats["total_registered"] == 1
    assert stats["total_attended"] == 1
    assert stats["total_late"] == 0
    assert stats["total_fully_attended"] == 1


@pytest.mark.asyncio
async def test_attendance_upload_and_review_flow(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
    seed_member: User,
):
    """Duyệt ảnh tải lên (upload):
    - Upload vào trạng thái pending.
    - Chưa tính có mặt cho đến khi duyệt.
    - Người tổ chức duyệt/từ chối kèm lý do.
    """
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=15)
    end = start + timedelta(hours=2)

    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Sự Kiện Test Duyệt Ảnh",
            "location": "Phòng họp",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "checkin_open_minutes_before": 30,
            "late_after_minutes": 15,
        },
        headers=admin_headers,
    )
    event_id = create_res.json()["id"]
    await async_client.post(f"/api/events/{event_id}/publish", headers=admin_headers)
    await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)

    # Cập nhật start_time lùi lại 20 phút trước để test tính muộn (> 15 phút)
    from app.models.event import Event
    async with TestingSessionLocal() as session:
        ev = await session.get(Event, event_id)
        ev.start_time = now - timedelta(minutes=20)
        await session.commit()

    # 1. Gửi ảnh upload
    files = {"file": ("upload.png", io.BytesIO(VALID_PNG), "image/png")}
    res_upload = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files,
        data={"source": "upload"},
        headers=member_headers,
    )
    assert res_upload.status_code == 201
    att_data = res_upload.json()
    att_id = att_data["id"]
    assert att_data["review_status"] == "pending"
    assert att_data["is_late"] is True

    # 2. Kiểm tra stats trước khi duyệt -> total_attended = 0, total_pending_reviews = 1
    stats_before = (await async_client.get(f"/api/events/{event_id}/stats", headers=admin_headers)).json()
    assert stats_before["total_attended"] == 0
    assert stats_before["total_pending_reviews"] == 1

    # 3. Quản lý duyệt ảnh
    res_approve = await async_client.post(
        f"/api/attendances/{att_id}/approve",
        json={"note": "Ảnh rõ nét, hợp lệ"},
        headers=admin_headers,
    )
    assert res_approve.status_code == 200
    assert res_approve.json()["review_status"] == "approved"

    # Kiểm tra stats sau khi duyệt -> total_attended = 1, total_late = 1
    stats_after = (await async_client.get(f"/api/events/{event_id}/stats", headers=admin_headers)).json()
    assert stats_after["total_attended"] == 1
    assert stats_after["total_late"] == 1


@pytest.mark.asyncio
async def test_attendance_rejection_allows_resubmission(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
):
    """Khi ảnh bị từ chối, thành viên có thể chụp/gửi lại lượt mới."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=15)
    end = start + timedelta(hours=2)

    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Sự Kiện Test Từ Chối Ảnh",
            "location": "Phòng họp",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
        },
        headers=admin_headers,
    )
    event_id = create_res.json()["id"]
    await async_client.post(f"/api/events/{event_id}/publish", headers=admin_headers)
    await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)

    # Cập nhật start_time lùi 5 phút trước
    from app.models.event import Event
    async with TestingSessionLocal() as session:
        ev = await session.get(Event, event_id)
        ev.start_time = now - timedelta(minutes=5)
        await session.commit()

    # 1. Gửi ảnh lần 1
    files1 = {"file": ("mờ.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res_att1 = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files1,
        data={"source": "upload"},
        headers=member_headers,
    )
    assert res_att1.status_code == 201
    att1_id = res_att1.json()["id"]

    # 2. Quản lý từ chối
    res_reject = await async_client.post(
        f"/api/attendances/{att1_id}/reject",
        json={"note": "Ảnh mờ, không rõ mặt"},
        headers=admin_headers,
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["review_status"] == "rejected"
    assert res_reject.json()["review_note"] == "Ảnh mờ, không rõ mặt"

    # 3. Thành viên gửi lại ảnh lần 2 -> Cho phép gửi lại thành công
    from app.core.rate_limiter import attendance_limiter
    attendance_limiter.reset_all()
    files2 = {"file": ("ro_net.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res_att2 = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files2,
        data={"source": "camera"},
        headers=member_headers,
    )
    assert res_att2.status_code == 201
    assert res_att2.json()["review_status"] == "approved"


@pytest.mark.asyncio
async def test_attendance_rate_limiting(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
):
    """Kiểm tra giới hạn tần suất gửi ảnh điểm danh (429 Too Many Requests khi spam ảnh)."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=15)
    end = start + timedelta(hours=2)

    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Sự Kiện Test Rate Limit",
            "location": "Phòng họp",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
        },
        headers=admin_headers,
    )
    event_id = create_res.json()["id"]
    await async_client.post(f"/api/events/{event_id}/publish", headers=admin_headers)
    await async_client.post(f"/api/events/{event_id}/register", headers=member_headers)

    from app.models.event import Event
    async with TestingSessionLocal() as session:
        ev = await session.get(Event, event_id)
        ev.start_time = now - timedelta(minutes=5)
        await session.commit()

    # Gửi ảnh lần 1 thành công
    files1 = {"file": ("p1.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res1 = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files1,
        data={"source": "upload"},
        headers=member_headers,
    )
    assert res1.status_code == 201

    # Gửi ảnh lần 2 ngay lập tức trong vòng 5 giây -> 429 Too Many Requests
    files2 = {"file": ("p2.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res2 = await async_client.post(
        f"/api/events/{event_id}/attendance/check-in",
        files=files2,
        data={"source": "upload"},
        headers=member_headers,
    )
    assert res2.status_code == 429
    assert "quá nhanh" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_manual_attendance_and_csv_export(
    async_client: AsyncClient,
    admin_headers: dict,
    member_headers: dict,
    seed_member: User,
):
    """Điểm danh thủ công và xuất báo cáo CSV."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=5)
    end = now + timedelta(hours=2)

    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Sự Kiện Thủ Công & CSV",
            "location": "Phòng A",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
        },
        headers=admin_headers,
    )
    event_id = create_res.json()["id"]
    await async_client.post(f"/api/events/{event_id}/publish", headers=admin_headers)

    # 1. Người quản lý điểm danh thủ công cho seed_member
    res_manual = await async_client.post(
        f"/api/events/{event_id}/registrations/{seed_member.id}/attendance",
        json={"type": "check_in", "is_late": False, "note": "Hỏng camera, điểm danh thủ công"},
        headers=admin_headers,
    )
    assert res_manual.status_code == 200
    m_data = res_manual.json()
    assert m_data["source"] == "manual"
    assert m_data["review_status"] == "approved"

    # 2. Xuất CSV
    res_csv = await async_client.get(f"/api/events/{event_id}/registrations/export", headers=admin_headers)
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    csv_text = res_csv.text
    # Kiểm tra có BOM UTF-8
    assert csv_text.startswith("\ufeff")
    # Kiểm tra có mã sinh viên và tên trong CSV
    assert seed_member.student_id in csv_text
    assert seed_member.full_name in csv_text

    # 3. Lịch sử cá nhân của tôi (GET /users/me/registrations)
    res_history = await async_client.get("/api/users/me/registrations", headers=member_headers)
    assert res_history.status_code == 200
    h_data = res_history.json()
    assert h_data["total"] >= 1
    assert any(item["event_id"] == event_id for item in h_data["items"])


@pytest.mark.asyncio
async def test_event_approval_workflow_permissions_and_resubmission(
    async_client: AsyncClient,
    admin_headers: dict,
    dept_head_headers: dict,
    member_headers: dict,
    seed_department: Department,
    seed_admin: User,
):
    """Kiểm tra toàn diện luồng duyệt sự kiện (Event Approval Workflow):
    1. Trưởng ban tạo sự kiện ban mình ở trạng thái draft.
    2. Trưởng ban KHÔNG tự publish được (403 Forbidden).
    3. Thành viên không tự publish hay submit được (403 Forbidden).
    4. Trưởng ban khác ban không submit được sự kiện ban này (403 Forbidden).
    5. Trưởng ban gửi duyệt (POST /events/{id}/submit) -> Chuyển sang pending_approval.
    6. Trưởng ban gửi duyệt lại khi đang pending_approval -> Báo lỗi 400.
    7. Trưởng ban không được tự từ chối (403 Forbidden, chỉ Admin).
    8. Admin từ chối không có lý do -> Báo lỗi validation 422.
    9. Admin từ chối kèm lý do -> Chuyển sang rejected, lưu rejection_reason.
    10. Admin không thể publish sự kiện đang bị rejected khi chưa sửa và gửi duyệt lại (400).
    11. Trưởng ban được sửa sự kiện bị từ chối (PATCH /events/{id}).
    12. Trưởng ban gửi lại duyệt (POST /events/{id}/submit) sau khi sửa -> pending_approval, xóa lý do từ chối.
    13. Admin duyệt (publish) sự kiện thành công -> published.
    14. Thành viên đăng ký sự kiện đã published thành công.
    15. Sự kiện toàn CLB do Admin tạo ở draft và publish trực tiếp (không cần qua pending_approval).
    """
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=5)
    end = start + timedelta(hours=3)

    # 1. Trưởng ban tạo sự kiện ban mình -> draft
    create_res = await async_client.post(
        "/api/events",
        json={
            "title": "Workshop Thiết Kế Đồ Họa 2026",
            "description": "Kỹ năng Canva và Illustrator",
            "location": "Phòng thực hành 204",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "department_id": seed_department.id,
            "is_public": False,
            "capacity": 40,
        },
        headers=dept_head_headers,
    )
    assert create_res.status_code == 201
    event_data = create_res.json()
    event_id = event_data["id"]
    assert event_data["status"] == "draft"
    assert event_data["rejection_reason"] is None

    # 2. Trưởng ban không tự publish được -> 403 Forbidden
    res_head_publish = await async_client.post(
        f"/api/events/{event_id}/publish",
        headers=dept_head_headers,
    )
    assert res_head_publish.status_code == 403

    # 3. Thành viên không tự publish hay submit được -> 403 Forbidden
    res_mem_publish = await async_client.post(
        f"/api/events/{event_id}/publish",
        headers=member_headers,
    )
    assert res_mem_publish.status_code == 403

    res_mem_submit = await async_client.post(
        f"/api/events/{event_id}/submit",
        headers=member_headers,
    )
    assert res_mem_submit.status_code == 403

    # 4. Trưởng ban khác ban không submit được sự kiện của ban này
    from app.core.security import create_access_token, hash_password
    async with TestingSessionLocal() as session:
        dept2 = Department(name="Ban Đối Ngoại", is_active=True)
        session.add(dept2)
        await session.commit()
        await session.refresh(dept2)

        head2 = User(
            email="head2@clb.edu.vn",
            student_id="HEAD002",
            full_name="Nguyễn Văn Đối Ngoại",
            role=SystemRole.DEPARTMENT_HEAD,
            department_id=dept2.id,
            password_hash=hash_password("Pass12345"),
            is_active=True,
        )
        session.add(head2)
        await session.commit()
        await session.refresh(head2)

    token_head2 = create_access_token(subject=head2.id, role=head2.role)
    dept2_head_headers = {"Authorization": f"Bearer {token_head2}"}

    res_head2_submit = await async_client.post(
        f"/api/events/{event_id}/submit",
        headers=dept2_head_headers,
    )
    assert res_head2_submit.status_code == 403

    # 5. Trưởng ban gửi duyệt -> pending_approval
    res_submit = await async_client.post(
        f"/api/events/{event_id}/submit",
        headers=dept_head_headers,
    )
    assert res_submit.status_code == 200
    sub_data = res_submit.json()
    assert sub_data["status"] == "pending_approval"
    assert sub_data["rejection_reason"] is None

    # 6. Gửi duyệt lại khi đang pending_approval -> 400
    res_submit_dup = await async_client.post(
        f"/api/events/{event_id}/submit",
        headers=dept_head_headers,
    )
    assert res_submit_dup.status_code == 400
    assert "chờ" in res_submit_dup.json()["detail"].lower()

    # 7. Trưởng ban không được từ chối -> 403 Forbidden
    res_head_reject = await async_client.post(
        f"/api/events/{event_id}/reject",
        json={"reason": "Không thích"},
        headers=dept_head_headers,
    )
    assert res_head_reject.status_code == 403

    # 8. Admin từ chối không có lý do -> 422
    res_reject_empty = await async_client.post(
        f"/api/events/{event_id}/reject",
        json={"reason": "   "},
        headers=admin_headers,
    )
    assert res_reject_empty.status_code in [400, 422]

    # 9. Admin từ chối kèm lý do -> rejected
    res_reject = await async_client.post(
        f"/api/events/{event_id}/reject",
        json={"reason": "Chưa có dự trù kinh phí chi tiết, cần bổ sung"},
        headers=admin_headers,
    )
    assert res_reject.status_code == 200
    rej_data = res_reject.json()
    assert rej_data["status"] == "rejected"
    assert rej_data["rejection_reason"] == "Chưa có dự trù kinh phí chi tiết, cần bổ sung"

    # 10. Admin không thể publish sự kiện đang bị rejected khi chưa gửi lại -> 400
    res_admin_pub_rej = await async_client.post(
        f"/api/events/{event_id}/publish",
        headers=admin_headers,
    )
    assert res_admin_pub_rej.status_code == 400

    # 11. Trưởng ban sửa sự kiện bị từ chối -> status vẫn rejected
    res_patch = await async_client.patch(
        f"/api/events/{event_id}",
        json={"description": "Đã bổ sung dự trù kinh phí 500k mua tài liệu"},
        headers=dept_head_headers,
    )
    assert res_patch.status_code == 200
    patch_data = res_patch.json()
    assert patch_data["status"] == "rejected"
    assert "500k" in patch_data["description"]
    assert patch_data["rejection_reason"] == "Chưa có dự trù kinh phí chi tiết, cần bổ sung"

    # 12. Trưởng ban gửi lại duyệt sau khi sửa -> pending_approval, xóa rejection_reason
    res_resubmit = await async_client.post(
        f"/api/events/{event_id}/submit",
        headers=dept_head_headers,
    )
    assert res_resubmit.status_code == 200
    resub_data = res_resubmit.json()
    assert resub_data["status"] == "pending_approval"
    assert resub_data["rejection_reason"] is None

    # 13. Admin duyệt (publish) sự kiện -> published
    res_approve = await async_client.post(
        f"/api/events/{event_id}/publish",
        headers=admin_headers,
    )
    assert res_approve.status_code == 200
    app_data = res_approve.json()
    assert app_data["status"] == "published"
    assert app_data["rejection_reason"] is None

    # 14. Thành viên đăng ký sự kiện đã published -> 201
    res_reg = await async_client.post(
        f"/api/events/{event_id}/register",
        headers=member_headers,
    )
    assert res_reg.status_code == 201
    assert res_reg.json()["status"] == "registered"

    # 15. Sự kiện toàn CLB do Admin tạo và publish trực tiếp
    res_whole_club = await async_client.post(
        "/api/events",
        json={
            "title": "Gala Chào Tân Sinh Viên Toàn CLB",
            "location": "Hội trường lớn",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "department_id": None,
        },
        headers=admin_headers,
    )
    assert res_whole_club.status_code == 201
    whole_id = res_whole_club.json()["id"]
    assert res_whole_club.json()["status"] == "draft"

    # Admin publish trực tiếp -> published thành công
    res_whole_pub = await async_client.post(
        f"/api/events/{whole_id}/publish",
        headers=admin_headers,
    )
    assert res_whole_pub.status_code == 200
    assert res_whole_pub.json()["status"] == "published"

    # Thử gửi duyệt sự kiện toàn CLB -> Bị từ chối 400
    res_whole_sub = await async_client.post(
        f"/api/events/{whole_id}/submit",
        headers=admin_headers,
    )
    assert res_whole_sub.status_code == 400
