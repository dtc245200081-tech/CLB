# 🚀 HƯỚNG DẪN PHÁT TRIỂN & ONBOARDING DỰ ÁN
## HỆ THỐNG QUẢN LÝ CÂU LẠC BỘ SINH VIÊN (STUDENT CLUB MANAGEMENT SYSTEM)

> **Mục đích tài liệu:** Dành cho bất kỳ lập trình viên nào tiếp nhận hoặc mở rộng hệ thống (Đã hoàn thành toàn diện 5 GIAI ĐOẠN: Giai đoạn 1: Đăng nhập & Thành viên, Giai đoạn 2: Ban & Vai trò, Giai đoạn 3: Sự kiện & Điểm danh ảnh, Giai đoạn 4: Công việc, Thông báo, Hội phí & Sổ quỹ; Giai đoạn 5: Chatbot AI Trợ lý ảo & Kho tri thức RAG).  
> **Bạn không cần đọc lại toàn bộ mã nguồn từ đầu.** Đọc tài liệu này sẽ giúp bạn nắm chắc kiến trúc, cơ chế phân quyền, quy tắc nghiệp vụ, chuẩn viết code và checklist triển khai tính năng mới.

---

## 📌 1. TỔNG QUAN HỆ THỐNG & TECH STACK

### 1.1. Kiến trúc tổng thể
Hệ thống được thiết kế theo mô hình **Client - Server tách rời**, giao tiếp qua RESTful JSON APIs, triển khai qua Docker Compose:

```
[Browser / Client] 
        │ (HTTP Port :80)
        ▼
[Nginx Reverse Proxy Gateway]
        ├── /api/*   ──────►  [FastAPI Backend Server (:8000)]
        │                           │
        │                           ▼
        │                     [PostgreSQL 16 Database (:5432)]
        └── /*       ──────►  [React + Vite Frontend (Static Build)]
```

### 1.2. Công nghệ sử dụng
- **Backend:** 
  - Python 3.11+ / FastAPI
  - SQLAlchemy 2.0 (Async/Await với `asyncpg`)
  - Alembic (Quản lý Database Migrations)
  - Pytest + `pytest-asyncio` + `httpx` + `aiosqlite` (Bộ test tự động cách ly)
  - JWT (JSON Web Token), bcrypt hash password
  - Google GenAI SDK (Mô hình Google Gemini 2.5 Flash / Gemini 2.0 Flash)
  - Server-Sent Events (SSE) streaming thời gian thực
- **Frontend:**
  - React 18 + TypeScript + Vite
  - React Router v6
  - Lucide React (Bộ icon chuẩn)
  - CSS thuần (Design System: CSS Variables, Glassmorphism, Dark Modern UI)
- **Hạ tầng & Triển khai:**
  - Docker Compose (`db`, `backend`, `frontend`, `nginx`)
  - PostgreSQL 16 tích hợp extension `pgvector` (Vector 768 chiều & chỉ mục HNSW)
  - Multi-stage Dockerfile tối ưu kích thước và bảo mật (User non-root)

---

## 📂 2. CẤU TRÚC THƯ MỤC DỰ ÁN

```
CLB sinh viên/
├── DEVELOPMENT_GUIDE.md        # File hướng dẫn kỹ thuật này (đọc trước tiên)
├── README.md                   # Giới thiệu tổng quan & hướng dẫn khởi chạy nhanh
├── docker-compose.yml          # Cấu hình production container
├── docker-compose.dev.yml      # Cấu hình development container
├── knowledge/                  # Kho tài liệu Markdown chuẩn phục vụ RAG (8 tài liệu)
├── nginx/
│   └── default.conf            # Cấu hình Nginx reverse proxy & SSE streaming
│
├── backend/
│   ├── alembic/
│   │   ├── versions/           # Các file migration (001 đến 007)
│   │   └── env.py              # Cấu hình Alembic chạy async migrations
│   ├── app/
│   │   ├── api/
│   │   │   ├── api.py          # Router tổng (Include tất cả routers con)
│   │   │   └── endpoints/      # Controllers: auth, users, departments, events, attendances,
│   │   │                       # tasks, announcements, notifications, fees, funds,
│   │   │                       # chat, public_chat, knowledge, audit_logs
│   │   ├── chatbot/            # Module Trợ lý AI và Kho tri thức RAG
│   │   │   ├── gemini_client.py# Adapter gọi Google GenAI SDK (Gemini 2.5 Flash)
│   │   │   ├── prompt.py       # Prompt templates & context formatting
│   │   │   ├── rag.py          # Vector search, HNSW, cosine similarity & chuẩn hóa tiếng Việt
│   │   │   ├── service.py      # Điều phối hội thoại và SSE stream response
│   │   │   └── tools.py        # 15+ Function Calling Declarations & Server Executors
│   │   ├── core/
│   │   │   ├── config.py       # Cấu hình đọc file .env qua Pydantic Settings
│   │   │   ├── database.py     # Engine async, sessionmaker, Base model
│   │   │   ├── deps.py         # Dependencies dùng chung: Auth, RBAC, phân quyền ban
│   │   │   ├── security.py     # Hash bcrypt, JWT token encode/decode
│   │   │   ├── audit.py        # Ghi nhật ký an toàn (console + CSDL)
│   │   │   └── rate_limiter.py # Chống tấn công dò mật khẩu brute-force
│   │   ├── models/             # SQLAlchemy ORM Models (User, Department, Event, Task, Fee, Fund, Document, Chat...)
│   │   └── schemas/            # Pydantic v2 validation schemas
│   ├── tests/                  # Bộ kiểm thử Pytest tự động
│   └── scripts/                # Script khởi chạy: start-dev.sh, start-prod.sh
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── client.ts       # NƠI DUY NHẤT gọi fetch API backend & SSE stream
    │   ├── components/         # Layout, Modal, Route Guards, CameraCapture, ChatWidget...
    │   ├── context/
    │   │   └── AuthContext.tsx # Quản lý trạng thái đăng nhập, user, vai trò
    │   ├── pages/              # Các trang theo vai trò: Admin, Trưởng ban, Hội viên
    │   │   └── admin/          # Quản trị: Thành viên, Ban, Đơn gia nhập, Phí, Quỹ, Tri thức, Chất lượng AI...
    │   └── types/
    │       └── index.ts        # TypeScript interfaces dùng chung toàn hệ thống
    └── package.json
```

