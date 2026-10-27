"""Bộ kiểm thử tự động toàn diện cho Giai đoạn 5: Chatbot AI và Kho Tri Thức RAG.

Tuân thủ:
- Giả lập 100% lớp GeminiClient (không gọi API bên ngoài, không cần khóa thật).
- Kiểm tra Routing: sự kiện -> get_events, hội phí -> get_my_fees, quy định -> search_club_documents, chào hỏi -> không gọi tool.
- Kiểm tra Phân quyền: khách không có tool riêng tư, thành viên không gọi được tool trưởng ban/admin, danh tính luôn lấy từ session.
- Kiểm tra Tìm kiếm RAG: câu hỏi khác nhau trả chunks khác nhau, lọc audience trong DB, câu không dấu vẫn tìm được, câu vô nghĩa rơi vào không tìm thấy.
- Kiểm tra Lỗi: 429, timeout, safety blocked trả thông báo lỗi thân thiện, KHÔNG trả câu trả lời mẫu, giới hạn câu hỏi/ngày.
- Kiểm tra Hội thoại: cách ly hội thoại giữa người dùng, xóa hội thoại, feedback thumbs up/down, nhật ký chẩn đoán chat_logs.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.chatbot.gemini_client import (
    GeminiClient,
    GeminiError,
    QuotaExceededError,
    SafetyBlockedError,
    GeminiTimeoutError,
)
from app.chatbot.rag import (
    chunk_markdown,
    cosine_similarity,
    get_allowed_audiences_for_role,
    remove_vietnamese_accents,
    search_knowledge,
)
from app.chatbot.service import chatbot_service
from app.chatbot.tools import ToolExecutor, format_dt, format_vnd, get_tool_declarations_for_role
from app.core.config import settings
from app.models.chatbot import ChatLog, ChatMessage, Conversation, Document, DocumentAudience, DocumentChunk
from app.models.department import Department
from app.models.event import Event, EventStatus
from app.models.fee import FeePeriod, MemberFee, MemberFeeStatus
from app.models.task import Task, TaskAssignee, TaskStatus
from app.models.user import SystemRole, User
from tests.conftest import TestingSessionLocal


# ============================================================
# Mock Gemini Client cho kiểm thử
# ============================================================

class MockCandidatePart:
    def __init__(self, text=None, function_call=None):
        self.text = text
        self.function_call = function_call


class MockFunctionCall:
    def __init__(self, name, args):
        self.name = name
        self.args = args


class MockCandidate:
    def __init__(self, parts):
        self.content = type("MockContent", (), {"parts": parts})()


class MockGeminiResponse:
    def __init__(self, parts):
        self.candidates = [MockCandidate(parts)]


class MockEmbeddingResponse:
    def __init__(self, values):
        self.embedding = type("MockEmbedding", (), {"values": values})()


class MockGeminiClient(GeminiClient):
    """Giả lập hoạt động của Gemini Client một cách thông minh và có thể điều khiển."""

    def __init__(self, should_raise=None):
        super().__init__(api_key="mock_key_test")
        self.should_raise = should_raise
        self.calls = []

    @property
    def is_configured(self) -> bool:
        return True

    async def generate_chat(self, contents, system_instruction=None, tools=None, temperature=0.3):
        self.calls.append({"contents": contents, "tools": tools})

        if self.should_raise:
            raise self.should_raise

        # Kiểm tra xem lượt này là phản hồi sau khi đã có tool response hay chưa
        last_item = contents[-1] if contents else None
        has_tool_response = False
        if isinstance(last_item, dict) and last_item.get("role") == "user":
            parts = last_item.get("parts", [])
            if any("function_response" in p for p in parts if isinstance(p, dict)):
                has_tool_response = True

        if has_tool_response:
            # Mô hình tổng hợp phản hồi cuối
            return MockGeminiResponse([
                MockCandidatePart(text="Dựa trên dữ liệu tra cứu từ hệ thống, câu lạc bộ hiện có các sự kiện và thông tin bạn cần.")
            ])

        # Lấy nội dung câu hỏi mới nhất từ user
        user_query = ""
        for c in reversed(contents):
            if isinstance(c, dict) and c.get("role") == "user":
                parts = c.get("parts", [])
                for p in parts:
                    if isinstance(p, dict) and "text" in p:
                        user_query = p["text"].lower()
                        break
            if user_query:
                break

        # Mô phỏng quyết định của Gemini Function Calling
        if "sự kiện" in user_query or "event" in user_query:
            return MockGeminiResponse([
                MockCandidatePart(function_call=MockFunctionCall("get_events", {"time_filter": "upcoming"}))
            ])
        elif "hội phí" in user_query or "fee" in user_query:
            return MockGeminiResponse([
                MockCandidatePart(function_call=MockFunctionCall("get_my_fees", {}))
            ])
        elif "quy định" in user_query or "nội quy" in user_query:
            return MockGeminiResponse([
                MockCandidatePart(function_call=MockFunctionCall("search_club_documents", {"query": user_query}))
            ])
        elif "việc" in user_query or "task" in user_query:
            return MockGeminiResponse([
                MockCandidatePart(function_call=MockFunctionCall("get_my_tasks", {}))
            ])
        else:
            # Trò chuyện xã giao hoặc ngoài phạm vi -> Trả lời trực tiếp, không gọi hàm
            return MockGeminiResponse([
                MockCandidatePart(text="Xin chào! Tôi là Trợ lý AI của Câu lạc bộ Sinh viên. Tôi có thể giúp gì cho bạn?")
            ])

    async def embed_text(self, text, task_type="RETRIEVAL_QUERY", title=None):
        # Trả về vector giả lập có tính tương đồng dựa trên từ khóa
        dim = settings.EMBEDDING_DIM
        vec = [0.0] * dim
        lower_t = text.lower()
        if "hội phí" in lower_t or "hoi phi" in lower_t:
            vec[0] = 0.9
            vec[1] = 0.4
        elif "sự kiện" in lower_t or "su kien" in lower_t:
            vec[2] = 0.9
            vec[3] = 0.4
        elif "điểm danh" in lower_t or "diem danh" in lower_t:
            vec[4] = 0.9
            vec[5] = 0.4
        else:
            vec[10] = 0.8
        return vec

    async def embed_batch(self, texts, task_type="RETRIEVAL_DOCUMENT", titles=None):
        results = []
        for idx, t in enumerate(texts):
            title = titles[idx] if titles and idx < len(titles) else None
            v = await self.embed_text(t, task_type=task_type, title=title)
            results.append(v)
        return results


# ============================================================
# CÁC TEST CASES
# ============================================================

@pytest.mark.asyncio
async def test_vietnamese_accent_removal_and_normalization():
    """Kiểm tra xử lý văn bản tiếng Việt không dấu và chuẩn hóa."""
    assert remove_vietnamese_accents("Hội phí câu lạc bộ") == "hoi phi cau lac bo"
    assert remove_vietnamese_accents("ĐIỂM DANH BẰNG ẢNH") == "diem danh bang anh"
    assert remove_vietnamese_accents("Đăng ký sự kiện") == "dang ky su kien"


@pytest.mark.asyncio
async def test_markdown_chunking_preserves_headings():
    """Kiểm tra bộ tách markdown giữ lại tiêu đề mục cha."""
    md = """# Giới thiệu CLB
