"""Script CLI nạp và lập chỉ mục thư mục knowledge/ vào bảng documents và document_chunks."""
import asyncio
import sys
from pathlib import Path

# Đảm bảo import được app
sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from app.chatbot.rag import index_knowledge_directory
from app.core.database import AsyncSessionLocal


async def main():
    print("=" * 60)
    print("🚀 BẮT ĐẦU LẬP CHỈ MỤC KHO TRI THỨC CLB (KNOWLEDGE BASE)")
    print("=" * 60)

    async with AsyncSessionLocal() as session:
        result = await index_knowledge_directory(db=session, reindex_all=True)
        print("Kết quả:", result)

    print("\n✅ Hoàn tất quá trình lập chỉ mục tài liệu!")


if __name__ == "__main__":
    asyncio.run(main())
