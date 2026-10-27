import asyncio
from typing import AsyncGenerator
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.rate_limiter import attendance_limiter, login_limiter
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.user import SystemRole, User

# Database SQLite file cho test
import os
TEST_DB_FILE = "./test.db"
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DB_FILE}"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=AsyncSession,
)


@pytest.fixture(scope="session")
def event_loop():
    """Tạo event loop riêng cho test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def setup_test_db():
    """Tạo mới schema trước mỗi test và dọn dẹp sau khi chạy."""
    login_limiter.reset_all()
    attendance_limiter.reset_all()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture
async def seed_admin() -> User:
    """Tạo sẵn 1 Admin trong CSDL test."""
    async with TestingSessionLocal() as session:
        admin = User(
            email="admin.test@clb.edu.vn",
            student_id="ADMIN999",
            full_name="Nguyễn Văn Admin",
            phone="0901112222",
            faculty="CNTT",
            class_name="K60-CNTT",
            title="Chủ nhiệm",
            password_hash=hash_password("AdminPassword123"),
            role=SystemRole.ADMIN,
            is_active=True,
            deleted_at=None,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        return admin


@pytest.fixture
async def seed_member() -> User:
    """Tạo sẵn 1 Thành viên thông thường trong CSDL test."""
    async with TestingSessionLocal() as session:
        member = User(
            email="member.test@clb.edu.vn",
            student_id="SV2024001",
            full_name="Trần Thị Thành Viên",
            phone="0988777666",
            faculty="Kinh tế",
            class_name="K61-KT",
            title=None,
            password_hash=hash_password("MemberPassword123"),
            role=SystemRole.MEMBER,
            is_active=True,
            deleted_at=None,
        )
        session.add(member)
        await session.commit()
        await session.refresh(member)
        return member


@pytest.fixture
def admin_headers(seed_admin: User) -> dict:
    token = create_access_token(subject=seed_admin.id, role=seed_admin.role)
    return {"Authorization": f"Bearer {token}"}


from app.models.department import Department


@pytest.fixture
def member_headers(seed_member: User) -> dict:
    token = create_access_token(subject=seed_member.id, role=seed_member.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def seed_department() -> Department:
    """Tạo sẵn 1 Ban chuyên môn trong CSDL test."""
    async with TestingSessionLocal() as session:
        dept = Department(
            name="Ban Truyền thông",
            description="Chuyên trách truyền thông, hình ảnh cho CLB",
            is_active=True,
        )
        session.add(dept)
        await session.commit()
        await session.refresh(dept)
        return dept


@pytest.fixture
async def seed_department_head(seed_department: Department) -> User:
    """Tạo sẵn 1 Trưởng ban trong CSDL test thuộc seed_department."""
    async with TestingSessionLocal() as session:
        head = User(
            email="head.media@clb.edu.vn",
            student_id="HEAD001",
            full_name="Lê Văn Trưởng Ban",
            phone="0911223344",
            faculty="Báo chí",
            class_name="K60-BC",
            title="Trưởng ban Truyền thông",
            password_hash=hash_password("HeadPassword123"),
            role=SystemRole.DEPARTMENT_HEAD,
            department_id=seed_department.id,
            is_active=True,
            deleted_at=None,
        )
        session.add(head)
        await session.commit()
        await session.refresh(head)

        # Cập nhật head_id cho seed_department
        dept = await session.get(Department, seed_department.id)
        if dept:
            dept.head_id = head.id
            await session.commit()

        return head


@pytest.fixture
def dept_head_headers(seed_department_head: User) -> dict:
    token = create_access_token(subject=seed_department_head.id, role=seed_department_head.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def seed_treasurer() -> User:
    """Tạo sẵn 1 Thủ quỹ trong CSDL test."""
    async with TestingSessionLocal() as session:
        treasurer = User(
            email="treasurer.test@clb.edu.vn",
            student_id="TREASURER001",
            full_name="Hoàng Thị Thủ Quỹ",
            phone="0933445566",
            faculty="Kế toán",
            class_name="K61-KT",
            title="Thủ quỹ CLB",
            password_hash=hash_password("TreasurerPassword123"),
            role=SystemRole.MEMBER,
            is_active=True,
            is_treasurer=True,
            deleted_at=None,
        )
        session.add(treasurer)
        await session.commit()
        await session.refresh(treasurer)
        return treasurer


@pytest.fixture
def treasurer_headers(seed_treasurer: User) -> dict:
    token = create_access_token(subject=seed_treasurer.id, role=seed_treasurer.role)
    return {"Authorization": f"Bearer {token}"}

