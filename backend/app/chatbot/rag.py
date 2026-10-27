"""Hệ thống Kho tri thức và Tìm kiếm tài liệu kết hợp (Hybrid RAG Search).

Tính năng:
- Tách tài liệu theo cấu trúc tiêu đề (Markdown headings) và đoạn văn.
- Tạo embedding bằng GEMINI_EMBEDDING_MODEL với task_type chuẩn (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY).
- Phân quyền theo audience (public / member / dept_head / admin) được lọc chặt chẽ ngay trong truy vấn CSDL.
- Tìm kiếm kết hợp (Hybrid Search: Vector Cosine Similarity + Từ khóa có/không dấu).
- Áp dụng ngưỡng điểm tối thiểu CHAT_RETRIEVAL_MIN_SCORE: dưới ngưỡng thì trả về rỗng để bot trả lời "chưa có thông tin".
- Bộ nhớ đệm ngắn hạn (LRU Cache với TTL) cho các câu hỏi tương tự theo phạm vi quyền.
"""
import hashlib
import logging
import math
import re
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chatbot.gemini_client import gemini_client
from app.core.config import settings
from app.models.chatbot import Document, DocumentAudience, DocumentChunk
from app.models.user import SystemRole, User

logger = logging.getLogger(__name__)


def remove_vietnamese_accents(text: str) -> str:
    """Loại bỏ dấu tiếng Việt để hỗ trợ tìm kiếm câu hỏi không dấu."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", text)
    no_accents = re.sub(r"[\u0300-\u036f]", "", normalized)
    no_accents = no_accents.replace("đ", "d").replace("Đ", "D")
    return unicodedata.normalize("NFC", no_accents).lower().strip()


def normalize_query_text(text: str) -> str:
    """Chuẩn hóa câu hỏi: loại bỏ khoảng trắng thừa, đưa về chữ thường."""
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def get_allowed_audiences_for_role(role: Optional[Any]) -> List[str]:
    """Xác định danh sách audience được phép truy cập theo vai trò người dùng."""
    if not role or role == "guest":
        return [DocumentAudience.PUBLIC.value]
    role_val = role.value if hasattr(role, "value") else str(role)
    if role_val in [SystemRole.MEMBER, "member"]:
        return [DocumentAudience.PUBLIC.value, DocumentAudience.MEMBER.value]
    if role_val in [SystemRole.DEPARTMENT_HEAD, "department_head"]:
        return [
            DocumentAudience.PUBLIC.value,
            DocumentAudience.MEMBER.value,
            DocumentAudience.DEPT_HEAD.value,
        ]
    if role_val in [SystemRole.ADMIN, "admin"]:
        return [
            DocumentAudience.PUBLIC.value,
            DocumentAudience.MEMBER.value,
            DocumentAudience.DEPT_HEAD.value,
            DocumentAudience.ADMIN.value,
        ]
    return [DocumentAudience.PUBLIC.value]


def chunk_markdown(content: str, max_chars: int = 600, overlap: int = 50) -> List[Tuple[Optional[str], str]]:
    """
    Chia tài liệu markdown theo tiêu đề (#, ##, ###) và đoạn văn bản.
    Mỗi chunk giữ lại tiêu đề mục cha để có ngữ cảnh ngữ nghĩa trọn vẹn.
    """
    lines = content.split("\n")
    chunks: List[Tuple[Optional[str], str]] = []

    current_heading: Optional[str] = None
    current_buffer: List[str] = []
    current_len = 0

    heading_regex = re.compile(r"^(#{1,4})\s+(.+)$")

    for line in lines:
        match = heading_regex.match(line.strip())
        if match:
            # Nếu đang có buffer thì lưu chunk trước khi đổi heading
            if current_buffer:
                chunk_text = "\n".join(current_buffer).strip()
                if chunk_text:
                    chunks.append((current_heading, chunk_text))
                current_buffer = []
                current_len = 0
            current_heading = match.group(2).strip()
            continue

        stripped_line = line.strip()
        if not stripped_line:
            # Đoạn phân tách rỗng: kiểm tra nếu buffer đủ lớn thì tách chunk
            if current_len >= max_chars:
                chunk_text = "\n".join(current_buffer).strip()
                if chunk_text:
                    chunks.append((current_heading, chunk_text))
                # Giữ lại một phần overlap
                overlap_lines = current_buffer[-2:] if len(current_buffer) >= 2 else []
                current_buffer = list(overlap_lines)
                current_len = sum(len(l) for l in current_buffer)
            continue

        current_buffer.append(line)
        current_len += len(line)

        if current_len >= max_chars + 100:
            chunk_text = "\n".join(current_buffer).strip()
            if chunk_text:
                chunks.append((current_heading, chunk_text))
            overlap_lines = current_buffer[-2:] if len(current_buffer) >= 2 else []
            current_buffer = list(overlap_lines)
            current_len = sum(len(l) for l in current_buffer)

    if current_buffer:
        chunk_text = "\n".join(current_buffer).strip()
        if chunk_text:
            chunks.append((current_heading, chunk_text))

    return chunks


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Tính độ tương đồng Cosine giữa 2 vector số thực."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


# Bộ nhớ đệm tìm kiếm RAG theo (normalized_query, audience_tuple) với TTL 5 phút
_RAG_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_RAG_CACHE_TTL_SECONDS = 300


def get_cached_rag_result(cache_key: str) -> Optional[List[Dict[str, Any]]]:
    now = time.time()
    if cache_key in _RAG_CACHE:
        timestamp, results = _RAG_CACHE[cache_key]
        if now - timestamp < _RAG_CACHE_TTL_SECONDS:
            return results
        del _RAG_CACHE[cache_key]
    return None


def set_cached_rag_result(cache_key: str, results: List[Dict[str, Any]]) -> None:
    _RAG_CACHE[cache_key] = (time.time(), results)
    # Dọn dẹp cache nếu quá 200 items
    if len(_RAG_CACHE) > 200:
        oldest = sorted(_RAG_CACHE.keys(), key=lambda k: _RAG_CACHE[k][0])[:50]
        for k in oldest:
            _RAG_CACHE.pop(k, None)


async def search_knowledge(
    db: AsyncSession,
    query: str,
    user_role: Optional[str] = "guest",
    top_k: int = 4,
    min_score: float = 0.65,
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Tìm kiếm tài liệu kết hợp (Hybrid Search: Vector + Keyword) có kiểm tra phân quyền.

    Trả về:
    - Danh sách các đoạn tài liệu tìm được: [{document_id, title, heading, content, score}]
    - Boolean: True nếu kết quả lấy từ Cache, False nếu truy vấn trực tiếp
    """
    normalized_q = normalize_query_text(query)
    if not normalized_q:
        return [], False

    allowed_audiences = get_allowed_audiences_for_role(user_role)
    cache_key = f"{normalized_q}::{','.join(sorted(allowed_audiences))}::{top_k}::{min_score}"

    cached = get_cached_rag_result(cache_key)
    if cached is not None:
        logger.info(f"[RAG] Hit cache cho câu hỏi: '{normalized_q}'")
        return cached, True

    # 1. Tạo vector embedding cho câu hỏi (dùng task_type="RETRIEVAL_QUERY")
    query_vector: Optional[List[float]] = None
    if gemini_client.is_configured:
        try:
            query_vector = await gemini_client.embed_text(
                text=normalized_q,
                task_type="RETRIEVAL_QUERY",
            )
        except Exception as e:
            logger.warning(f"[RAG] Không tạo được embedding cho câu hỏi ({e}), chuyển sang tìm theo từ khóa.")
            query_vector = None

    # 2. Lấy toàn bộ chunks từ các tài liệu đang active và thuộc quyền xem của người dùng
    stmt = (
        select(
            DocumentChunk.id,
            DocumentChunk.document_id,
            DocumentChunk.chunk_index,
            DocumentChunk.heading,
            DocumentChunk.content,
            DocumentChunk.embedding,
            Document.title,
            Document.category,
            Document.audience,
        )
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(
            Document.is_active == True,
            Document.audience.in_(allowed_audiences),
        )
    )

    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return [], False

    # 3. Tính điểm xếp hạng kết hợp (Hybrid Score)
    unaccent_q = remove_vietnamese_accents(normalized_q)
    query_terms = [t for t in unaccent_q.split() if len(t) > 1]

    scored_chunks: List[Dict[str, Any]] = []

    for row in rows:
        chunk_id, doc_id, chunk_idx, heading, content, emb, title, category, audience = row

        # Điểm tương đồng Vector
        vec_score = 0.0
        if query_vector and emb:
            try:
                if isinstance(emb, str):
                    import json
                    emb_list = json.loads(emb)
                else:
                    emb_list = list(emb)
                vec_score = cosine_similarity(query_vector, emb_list)
            except Exception:
                vec_score = 0.0

        # Điểm từ khóa (Keyword matching có dấu và không dấu)
        text_to_search = f"{title} {heading or ''} {content}".lower()
        unaccent_text = remove_vietnamese_accents(text_to_search)

        kw_score = 0.0
        if query_terms:
            matches = sum(1 for term in query_terms if term in unaccent_text)
            kw_score = matches / len(query_terms)

        # Trọng số kết hợp
        if query_vector and vec_score > 0:
            final_score = 0.75 * vec_score + 0.25 * kw_score
        else:
            final_score = kw_score

        # Áp dụng ngưỡng min_score
        if final_score >= min_score:
            scored_chunks.append({
                "chunk_id": chunk_id,
                "document_id": doc_id,
                "title": title,
                "heading": heading,
                "content": content,
                "category": category,
                "audience": audience,
                "score": round(final_score, 4),
            })

    # Sắp xếp theo điểm giảm dần và lấy top_k
    scored_chunks.sort(key=lambda x: x["score"], reverse=True)
    top_results = scored_chunks[:top_k]

    set_cached_rag_result(cache_key, top_results)
    return top_results, False


async def index_knowledge_directory(
    db: AsyncSession,
    knowledge_dir: Optional[str] = None,
    reindex_all: bool = False,
    updated_by_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Quét thư mục tài liệu Markdown, nạp vào bảng `documents` và lập chỉ mục `document_chunks`.
    Chỉ nhúng lại các chunk thay đổi trừ khi reindex_all=True.
    """
    if not knowledge_dir:
        # Tự động tìm thư mục knowledge/ trong thư mục gốc dự án hoặc backend
        possible_paths = [
            Path("knowledge"),
            Path("../knowledge"),
            Path("backend/knowledge"),
            Path(__file__).parent.parent.parent.parent / "knowledge",
        ]
        target_dir = None
        for p in possible_paths:
            if p.exists() and p.is_dir():
                target_dir = p
                break
        if not target_dir:
            return {"status": "error", "message": "Không tìm thấy thư mục knowledge/"}
    else:
        target_dir = Path(knowledge_dir)

    md_files = list(target_dir.glob("*.md"))
    if not md_files:
        return {"status": "warning", "message": f"Không có file .md nào trong {target_dir}"}

    docs_created = 0
    docs_updated = 0
    total_chunks = 0

    for file_path in md_files:
        raw_content = file_path.read_text(encoding="utf-8")

        # Phân tích Frontmatter cơ bản
        title = file_path.stem.replace("_", " ").title()
        category = "Quy định"
        audience = DocumentAudience.PUBLIC.value

        content_body = raw_content
        if raw_content.startswith("---") or "\n---" in raw_content:
            parts = raw_content.split("---")
            if len(parts) >= 3:
                header = parts[1]
                content_body = "---".join(parts[2:]).strip()
                for line in header.split("\n"):
                    line = line.strip()
                    if line.startswith("title:"):
                        title = line.replace("title:", "").strip()
                    elif line.startswith("category:"):
                        category = line.replace("category:", "").strip()
                    elif line.startswith("audience:"):
                        audience = line.replace("audience:", "").strip().lower()

        # Tìm tài liệu đã có trong CSDL
        stmt = select(Document).where(Document.title == title)
        result = await db.execute(stmt)
        doc = result.scalars().first()

        if not doc:
            doc = Document(
                title=title,
                category=category,
                audience=audience,
                content=content_body,
                is_active=True,
                version=1,
                updated_by_id=updated_by_id,
            )
            db.add(doc)
            await db.flush()
            await db.refresh(doc)
            docs_created += 1
            need_rechunk = True
        else:
            if doc.content != content_body or reindex_all:
                doc.content = content_body
                doc.category = category
                doc.audience = audience
                doc.version += 1
                doc.updated_by_id = updated_by_id
                docs_updated += 1
                need_rechunk = True
            else:
                need_rechunk = False

        if need_rechunk:
            # Xóa các chunks cũ của tài liệu này
            await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))

            # Tách chunks mới
            chunks = chunk_markdown(content_body)
            texts_to_embed = [c[1] for c in chunks]
            titles_for_embed = [f"{title} - {c[0]}" if c[0] else title for c in chunks]

            # Tạo vector embedding nếu gemini client được cấu hình
            embeddings: List[List[float]] = []
            if gemini_client.is_configured:
                try:
                    embeddings = await gemini_client.embed_batch(
                        texts=texts_to_embed,
                        task_type="RETRIEVAL_DOCUMENT",
                        titles=titles_for_embed,
                    )
                except Exception as e:
                    logger.warning(f"[RAG] Lỗi tạo embedding cho tài liệu '{title}': {e}")
                    embeddings = [[] for _ in chunks]
            else:
                embeddings = [[] for _ in chunks]

            for idx, (heading, chunk_text) in enumerate(chunks):
                vec = embeddings[idx] if idx < len(embeddings) else None
                chunk_obj = DocumentChunk(
                    document_id=doc.id,
                    chunk_index=idx,
                    heading=heading,
                    content=chunk_text,
                    embedding=vec if vec else None,
                    embedding_model=settings.GEMINI_EMBEDDING_MODEL,
                    token_count=len(chunk_text.split()),
                )
                db.add(chunk_obj)
                total_chunks += 1

    await db.commit()
    return {
        "status": "success",
        "docs_created": docs_created,
        "docs_updated": docs_updated,
        "total_chunks_indexed": total_chunks,
    }
