from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple
from fastapi import HTTPException, status

MAX_ATTEMPTS = 5
WINDOW_MINUTES = 15


class LoginRateLimiter:
    """Bộ giới hạn tần suất đăng nhập sai chống brute-force:
    Tối đa 5 lần thử sai trong vòng 15 phút theo từng tài khoản (email) và IP.
    """

    def __init__(self, max_attempts: int = MAX_ATTEMPTS, window_minutes: int = WINDOW_MINUTES):
        self.max_attempts = max_attempts
        self.window = timedelta(minutes=window_minutes)
        # Lưu trữ: key -> list of datetime timestamps của các lần thử sai
        self.failed_attempts: Dict[str, List[datetime]] = {}

    def _cleanup_old_attempts(self, key: str, now: datetime) -> None:
        cutoff = now - self.window
        if key in self.failed_attempts:
            self.failed_attempts[key] = [
                t for t in self.failed_attempts[key] if t > cutoff
            ]
            if not self.failed_attempts[key]:
                del self.failed_attempts[key]

    def check_rate_limit(self, email: str, ip_address: str) -> None:
        """Kiểm tra xem email hoặc IP có đang bị tạm khóa do nhập sai quá nhiều lần hay không."""
        now = datetime.now(timezone.utc)
        keys = [f"email:{email.strip().lower()}", f"ip:{ip_address}"]

        for k in keys:
            self._cleanup_old_attempts(k, now)
            attempts = self.failed_attempts.get(k, [])
            if len(attempts) >= self.max_attempts:
                # Tính thời gian còn lại cần chờ
                oldest_in_window = attempts[0]
                remaining_seconds = int((oldest_in_window + self.window - now).total_seconds())
                remaining_minutes = max(1, (remaining_seconds + 59) // 60)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Tài khoản hoặc IP tạm thời bị khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau {remaining_minutes} phút.",
                )

    def record_failed_attempt(self, email: str, ip_address: str) -> int:
        """Ghi nhận một lần đăng nhập thất bại cho cả email và IP."""
        now = datetime.now(timezone.utc)
        keys = [f"email:{email.strip().lower()}", f"ip:{ip_address}"]
        current_counts = []

        for k in keys:
            self._cleanup_old_attempts(k, now)
            if k not in self.failed_attempts:
                self.failed_attempts[k] = []
            self.failed_attempts[k].append(now)
            current_counts.append(len(self.failed_attempts[k]))

        return max(current_counts)

    def record_success(self, email: str, ip_address: str) -> None:
        """Khi đăng nhập thành công, xóa lịch sử thử sai của email và IP này."""
        keys = [f"email:{email.strip().lower()}", f"ip:{ip_address}"]
        for k in keys:
            if k in self.failed_attempts:
                del self.failed_attempts[k]

    def reset_all(self) -> None:
        """Dùng cho kiểm thử để dọn dẹp bộ nhớ."""
        self.failed_attempts.clear()


login_limiter = LoginRateLimiter()


class AttendanceRateLimiter:
    """Bộ giới hạn tần suất gửi ảnh điểm danh theo từng thành viên.
    Ngăn chặn việc gửi ảnh liên tục hoặc spam upload ảnh.
    Quy tắc: Mỗi người dùng phải cách nhau ít nhất 5 giây giữa 2 lần gửi ảnh,
    hoặc tối đa 10 lượt gửi ảnh trong 1 phút.
    """

    def __init__(self, min_interval_seconds: int = 5, max_per_minute: int = 10):
        self.min_interval = timedelta(seconds=min_interval_seconds)
        self.window = timedelta(minutes=1)
        self.max_per_minute = max_per_minute
        self.submissions: Dict[int, List[datetime]] = {}

    def check_and_record(self, user_id: int) -> None:
        now = datetime.now(timezone.utc)
        user_history = self.submissions.get(user_id, [])

        # Dọn dẹp các bản ghi quá 1 phút
        cutoff = now - self.window
        user_history = [t for t in user_history if t > cutoff]

        if user_history:
            last_submission = user_history[-1]
            if now - last_submission < self.min_interval:
                wait_sec = int((self.min_interval - (now - last_submission)).total_seconds()) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Thao tác quá nhanh. Vui lòng đợi {wait_sec} giây trước khi gửi lại ảnh điểm danh",
                )

            if len(user_history) >= self.max_per_minute:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Bạn đã vượt quá số lần gửi ảnh điểm danh cho phép trong 1 phút. Vui lòng thử lại sau.",
                )

        user_history.append(now)
        self.submissions[user_id] = user_history

    def reset_all(self) -> None:
        self.submissions.clear()


attendance_limiter = AttendanceRateLimiter()