---

## 🛡️ 3. CƠ CHẾ PHÂN QUYỀN DÙNG CHUNG (RBAC & DEPARTMENT SCOPE)

Đây là **phần cốt lõi** cần dùng lại khi viết các giai đoạn sau (Sự kiện, Công việc, Hội phí). **Tuyệt đối không tạo lại cơ chế xác thực/phân quyền mới!**

### 3.1. Các vai trò & Cờ quyền trong hệ thống
1. **Vai trò hệ thống (`SystemRole`)** - lưu dạng `VARCHAR(20)` trong bảng `users`:
   - `admin`: **Quản trị viên** - Toàn quyền trên mọi dữ liệu, ban chuyên môn, thành viên, duyệt chi và cấu hình.
   - `department_head`: **Trưởng ban** - Quản lý, tạo, xem và thao tác trên dữ liệu **thuộc ban của chính mình**.
   - `member`: **Thành viên** - Xem dữ liệu công khai, các ban hoạt động, công việc, hội phí và hồ sơ của chính mình.
2. **Cờ quyền Thủ quỹ (`is_treasurer`)**:
   - Kiểu `Boolean`, mặc định `False` trong bảng `users`.
   - **Đây là CỜ QUYỀN**, không phải vai trò mới; chỉ Admin được bật/tắt (qua `PATCH /users/{id}/treasurer`).
   - Một thành viên bất kỳ (kể cả Trưởng ban) có thể được gán cờ này.
   - **Người quản lý quỹ (Finance Manager)** = `admin` HOẶC `is_treasurer`.
   - Kiểm tra trực tiếp từ CSDL mỗi request (mất quyền ngay lập tức khi Admin gỡ cờ mà không cần chờ JWT hết hạn).

### 3.2. Bảng ma trận phân quyền cập nhật (Giai đoạn 1 - 4)

| Nhóm chức năng / Hành động | Admin | Thủ quỹ (`is_treasurer`) | Trưởng ban | Thành viên | Khách |
|---|:---:|:---:|:---:|:---:|:---:|
| **Hệ thống & Tài khoản** | | | | | |
| Đăng nhập / Xem trang chủ / Nộp đơn gia nhập | ✔ | ✔ | ✔ | ✔ | ✔ |
| Bật / tắt cờ Thủ quỹ (`is_treasurer`) | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |
| Quản lý ban chuyên môn / Duyệt đơn gia nhập | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |
| Tra cứu Nhật ký hoạt động (Audit log) | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |
| **Sự kiện & Điểm danh** | | | | | |
| Xem sự kiện công khai (`/public/events`) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Tạo / sửa / hủy sự kiện toàn CLB | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |
| Tạo / sửa / hủy sự kiện của ban | ✔ | ✘ (403) | Ban mình | ✘ (403) | ✘ |
| Đăng ký / Điểm danh ảnh / Xem lịch sử tham gia | ✔ | ✔ | ✔ | ✔ | ✘ |
| Duyệt ảnh điểm danh / Điểm danh thủ công | ✔ | ✘ (403) | Ban mình | ✘ (403) | ✘ |
| **Công việc (Tasks)** | | | | | |
| Giao việc toàn CLB | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |
| Giao việc trong ban | ✔ | ✘ (403) | Ban mình | ✘ (403) | ✘ |
| Xem việc & Cập nhật trạng thái việc của mình | ✔ | ✔ | ✔ | ✔ | ✘ |
| Xem tất cả việc trong ban / Giao lại việc | ✔ | ✘ (403) | Ban mình | ✘ (403) | ✘ |
| Bình luận công việc | Liên quan | Liên quan | Ban mình | Người nhận/giao | ✘ |
| **Thông báo & Bảng tin** | | | | | |
| Đăng bảng tin toàn CLB / Ghim thông báo | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |
| Đăng bảng tin của ban | ✔ | ✘ (403) | Ban mình | ✘ (403) | ✘ |
| Xem bảng tin (toàn CLB + ban mình) & Đánh dấu đọc | ✔ | ✔ | ✔ | ✔ | ✘ |
| Nhận thông báo cá nhân (Task, Phí, Sự kiện) | ✔ | ✔ | ✔ | ✔ | ✘ |
| **Hội phí (Membership Fees)** | | | | | |
| Tạo kỳ thu, đóng/mở kỳ thu | ✔ | ✘ (Chỉ Admin) | ✘ (403) | ✘ (403) | ✘ |
| Ghi nhận nộp tiền mặt, hủy thanh toán | ✔ | ✔ | ✘ (403) | ✘ (403) | ✘ |
| Duyệt / từ chối claim chuyển khoản nộp phí | ✔ | ✔ | ✘ (403) | ✘ (403) | ✘ |
| Miễn giảm hội phí (Waive/Discount) có lý do | ✔ | ✘ (Chỉ Admin) | ✘ (403) | ✘ (403) | ✘ |
| Xem tình trạng nộp phí CLB | ✔ (toàn bộ) | ✔ (toàn bộ) | Ban mình (chỉ trạng thái) | ✘ (chỉ của mình) | ✘ |
| Xem khoản nợ & Gửi claim biên lai chuyển khoản | ✔ | ✔ | ✔ | ✔ | ✘ |
| **Thu chi & Sổ quỹ (Funds & Treasury)** | | | | | |
| Tạo đề xuất chi quỹ | ✔ | ✔ | Ban mình | ✘ (403) | ✘ |
| Duyệt / Từ chối đề xuất chi (Tách bạch người tạo) | ✔ | ✘ (Chỉ Admin) | ✘ (403) | ✘ (403) | ✘ |
| Ghi nhận chi thực tế kèm chứng từ (vượt <= 10%) | ✔ | ✔ | ✘ (403) | ✘ (403) | ✘ |
| Ghi nhận thu khác (tài trợ, bán vé) | ✔ | ✔ | ✘ (403) | ✘ (403) | ✘ |
| Xem chi tiết sổ quỹ, xuất CSV, báo cáo tài chính | ✔ | ✔ | ✘ (403) | ✘ (403) | ✘ |
| Xem trang tài chính tổng quan (Minh bạch CLB) | ✔ | ✔ | ✔ | ✔ (nếu bật) | ✘ |
| **Chatbot AI & Kho Tri Thức RAG** | | | | | |
| Hỏi đáp Chatbot AI công khai (tài liệu public & sự kiện mở) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Tra cứu việc, hội phí, điểm danh cá nhân qua Chatbot | ✔ | ✔ | ✔ | ✔ | ✘ |
| Dùng công cụ AI quản lý ban & soạn nháp thông báo/kế hoạch | ✔ | ✘ (403) | Ban mình | ✘ (403) | ✘ |
| Dùng công cụ AI tra cứu tồn quỹ, sổ quỹ, nợ hội phí | ✔ | ✔ | ✘ (403) | ✘ (403) | ✘ |
| Quản lý kho tài liệu tri thức CLB (CRUD, Reindex vector) | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |
| Xem bảng chẩn đoán chất lượng Chatbot & nhật ký câu hỏi | ✔ | ✘ (403) | ✘ (403) | ✘ (403) | ✘ |

