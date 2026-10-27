import os
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import HTTPException, status

from app.core.config import settings

# Thư mục lưu trữ ảnh điểm danh
STORAGE_DIR = Path(settings.ATTENDANCE_PHOTO_DIR)


def ensure_storage_dir() -> Path:
    """Đảm bảo thư mục lưu trữ ảnh tồn tại."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return STORAGE_DIR


def validate_image_bytes(content: bytes) -> str:
    """Kiểm tra tính hợp lệ của tệp ảnh:
    - Dung lượng không vượt quá 2MB.
    - Loại thật của tệp dựa trên Magic Bytes (JPEG hoặc PNG), không chỉ dựa vào phần mở rộng hay Content-Type.
    Trả về định dạng tệp chuẩn ('jpg' hoặc 'png').
    """
    MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp ảnh tải lên trống",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng ảnh vượt quá giới hạn cho phép (tối đa 2MB)",
        )

    # Kiểm tra Magic Bytes thực tế
    # JPEG magic bytes: FF D8 FF
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg"

    # PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"

    # WebP magic bytes: RIFF....WEBP
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Định dạng tệp không hợp lệ. Hệ thống chỉ chấp nhận ảnh JPEG, PNG hoặc WebP thực tế",
    )


def save_attendance_photo(content: bytes) -> str:
    """Lưu tệp ảnh điểm danh vào volume riêng biệt với tên ngẫu nhiên UUID để chống ghi đè/đoán tên.
    Trả về đường dẫn tương đối để lưu vào CSDL.
    """
    ext = validate_image_bytes(content)
    target_dir = ensure_storage_dir()

    random_filename = f"{uuid.uuid4().hex}.{ext}"
    target_file = target_dir / random_filename

    with open(target_file, "wb") as f:
        f.write(content)

    # Trả về tên file/đường dẫn tương đối để lưu trong database
    return random_filename


def get_photo_absolute_path(photo_filename: str) -> Optional[Path]:
    """Lấy đường dẫn tuyệt đối an toàn của tệp ảnh, ngăn chặn tấn công Path Traversal."""
    if not photo_filename:
        return None

    # Lấy chỉ tên file để ngăn ngừa thư mục cha ../
    safe_filename = Path(photo_filename).name
    file_path = STORAGE_DIR / safe_filename

    if not file_path.exists() or not file_path.is_file():
        return None

    return file_path


def delete_attendance_photo(photo_filename: Optional[str]) -> bool:
    """Xóa an toàn tệp ảnh trên ổ đĩa."""
    if not photo_filename:
        return False

    file_path = get_photo_absolute_path(photo_filename)
    if file_path and file_path.exists():
        try:
            file_path.unlink()
            return True
        except OSError:
            return False
    return False


def cleanup_photos(filenames: List[str]) -> int:
    """Dọn dẹp hàng loạt ảnh."""
    deleted_count = 0
    for name in filenames:
        if delete_attendance_photo(name):
            deleted_count += 1
    return deleted_count


# ============================================================
# QUẢN LÝ LƯU TRỮ ẢNH BIÊN LAI / HÓA ĐƠN CHỨNG TỪ TÀI CHÍNH
# ============================================================
RECEIPT_STORAGE_DIR = Path(settings.RECEIPT_PHOTO_DIR)


def ensure_receipt_storage_dir() -> Path:
    """Đảm bảo thư mục lưu trữ ảnh chứng từ/biên lai tồn tại."""
    RECEIPT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return RECEIPT_STORAGE_DIR


def save_receipt_photo(content: bytes) -> str:
    """Lưu tệp ảnh biên lai chuyển khoản / hóa đơn chứng từ vào volume riêng biệt.
    Kiểm tra magic bytes, giới hạn 2MB, tên ngẫu nhiên UUID.
    """
    ext = validate_image_bytes(content)
    target_dir = ensure_receipt_storage_dir()

    random_filename = f"{uuid.uuid4().hex}.{ext}"
    target_file = target_dir / random_filename

    with open(target_file, "wb") as f:
        f.write(content)

    return random_filename


def get_receipt_photo_absolute_path(photo_filename: str) -> Optional[Path]:
    """Lấy đường dẫn tuyệt đối an toàn của tệp ảnh biên lai, ngăn chặn Path Traversal."""
    if not photo_filename:
        return None

    safe_filename = Path(photo_filename).name
    file_path = RECEIPT_STORAGE_DIR / safe_filename

    if not file_path.exists() or not file_path.is_file():
        return None

    return file_path


# ============================================================
# QUẢN LÝ LƯU TRỮ ẢNH ĐẠI DIỆN HỘI VIÊN (AVATAR)
# ============================================================
AVATAR_STORAGE_DIR = Path(settings.AVATAR_PHOTO_DIR)


def ensure_avatar_storage_dir() -> Path:
    """Đảm bảo thư mục lưu trữ ảnh đại diện tồn tại."""
    AVATAR_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return AVATAR_STORAGE_DIR


def save_avatar_photo(content: bytes) -> str:
    """Lưu tệp ảnh đại diện của người dùng vào storage."""
    ext = validate_image_bytes(content)
    target_dir = ensure_avatar_storage_dir()

    random_filename = f"{uuid.uuid4().hex}.{ext}"
    target_file = target_dir / random_filename

    with open(target_file, "wb") as f:
        f.write(content)

    return random_filename


def get_avatar_photo_absolute_path(photo_filename: str) -> Optional[Path]:
    """Lấy đường dẫn tuyệt đối của tệp ảnh đại diện, chống Path Traversal."""
    if not photo_filename:
        return None

    safe_filename = Path(photo_filename).name
    file_path = AVATAR_STORAGE_DIR / safe_filename

    if not file_path.exists() or not file_path.is_file():
        return None

    return file_path


def delete_avatar_photo(photo_filename: Optional[str]) -> bool:
    """Xóa ảnh đại diện cũ khỏi ổ đĩa."""
    if not photo_filename:
        return False

    file_path = get_avatar_photo_absolute_path(photo_filename)
    if file_path and file_path.exists():
        try:
            file_path.unlink()
            return True
        except OSError:
            return False
    return False


