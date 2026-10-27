import logging
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEFAULT_SECRET_KEY = "change-this-to-a-super-secret-key-at-least-32-chars-long-production"


class Settings(BaseSettings):
    # Cấu hình dự án
    PROJECT_NAME: str = "Hệ Thống Quản Lý Câu Lạc Bộ Sinh Viên"
    ENV_MODE: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api"

    # Bảo mật JWT
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CSDL PostgreSQL
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres_password_123"
    POSTGRES_DB: str = "clb_system_db"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres_password_123@localhost:5432/clb_system_db"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres_password_123@localhost:5432/clb_system_db"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # Lưu trữ tệp ảnh điểm danh & chứng từ tài chính (Volume riêng biệt)
    ATTENDANCE_PHOTO_DIR: str = "storage/attendance_photos"
    RECEIPT_PHOTO_DIR: str = "storage/receipt_photos"
    AVATAR_PHOTO_DIR: str = "storage/avatar_photos"

    # Cấu hình tài chính CLB
    SHOW_FINANCE_TO_MEMBERS: bool = True
    BANK_ACCOUNT_NAME: str = "CLB SINH VIEN"
    BANK_ACCOUNT_NUMBER: str = "1029384756"
    BANK_NAME: str = "Vietcombank (VCB)"

    # Thông tin tài khoản Admin khởi tạo (Seed)
    FIRST_ADMIN_EMAIL: str = "admin@clb.edu.vn"
    FIRST_ADMIN_PASSWORD: str = "Admin@123456"
    FIRST_ADMIN_STUDENT_ID: str = "ADMIN001"
    FIRST_ADMIN_FULL_NAME: str = "Quản Trị Viên Hệ Thống"
    FIRST_ADMIN_PHONE: str = "0901234567"
    FIRST_ADMIN_FACULTY: str = "Đoàn Thanh Niên - Hội Sinh Viên"
    FIRST_ADMIN_CLASS_NAME: str = "BCH-CLB"
    FIRST_ADMIN_TITLE: str = "Chủ nhiệm CLB"

    # ============================================================
    # Giai đoạn 5: Cấu hình Chatbot AI (Gemini API & RAG)
    # ============================================================
    GEMINI_API_KEY: str = ""
    GEMINI_CHAT_MODEL: str = "gemini-3.5-flash"
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    EMBEDDING_DIM: int = 768
    CHAT_MAX_QUESTIONS_PER_USER_PER_DAY: int = 50
    CHAT_MAX_QUESTIONS_PER_IP_PER_DAY: int = 20
    CHAT_MAX_SYSTEM_QUESTIONS_PER_DAY: int = 1000
    CHAT_RETRIEVAL_TOP_K: int = 4
    CHAT_RETRIEVAL_MIN_SCORE: float = 0.65
    CHAT_HISTORY_TURNS: int = 5
    CHAT_THINKING_BUDGET: int = 0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

    def check_security(self) -> None:
        """Cảnh báo khi dùng SECRET_KEY mặc định."""
        if self.SECRET_KEY == DEFAULT_SECRET_KEY:
            logger.warning(
                "⚠️ CẢNH BÁO BẢO MẬT: Đang sử dụng SECRET_KEY mặc định! "
                "Vui lòng thiết lập SECRET_KEY mạnh trong file .env cho môi trường production."
            )


settings = Settings()
settings.check_security()