### 3.3. Các Dependencies & Hàm kiểm tra quyền chuẩn (`app.core.deps`)

Khi viết endpoint mới, **hãy import trực tiếp từ `app.core.deps`**:

```python
from app.core.deps import (
    get_current_user,           # Lấy user hiện tại từ Bearer JWT (kiểm tra xóa mềm, khóa tài khoản)
    require_admin,              # Bắt buộc vai trò Admin
    require_finance_manager,    # Người quản lý quỹ: Admin HOẶC User có cờ is_treasurer=True
    require_department_head,    # Cho phép Admin hoặc Trưởng ban
    require_any_authenticated,  # Mọi người dùng đã đăng nhập (Admin, Trưởng ban, Thành viên)
    ensure_same_department,     # Kiểm tra quyền thao tác trên một thành viên khác
    ensure_department_access,   # Kiểm tra quyền thao tác trên một BAN cụ thể
    ensure_event_manage_access, # Kiểm tra quyền quản lý một SỰ KIỆN cụ thể
)
```

#### Ví dụ cách dùng chuẩn cho Quyền tài chính & Thu chi:
```python
# 1. Endpoint chỉ người quản lý quỹ (Admin hoặc Thủ quỹ) được thao tác
@router.post("/periods", response_model=FeePeriodResponse)
async def create_fee_period(
    data: FeePeriodCreate,
    current_user: User = Depends(require_finance_manager),
    db: AsyncSession = Depends(get_db),
):
    ...

# 2. Endpoint duyệt chi: Chỉ Admin và tuân thủ NGUYÊN TẮC TÁCH BẠCH
@router.post("/requests/{id}/review")
async def review_expense_request(
    id: int,
    data: ExpenseReviewAction,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    req = await db.get(ExpenseRequest, id)
    # Nếu còn Admin khác trong CLB, người tạo không được tự duyệt đề xuất của chính mình!
    if req.requested_by_id == current_user.id:
        active_admins_count = await get_active_admin_count(db)
        if active_admins_count > 1:
            raise HTTPException(status_code=403, detail="Không được tự phê duyệt đề xuất chi do chính mình tạo")
    ...
```

#### Ví dụ cho Giai đoạn 3 (Sự kiện):
```python
# 1. Endpoint chỉ Admin được tạo sự kiện cấp CLB, hoặc Trưởng ban tạo sự kiện ban mình
@router.post("", response_model=EventResponse)
async def create_event(
    data: EventCreate,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    if data.department_id is not None:
        # Đảm bảo Trưởng ban không tạo sự kiện cho ban khác!
        ensure_department_access(current_user, data.department_id)
    elif current_user.role != SystemRole.ADMIN:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới được tạo sự kiện cấp CLB")
    ...

# 2. Endpoint xem chi tiết hoặc điểm danh sự kiện
@router.post("/{event_id}/check-in")
async def check_in_event(
    event_id: int,
    user_id: int,
    current_user: User = Depends(require_department_head),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event.department_id is not None:
        # Tự động từ chối nếu Trưởng ban điểm danh sự kiện của ban khác
        ensure_department_access(current_user, event.department_id)
    ...
```

---

## 🗄️ 4. QUY TẮC CƠ SỞ DỮ LIỆU & ALEMBIC MIGRATION

