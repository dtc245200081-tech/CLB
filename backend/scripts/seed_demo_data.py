"""Script tạo bộ DỮ LIỆU SEED GIẢ HOÀN TOÀN để phục vụ demo toàn diện Chatbot AI và các chức năng hệ thống.

Bao gồm:
- 4 Ban chuyên môn.
- 1 Quản trị viên (Admin), 4 Trưởng ban (Department Heads), 1 Thủ quỹ (Treasurer), 25 Hội viên (Members).
- 8 Sự kiện (đã qua và sắp tới, có đăng ký và điểm danh ảnh).
- 3 Kỳ hội phí (Đã đóng, Còn nợ, Quá hạn, kèm các yêu cầu claim đang chờ duyệt).
- Bút toán thu chi sổ quỹ và đề xuất chi đang chờ.
- Công việc (tasks) hoàn thành, đang làm, quá hạn deadline.
- Bảng tin thông báo chung.
- Tự động nạp và lập chỉ mục kho tri thức (RAG documents).
- Tính năng lũy tiến (Idempotent): Chạy nhiều lần không sinh trùng dữ liệu.
"""
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from sqlalchemy import select
from app.chatbot.rag import index_knowledge_directory
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.announcement import Announcement, AnnouncementScope, AnnouncementStatus
from app.models.department import Department
from app.models.event import (
    AttendanceSource,
    AttendanceType,
    Event,
    EventAttendance,
    EventRegistration,
    EventStatus,
    RegistrationStatus,
    ReviewStatus,
)
from app.models.fee import (
    ClaimStatus,
    FeePayment,
    FeePeriod,
    FeePeriodStatus,
    MemberFee,
    MemberFeeStatus,
    PaymentClaim,
    PaymentMethod,
)
from app.models.fund import ExpenseRequest, ExpenseRequestStatus, LedgerEntry, LedgerType
from app.models.task import Task, TaskAssignee, TaskPriority, TaskStatus
from app.models.user import SystemRole, User


