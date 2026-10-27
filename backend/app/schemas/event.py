from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class EventBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255, description="Tiêu đề sự kiện")
    description: Optional[str] = Field(None, description="Mô tả chi tiết sự kiện")
    location: str = Field(..., min_length=1, max_length=255, description="Địa điểm tổ chức")
    start_time: datetime = Field(..., description="Thời gian bắt đầu (UTC)")
    end_time: datetime = Field(..., description="Thời gian kết thúc (UTC)")
    registration_deadline: Optional[datetime] = Field(None, description="Hạn đăng ký (UTC)")
    capacity: Optional[int] = Field(None, gt=0, description="Số lượng người tham gia tối đa (null = không giới hạn)")
    department_id: Optional[int] = Field(None, description="Ban tổ chức (null = toàn CLB)")
    is_public: bool = Field(False, description="Công khai cho khách xem")

    # Tham số cấu hình điểm danh
    checkin_open_minutes_before: int = Field(30, ge=0, description="Mở điểm danh đến trước bắt đầu (phút)")
    late_after_minutes: int = Field(15, ge=0, description="Tính muộn sau bắt đầu (phút)")
    checkin_close_minutes_after_start: Optional[int] = Field(
        None,
        ge=0,
        description="Đóng điểm danh đến sau bắt đầu (phút, null = đến hết giờ kết thúc)",
    )
    checkout_open_after_minutes: Optional[int] = Field(
        None,
        ge=0,
        description="Mở điểm danh về sau bắt đầu (phút, null = nửa thời lượng)",
    )
    checkout_close_minutes_after_end: int = Field(60, ge=0, description="Đóng điểm danh về sau kết thúc (phút)")


class EventCreate(EventBase):
    @model_validator(mode="after")
    def validate_times(self) -> "EventCreate":
        if self.end_time <= self.start_time:
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")

        if self.registration_deadline and self.registration_deadline > self.start_time:
            raise ValueError("Hạn chót đăng ký không được muộn hơn thời gian bắt đầu sự kiện")

        # Kiểm tra giờ mở điểm danh về không được vượt quá giờ kết thúc nếu cấu hình cụ thể
        if self.checkout_open_after_minutes is not None:
            event_duration_minutes = (self.end_time - self.start_time).total_seconds() / 60
            if self.checkout_open_after_minutes > event_duration_minutes:
                raise ValueError("Thời điểm mở điểm danh về không được muộn hơn thời điểm kết thúc sự kiện")

        return self


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    location: Optional[str] = Field(None, min_length=1, max_length=255)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    registration_deadline: Optional[datetime] = None
    capacity: Optional[int] = Field(None, gt=0)
    department_id: Optional[int] = None
    is_public: Optional[bool] = None

    checkin_open_minutes_before: Optional[int] = Field(None, ge=0)
    late_after_minutes: Optional[int] = Field(None, ge=0)
    checkin_close_minutes_after_start: Optional[int] = Field(None, ge=0)
    checkout_open_after_minutes: Optional[int] = Field(None, ge=0)
    checkout_close_minutes_after_end: Optional[int] = Field(None, ge=0)

    @model_validator(mode="after")
    def validate_update_times(self) -> "EventUpdate":
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
        if self.start_time and self.registration_deadline and self.registration_deadline > self.start_time:
            raise ValueError("Hạn chót đăng ký không được muộn hơn thời gian bắt đầu sự kiện")
        return self


class EventAttendanceOut(BaseModel):
    id: int
    registration_id: int
    type: str
    taken_at: datetime
    photo_path: Optional[str] = None
    source: str
    review_status: str
    is_late: bool = False
    reviewed_by_id: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventRegistrationOut(BaseModel):
    id: int
    user_id: int
    event_id: int
    status: str
    created_at: datetime
    updated_at: datetime

    # Thông tin thành viên
    student_id: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    faculty: Optional[str] = None
    class_name: Optional[str] = None
    department_name: Optional[str] = None

    # Lượt điểm danh
    check_in: Optional[EventAttendanceOut] = None
    check_out: Optional[EventAttendanceOut] = None

    # Chỉ số tham dự
    is_attended: bool = False
    is_late: bool = False
    is_fully_attended: bool = False
    duration_minutes: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class EventPublicResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    location: str
    start_time: datetime
    end_time: datetime
    registration_deadline: Optional[datetime] = None
    capacity: Optional[int] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    is_public: bool
    status: str
    registered_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class EventResponse(EventBase):
    id: int
    status: str
    rejection_reason: Optional[str] = None
    created_by_id: Optional[int] = None
    creator_name: Optional[str] = None
    department_name: Optional[str] = None
    registered_count: int = 0
    is_registered: bool = False
    my_registration_status: Optional[str] = None
    my_registration: Optional[EventRegistrationOut] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventStatsOut(BaseModel):
    event_id: int
    total_registered: int
    total_attended: int
    total_late: int
    total_fully_attended: int
    total_pending_reviews: int
    capacity: Optional[int] = None


class EventReject(BaseModel):
    reason: Optional[str] = Field(None, description="Lý do từ chối sự kiện")
    note: Optional[str] = Field(None, description="Lý do từ chối sự kiện (alias)")

    @model_validator(mode="after")
    def validate_reason(self) -> "EventReject":
        r = (self.reason or self.note or "").strip()
        if not r:
            raise ValueError("Lý do từ chối không được để trống")
        self.reason = r
        return self


class ManualAttendanceCreate(BaseModel):
    type: str = Field(..., description="check_in hoặc check_out")
    is_late: bool = Field(False, description="Có muộn hay không (chỉ dùng cho check_in)")
    note: Optional[str] = Field("Điểm danh thủ công", description="Ghi chú điểm danh")


class AttendanceReviewReject(BaseModel):
    note: str = Field(..., min_length=1, description="Lý do từ chối điểm danh")


class AttendanceReviewApprove(BaseModel):
    note: Optional[str] = Field(None, description="Ghi chú duyệt (không bắt buộc)")


class UserEventHistoryItem(BaseModel):
    id: int  # registration id
    event_id: int
    event_title: str
    event_location: str
    event_start_time: datetime
    event_end_time: datetime
    event_status: str
    department_name: Optional[str] = None
    registration_status: str
    registered_at: datetime
    checkin_open_minutes_before: int = 30
    late_after_minutes: int = 15
    checkin_close_minutes_after_start: Optional[int] = None
    checkout_open_after_minutes: Optional[int] = None
    checkout_close_minutes_after_end: int = 60
    check_in: Optional[EventAttendanceOut] = None
    check_out: Optional[EventAttendanceOut] = None
    is_attended: bool = False
    is_late: bool = False
    is_fully_attended: bool = False
    duration_minutes: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)
