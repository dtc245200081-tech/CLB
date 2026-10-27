import asyncio
import logging
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import SystemRole, User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_initial_admin() -> None:
    """Tạo tài khoản quản trị viên đầu tiên nếu bảng users đang trống."""
    async with AsyncSessionLocal() as session:
        try:
            # Kiểm tra xem bảng users đã có dữ liệu hay chưa
            stmt = select(func.count(User.id))
            result = await session.execute(stmt)
            count = result.scalar_one()

            if count > 0:
                logger.info("ℹ️ Bảng users đã có %d tài khoản. Bỏ qua khởi tạo admin ban đầu.", count)
                return

            logger.info("🚀 Bảng users đang trống. Đang khởi tạo tài khoản Quản trị viên đầu tiên...")
            admin_user = User(
                email=settings.FIRST_ADMIN_EMAIL.strip().lower(),
                student_id=settings.FIRST_ADMIN_STUDENT_ID.strip(),
                full_name=settings.FIRST_ADMIN_FULL_NAME.strip(),
                phone=settings.FIRST_ADMIN_PHONE.strip() if settings.FIRST_ADMIN_PHONE else None,
                faculty=settings.FIRST_ADMIN_FACULTY.strip() if settings.FIRST_ADMIN_FACULTY else None,
                class_name=settings.FIRST_ADMIN_CLASS_NAME.strip() if settings.FIRST_ADMIN_CLASS_NAME else None,
                title=settings.FIRST_ADMIN_TITLE.strip() if settings.FIRST_ADMIN_TITLE else None,
                password_hash=hash_password(settings.FIRST_ADMIN_PASSWORD),
                role=SystemRole.ADMIN,
                is_active=True,
                deleted_at=None,
            )

            session.add(admin_user)
            await session.commit()
            logger.info("✅ Khởi tạo tài khoản Quản trị viên thành công: %s", settings.FIRST_ADMIN_EMAIL)
        except Exception as e:
            await session.rollback()
            logger.error("❌ Lỗi khi khởi tạo tài khoản admin: %s", e)
            raise


if __name__ == "__main__":
    asyncio.run(seed_initial_admin())