async def seed_demo_data():
    print("=" * 65)
    print("🌱 BẮT ĐẦU KHỞI TẠO DỮ LIỆU SEED DEMO TOÀN DIỆN (GIAI ĐOẠN 5)")
    print("=" * 65)

    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)

        # ------------------------------------------------------------
        # 1. TẠO 4 BAN CHUYÊN MÔN
        # ------------------------------------------------------------
        print("📁 1. Khởi tạo các Ban chuyên môn...")
        depts_data = [
            ("Ban Truyền thông", "Phụ trách hình ảnh, video, fanpage và bài viết truyền thông sự kiện"),
            ("Ban Chuyên môn & Học thuật", "Tổ chức các buổi đào tạo kỹ thuật, workshop công nghệ và lập trình"),
            ("Ban Sự kiện & Hoạt động", "Phụ trách điều phối hậu cần, sân khấu, teambuilding và check-in sự kiện"),
            ("Ban Đối ngoại & Tài trợ", "Kết nối doanh nghiệp tài trợ, cựu sinh viên và các câu lạc bộ bạn"),
        ]
        dept_map = {}
        for name, desc in depts_data:
            res = await db.execute(select(Department).where(Department.name == name))
            dept = res.scalars().first()
            if not dept:
                dept = Department(name=name, description=desc, is_active=True)
                db.add(dept)
                await db.flush()
                await db.refresh(dept)
            dept_map[name] = dept

        # ------------------------------------------------------------
        # 2. TẠO NGƯỜI DÙNG THEO TỪNG VAI TRÒ
        # ------------------------------------------------------------
        print("👥 2. Khởi tạo tài khoản người dùng theo vai trò...")

        # 2.1. Admin
        res = await db.execute(select(User).where(User.email == "admin@clb.edu.vn"))
        admin_user = res.scalars().first()
        if not admin_user:
            admin_user = User(
                email="admin@clb.edu.vn",
                student_id="ADMIN001",
                full_name="Nguyễn Văn Admin (Chủ nhiệm)",
                phone="0901234567",
                faculty="Công nghệ thông tin",
                class_name="K60-CNTT1",
                title="Chủ nhiệm CLB",
                password_hash=hash_password("Admin@123456"),
                role=SystemRole.ADMIN,
                is_active=True,
            )
            db.add(admin_user)
            await db.flush()
            await db.refresh(admin_user)

        # 2.2. Trưởng ban
        heads_info = [
            ("head.media@clb.edu.vn", "HEAD001", "Trần Thị Mai (Trưởng Ban Truyền thông)", "Ban Truyền thông", "K61-TT"),
            ("head.tech@clb.edu.vn", "HEAD002", "Lê Hoàng Nam (Trưởng Ban Chuyên môn)", "Ban Chuyên môn & Học thuật", "K60-KHMT"),
            ("head.event@clb.edu.vn", "HEAD003", "Phạm Quốc Tuấn (Trưởng Ban Sự kiện)", "Ban Sự kiện & Hoạt động", "K61-QTKD"),
            ("head.relation@clb.edu.vn", "HEAD004", "Vũ Thùy Linh (Trưởng Ban Đối ngoại)", "Ban Đối ngoại & Tài trợ", "K60-NNA"),
        ]
        head_users = []
        for email, st_id, name, dept_name, class_n in heads_info:
            res = await db.execute(select(User).where(User.email == email))
            u = res.scalars().first()
            dept_obj = dept_map.get(dept_name)
            if not u:
                u = User(
                    email=email,
                    student_id=st_id,
                    full_name=name,
                    phone="0911000111",
                    faculty="Khoa Kinh tế & Kỹ thuật",
                    class_name=class_n,
                    title=f"Trưởng {dept_name}",
                    password_hash=hash_password("Head@123456"),
                    role=SystemRole.DEPARTMENT_HEAD,
                    department_id=dept_obj.id if dept_obj else None,
                    is_active=True,
                )
                db.add(u)
                await db.flush()
                await db.refresh(u)
                if dept_obj:
                    dept_obj.head_id = u.id
            head_users.append(u)

        # 2.3. Thủ quỹ
        res = await db.execute(select(User).where(User.email == "treasurer@clb.edu.vn"))
        treasurer_user = res.scalars().first()
        if not treasurer_user:
            treasurer_user = User(
                email="treasurer@clb.edu.vn",
                student_id="TREASURER001",
                full_name="Hoàng Thị Thu Hương (Thủ Quỹ)",
                phone="0933445566",
                faculty="Tài chính - Kế toán",
                class_name="K61-KT1",
                title="Thủ quỹ CLB",
                password_hash=hash_password("Treasurer@123456"),
                role=SystemRole.MEMBER,
                is_active=True,
                is_treasurer=True,
            )
            db.add(treasurer_user)
            await db.flush()
            await db.refresh(treasurer_user)

        # 2.4. 25 Hội viên thường
        dept_list = list(dept_map.values())
        member_users = []
        for i in range(1, 26):
            m_email = f"member{i:02d}@clb.edu.vn"
            m_id = f"SV2026{i:03d}"
            res = await db.execute(select(User).where(User.email == m_email))
            m_user = res.scalars().first()
            assigned_dept = dept_list[i % len(dept_list)]
            if not m_user:
                m_user = User(
                    email=m_email,
                    student_id=m_id,
                    full_name=f"Hội Viên Số {i:02d}",
                    phone=f"098800{i:04d}",
                    faculty="Công nghệ & Đa phương tiện",
                    class_name=f"K62-Lớp{i%5 + 1}",
                    title="Hội viên",
                    password_hash=hash_password("Member@123456"),
                    role=SystemRole.MEMBER,
                    department_id=assigned_dept.id,
                    is_active=True,
                    is_treasurer=False,
                )
                db.add(m_user)
                await db.flush()
                await db.refresh(m_user)
            member_users.append(m_user)

        # ------------------------------------------------------------
        # 3. TẠO 8 SỰ KIỆN (4 ĐÃ QUA, 4 SẮP TỚI)
        # ------------------------------------------------------------
        print("🎪 3. Khởi tạo 8 Sự kiện và dữ liệu Điểm danh ảnh...")
        events_spec = [
            # Đã qua
            ("Workshop: Nhập môn Git & GitHub Pro", -20, -18, "Hội trường A2", False, dept_map["Ban Chuyên môn & Học thuật"]),
            ("Teambuilding: Kết nối Tân hội viên Gen 10", -14, -13, "Công viên Yên Sở", False, dept_map["Ban Sự kiện & Hoạt động"]),
            ("Buổi chia sẻ: Kỹ năng Viết bài PR & Quản lý Fanpage", -7, -6, "Phòng 301 Nhà B", False, dept_map["Ban Truyền thông"]),
            ("Tọa đàm: Giao lưu cùng Doanh nghiệp & Cơ hội Thực tập", -3, -2, "Hội trường C1", True, dept_map["Ban Đối ngoại & Tài trợ"]),
            # Sắp tới
            ("Hackathon Mini: Xây dựng ứng dụng AI trong 24 giờ", 3, 5, "Lab 502 Nhà C", True, dept_map["Ban Chuyên môn & Học thuật"]),
            ("Cuộc thi: Thiết kế Ấn phẩm Truyền thông Sáng tạo", 7, 9, "Trực tuyến qua MS Teams", True, dept_map["Ban Truyền thông"]),
            ("Sinh hoạt Toàn thể CLB: Báo cáo tháng & Giao ban", 12, 13, "Phòng 402 Nhà A1", False, dept_map["Ban Sự kiện & Hoạt động"]),
            ("Ngày hội Công nghệ Tân sinh viên (Open Day)", 20, 21, "Sân trường Nhà A", True, dept_map["Ban Đối ngoại & Tài trợ"]),
        ]

        created_events = []
        for title, start_d, end_d, loc, is_pub, d_obj in events_spec:
            res = await db.execute(select(Event).where(Event.title == title))
            ev = res.scalars().first()
            if not ev:
                ev = Event(
                    title=title,
                    description=f"Chương trình hoạt động '{title}' do {d_obj.name} chủ trì tổ chức.",
                    start_time=now + timedelta(days=start_d),
                    end_time=now + timedelta(days=end_d),
                    location=loc,
                    registration_deadline=now + timedelta(days=start_d - 1),
                    capacity=50,
                    is_public=is_pub,
                    status=EventStatus.PUBLISHED,
                    department_id=d_obj.id,
                    created_by_id=admin_user.id,
                )
                db.add(ev)
                await db.flush()
                await db.refresh(ev)

                # Thêm đăng ký và điểm danh cho sự kiện đã qua
                if start_d < 0:
                    for m in member_users[:8]:
                        reg = EventRegistration(
                            event_id=ev.id,
                            user_id=m.id,
                            status=RegistrationStatus.REGISTERED,
                        )
                        db.add(reg)
                        await db.flush()
                        await db.refresh(reg)

                        att = EventAttendance(
                            registration_id=reg.id,
                            type=AttendanceType.CHECK_IN,
                            taken_at=now + timedelta(days=start_d, hours=1),
                            source=AttendanceSource.CAMERA,
                            photo_path="storage/attendance_photos/sample.jpg",
                            review_status=ReviewStatus.APPROVED,
                        )
                        db.add(att)
                else:
                    # Đăng ký cho sự kiện sắp tới
                    for m in member_users[:5]:
                        reg = EventRegistration(
                            event_id=ev.id,
                            user_id=m.id,
                            status=RegistrationStatus.REGISTERED,
                        )
                        db.add(reg)

            created_events.append(ev)

        # ------------------------------------------------------------
        # 4. TẠO 3 KỲ HỘI PHÍ VÀ CÁC YÊU CẦU CLAIM
        # ------------------------------------------------------------
        print("💰 4. Khởi tạo 3 Kỳ hội phí và Báo nộp tiền (Claims)...")
        periods_spec = [
            ("Học kỳ 1 (2025 - 2026)", 50000, -30, FeePeriodStatus.CLOSED),
            ("Học kỳ 2 (2025 - 2026)", 50000, 15, FeePeriodStatus.OPEN),
            ("Quỹ Áo Đồng Phục CLB", 100000, -5, FeePeriodStatus.OPEN),  # Hạn nộp đã qua 5 ngày -> quá hạn
        ]

        for p_name, amt, due_d, p_status in periods_spec:
            res = await db.execute(select(FeePeriod).where(FeePeriod.name == p_name))
            period = res.scalars().first()
            if not period:
                period = FeePeriod(
                    name=p_name,
                    description=f"Kỳ thu {p_name} dành cho toàn thể thành viên chính thức.",
                    amount=amt,
                    due_date=now + timedelta(days=due_d),
                    status=p_status,
                    created_by_id=admin_user.id,
                )
                db.add(period)
                await db.flush()
                await db.refresh(period)

                pending_claim_mf = None
                # Gán MemberFee cho từng hội viên
                for idx, m in enumerate(member_users):
                    mf = MemberFee(
                        period_id=period.id,
                        user_id=m.id,
                        amount_due=amt,
                        discount_amount=0,
                    )
                    db.add(mf)
                    await db.flush()
                    await db.refresh(mf)

                    # Kỳ đã đóng hoặc 10 hội viên đầu tiên ở kỳ đang mở: Tạo Payment
                    if p_status == FeePeriodStatus.CLOSED or (p_status == FeePeriodStatus.OPEN and idx < 10):
                        payment = FeePayment(
                            receipt_code=f"REC-{period.id}-{m.id}",
                            member_fee_id=mf.id,
                            amount=amt,
                            method=PaymentMethod.BANK_TRANSFER,
                            paid_at=now - timedelta(days=5),
                            received_by_id=treasurer_user.id,
                        )
                        db.add(payment)

                    if idx == 10 and p_status == FeePeriodStatus.OPEN:
                        pending_claim_mf = mf

                # Thêm claim thanh toán đang chờ duyệt cho hội viên số 11
                if pending_claim_mf:
                    claim1 = PaymentClaim(
                        member_fee_id=pending_claim_mf.id,
                        amount=amt,
                        transfer_time=now - timedelta(days=1),
                        status=ClaimStatus.PENDING,
                        proof_photo_path="storage/receipt_photos/sample_receipt.jpg",
                    )
                    db.add(claim1)

        # ------------------------------------------------------------
        # 5. SỔ QUỸ VÀ ĐỀ XUẤT CHI TIÊU
        # ------------------------------------------------------------
        print("📊 5. Khởi tạo Bút toán Sổ quỹ và Đề xuất chi...")
        res = await db.execute(select(LedgerEntry).limit(1))
        if not res.scalars().first():
            entries = [
                LedgerEntry(
                    type=LedgerType.INCOME,
                    amount=5000000,
                    category="Hội phí",
                    description="Thu hội phí đợt 1 toàn CLB",
                    recorded_by_id=treasurer_user.id,
                    occurred_at=now - timedelta(days=25),
                ),
                LedgerEntry(
                    type=LedgerType.INCOME,
                    amount=3000000,
                    category="Tài trợ",
                    description="Tài trợ học bổng từ Công ty Công nghệ F",
                    recorded_by_id=treasurer_user.id,
                    occurred_at=now - timedelta(days=15),
                ),
                LedgerEntry(
                    type=LedgerType.EXPENSE,
                    amount=1500000,
                    category="Tổ chức sự kiện",
                    description="Chi thuê hội trường và âm thanh Workshop Git",
                    recorded_by_id=treasurer_user.id,
                    occurred_at=now - timedelta(days=18),
                ),
                LedgerEntry(
                    type=LedgerType.EXPENSE,
                    amount=800000,
                    category="Hậu cần",
                    description="Mua nước uống và bánh ngọt teambuilding",
                    recorded_by_id=treasurer_user.id,
                    occurred_at=now - timedelta(days=12),
                ),
            ]
            db.add_all(entries)

            # Đề xuất chi đang chờ duyệt
            exp_req = ExpenseRequest(
                title="Mua thiết bị micro không dây & pin dự phòng cho Ban Sự kiện",
                description="Bộ micro phục vụ các buổi sinh hoạt định kỳ và workshop công nghệ hàng tuần.",
                amount_requested=1200000,
                status=ExpenseRequestStatus.REQUESTED,
                department_id=dept_map["Ban Sự kiện & Hoạt động"].id,
                requested_by_id=head_users[2].id,  # Trưởng ban sự kiện
            )
            db.add(exp_req)

        # ------------------------------------------------------------
        # 6. CÔNG VIỆC (TASKS)
        # ------------------------------------------------------------
        print("📌 6. Khởi tạo Công việc (Tasks)...")
        res = await db.execute(select(Task).limit(1))
        if not res.scalars().first():
            tasks_data = [
                ("Thiết kế avatar & banner chào đón tân thành viên", TaskStatus.DONE, TaskPriority.HIGH, -10, dept_map["Ban Truyền thông"], member_users[0]),
                ("Biên soạn slide đào tạo Python cơ bản cho workshop", TaskStatus.IN_PROGRESS, TaskPriority.NORMAL, 4, dept_map["Ban Chuyên môn & Học thuật"], member_users[1]),
                ("Khảo sát địa điểm cắm trại cho chuyến dã ngoại cuối năm", TaskStatus.TODO, TaskPriority.LOW, 10, dept_map["Ban Sự kiện & Hoạt động"], member_users[2]),
                ("Gửi thư mời tài trợ tới 5 doanh nghiệp đối tác", TaskStatus.TODO, TaskPriority.HIGH, -2, dept_map["Ban Đối ngoại & Tài trợ"], member_users[3]), # Quá hạn
                ("Liên hệ in ấn backdrop cho cuộc thi thiết kế", TaskStatus.IN_PROGRESS, TaskPriority.NORMAL, -1, dept_map["Ban Truyền thông"], member_users[4]), # Quá hạn
            ]
            for t_title, t_status, t_prio, due_d, d_obj, assignee_u in tasks_data:
                task = Task(
                    title=t_title,
                    description=f"Mô tả chi tiết công việc: {t_title}",
                    status=t_status,
                    priority=t_prio,
                    due_date=now + timedelta(days=due_d),
                    department_id=d_obj.id,
                    created_by_id=admin_user.id,
                )
                db.add(task)
                await db.flush()
                await db.refresh(task)
                assign = TaskAssignee(task_id=task.id, user_id=assignee_u.id)
                db.add(assign)

        # ------------------------------------------------------------
        # 7. BẢNG TIN THÔNG BÁO (ANNOUNCEMENTS)
        # ------------------------------------------------------------
        print("📢 7. Khởi tạo Bảng tin Thông báo chung...")
        res = await db.execute(select(Announcement).limit(1))
        if not res.scalars().first():
            announcements = [
                Announcement(
                    title="Chào mừng Tân Hội viên Gen 10 gia nhập đại gia đình CLB Sinh viên!",
                    content="Ban Chủ nhiệm xin gửi lời chào nồng nhiệt nhất đến tất cả các bạn đã xuất sắc vượt qua các vòng ứng tuyển. Hãy cùng nhau tạo nên một năm học rực rỡ!",
                    scope=AnnouncementScope.ALL,
                    status=AnnouncementStatus.PUBLISHED,
                    published_at=now - timedelta(days=15),
                    created_by_id=admin_user.id,
                ),
                Announcement(
                    title="Thông báo mở kỳ thu Hội phí Học kỳ 2 và Hạn chót hoàn thành",
                    content="Các bạn vui lòng kiểm tra mục 'Hội Phí Của Tôi' trên website và hoàn thành nghĩa vụ trước hạn ngày 15 tới đây. Mọi thắc mắc xin liên hệ Thủ quỹ CLB.",
                    scope=AnnouncementScope.ALL,
                    status=AnnouncementStatus.PUBLISHED,
                    published_at=now - timedelta(days=5),
                    created_by_id=admin_user.id,
                ),
            ]
            db.add_all(announcements)

        # ------------------------------------------------------------
        # 8. LẬP CHỈ MỤC KHO TRI THỨC (RAG KNOWLEDGE INDEXING)
        # ------------------------------------------------------------
        print("📚 8. Tự động lập chỉ mục tài liệu từ thư mục knowledge/...")
        rag_res = await index_knowledge_directory(db=db, reindex_all=False, updated_by_id=admin_user.id)
        print(f"   Kết quả RAG Indexing: {rag_res}")

        await db.commit()

    print("\n" + "=" * 65)
    print("✅ ĐÃ KHỞI TẠO XONG TOÀN BỘ DỮ LIỆU SEED DEMO!")
    print("=" * 65)
    print("📋 TÀI KHOẢN MẪU ĐỂ KIỂM THỬ VÀ DEMO:")
    print("  1. Quản trị viên (Admin):   admin@clb.edu.vn        | Mật khẩu: Admin@123456")
    print("  2. Trưởng ban Truyền thông: head.media@clb.edu.vn   | Mật khẩu: Head@123456")
    print("  3. Trưởng ban Chuyên môn:   head.tech@clb.edu.vn    | Mật khẩu: Head@123456")
    print("  4. Thủ quỹ CLB:             treasurer@clb.edu.vn    | Mật khẩu: Treasurer@123456")
    print("  5. Hội viên thường:         member01@clb.edu.vn     | Mật khẩu: Member@123456")
    print("  6. Khách vãng lai:          (Không cần đăng nhập, truy cập khung chat công khai)")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
