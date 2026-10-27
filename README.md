# 🎓 Hệ Thống Quản Lý Câu Lạc Bộ Sinh Viên
### *Student Club Management System with AI Assistant (Full-stack FastAPI + React TypeScript + PostgreSQL + pgvector + Docker)*

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.110+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016%20%2B%20pgvector-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Gemini](https://img.shields.io/badge/AI-Google%20Gemini%202.5%20Flash-4285F4.svg?style=flat&logo=google&logoColor=white)](https://aistudio.google.com)
[![Docker](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📌 Giới Thiệu Tổng Quan

**Hệ Thống Quản Lý Câu Lạc Bộ Sinh Viên** là nền tảng quản trị số hóa toàn diện dành cho các câu lạc bộ, đội, nhóm sinh viên trong các trường Đại học/Cao đẳng. Hệ thống giải quyết trọn vẹn bài toán vận hành thực tế: từ khâu tuyển quân, quản lý ban chuyên môn, tổ chức sự kiện & điểm danh bằng camera thực tế, phân công công việc Kanban, thu chi hội phí & minh bạch sổ quỹ, cho đến **Trợ lý ảo AI thông minh (Google Gemini 2.5 Flash)** hỗ trợ giải đáp 24/7 và tra cứu nghiệp vụ bằng ngôn ngữ tự nhiên.

Dự án đã hoàn thành **100% cả 5 Giai đoạn phát triển** với kiến trúc chuẩn micro-ready, phân quyền RBAC đa cấp độ, kiểm soát an toàn giao dịch tiền tệ bất biến và bộ test tự động toàn diện.

---

## 📑 Mục Lục
1. [Điểm Nổi Bật & Tính Năng Trọng Tâm](#-điểm-nổi-bật--tính-năng-trọng-tâm)
2. [Chi Tiết 5 Giai Đoạn Đã Hoàn Thành](#-chi-tiết-5-giai-đoạn-đã-hoàn-thành)
3. [Kiến Trúc Kỹ Thuật & Luồng Dữ Liệu](#-kiến-trúc-kỹ-thuật--luồng-dữ-liệu)
4. [Công Nghệ Sử Dụng (Tech Stack)](#-công-nghệ-sử-dụng-tech-stack)
5. [Cấu Trúc Thư Mục Dự Án](#-cấu-trúc-thư-mục-dự-án)
6. [Hướng Dẫn Khởi Chạy Nhanh (Docker Compose)](#-hướng-dẫn-khởi-chạy-nhanh-docker-compose)
7. [Hướng Dẫn Cài Đặt Môi Trường Cục Bộ (Local Dev)](#-hướng-dẫn-cài-đặt-môi-trường-cục-bộ-local-dev)
8. [Cấu Hình Biến Môi Trường (.env)](#-cấu-hình-biến-môi-trường-env)
9. [Tài Khoản Mặc Định & Ma Trận Phân Quyền](#-tài-khoản-mặc-định--ma-trận-phân-quyền)
10. [Kiểm Thử Tự Động (Automated Testing)](#-kiểm-thử-tự-động-automated-testing)
11. [Tài Liệu API (Swagger / OpenAPI)](#-tài-liệu-api-swagger--openapi)
12. [Tài Liệu Chuyên Sâu Cho Lập Trình Viên](#-tài-liệu-chuyên-sâu-cho-lập-trình-viên)

---

## 🌟 Điểm Nổi Bật & Tính Năng Trọng Tâm

- 🔐 **Bảo mật & Phân quyền chặt chẽ:** Xác thực JWT (Access + Refresh Token), mã hóa mật khẩu bcrypt, chống brute-force (Rate Limiter), phân quyền RBAC 3 vai trò (`admin`, `department_head`, `member`) cùng cờ quyền Thủ quỹ (`is_treasurer`).
- 📸 **Điểm danh ảnh Camera 2 lượt (Check-in / Check-out):** Tích hợp Web Camera HTML5 trực tiếp, tự động duyệt ảnh trong khung giờ quy định, chống gian lận, fallback upload ảnh, xuất CSV danh sách điểm danh UTF-8 BOM xem chuẩn trên Excel.
- 📋 **Quản lý công việc Kanban trực quan:** Kéo thả/chuyển trạng thái công việc (`todo` ➔ `in_progress` ➔ `done`), giao việc đa người nhận, liên kết công việc với sự kiện cụ thể, trao đổi bình luận trực tiếp.
- 💰 **Tài chính & Sổ quỹ bất biến (Immutable Ledger):** Lưu trữ tiền tệ kiểu số nguyên `BIGINT` VND, không xóa/sửa số tiền (thay bằng thao tác Void), sinh mã phiếu thu `PT-YYYYMM-XXXX`, quy trình gửi claim chuyển khoản kèm ảnh biên lai, kiểm soát vượt chi 10%, trang minh bạch tài chính cho toàn bộ hội viên.
- 🤖 **Trợ lý ảo AI & RAG Kho Tri Thức CLB (Gemini 2.5 Flash):**
  - Trò chuyện streaming SSE thời gian thực mượt mà.
  - Tìm kiếm ngữ nghĩa tài liệu quy chế, nội quy CLB với pgvector / HNSW vector index & chuẩn hóa tiếng Việt không dấu.
  - Phân quyền dữ liệu theo vai trò (Audience Filtering: public, member, dept_head, admin).
  - Hệ thống **15+ Function Calling Tools** tự động tra cứu sự kiện, điểm danh, công việc, hội phí, quỹ tiền, soạn thảo nháp thông báo và kế hoạch.
  - Giao diện Floating Chat Widget toàn hệ thống, bảng quản trị tài liệu tri thức và màn hình chẩn đoán chất lượng Chatbot chuyên sâu.

---

## 🚀 Chi Tiết 5 Giai Đoạn Đã Hoàn Thành

### 1️⃣ GIAI ĐOẠN 1: Xác Thực, Phân Quyền & Đơn Gia Nhập CLB
- Đăng nhập, cấp phát JWT cặp token an toàn, lưu thông tin hồ sơ sinh viên (MSSV, Lớp, Khoa, SĐT, Email).
- Trang nộp đơn gia nhập CLB công khai (`/join`) cho sinh viên mới đăng ký nguyện vọng ban chuyên môn, lý do tham gia và kỹ năng sở trường.
- Quy trình xét duyệt đơn: Quản trị viên duyệt hồ sơ, tạo tài khoản và tự động gửi thông báo kết quả.
- Ghi nhận nhật ký kiểm toán hệ thống an toàn (Audit Logs) cho mọi hành động nhạy cảm.

### 2️⃣ GIAI ĐOẠN 2: Ban Chuyên Môn & Cơ Cấu Tổ Chức
- Quản lý danh mục ban chuyên môn (CRUD Ban, chỉ tiêu tuyển quân, mô tả nhiệm vụ, bổ nhiệm/thay đổi Trưởng ban).
- Quản lý danh sách thành viên theo từng ban: phân loại trạng thái hoạt động (`active`, `inactive`, `suspended`), chuyển đổi ban chuyên môn, phân quyền trưởng ban quản lý hội viên ban mình.
- Bảng phân quyền RBAC phân tách rõ ràng phạm vi tác động (Department Scope).

### 3️⃣ GIAI ĐOẠN 3: Sự Kiện & Điểm Danh Ảnh Camera 2 Lượt
- Quản lý vòng đời sự kiện: Tạo dự thảo, phê duyệt, xuất bản (`published`), hủy sự kiện. Hỗ trợ sự kiện toàn trường và sự kiện nội bộ theo ban.
- Đăng ký sự kiện concurrency-safe (`SELECT ... FOR UPDATE`), khóa giới hạn số lượng tham gia tối đa (`max_participants`), chống tình trạng đăng ký vượt hạn mức khi lượng truy cập lớn.
- **Điểm danh bằng ảnh 2 lượt:** Chụp ảnh check-in khi đến và check-out khi về qua Camera Web trực tiếp (`getUserMedia`) kèm xem trước và chụp lại.
- Cơ chế tự động duyệt ảnh hợp lệ trong khung giờ; ảnh tải tệp đưa vào hàng đợi kiểm duyệt (`pending`); ban tổ chức có thể duyệt/từ chối kèm lý do hoặc điểm danh thủ công.
- Cổng xem sự kiện công khai (`/public/events`) cho sinh viên toàn trường theo dõi lịch hoạt động.
- Xuất danh sách tham gia và điểm danh ra file CSV (UTF-8 BOM hiển thị tiếng Việt có dấu chuẩn xác trong Microsoft Excel).

### 4️⃣ GIAI ĐOẠN 4: Công Việc, Thông Báo, Hội Phí & Sổ Quỹ Minh Bạch
- **Quản lý công việc (Tasks & Kanban):**
  - Giao việc theo sự kiện hoặc theo ban, hỗ trợ giao nhiều người nhận (`task_assignees`).
  - Trạng thái công việc: Cần làm (`todo`), Đang làm (`in_progress`), Hoàn thành (`done`).
  - Cảnh báo hạn chót và phát hiện quá hạn động (`is_overdue`); cơ chế đánh dấu việc cần giao lại (`needs_reassignment`) khi thành viên bị khóa hoặc đổi ban.
  - Khu vực trao đổi bình luận công việc theo thời gian thực.
- **Bảng tin & Chuông thông báo (Announcements & Notifications):**
  - Bảng tin thông báo toàn CLB hoặc theo ban; tính năng ghim bài viết quan trọng; quản lý người đã đọc bài (`announcement_reads`).
  - Chuông thông báo cá nhân trên thanh điều hướng topbar kèm số đếm chưa đọc.
  - Background Worker chạy ngầm định kỳ 15 phút/lần tự động quét và gửi thông báo nhắc việc sắp đến hạn (trước 24h), việc quá hạn, sự kiện sắp bắt đầu và hội phí nợ quá hạn.
- **Quản lý Hội phí (Membership Fees):**
  - Tạo kỳ thu phí, tự động phát sinh khoản nợ đồng loạt cho tất cả thành viên đang hoạt động (`active`).
  - Định dạng tiền tệ `BIGINT` VND, bảo đảm bất biến (không xóa/sửa số tiền, áp dụng hủy Void).
  - Tự động sinh mã phiếu thu chuẩn hóa liên tục: `PT-YYYYMM-XXXX`.
  - Hỗ trợ đóng từng phần (`partial`), chặn nộp vượt dư nợ.
  - Chính sách miễn giảm hội phí có điều kiện (`discount_amount` / `waived`) chỉ dành cho Admin, bắt buộc nhập lý do và ghi nhận audit log.
  - Hướng dẫn cú pháp chuyển khoản chuẩn (MSSV + Mã kỳ thu); sinh viên gửi claim kèm ảnh biên lai; người quản lý quỹ đối soát và xác nhận duyệt tiền.
- **Thu chi & Sổ quỹ CLB (Funds & Treasury):**
  - Cờ quyền Thủ quỹ (`is_treasurer`) phân quyền quản lý tài chính độc lập.
  - Trưởng ban tạo đề xuất chi cho ban; Admin phê duyệt tuân thủ **Nguyên tắc tách bạch** (không tự duyệt đề xuất của chính mình nếu CLB còn Admin khác).
  - Ghi nhận chi thực tế kèm chứng từ hóa đơn; kiểm soát vượt định mức 10% (vượt phải gửi duyệt lại).
  - Chặn chi làm âm quỹ; số dư quỹ tính toán động từ tổng các bút toán chưa hủy (`voided_at IS NULL`).
  - Báo cáo tài chính theo tháng, danh mục, ban chuyên môn, sự kiện; xuất file CSV sổ quỹ.
  - Trang minh bạch tài chính (`/finance/overview`) giúp mọi thành viên đều có thể theo dõi sự trong sạch của quỹ CLB.

### 5️⃣ GIAI ĐOẠN 5: Chatbot AI Trợ Lý Ảo & Kho Tri Thức RAG
- **Tích hợp Google Gemini 2.5 Flash / Gemini 2.0 Flash:**
  - Kết nối qua Google GenAI SDK chính thức với cơ chế Server-Sent Events (SSE) streaming ký tự thời gian thực.
  - Hỗ trợ câu hỏi xã giao, hội thoại nhiều lượt (giữ ngữ cảnh 5 lượt gần nhất) và xử lý lỗi mạng/quota/safety mềm dẻo.
- **Kho Tri Thức RAG (Retrieval-Augmented Generation):**
  - Lưu trữ tài liệu quy chế, điều lệ, nội quy, hướng dẫn trong bảng `documents`.
  - Tự động chunking thông minh theo tiêu đề Markdown, sinh vector nhúng 768 chiều bằng `gemini-embedding-001`.
  - Tìm kiếm vector tương đồng qua extension `pgvector` với chỉ mục `HNSW` (`cosine distance`) trên PostgreSQL, kết hợp thuật toán loại bỏ dấu tiếng Việt để tìm kiếm chính xác ngay cả khi người dùng gõ không dấu.
  - Phân quyền truy cập tài liệu tri thức (Audience Filtering: `public`, `member`, `dept_head`, `admin`).
- **Hệ thống 15+ Function Calling Tools theo vai trò:**
  - *Khách vãng lai:* `search_public_documents`, `get_public_events`.
  - *Thành viên đã đăng nhập:* `search_club_documents`, `get_events`, `get_event_detail`, `get_my_event_registrations`, `get_my_attendance_status`, `get_my_tasks`, `get_my_fees`, `get_recent_announcements`, `get_my_unread_notifications`, `get_my_profile_and_department`, `get_club_finance_overview`.
  - *Trưởng ban:* `get_department_members`, `get_department_fee_status`, `get_department_tasks`, `get_department_events`, `draft_announcement_or_plan` (soạn nháp thông báo/kế hoạch sự kiện).
  - *Thủ quỹ:* `get_treasury_summary`, `get_pending_expense_requests`, `get_fee_collection_stats`, `get_overdue_fee_members`, `get_recent_ledger_entries`.
  - *Quản trị viên (Admin):* `get_club_overall_stats`, `get_pending_join_requests`, `get_system_overdue_tasks`.
- **An toàn & Quản trị AI:**
  - Server-side Executor: Tham số danh tính người dùng luôn lấy từ token đăng nhập của phiên, không bao giờ tin cậy `user_id` từ client hay prompt AI.
  - Rate Limiter giới hạn số câu hỏi mỗi ngày theo IP (khách) và theo User (thành viên).
  - Bảng ghi chẩn đoán `chat_logs`: Ghi nhận độ trễ (ms), token sử dụng, intent phân loại, lỗi nếu có.
  - Giao diện Admin quản trị kho tri thức (`/admin/knowledge`) cho phép thêm/sửa/xóa tài liệu và reindex toàn bộ vector chỉ với 1 click.
  - Giao diện Admin giám sát chất lượng (`/admin/chatbot-quality`): Thống kê đánh giá hài lòng (Like/Dislike), biểu đồ phân bố độ trễ, bảng thống kê các câu hỏi chưa trả lời được (Unanswered Queries) để bổ sung tri thức kịp thời.

---

## 🏗️ Kiến Trúc Kỹ Thuật & Luồng Dữ Liệu

```
[ Trình duyệt / Thiết bị người dùng ]
                   │
                   │ (HTTP Port :80)
                   ▼
┌────────────────────────────────────────────────────────┐
│              Nginx Reverse Proxy Gateway               │
│   ├── /api/*   ──────► FastAPI Backend (:8000)        │
│   │                    (REST API + SSE Stream)         │
│   └── /*       ──────► React + Vite Frontend (:80)     │
│                        (Static SPA Build)              │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌─────────────────────────┐  ┌───────────────────────────┐
│  PostgreSQL 16 Database │  │   Google Gemini AI Cloud  │
│  - SQLAlchemy 2.0 Async │  │   - gemini-2.5-flash      │
│  - pgvector + HNSW Index│  │   - gemini-embedding-001  │
│  - Alembic Migrations   │  │   - Function Calling      │
│  - Immutable Ledgers    │  │   - RAG Semantic Search   │
└─────────────────────────┘  └───────────────────────────┘
```

---

## 💻 Công Nghệ Sử Dụng (Tech Stack)

| Lớp (Layer) | Công nghệ / Thư viện | Vai trò |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite | Xây dựng giao diện Single Page Application hiện đại, mượt mà |
| | React Router DOM v6 | Quản lý điều hướng và phân luồng bảo vệ Route (Route Guards) |
| | Lucide React | Hệ thống biểu tượng (icons) chuẩn hóa |
| | Vanilla CSS Design System | Biến số giao diện, hiệu ứng Glassmorphism, phong cách hiện đại |
| **Backend** | Python 3.11+, FastAPI | Máy chủ API RESTful bất đồng bộ hiệu năng cao |
| | SQLAlchemy 2.0 (Asyncpg) | ORM truy xuất CSDL bất đồng bộ với cơ chế kiểm soát concurrency |
| | Alembic | Quản lý phiên bản và lịch sử di chuyển cơ sở dữ liệu (Migrations) |
| | Pydantic v2 | Ràng buộc và xác thực dữ liệu đầu vào / đầu ra đa tầng |
| | Pytest + pytest-asyncio | Khung kiểm thử tự động cách ly |
| | Passlib (bcrypt), PyJWT | Mã hóa mật khẩu và tạo token định danh bảo mật |
| **Trí tuệ nhân tạo (AI)** | Google GenAI SDK | Giao tiếp mô hình Google Gemini 2.5 Flash & Gemini 2.0 Flash |
| | pgvector (HNSW Index) | Lưu trữ và tìm kiếm vector nhúng ngữ nghĩa (RAG) |
| | Server-Sent Events (SSE) | Truyền dữ liệu streaming hội thoại thời gian thực |
| **Hạ tầng & Triển khai** | Docker & Docker Compose | Đóng gói môi trường toàn bộ hệ thống (db, backend, frontend, nginx) |
| | Nginx (Alpine) | Cổng Reverse Proxy, định tuyến API và phục vụ SPA frontend |

---

## 📂 Cấu Trúc Thư Mục Dự Án

```
CLB sinh viên/
├── .env.example                # File mẫu biến môi trường chuẩn
├── docker-compose.yml          # Triển khai hệ thống production hoàn chỉnh
├── docker-compose.dev.yml      # Triển khai môi trường phát triển cục bộ
├── DEVELOPMENT_GUIDE.md        # Tài liệu hướng dẫn kỹ thuật chi tiết
├── README.md                   # Tài liệu tổng quan dự án (file này)
│
├── knowledge/                  # Kho tài liệu Markdown chuẩn phục vụ RAG
│   ├── 01_gioi_thieu_clb_va_cac_ban.md
│   ├── 02_dieu_kien_va_quy_trinh_gia_nhap.md
│   ├── 03_quy_dinh_hoi_phi.md
│   ├── 04_quy_dinh_diem_danh_va_su_kien.md
│   ├── 05_quyen_loi_nghia_vu_khen_thuong_ky_luat.md
│   ├── 06_huong_dan_su_dung_he_thong.md
│   ├── 07_thong_tin_lien_he.md
│   └── 08_quy_dinh_danh_cho_truong_ban.md
│
├── nginx/
│   └── default.conf            # Cấu hình reverse proxy và gzip compression
│
├── backend/
│   ├── alembic/
│   │   ├── versions/           # Danh sách migrations từ 001 đến 007
│   │   │   ├── 001_initial_schema.py
│   │   │   ├── 002_add_audit_logs.py
│   │   │   ├── 003_add_departments.py
│   │   │   ├── 004_add_events_and_attendance.py
│   │   │   ├── 005_add_event_approval_workflow.py
│   │   │   ├── 006_add_phase4_features.py
│   │   │   └── 007_add_phase5_chatbot.py
│   │   └── env.py              # Cấu hình kết nối async migration
│   ├── app/
│   │   ├── api/
│   │   │   ├── api.py          # Master Router nạp tất cả các module
│   │   │   └── endpoints/      # Controllers theo từng module: auth, users, departments,
│   │   │                       # events, attendances, tasks, announcements, notifications,
│   │   │                       # fees, funds, chat, public_chat, knowledge, audit_logs
│   │   ├── chatbot/            # Module Trợ lý AI và RAG
│   │   │   ├── gemini_client.py# Adapter giao tiếp Google GenAI SDK
│   │   │   ├── prompt.py       # Kỹ nghệ Prompt theo từng vai trò
│   │   │   ├── rag.py          # Bộ tách chunk, vector search và chuẩn hóa tiếng Việt
│   │   │   ├── service.py      # Bộ điều phối luồng trò chuyện và SSE streaming
│   │   │   └── tools.py        # 15+ Function Calling Declarations & Server Executors
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic Settings đọc cấu hình .env
│   │   │   ├── database.py     # Khởi tạo Async Engine, Session & Base Model
│   │   │   ├── deps.py         # Dependencies phân quyền dùng chung (RBAC)
│   │   │   ├── security.py     # Xử lý băm bcrypt và JWT encode/decode
│   │   │   ├── audit.py        # Ghi nhật ký kiểm toán vào CSDL & Console
│   │   │   ├── rate_limiter.py # Chống tấn công brute-force mật khẩu
│   │   │   └── seed.py         # Khởi tạo dữ liệu mẫu và tài khoản Admin ban đầu
│   │   ├── models/             # Định nghĩa SQLAlchemy Models (ORM)
│   │   ├── schemas/            # Pydantic Schemas xác thực dữ liệu
│   │   ├── services/           # Nghiệp vụ mở rộng (Background deadline reminder)
│   │   └── main.py             # Điểm khởi chạy FastAPI app & Lifespan worker
│   ├── tests/                  # Bộ kiểm thử tự động toàn diện Pytest
│   ├── Dockerfile
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── client.ts       # Điểm tập trung duy nhất gọi API Backend
    │   ├── components/         # Layout, Header, Modal, Pagination, Alert, CameraCapture,
    │   │                       # ChatWidget, AttendancePhotoModal, QuickDateTimePicker...
    │   ├── context/
    │   │   └── AuthContext.tsx # Quản lý phiên đăng nhập và quyền hạn người dùng
    │   ├── pages/              # Các trang chức năng:
    │   │   ├── HomePage.tsx            # Trang chủ với các module, tin tức và thống kê
    │   │   ├── LoginPage.tsx           # Trang đăng nhập
    │   │   ├── JoinPage.tsx            # Trang đăng ký gia nhập CLB
    │   │   ├── EventsPage.tsx          # Danh sách sự kiện nội bộ
    │   │   ├── EventDetailPage.tsx    # Chi tiết sự kiện & Điểm danh ảnh camera
    │   │   ├── PublicEventsPage.tsx    # Cổng sự kiện công khai cho sinh viên ngoài
    │   │   ├── TasksPage.tsx           # Bảng Kanban và danh sách công việc
    │   │   ├── AnnouncementsPage.tsx   # Bảng tin thông báo CLB & Ban
    │   │   ├── MyFeesPage.tsx          # Tra cứu hội phí cá nhân & nộp claim
    │   │   ├── FinanceOverviewPage.tsx # Trang minh bạch tài chính CLB
    │   │   ├── ProfilePage.tsx         # Hồ sơ cá nhân và đổi mật khẩu
    │   │   └── admin/                  # Khu vực quản trị:
    │   │       ├── MemberManagementPage.tsx     # Quản lý thành viên & phân quyền
    │   │       ├── DepartmentManagementPage.tsx # Quản lý ban chuyên môn
    │   │       ├── JoinRequestsPage.tsx         # Phê duyệt đơn gia nhập
    │   │       ├── FeeManagementPage.tsx        # Quản trị kỳ thu phí & duyệt claim
    │   │       ├── FundManagementPage.tsx       # Quản trị sổ quỹ & duyệt chi
    │   │       ├── KnowledgeManagementPage.tsx  # Quản lý kho tri thức RAG CLB
    │   │       ├── ChatbotQualityPage.tsx       # Bảng đánh giá chất lượng Chatbot
    │   │       └── AuditLogsPage.tsx            # Nhật ký kiểm toán hệ thống
    │   └── types/
    │       └── index.ts        # Toàn bộ TypeScript interfaces chuẩn hóa
    ├── Dockerfile
    ├── package.json
    └── vite.config.ts
```

---

## ⚡ Hướng Dẫn Khởi Chạy Nhanh (Docker Compose)

Khuyến nghị sử dụng Docker Compose vì đây là phương thức cài đặt nhanh nhất, tự động thiết lập toàn bộ môi trường (PostgreSQL có pgvector, FastAPI Backend, React Frontend và Nginx Gateway).

### Bước 1: Sao chép file cấu hình môi trường
```bash
cp .env.example .env
```
> 💡 **Quan trọng:** Mở file `.env` và điền khóa API Gemini của bạn tại dòng `GEMINI_API_KEY=your_gemini_api_key_here` (lấy miễn phí tại [Google AI Studio](https://aistudio.google.com/app/apikey)) để kích hoạt toàn bộ tính năng Chatbot AI.

### Bước 2: Khởi chạy toàn bộ hệ thống
```bash
docker compose up -d --build
```

### Bước 3: Truy cập hệ thống
Sau khi các container khởi động thành công:
- 🌐 **Giao diện Web Người Dùng:** [http://localhost](http://localhost) (hoặc [http://localhost:80](http://localhost:80))
- 📄 **Tài liệu API Swagger:** [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- 📊 **Tài liệu API ReDoc:** [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc)

### Bước 4: Tải dữ liệu tri thức ban đầu vào Chatbot
Sau khi hệ thống lên, bạn có thể nạp ngay 8 tài liệu quy chế từ thư mục `knowledge/` vào hệ thống vector của Chatbot bằng cách:
1. Đăng nhập tài khoản Admin (`admin@clb.edu.vn` / `Admin@123456`).
2. Truy cập menu **Quản trị ➔ Quản lý Kho Tri Thức** (`/admin/knowledge`).
3. Bấm nút **"Đồng bộ & Reindex lại Vector"** để hệ thống tự động sinh embedding nhúng vào CSDL.

---

## 🛠️ Hướng Dẫn Cài Đặt Môi Trường Cục Bộ (Local Dev)

Nếu bạn muốn debug hoặc phát triển từng phần mã nguồn trên máy chủ:

### Yêu cầu hệ thống:
- Python 3.11 hoặc mới hơn.
- Node.js 18+ và npm 9+.
- PostgreSQL 16 đã cài sẵn extension `pgvector`.

### 1. Cấu hình Backend:
```bash
# 1. Di chuyển vào thư mục backend
cd backend

# 2. Tạo môi trường ảo Python
python -m venv venv

# 3. Kích hoạt môi trường ảo:
# Trên Windows:
venv\Scripts\activate
# Trên Linux/macOS:
source venv/bin/activate

# 4. Cài đặt các gói phụ thuộc
pip install -r requirements.txt

# 5. Cấu hình file .env trong thư mục backend (trỏ tới PostgreSQL cục bộ)
# 6. Chạy migration tạo các bảng CSDL
alembic upgrade head

# 7. Khởi tạo tài khoản Admin mặc định
python -m app.core.seed

# 8. Chạy server FastAPI ở chế độ reload
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Cấu hình Frontend:
```bash
# 1. Mở một cửa sổ dòng lệnh khác, di chuyển vào thư mục frontend
cd frontend

# 2. Cài đặt các thư viện Node.js
npm install

# 3. Khởi chạy máy chủ Vite Development
npm run dev
```
Trình duyệt sẽ mở tại địa chỉ: [http://localhost:5173](http://localhost:5173).

---

## ⚙️ Cấu Hình Biến Môi Trường (.env)

Các tham số cấu hình chính trong `.env`:

```ini
# ============================================================
# CẤU HÌNH HỆ THỐNG CHUNG
# ============================================================
PROJECT_NAME="Hệ Thống Quản Lý Câu Lạc Bộ Sinh Viên"
ENV_MODE=development
DEBUG=True

# ============================================================
# BẢO MẬT & JWT
# ============================================================
SECRET_KEY=change-this-to-a-super-secret-key-at-least-32-chars-long-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# ============================================================
# CƠ SỞ DỮ LIỆU POSTGRESQL (KÈM PGVECTOR)
# ============================================================
POSTGRES_SERVER=db
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres_password_123
POSTGRES_DB=clb_system_db
DATABASE_URL=postgresql+asyncpg://postgres:postgres_password_123@db:5432/clb_system_db

# ============================================================
# TÀI KHOẢN ADMIN ĐẦU TIÊN
# ============================================================
FIRST_ADMIN_EMAIL=admin@clb.edu.vn
FIRST_ADMIN_PASSWORD=Admin@123456
FIRST_ADMIN_STUDENT_ID=ADMIN001
FIRST_ADMIN_FULL_NAME=Quản Trị Viên Hệ Thống

# ============================================================
# GIAI ĐOẠN 5: CẤU HÌNH CHATBOT AI & RAG
# ============================================================
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIM=768

# Giới hạn số câu hỏi mỗi ngày chống spam
CHAT_MAX_QUESTIONS_PER_USER_PER_DAY=50
CHAT_MAX_QUESTIONS_PER_IP_PER_DAY=20

# Tham số RAG Semantic Search
CHAT_RETRIEVAL_TOP_K=4
CHAT_RETRIEVAL_MIN_SCORE=0.65
CHAT_HISTORY_TURNS=5
CHAT_THINKING_BUDGET=0
```

---

## 🔑 Tài Khoản Mặc Định & Ma Trận Phân Quyền

Hệ thống được khởi tạo sẵn với tài khoản Quản trị viên (Admin) cao nhất:
- **Email:** `admin@clb.edu.vn`
- **Mật khẩu:** `Admin@123456`

### Bảng Ma Trận Phân Quyền Hệ Thống

| Khu Vực / Nghiệp Vụ | Admin | Thủ Quỹ (`is_treasurer`) | Trưởng Ban | Thành Viên | Khách Vãng Lai |
|---|:---:|:---:|:---:|:---:|:---:|
| **Đăng nhập & Nộp đơn gia nhập** | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Quản lý ban chuyên môn & Duyệt đơn** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Phân quyền & Bật cờ Thủ quỹ** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Xem sự kiện công khai** | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Tạo sự kiện toàn CLB** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Tạo sự kiện Ban & Duyệt ảnh điểm danh** | ✔ | ✘ | Ban mình | ✘ | ✘ |
| **Đăng ký sự kiện & Điểm danh ảnh camera** | ✔ | ✔ | ✔ | ✔ | ✘ |
| **Giao việc toàn CLB** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Giao việc trong ban chuyên môn** | ✔ | ✘ | Ban mình | ✘ | ✘ |
| **Nhận việc & Cập nhật Kanban của mình** | ✔ | ✔ | ✔ | ✔ | ✘ |
| **Đăng thông báo bảng tin CLB / Ghim bài** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Đăng thông báo bảng tin Ban** | ✔ | ✘ | Ban mình | ✘ | ✘ |
| **Tạo kỳ thu hội phí & Miễn giảm phí** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Ghi nhận thu tiền mặt & Duyệt claim chuyển khoản** | ✔ | ✔ | ✘ | ✘ | ✘ |
| **Tạo đề xuất chi ngân sách** | ✔ | ✔ | Ban mình | ✘ | ✘ |
| **Phê duyệt đề xuất chi (Tách bạch người tạo)** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Ghi nhận chi thực tế kèm chứng từ hóa đơn** | ✔ | ✔ | ✘ | ✘ | ✘ |
| **Xem trang minh bạch tài chính CLB** | ✔ | ✔ | ✔ | ✔ | ✘ |
| **Hỏi đáp Chatbot AI công khai** | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Tra cứu việc, hội phí, điểm danh cá nhân qua AI** | ✔ | ✔ | ✔ | ✔ | ✘ |
| **Sử dụng Tool AI quản lý ban & Soạn nháp** | ✔ | ✘ | Ban mình | ✘ | ✘ |
| **Sử dụng Tool AI báo cáo tồn quỹ & Sổ quỹ** | ✔ | ✔ | ✘ | ✘ | ✘ |
| **Quản lý kho tri thức RAG & Reindex vector** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Xem chẩn đoán chất lượng Chatbot & Nhật ký lỗi** | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Xem nhật ký kiểm toán hệ thống (Audit Logs)** | ✔ | ✘ | ✘ | ✘ | ✘ |

---

## 🧪 Kiểm Thử Tự Động (Automated Testing)

Dự án chú trọng độ tin cậy và không gây hồi quy khi bổ sung tính năng mới:
- Cơ chế kiểm thử sử dụng **SQLite In-memory / aiosqlite**, độc lập hoàn toàn với CSDL production.
- Module AI Chatbot được giả lập (Mock) 100% tầng giao tiếp Gemini API, bảo đảm kiểm tra đúng logic nghiệp vụ, routing câu hỏi và bảo mật mà không tốn chi phí token.

```bash
# 1. Chạy toàn bộ test suite backend
cd backend
pytest

# 2. Chạy test hiển thị chi tiết tên từng test case
pytest -v

# 3. Chạy kiểm tra riêng từng module:
pytest -v tests/test_auth.py        # Kiểm thử đăng nhập, token, bảo mật
pytest -v tests/test_events.py      # Kiểm thử sự kiện, giới hạn người, điểm danh
pytest -v tests/test_phase4.py      # Kiểm thử công việc, thông báo, hội phí, sổ quỹ
pytest -v tests/test_chatbot.py     # Kiểm thử Trợ lý AI, RAG và Function Calling

# 4. Kiểm tra biên dịch TypeScript phía Frontend
cd ../frontend
npm run build
```

---

## 📡 Tài Liệu API (Swagger / OpenAPI)

Toàn bộ các API endpoints đều tuân thủ chuẩn RESTful, có schema Pydantic xác thực và mô tả tiếng Việt:
- **Swagger Interactive UI:** [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **ReDoc Technical Docs:** [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc)
- **OpenAPI JSON Schema:** [http://localhost:8000/api/openapi.json](http://localhost:8000/api/openapi.json)

### Nhóm Endpoints Chính:
- `/api/auth`: Đăng ký, đăng nhập, cấp lại token, lấy thông tin người dùng hiện tại.
- `/api/users`: Quản trị người dùng, đổi vai trò, bật/tắt cờ thủ quỹ, khóa/mở tài khoản.
- `/api/departments`: CRUD ban chuyên môn, gán trưởng ban, thành viên ban.
- `/api/join-requests`: Tiếp nhận và xử lý đơn xin gia nhập câu lạc bộ.
- `/api/events` & `/api/public/events`: Quản lý sự kiện, đăng ký và xuất file CSV.
- `/api/attendances`: Chụp ảnh điểm danh 2 lượt, duyệt ảnh, kiểm tra ảnh.
- `/api/tasks`: Quản lý công việc Kanban, phân công và bình luận.
- `/api/announcements` & `/api/notifications`: Bảng tin thông báo và chuông nhắc hạn.
- `/api/fees`: Quản lý kỳ thu phí, phát sinh nợ, đóng phí, miễn giảm và duyệt claim.
- `/api/funds`: Đề xuất chi, duyệt chi, ghi sổ quỹ thu chi, báo cáo tài chính.
- `/api/chat` & `/api/public/chat`: Streaming SSE hội thoại AI, lưu vết phản hồi Like/Dislike.
- `/api/knowledge`: Quản lý tài liệu tri thức RAG và reindex vector embedding.
- `/api/audit-logs`: Truy vấn lịch sử kiểm toán an toàn.

---

## 📖 Tài Liệu Chuyên Sâu Cho Lập Trình Viên

Để tìm hiểu sâu hơn về:
- Các nguyên tắc bất biến trong cơ sở dữ liệu và quản trị tiền tệ.
- Chi tiết cấu trúc các bảng CSDL từ migration 001 đến 007.
- Chuẩn viết API endpoints, Pydantic validation và eager loading SQLAlchemy 2.0 Async.
- Cách mở rộng và thêm các Function Calling Tools mới cho Chatbot AI.
- Checklist triển khai tính năng mới mà không làm gãy hệ thống.

👉 Vui lòng đọc tài liệu: **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)**

---

## 👥 Đóng Góp & Bản Quyền

Dự án được xây dựng và phát triển phục vụ mục đích học tập, nghiên cứu và số hóa hoạt động cho các Câu Lạc Bộ Sinh Viên.  
Mọi đóng góp, báo cáo lỗi và đề xuất tính năng mới xin vui lòng gửi qua mục Issues hoặc tạo Pull Request.

**Chúc bạn có trải nghiệm tuyệt vời cùng Hệ Thống Quản Lý Câu Lạc Bộ Sinh Viên!** 🚀