### 4.1. Nguyên tắc cốt tử:
1. **Tuyệt đối KHÔNG sửa các file migration cũ đã migrate**:
   - `001_initial_schema.py`: Bảng `users`.
   - `002_add_audit_logs.py`: Bảng `audit_logs`.
   - `003_add_departments.py`: Bảng `departments`, `join_requests`.
   - `004_add_events_and_attendance.py`: Bảng `events`, `event_registrations`.
   - `005_add_phase3_features.py`: Bổ sung tính năng sự kiện & điểm danh ảnh.
   - `006_add_phase4_features.py`: Cờ `is_treasurer`, bảng `tasks`, `task_assignees`, `task_comments`, `announcements`, `announcement_reads`, `notifications`, `fee_periods`, `member_fees`, `fee_payments`, `payment_claims`, `expense_requests`, `ledger_entries`.
   - `007_add_phase5_chatbot.py`: Kích hoạt pgvector extension (`CREATE EXTENSION IF NOT EXISTS vector;`), bảng `documents`, `document_chunks` (vector 768 chiều + HNSW cosine index), `conversations`, `chat_messages`, `chat_logs`, `chat_rate_limits`.
2. Luôn tạo file migration mới theo thứ tự số tăng dần (ví dụ giai đoạn tiếp theo sẽ là `008_...`).
3. Luôn kế thừa đúng `down_revision`:
   - Migration mới nhất hiện tại: `down_revision: Union[str, None] = "007_add_phase5_chatbot"`
4. Các bảng bắt buộc có:
   - `id`: `Integer`, `primary_key=True`, `index=True`
   - `created_at`: `DateTime(timezone=True)`, `server_default=func.now()`
   - `updated_at`: `DateTime(timezone=True)`, `server_default=func.now()`, `onupdate=func.now()`
   - Khóa ngoại liên quan đến `users` hoặc `departments` cần có `ondelete="CASCADE"` hoặc `ondelete="SET NULL"` tùy ngữ cảnh nghiệp vụ.

### 4.2. Xử lý Foreign Key vòng tròn (Circular Dependency)
Khi 2 bảng tham chiếu chéo nhau (như `User.department_id` <-> `Department.head_id`), **bắt buộc cấu hình**:
- Trên `ForeignKey`: thêm `use_alter=True`:
  ```python
  ForeignKey("users.id", ondelete="SET NULL", use_alter=True)
  ```
- Trên `relationship`: thêm `post_update=True`:
  ```python
  head: Mapped[Optional["User"]] = relationship("User", foreign_keys=[head_id], post_update=True, lazy="joined")
  ```

### 4.3. Quy tắc bất biến & An toàn cho dữ liệu tiền tệ (Money & Fund Rules)
1. **Định dạng số tiền:** Lưu kiểu số nguyên `BIGINT` (VND), tuyệt đối không dùng kiểu số thực (`Float/Double`) để tránh sai số dấu phẩy động. Mọi số tiền giao dịch phải > 0.
2. **Tính bất biến (Immutable Ledger):** Bản ghi tiền (`fee_payments`, `ledger_entries`) **KHÔNG BAO GIỜ bị xóa hay sửa số tiền** sau khi tạo. Nếu có sai sót, thực hiện thao tác **HỦY (VOID)** kèm `void_reason`, `voided_by_id`, `voided_at`.
3. **Tính toán động (Dynamic Computation):**
   - **Số dư quỹ** = `SUM(income) - SUM(expense)` từ các bút toán chưa bị hủy (`voided_at IS NULL`).
   - **Trạng thái quá hạn** của task và hội phí được tính toán so với `due_date < now()`, không lưu cứng.
   - Khoản nợ còn lại = `(amount_due - discount_amount) - total_paid`.
4. **Nguyên tắc tách bạch:** Người tạo đề xuất chi không được tự phê duyệt đề xuất của chính mình nếu CLB còn Admin khác.
5. **Kiểm soát vượt chi:** Chi thực tế vượt quá 10% so với số tiền đã duyệt bắt buộc phải gửi Admin phê duyệt lại.
6. **Chặn số dư âm:** Giao dịch chi bị từ chối nếu số tiền chi vượt quá số dư hiện có của quỹ.

### 4.4. Lệnh chạy Migration
- Chạy cập nhật DB lên mới nhất:
  ```bash
  cd backend
  alembic upgrade head
  ```
- Xem phiên bản hiện tại:
  ```bash
  alembic current
  ```
- Rollback về phiên bản trước (nếu cần):
  ```bash
  alembic downgrade -1
  ```

---

## 📝 5. QUY TẮC THIẾT KẾ BACKEND API & AUDIT LOGGING

### 5.1. Định dạng kết quả trả về danh sách phân trang chuẩn:
Mọi endpoint trả về danh sách đều dùng generic model `PaginatedResponse[T]` từ `app.schemas.common`:
```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "page_size": 10
}
```

### 5.2. Luôn eager load quan hệ trong Async SQLAlchemy 2.0:
Khi query model có liên kết foreign key (như `User.department`), dùng `joinedload` hoặc `selectinload` để tránh lỗi `MissingGreenlet`:
```python
from sqlalchemy.orm import joinedload

stmt = select(User).options(joinedload(User.department)).where(...)
```

### 5.3. Ghi Audit Log an toàn:
Mọi hành động nhạy cảm (Tạo, Sửa, Xóa, Đổi vai trò, Gán ban, Điểm danh, Thu chi) **bắt buộc ghi log**:
```python
from app.api.endpoints.auth import get_client_ip
from app.core.audit import record_audit_event

client_ip = get_client_ip(request)
await record_audit_event(
    db,
    action="EVENT_CREATED",
    actor=f"user_id:{current_user.id}",
    target=f"event_id:{new_event.id}",
    ip_address=client_ip,
    details={"title": new_event.title, "department_id": new_event.department_id},
)
await db.commit()
```

---

## 🎨 6. QUY TẮC THIẾT KẾ FRONTEND (REACT + TYPESCRIPT)

