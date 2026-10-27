"""Endpoints quản lý Kho tri thức (Documents & Knowledge RAG)."""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.chatbot.gemini_client import gemini_client
from app.chatbot.rag import chunk_markdown, get_allowed_audiences_for_role, index_knowledge_directory
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_any_authenticated
from app.models.chatbot import Document, DocumentAudience, DocumentChunk
from app.models.user import SystemRole, User
from app.schemas.chatbot import DocumentCreate, DocumentResponse, DocumentUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(
    category: Optional[str] = None,
    audience: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """
    Lấy danh sách các tài liệu tri thức.
    Thành viên chỉ thấy tài liệu thuộc phạm vi quyền của mình.
    Quản trị viên (Admin) thấy toàn bộ và có thể lọc theo trạng thái/audience.
    """
    stmt = select(Document)

    if current_user.role != SystemRole.ADMIN:
        allowed = get_allowed_audiences_for_role(current_user.role.value)
        stmt = stmt.where(Document.is_active == True, Document.audience.in_(allowed))
    else:
        if audience:
            stmt = stmt.where(Document.audience == audience)
        if is_active is not None:
            stmt = stmt.where(Document.is_active == is_active)

    if category:
        stmt = stmt.where(Document.category == category)

    stmt = stmt.order_by(Document.updated_at.desc())
    res = await db.execute(stmt)
    docs = res.scalars().all()

    items = []
    for d in docs:
        cnt_q = select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == d.id)
        cnt_res = await db.execute(cnt_q)
        chunks_count = cnt_res.scalar() or 0

        items.append(
            DocumentResponse(
                id=d.id,
                title=d.title,
                category=d.category,
                audience=d.audience,
                content=d.content,
                is_active=d.is_active,
                version=d.version,
                updated_by_id=d.updated_by_id,
                created_at=d.created_at,
                updated_at=d.updated_at,
                chunks_count=chunks_count,
            )
        )
    return items


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_authenticated),
):
    """Xem chi tiết một tài liệu tri thức."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu.")

    # Kiểm tra quyền xem
    if current_user.role != SystemRole.ADMIN:
        allowed = get_allowed_audiences_for_role(current_user.role.value)
        if doc.audience not in allowed or not doc.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập tài liệu này.")

    cnt_q = select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == doc.id)
    cnt_res = await db.execute(cnt_q)
    chunks_count = cnt_res.scalar() or 0

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        category=doc.category,
        audience=doc.audience,
        content=doc.content,
        is_active=doc.is_active,
        version=doc.version,
        updated_by_id=doc.updated_by_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        chunks_count=chunks_count,
    )


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Tạo mới tài liệu tri thức và tự động phân tách chunks, lập chỉ mục vector (Chỉ Admin)."""
    doc = Document(
        title=payload.title,
        category=payload.category,
        audience=payload.audience,
        content=payload.content,
        is_active=True,
        version=1,
        updated_by_id=current_user.id,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    # Phân tách chunks và tạo embeddings
    chunks = chunk_markdown(doc.content)
    embeddings = []
    if gemini_client.is_configured:
        try:
            texts = [c[1] for c in chunks]
            titles = [f"{doc.title} - {c[0]}" if c[0] else doc.title for c in chunks]
            embeddings = await gemini_client.embed_batch(texts=texts, task_type="RETRIEVAL_DOCUMENT", titles=titles)
        except Exception as e:
            logger.warning(f"Lỗi tạo embedding cho tài liệu mới: {e}")
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

    await db.commit()
    await db.refresh(doc)

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        category=doc.category,
        audience=doc.audience,
        content=doc.content,
        is_active=doc.is_active,
        version=doc.version,
        updated_by_id=doc.updated_by_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        chunks_count=len(chunks),
    )


@router.put("/documents/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    payload: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Cập nhật tài liệu tri thức và tự động lập chỉ mục lại nếu nội dung thay đổi (Chỉ Admin)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu.")

    content_changed = payload.content is not None and payload.content != doc.content

    if payload.title is not None:
        doc.title = payload.title
    if payload.category is not None:
        doc.category = payload.category
    if payload.audience is not None:
        doc.audience = payload.audience
    if payload.is_active is not None:
        doc.is_active = payload.is_active
    if payload.content is not None:
        doc.content = payload.content

    doc.version += 1
    doc.updated_by_id = current_user.id

    if content_changed:
        # Xóa chunks cũ và lập chỉ mục lại
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
        chunks = chunk_markdown(doc.content)

        embeddings = []
        if gemini_client.is_configured:
            try:
                texts = [c[1] for c in chunks]
                titles = [f"{doc.title} - {c[0]}" if c[0] else doc.title for c in chunks]
                embeddings = await gemini_client.embed_batch(texts=texts, task_type="RETRIEVAL_DOCUMENT", titles=titles)
            except Exception as e:
                logger.warning(f"Lỗi tạo embedding cập nhật: {e}")
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

    await db.commit()
    await db.refresh(doc)

    cnt_q = select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == doc.id)
    cnt_res = await db.execute(cnt_q)
    chunks_count = cnt_res.scalar() or 0

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        category=doc.category,
        audience=doc.audience,
        content=doc.content,
        is_active=doc.is_active,
        version=doc.version,
        updated_by_id=doc.updated_by_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        chunks_count=chunks_count,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Xóa hoàn toàn một tài liệu tri thức (Chỉ Admin)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu cần xóa.")
    await db.delete(doc)
    await db.commit()
    return None


@router.post("/reindex")
async def reindex_all_knowledge(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Quét và lập chỉ mục lại toàn bộ tài liệu từ thư mục knowledge/ (Chỉ Admin)."""
    result = await index_knowledge_directory(db=db, reindex_all=True, updated_by_id=current_user.id)
    return result