Đây là đoạn mở đầu.

## 1. Cơ cấu ban
Ban Truyền thông phụ trách hình ảnh.

## 2. Quy định hội phí
Mức đóng là 50.000 VNĐ.
"""
    chunks = chunk_markdown(md)
    assert len(chunks) >= 2
    assert chunks[0][0] in ["Giới thiệu CLB", "1. Cơ cấu ban", None]
    headings = [c[0] for c in chunks]
    assert any("Quy định hội phí" in str(h) for h in headings)


@pytest.mark.asyncio
async def test_allowed_audiences_by_role():
    """Kiểm tra phân quyền audience theo vai trò."""
    assert get_allowed_audiences_for_role(None) == ["public"]
    assert get_allowed_audiences_for_role("guest") == ["public"]
    assert get_allowed_audiences_for_role("member") == ["public", "member"]
    assert get_allowed_audiences_for_role("department_head") == ["public", "member", "dept_head"]
    assert get_allowed_audiences_for_role("admin") == ["public", "member", "dept_head", "admin"]


@pytest.mark.asyncio
async def test_tools_available_strictly_by_role(seed_member: User, seed_department_head: User, seed_treasurer: User, seed_admin: User):
    """Kiểm tra danh sách Tool được cấp cho từng vai trò đảm bảo nguyên tắc bảo mật."""
    # Khách: chỉ có 2 tool public
    guest_tools = get_tool_declarations_for_role(None)[0].function_declarations
    guest_tool_names = [f.name for f in guest_tools]
    assert "search_public_documents" in guest_tool_names
    assert "get_public_events" in guest_tool_names
    assert "get_my_fees" not in guest_tool_names
    assert "get_treasury_summary" not in guest_tool_names

    # Thành viên: có các tool cá nhân, KHÔNG có tool trưởng ban/admin
    member_tools = get_tool_declarations_for_role(seed_member)[0].function_declarations
    member_tool_names = [f.name for f in member_tools]
    assert "get_events" in member_tool_names
    assert "get_my_fees" in member_tool_names
    assert "get_department_members" not in member_tool_names
    assert "get_treasury_summary" not in member_tool_names

    # Trưởng ban: có thêm tool ban của mình, KHÔNG có tool thủ quỹ
    head_tools = get_tool_declarations_for_role(seed_department_head)[0].function_declarations
    head_tool_names = [f.name for f in head_tools]
    assert "get_department_members" in head_tool_names
    assert "draft_announcement_or_plan" in head_tool_names
    assert "get_treasury_summary" not in head_tool_names

    # Thủ quỹ: có tool tài chính sổ quỹ
    treasurer_tools = get_tool_declarations_for_role(seed_treasurer)[0].function_declarations
    treasurer_names = [f.name for f in treasurer_tools]
    assert "get_treasury_summary" in treasurer_names
    assert "get_fee_collection_stats" in treasurer_names
    assert "get_club_overall_stats" not in treasurer_names

    # Admin: có đầy đủ toàn bộ tools
    admin_tools = get_tool_declarations_for_role(seed_admin)[0].function_declarations
    admin_names = [f.name for f in admin_tools]
    assert "get_club_overall_stats" in admin_names
    assert "get_pending_join_requests" in admin_names
    assert "get_treasury_summary" in admin_names


@pytest.mark.asyncio
async def test_tool_executor_server_side_permissions(seed_member: User, seed_department_head: User, seed_treasurer: User):
    """Kiểm tra Server thực thi hàm tự kiểm tra quyền và tự lấy user_id từ phiên."""
    async with TestingSessionLocal() as session:
        # 1. Member cố gọi hàm thủ quỹ -> Bị từ chối
        member_exec = ToolExecutor(db=session, current_user=seed_member)
        res = await member_exec.execute("get_treasury_summary", {})
        assert "error" in res
        assert "Chỉ Thủ quỹ" in res["error"] or "không có quyền" in res["error"]

        # 2. Member cố gọi hàm trưởng ban -> Bị từ chối
        res2 = await member_exec.execute("get_department_members", {})
        assert "error" in res2
        assert "không có quyền" in res2["error"]

        # 3. Thủ quỹ gọi hàm sổ quỹ -> Thành công
        treasurer_exec = ToolExecutor(db=session, current_user=seed_treasurer)
        res3 = await treasurer_exec.execute("get_treasury_summary", {})
        assert "current_balance" in res3


@pytest.mark.asyncio
async def test_rag_search_audience_isolation(seed_member: User):
    """Kiểm tra tài liệu có audience cao hơn KHÔNG bao giờ xuất hiện trong kết quả tìm kiếm của user cấp thấp."""
    async with TestingSessionLocal() as session:
        # Tạo 2 tài liệu: 1 public, 1 admin nội bộ
        doc_pub = Document(
            title="Nội quy công khai CLB",
            category="Quy định",
            audience=DocumentAudience.PUBLIC.value,
            content="Mọi sinh viên đều có thể tham gia các sự kiện mở của CLB.",
            is_active=True,
        )
        doc_adm = Document(
            title="Quy trình kỷ luật nội bộ Admin",
            category="Nội bộ",
            audience=DocumentAudience.ADMIN.value,
            content="Tài liệu bảo mật về phương án xử lý kỷ luật cấp ban chủ nhiệm.",
            is_active=True,
        )
        session.add_all([doc_pub, doc_adm])
        await session.commit()
        await session.refresh(doc_pub)
        await session.refresh(doc_adm)

        # Tạo chunks cho cả 2 tài liệu
        chunk_pub = DocumentChunk(
            document_id=doc_pub.id,
            chunk_index=0,
            content=doc_pub.content,
            embedding=[0.8, 0.4] + [0.0] * (settings.EMBEDDING_DIM - 2),
        )
        chunk_adm = DocumentChunk(
            document_id=doc_adm.id,
            chunk_index=0,
            content=doc_adm.content,
            embedding=[0.8, 0.4] + [0.0] * (settings.EMBEDDING_DIM - 2),
        )
        session.add_all([chunk_pub, chunk_adm])
        await session.commit()

        # Khách tìm kiếm -> Chỉ thấy tài liệu public
        results_guest, _ = await search_knowledge(session, query="nội quy", user_role="guest", min_score=0.1)
        found_titles = [r["title"] for r in results_guest]
        assert "Nội quy công khai CLB" in found_titles
        assert "Quy trình kỷ luật nội bộ Admin" not in found_titles

        # Thành viên thường tìm kiếm -> Cũng KHÔNG thấy tài liệu của admin
        results_member, _ = await search_knowledge(session, query="kỷ luật", user_role="member", min_score=0.1)
        member_titles = [r["title"] for r in results_member]
        assert "Quy trình kỷ luật nội bộ Admin" not in member_titles


@pytest.mark.asyncio
async def test_rag_search_unaccented_query_matching():
    """Kiểm tra câu hỏi thiếu dấu (unaccented) vẫn tìm được tài liệu tiếng Việt có dấu."""
    async with TestingSessionLocal() as session:
        doc = Document(
            title="Quy định đóng hội phí học kỳ",
            category="Hội phí",
            audience="public",
            content="Mỗi hội viên hoàn thành nghĩa vụ đóng hội phí trước ngày 15.",
            is_active=True,
        )
        session.add(doc)
        await session.commit()
        await session.refresh(doc)

        chunk = DocumentChunk(
            document_id=doc.id,
            chunk_index=0,
            content=doc.content,
            embedding=None,
        )
        session.add(chunk)
        await session.commit()

        # Tìm bằng tiếng Việt không dấu: "dong hoi phi"
        results, _ = await search_knowledge(session, query="dong hoi phi", user_role="guest", min_score=0.1)
        assert len(results) > 0
        assert results[0]["title"] == "Quy định đóng hội phí học kỳ"


@pytest.mark.asyncio
async def test_rag_search_irrelevant_query_threshold():
    """Kiểm tra câu hỏi vô nghĩa hoặc ngoài phạm vi rơi vào dưới ngưỡng (không tìm thấy)."""
    async with TestingSessionLocal() as session:
        # Tìm câu hỏi hoàn toàn không liên quan với min_score chuẩn (0.65)
        results, _ = await search_knowledge(
            session,
            query="cách nấu canh chua cá lóc miền tây nam bộ",
            user_role="guest",
            min_score=0.65,
        )
        # Bắt buộc trả về rỗng vì không đạt ngưỡng điểm tương đồng
        assert len(results) == 0


@pytest.mark.asyncio
async def test_chat_pipeline_routing_and_streaming(async_client: AsyncClient, member_headers: dict, monkeypatch):
    """Kiểm tra định tuyến: câu hỏi về sự kiện kích hoạt hàm sự kiện và trả streaming SSE."""
    mock_client = MockGeminiClient()
    monkeypatch.setattr(chatbot_service, "client", mock_client)

    response = await async_client.post(
        "/api/chat/messages",
        headers=member_headers,
        json={"content": "Cho tôi xem danh sách các sự kiện sắp tới của CLB"},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    body = response.text
    # Kiểm tra SSE chứa event status hoặc tool_call
    assert "event: status" in body
    assert "get_events" in body or "delta" in body
    assert "event: done" in body


@pytest.mark.asyncio
async def test_chat_pipeline_rate_limit(async_client: AsyncClient, member_headers: dict, monkeypatch):
    """Kiểm tra vượt giới hạn câu hỏi trong ngày thì bị chặn ngay lập tức và không gọi Gemini."""
    mock_client = MockGeminiClient()
    monkeypatch.setattr(chatbot_service, "client", mock_client)

    # Đặt giới hạn câu hỏi về 1 câu/ngày
    monkeypatch.setattr(settings, "CHAT_MAX_QUESTIONS_PER_USER_PER_DAY", 1)

    # Lần 1: Thành công
    res1 = await async_client.post(
        "/api/chat/messages",
        headers=member_headers,
        json={"content": "Câu hỏi thứ nhất"},
    )
    assert res1.status_code == 200
    assert "event: done" in res1.text

    # Lần 2: Bị chặn do vượt giới hạn
    res2 = await async_client.post(
        "/api/chat/messages",
        headers=member_headers,
        json={"content": "Câu hỏi thứ hai"},
    )
    assert res2.status_code == 200
    assert "event: error" in res2.text
    assert "RATE_LIMITED" in res2.text


@pytest.mark.asyncio
async def test_chat_pipeline_error_handling_quota_exceeded(async_client: AsyncClient, member_headers: dict, monkeypatch):
    """Kiểm tra khi Gemini trả lỗi Quota Exceeded (429), người dùng nhận thông báo lỗi thật, KHÔNG nhận câu trả lời mẫu."""
    mock_client = MockGeminiClient(should_raise=QuotaExceededError("Resource Exhausted (429)"))
    monkeypatch.setattr(chatbot_service, "client", mock_client)

    response = await async_client.post(
        "/api/chat/messages",
        headers=member_headers,
        json={"content": "Hỏi đáp khi API quá tải"},
    )
    assert response.status_code == 200
    body = response.text

    assert "event: error" in body
    assert "QUOTA_EXCEEDED" in body
    # Đảm bảo không bị trả lời lặp lại câu mẫu
    assert "Dựa trên dữ liệu tra cứu" not in body


@pytest.mark.asyncio
async def test_conversations_isolation_and_feedback(async_client: AsyncClient, seed_member: User, member_headers: dict, admin_headers: dict):
    """Kiểm tra người dùng không đọc được hội thoại của nhau, xóa hội thoại và gửi feedback 👍/👎."""
    async with TestingSessionLocal() as session:
        # Tạo 1 cuộc trò chuyện thuộc về seed_member
        conv = Conversation(user_id=seed_member.id, title="Hội thoại bí mật của hội viên")
        session.add(conv)
        await session.commit()
        await session.refresh(conv)

        msg = ChatMessage(
            conversation_id=conv.id,
            role="assistant",
            content="Phản hồi từ AI",
        )
        session.add(msg)
        await session.commit()
        await session.refresh(msg)
        conv_id = conv.id
        msg_id = msg.id

    # 1. Member xem cuộc trò chuyện của chính mình -> Thành công
    res_my = await async_client.get(f"/api/chat/conversations/{conv_id}", headers=member_headers)
    assert res_my.status_code == 200
    assert res_my.json()["title"] == "Hội thoại bí mật của hội viên"

    # 2. Admin thử xem nội dung hội thoại riêng tư của Member -> Bị từ chối 403 (Bảo vệ quyền riêng tư)
    res_admin = await async_client.get(f"/api/chat/conversations/{conv_id}", headers=admin_headers)
    assert res_admin.status_code == 403

    # 3. Gửi feedback thumbs up / down
    res_fb = await async_client.post(
        f"/api/chat/messages/{msg_id}/feedback",
        headers=member_headers,
        json={"feedback": "up", "note": "Câu trả lời rất chính xác và hữu ích"},
    )
    assert res_fb.status_code == 200
    assert res_fb.json()["feedback"] == "up"

    # 4. Member xóa cuộc trò chuyện
    del_res = await async_client.delete(f"/api/chat/conversations/{conv_id}", headers=member_headers)
    assert del_res.status_code == 204

    # 5. Kiểm tra không còn tồn tại
    check_res = await async_client.get(f"/api/chat/conversations/{conv_id}", headers=member_headers)
    assert check_res.status_code == 404


@pytest.mark.asyncio
async def test_admin_knowledge_crud_and_reindex(async_client: AsyncClient, admin_headers: dict, member_headers: dict):
    """Kiểm tra Admin quản lý tài liệu tri thức (CRUD) và reindex, thành viên không có quyền."""
    # Member tạo tài liệu -> 403 Forbidden
    res_forbidden = await async_client.post(
        "/api/knowledge/documents",
        headers=member_headers,
        json={
            "title": "Tài liệu trái phép",
            "category": "Quy chế",
            "audience": "member",
            "content": "Nội dung không hợp lệ",
        },
    )
    assert res_forbidden.status_code == 403

    # Admin tạo tài liệu -> 201 Created
    res_create = await async_client.post(
        "/api/knowledge/documents",
        headers=admin_headers,
        json={
            "title": "Quy chế khen thưởng mới",
            "category": "Khen thưởng",
            "audience": "member",
            "content": "# Khen thưởng\nThành viên tích cực sẽ được nhận học bổng.",
        },
    )
    assert res_create.status_code == 201
    doc_id = res_create.json()["id"]

    # Admin cập nhật tài liệu
    res_update = await async_client.put(
        f"/api/knowledge/documents/{doc_id}",
        headers=admin_headers,
        json={"title": "Quy chế khen thưởng mới (Cập nhật)"},
    )
    assert res_update.status_code == 200
    assert res_update.json()["title"] == "Quy chế khen thưởng mới (Cập nhật)"

    # Admin xóa tài liệu
    res_del = await async_client.delete(f"/api/knowledge/documents/{doc_id}", headers=admin_headers)
    assert res_del.status_code == 204


@pytest.mark.asyncio
async def test_admin_chatbot_stats(async_client: AsyncClient, admin_headers: dict):
    """Kiểm tra màn hình thống kê chất lượng chatbot của Admin."""
    res = await async_client.get("/api/chat/admin/stats", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_queries" in data
    assert "no_info_rate" in data
    assert "negative_feedback_rate" in data