### 6.1. Nguyên tắc kết nối API:
- **Tập trung tại [client.ts](file:///c:/Users/ADMIN_LaptopEDG/Downloads/CLB%20sinh%20vi%C3%AAn/frontend/src/api/client.ts):** Mọi lệnh gọi API phải được định nghĩa trong object `api` (ví dụ: `api.events.list`, `api.events.create`, `api.events.checkIn`).
- Tự động bắt lỗi 401 hết hạn và điều hướng về `/login?expired=1`.
- Quăng lỗi dạng `ApiError` với message tiếng Việt rõ ràng từ backend.

### 6.2. Kiểu dữ liệu TypeScript:
- Mọi model và request/response body phải được khai báo trong [frontend/src/types/index.ts](file:///c:/Users/ADMIN_LaptopEDG/Downloads/CLB%20sinh%20vi%C3%AAn/frontend/src/types/index.ts).
- Khi build production (`npm run build`), TypeScript chạy với chế độ nghiêm ngặt: **không được để biến/import thừa không sử dụng** (`noUnusedLocals`).

### 6.3. Tiêu chuẩn giao diện & Thẩm mỹ:
- Sử dụng CSS Variables định sẵn trong [index.css](file:///c:/Users/ADMIN_LaptopEDG/Downloads/CLB%20sinh%20vi%C3%AAn/frontend/src/index.css) (`var(--primary)`, `var(--card-bg)`, `var(--border-subtle)`, v.v.).
- Sử dụng class chuẩn: `.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.badge`, `.badge-primary`, `.badge-success`, `.data-table`, `.table-container`.
- **Tất cả nhãn vai trò hiển thị trên giao diện người dùng phải dùng tiếng Việt:**
  - `admin` ➔ **Quản trị viên**
  - `department_head` ➔ **Trưởng ban**
  - `member` ➔ **Thành viên**

### 6.4. Bảo vệ đường dẫn (Route Guards):
- Dành cho người đã đăng nhập: `<ProtectedRoute><ProfilePage /></ProtectedRoute>`
- Dành cho Quản trị viên: `<AdminRoute allowedRoles={['admin']}><DepartmentManagementPage /></AdminRoute>`
- Dành cho cả Admin & Trưởng ban: `<AdminRoute allowedRoles={['admin', 'department_head']}><EventManagementPage /></AdminRoute>`

---

## 🧪 7. QUY TRÌNH KIỂM THỬ TỰ ĐỘNG (PYTEST)

Mỗi giai đoạn mới **bắt buộc viết test bổ sung** và **đảm bảo các test cũ tiếp tục pass 100%**:
1. Tất cả test đặt trong `backend/tests/test_*.py`.
2. Sử dụng fixture có sẵn trong `conftest.py`:
   - `async_client`: HTTP client bất đồng bộ gọi API
   - `admin_headers`: Bearer token của Admin
   - `dept_head_headers`: Bearer token của Trưởng ban
   - `member_headers`: Bearer token của Thành viên thường
   - `seed_department`, `seed_member`, `seed_admin`
3. Lệnh chạy toàn bộ test:
   ```bash
   cd backend
   pytest
   ```
4. Lệnh chạy riêng file test tính năng:
   ```bash
   pytest tests/test_departments.py
   ```

---

## 🗺️ 8. ROADMAP & CHECKLIST TRIỂN KHAI GIAI ĐOẠN 3 (SỰ KIỆN & ĐIỂM DANH)

Khi bắt đầu Giai đoạn 3, hãy thực hiện theo thứ tự 7 bước sau để không bỏ sót:

### Bước 1: Tạo Database Model
- Tạo file `backend/app/models/event.py`:
  - Bảng `events`: `id`, `title`, `description`, `department_id` (FK tới `departments.id`, nullable cho sự kiện toàn CLB), `location`, `start_time`, `end_time`, `max_participants`, `status` (`draft`, `published`, `completed`, `cancelled`), `created_by_id`.
  - Bảng `event_registrations`: `id`, `event_id`, `user_id` (Unique cặp `event_id` + `user_id`), `registered_at`, `is_attended` (bool), `checked_in_at`, `checked_in_by_id`.
- Export trong `app/models/__init__.py`.

### Bước 2: Tạo Migration Alembic mới
- Tạo file `backend/alembic/versions/004_add_events_and_attendance.py`:
  - `down_revision = "003_add_departments"`
  - Viết `upgrade()` tạo `events` và `event_registrations` kèm các khóa ngoại và index.
  - Viết `downgrade()`.

### Bước 3: Tạo Pydantic Schemas
- Tạo file `backend/app/schemas/event.py`:
  - `EventCreate`, `EventUpdate`, `EventResponse`
  - `EventRegistrationCreate`, `EventCheckInRequest`, `EventRegistrationResponse`

### Bước 4: Viết API Endpoints
- Tạo file `backend/app/api/endpoints/events.py`:
  - `GET /events`: Khách & Hội viên xem sự kiện đã `published`; Admin/Trưởng ban xem thêm sự kiện `draft` ban mình.
  - `POST /events`: Admin tạo mọi sự kiện; Trưởng ban chỉ tạo sự kiện cho `department_id` của mình.
  - `GET /events/{id}`: Xem chi tiết.
  - `PATCH /events/{id}`: Phân quyền qua `ensure_department_access`.
  - `DELETE /events/{id}`: Phân quyền qua `ensure_department_access`.
  - `POST /events/{id}/register`: Thành viên đăng ký tham gia.
  - `GET /events/{id}/attendees`: Admin & Trưởng ban xem danh sách đăng ký.
  - `POST /events/{id}/check-in`: Điểm danh (Trưởng ban điểm danh ban mình, Admin mọi ban).
- Đăng ký router vào `app/api/api.py`.

### Bước 5: Viết Pytest Giai đoạn 3
- Tạo file `backend/tests/test_events.py`:
  - CRUD sự kiện (Admin tạo sự kiện CLB, Trưởng ban tạo sự kiện ban mình).
  - Trưởng ban tạo/sửa sự kiện của ban khác ➔ Bị từ chối 403.
  - Hội viên đăng ký sự kiện và kiểm tra giới hạn `max_participants`.
  - Điểm danh và quyền điểm danh.
  - Chạy `pytest` đảm bảo toàn bộ (hiện tại 47 test + các test mới) đều xanh 100%.

### Bước 6: Mở rộng Frontend
- Cập nhật `frontend/src/types/index.ts`: Thêm `Event`, `EventRegistration`.
- Thêm `api.events.*` trong `frontend/src/api/client.ts`.
- Tạo trang `frontend/src/pages/EventsPage.tsx` (danh sách sự kiện công khai cho hội viên).
- Tạo trang `frontend/src/pages/admin/EventManagementPage.tsx` (quản trị sự kiện, tạo sự kiện, quét mã/điểm danh).
- Đăng ký link trên [Layout.tsx](file:///c:/Users/ADMIN_LaptopEDG/Downloads/CLB%20sinh%20vi%C3%AAn/frontend/src/components/Layout.tsx) và route trên [App.tsx](file:///c:/Users/ADMIN_LaptopEDG/Downloads/CLB%20sinh%20vi%C3%AAn/frontend/src/App.tsx).

### Bước 7: Kiểm thử & Đóng gói
- Chạy `npm run build` trong `frontend` để kiểm tra TypeScript.
- Chạy `docker compose up --build` để xác nhận toàn bộ hệ thống hoạt động trơn tru.

---

### ✅ Giai đoạn 3 Đã hoàn thành (Sự kiện & Điểm danh bằng ảnh)
1. Quản lý sự kiện: tạo, sửa, xuất bản (publish), hủy (cancel).
2. Đăng ký & hủy đăng ký có kiểm tra an toàn concurrency (`SELECT ... FOR UPDATE`), bảo toàn capacity.
3. Điểm danh bằng ẢNH 2 lượt (Đến & Về) với camera HTML5 (`getUserMedia`) có xem trước/chụp lại, fallback tải tệp.
4. Tự động duyệt ảnh camera trong khung giờ (`review_status = approved`), ảnh upload đưa vào chờ duyệt (`pending`).
5. Người tổ chức duyệt/từ chối ảnh kèm lý do, điểm danh thủ công (`manual`), hủy lượt điểm danh.
6. Trang sự kiện công khai (`/public/events`) cho khách và người ngoài xem thông tin chung.
7. Thống kê tham dự & xuất danh sách CSV có UTF-8 BOM xem tiếng Việt chuẩn trên Excel.
8. Volume lưu trữ ảnh bảo mật trong Docker (`attendance_photos`), kiểm tra magic bytes JPEG/PNG, giới hạn 2MB.

---

### ✅ Giai đoạn 4 Đã hoàn thành (Công việc, Thông báo, Hội phí & Sổ quỹ CLB)
1. **Cờ quyền Thủ quỹ (`is_treasurer`) & Phân quyền tài chính:**
   - Admin bật/tắt cờ `is_treasurer` cho user bất kỳ (ghi log kiểm toán).
   - Dependency `require_finance_manager` (`admin` HOẶC `is_treasurer`) kiểm tra DB trực tiếp trên mỗi request.
2. **Quản lý Công việc & Tiến độ (Tasks):**
   - Bảng `tasks`, `task_assignees` (nhiều người nhận việc), `task_comments`.
   - Admin giao việc toàn CLB; Trưởng ban giao việc trong ban; Thành viên chỉ nhận và cập nhật tiến độ (`todo` ➔ `in_progress` ➔ `done`).
   - Tính toán hạn chót/quá hạn động; gắn công việc với Sự kiện (`event_id`); tự động đánh dấu cần giao lại khi user bị khóa/xóa.
   - Giao diện Bảng Kanban 4 cột & danh sách, hỗ trợ trao đổi bình luận trực tiếp.
3. **Thông báo Bảng tin & Thông báo cá nhân (Announcements & Notifications):**
   - Bảng tin `announcements` (scope `all` / `department`), ghim bài viết, thu hồi về draft, theo dõi người đọc (`announcement_reads`).
   - Chuông thông báo `notifications` với bộ đếm chưa đọc trên thanh điều hướng topbar.
   - Tiến trình ngầm định kỳ 15 phút quét nhắc hạn công việc (trước 24h & quá hạn), sự kiện sắp diễn ra, hội phí nợ quá hạn (idempotent, không sinh trùng thông báo).
4. **Quản lý Hội phí (Membership Fees):**
   - Bảng `fee_periods`, `member_fees`, `fee_payments`, `payment_claims`.
   - Người quản lý quỹ tạo kỳ thu, hệ thống tự sinh khoản nợ cho tất cả thành viên đang hoạt động.
   - Tiền tệ `BIGINT` VND, bất biến (void thay vì xóa/sửa); sinh mã phiếu thu liên tục `PT-YYYYMM-XXXX`.
   - Miễn giảm hội phí (`discount_amount` / `waived`) chỉ dành cho Admin kèm lý do bắt buộc & audit log.
   - Hỗ trợ đóng từng phần (`partial`), chặn nộp vượt số nợ.
   - Quy trình chuyển khoản: thành viên copy cú pháp nộp tiền chuẩn (MSSV + Mã kỳ), nộp và gửi claim kèm ảnh biên lai; Người quản lý quỹ đối chiếu và xác nhận (tự động tạo `fee_payment` và bút toán thu `income`).
   - Trưởng ban chỉ xem trạng thái nộp phí của ban mình (bảo mật số tiền nợ & ghi chú).
5. **Thu chi & Sổ quỹ CLB (Funds & Treasury):**
   - Bảng `expense_requests`, `ledger_entries`.
   - Trưởng ban (cho ban mình), Thủ quỹ hoặc Admin tạo đề xuất chi.
   - Admin phê duyệt với NGUYÊN TẮC TÁCH BẠCH (không tự duyệt đề xuất của mình nếu còn Admin khác).
   - Ghi nhận chi thực tế kèm ảnh hóa đơn chứng từ; kiểm soát vượt định mức 10% (vượt phải Admin duyệt lại).
   - Chặn chi làm âm quỹ; số dư quỹ tính toán động từ các bút toán chưa hủy.
   - Báo cáo tài chính theo tháng, danh mục, sự kiện, ban; xuất CSV sổ quỹ.
   - Trang minh bạch tài chính CLB (`/finance/overview`) cho toàn bộ thành viên.
   - Bộ kiểm thử tự động `backend/tests/test_phase4.py` bao phủ toàn bộ 5 nhóm kịch bản, 63/63 test pass 100%.

---

## ✅ 9. GIAI ĐOẠN 5 ĐÃ HOÀN THÀNH: CHATBOT AI TRỢ LÝ CLB & KHO TRI THỨC RAG

Hệ thống đã hoàn tất triển khai Trợ lý ảo AI thông minh tích hợp Google Gemini (Gemini 2.5 Flash / Gemini 2.0 Flash) hoạt động như một Trợ lý toàn diện cho Ban chủ nhiệm và Hội viên:

### 9.1. Kiến trúc Trợ lý AI & Luồng Streaming SSE
- **Google GenAI SDK Adapter (`app/chatbot/gemini_client.py`):**
  - Tách biệt hoàn toàn lớp giao tiếp API ngoài.
  - Hỗ trợ mô hình `gemini-2.5-flash` và `gemini-2.0-flash`.
  - Tự động bắt và chuyển đổi các lỗi API sang exception nội bộ: `QuotaExceededError`, `SafetyBlockedError`, `GeminiTimeoutError`, `GeminiError`.
- **Hội thoại Streaming thời gian thực (`app/chatbot/service.py`):**
  - Sử dụng giao thức Server-Sent Events (SSE) để truyền từng mẩu văn bản về Frontend ngay khi sinh ra.
  - Quản lý phiên hội thoại (`conversations` và `chat_messages`): Người dùng đăng nhập lưu theo `user_id`, khách lưu theo `session_id`.
  - Cắt tỉa ngữ cảnh tự động (giữ 5 lượt hội thoại gần nhất) nhằm tối ưu chi phí token và độ trễ phản hồi.

### 9.2. Kho Tri Thức RAG & Cơ chế Vector Search
- **Bảng `documents` & `document_chunks`:**
  - Lưu trữ các văn bản quy định, quy chế, nội quy, hướng dẫn của CLB (phân loại theo `category` và `audience`: `public`, `member`, `dept_head`, `admin`).
  - Tự động chia nhỏ tài liệu theo cấu trúc Markdown headings (`chunk_markdown`), lưu trữ tiêu đề mục cha để không mất ngữ cảnh.
- **Vector Embedding & HNSW Index:**
  - Sinh vector 768 chiều với mô hình chuẩn `gemini-embedding-001`.
  - Trên PostgreSQL: sử dụng kiểu dữ liệu `vector(768)` từ extension `pgvector` kèm chỉ mục `HNSW` (`cosine distance`) cho tốc độ tìm kiếm dưới 10ms.
  - Dự phòng (Fallback): Triển khai thuật toán tính tương đồng Cosine (`cosine_similarity`) bằng Python thuần khi chạy trên môi trường test SQLite.
  - **Chuẩn hóa tiếng Việt:** Tích hợp hàm xóa dấu tiếng Việt (`remove_vietnamese_accents`) kết hợp tìm kiếm từ khóa, giúp người dùng gõ không dấu vẫn tìm thấy chính xác thông tin.
- **Phân quyền truy cập tài liệu (Audience Isolation):**
  - Khách chỉ tìm thấy tài liệu `audience = 'public'`.
  - Thành viên tìm thấy `public` và `member`.
  - Trưởng ban tìm thấy thêm `dept_head`.
  - Quản trị viên (Admin) tìm thấy toàn bộ tài liệu.

### 9.3. Hệ thống Function Calling Tools theo Phân quyền Server-side
Chatbot trang bị **15+ công cụ Function Calling** (`app/chatbot/tools.py`) được cấp phát chính xác theo vai trò của người dùng:
1. **Dành cho khách vãng lai:** `search_public_documents`, `get_public_events`.
2. **Dành cho mọi thành viên đã đăng nhập:**
   - `search_club_documents`: Tra cứu văn bản nội quy theo phân quyền.
   - `get_events` & `get_event_detail`: Tra cứu danh sách và chi tiết sự kiện CLB.
   - `get_my_event_registrations`: Xem sự kiện mình đã đăng ký.
   - `get_my_attendance_status`: Kiểm tra trạng thái duyệt ảnh điểm danh của mình.
   - `get_my_tasks`: Tra cứu công việc được phân công, lọc việc quá hạn.
   - `get_my_fees`: Tra cứu số dư nợ hội phí, hạn nộp và tình trạng claim chuyển khoản.
   - `get_recent_announcements` & `get_my_unread_notifications`: Bảng tin và thông báo chưa đọc.
   - `get_my_profile_and_department`: Xem hồ sơ và ban chuyên môn.
   - `get_club_finance_overview`: Xem tổng quan quỹ CLB minh bạch.
3. **Dành cho Trưởng ban:**
   - `get_department_members`: Danh sách thành viên trong ban.
   - `get_department_fee_status`: Tình hình hoàn thành hội phí của ban (chỉ trạng thái, bảo mật số tiền).
   - `get_department_tasks` & `get_department_events`: Công việc và sự kiện của ban.
   - `draft_announcement_or_plan`: Soạn thảo nháp nội dung thông báo hoặc kế hoạch sự kiện (chỉ trả về bản nháp trong chat, KHÔNG tự ghi vào CSDL).
4. **Dành cho Thủ quỹ (`is_treasurer` hoặc Admin):**
   - `get_treasury_summary`: Số dư tồn quỹ tiền mặt và tài khoản ngân hàng.
   - `get_pending_expense_requests`: Danh sách đề xuất chi đang chờ duyệt/chờ chi.
   - `get_fee_collection_stats` & `get_overdue_fee_members`: Thống kê tỷ lệ thu phí và danh sách nợ quá hạn.
   - `get_recent_ledger_entries`: Lịch sử bút toán thu chi gần nhất.
5. **Dành cho Quản trị viên (Admin):**
   - `get_club_overall_stats`: Thống kê nhân sự toàn diện CLB.
   - `get_pending_join_requests`: Đơn đăng ký gia nhập chờ duyệt.
   - `get_system_overdue_tasks`: Công việc quá hạn trên toàn hệ thống.

> 🔒 **Nguyên tắc bảo mật cốt tử:** Mọi công cụ là **Read-Only** (không ghi CSDL). Danh tính `user_id` và quyền hạn luôn do **SERVER** trích xuất trực tiếp từ token đăng nhập, không bao giờ nhận hoặc tin cậy `user_id` từ mô hình AI hay prompt.

### 9.4. Nhật Ký Chẩn Đoán & Giới Hạn Hạn Mức (Rate Limiting)
- **Bảng `chat_logs`:** Ghi nhận từng lượt gọi AI bao gồm: độ trễ (latency_ms), token ước tính, intent người dùng, công cụ đã gọi, lỗi gặp phải (nếu có) và cờ đánh dấu câu hỏi chưa trả lời được (`unanswered_query`).
- **Phản hồi người dùng:** Hỗ trợ nút Thumbs Up / Thumbs Down kèm ghi chú đóng góp ý kiến.
- **Giới hạn Rate Limit:** Giới hạn số câu hỏi mỗi ngày theo IP (khách) và theo User (thành viên) để ngăn ngừa spam hoặc cạn kiệt ngân sách API.

### 9.5. Giao Diện Người Dùng Chatbot & Quản Trị
- **Floating Chat Widget (`frontend/src/components/ChatWidget.tsx`):**
  - Nút biểu tượng chatbot nổi ở góc dưới màn hình trên toàn hệ thống.
  - Hỗ trợ câu hỏi mẫu gợi ý (Quick Prompts), hiển thị nguồn trích dẫn tài liệu (Citations), xem công cụ AI đang gọi (Tool Calls Indicator).
- **Quản lý Kho Tri Thức (`frontend/src/pages/admin/KnowledgeManagementPage.tsx`):**
  - Quản trị viên tạo, sửa, xóa tài liệu tri thức CLB, chỉ định audience.
  - Nút "Đồng bộ & Reindex lại Vector" tự động sinh lại vector embedding cho toàn bộ tài liệu.
- **Bảng Đánh Giá Chất Lượng Chatbot (`frontend/src/pages/admin/ChatbotQualityPage.tsx`):**
  - Thống kê tỷ lệ hài lòng (Like / Dislike).
  - Biểu đồ phân bổ độ trễ phản hồi (ms).
  - Bảng danh sách các câu hỏi chưa trả lời được để Admin kịp thời bổ sung tài liệu vào kho tri thức.

---

## ⚡ 10. CHEAT SHEET CÁC LỆNH THƯỜNG DÙNG

| Mục đích | Lệnh thực thi | Thư mục thực hiện |
|---|---|---|
| **Chạy toàn bộ test backend** | `pytest` | `backend/` |
| **Chạy test backend có log chi tiết** | `pytest -v -s` | `backend/` |
| **Chạy test riêng Giai đoạn 5 (Chatbot & RAG)** | `pytest -v tests/test_chatbot.py` | `backend/` |
| **Chạy test riêng Giai đoạn 4** | `pytest -v tests/test_phase4.py` | `backend/` |
| **Chạy test riêng Giai đoạn 3** | `pytest tests/test_events.py` | `backend/` |
| **Kiểm tra migration DB** | `alembic current` | `backend/` |
| **Áp dụng migration mới nhất** | `alembic upgrade head` | `backend/` |
| **Khởi tạo dữ liệu Admin đầu tiên** | `python -m app.core.seed` | `backend/` |
| **Kiểm tra biên dịch Frontend** | `npm run build` | `frontend/` |
| **Chạy dev server Frontend** | `npm run dev` | `frontend/` |
| **Khởi động toàn bộ qua Docker** | `docker compose up -d --build` | Thư mục gốc dự án |
| **Xem log container Backend** | `docker compose logs -f backend` | Thư mục gốc dự án |
| **Dừng hệ thống container** | `docker compose down` | Thư mục gốc dự án |

---
*Tài liệu được cập nhật sau khi hoàn thành toàn diện 5 GIAI ĐOẠN (Hệ thống Quản lý Câu Lạc Bộ Sinh Viên hoàn chỉnh).*
