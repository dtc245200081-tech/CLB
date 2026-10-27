import asyncio
from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.notification_service import run_deadline_reminders

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi tạo kiểm tra bảng và cột cần thiết
    try:
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);"))
            await session.commit()
    except Exception as e:
        logger.warning(f"Avatar column initialization warning: {e}")

    # Khởi động ứng dụng: Chạy background worker nhắc hạn định kỳ (15 phút/lần)
    stop_event = asyncio.Event()

    async def reminder_worker():
        while not stop_event.is_set():
            try:
                # Đợi 15 phút (900s) giữa các lần kiểm tra
                await asyncio.sleep(900)
                if stop_event.is_set():
                    break
                async with AsyncSessionLocal() as session:
                    await run_deadline_reminders(session)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Lỗi trong background reminder worker: {e}")

    worker_task = asyncio.create_task(reminder_worker())
    yield
    # Dọn dẹp tài nguyên khi tắt ứng dụng
    stop_event.set()
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Hệ thống Quản lý Câu Lạc Bộ Sinh Viên (Giai đoạn 5: Chatbot AI & RAG) - RESTful API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Cấu hình CORS
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/api/health", tags=["Hệ thống"])
async def health_check():
    """Kiểm tra tình trạng hoạt động của API Backend."""
    return {"status": "ok", "project": settings.PROJECT_NAME}


# Đăng ký Master API Router với tiền tố /api
app.include_router(api_router, prefix="/api")
