import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union
import bcrypt
import jwt

from app.core.config import settings

# Hash mẫu giả định dùng để chống timing attack khi email không tồn tại trong hệ thống
DUMMY_BCRYPT_HASH = bcrypt.hashpw(b"dummy_timing_protection_value", bcrypt.gensalt()).decode("utf-8")


def validate_password_complexity(password: str) -> str:
    """Kiểm tra độ phức tạp mật khẩu:
    - Tối thiểu 8 ký tự, tối đa 72 bytes.
    - Có ít nhất 1 chữ cái in hoa (A-Z).
    - Có ít nhất 1 ký tự đặc biệt (!@#$%^&*...).
    """
    if len(password) < 8:
        raise ValueError("Mật khẩu phải có tối thiểu 8 ký tự")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Mật khẩu không được vượt quá 72 bytes")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Mật khẩu phải chứa ít nhất 1 chữ cái in hoa (A-Z)")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?~`]", password):
        raise ValueError("Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*...)")
    return password


def hash_password(password: str) -> str:
    """Băm mật khẩu sử dụng bcrypt trực tiếp.
    Đảm bảo kiểm tra giới hạn 72 bytes của thuật toán bcrypt.
    """
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Mật khẩu không được vượt quá 72 bytes theo chuẩn bcrypt")
    if len(password) < 8:
        raise ValueError("Mật khẩu phải có tối thiểu 8 ký tự")

    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Xác thực mật khẩu plain-text với chuỗi hash bcrypt."""
    try:
        plain_bytes = plain_password.encode("utf-8")
        if len(plain_bytes) > 72:
            return False
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception:
        return False


def dummy_verify_password(plain_password: str) -> bool:
    """Chạy hàm xác thực giả định với cùng chi phí tính toán để ngăn chặn timing attacks."""
    try:
        plain_bytes = plain_password.encode("utf-8")[:72]
        bcrypt.checkpw(plain_bytes, DUMMY_BCRYPT_HASH.encode("utf-8"))
    except Exception:
        pass
    return False


def create_access_token(
    subject: Union[str, int],
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Tạo JWT access token bằng thư viện PyJWT."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """Giải mã và kiểm tra tính hợp lệ của token JWT bằng PyJWT."""
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
    )
