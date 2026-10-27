from app.schemas.common import PaginatedResponse
from app.schemas.user import (
    UserBase,
    UserCreate,
    UserResponse,
    UserOut,
    UserSelfUpdate,
    UserAdminUpdate,
    UserDepartmentUpdate,
)
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    ChangePasswordRequest,
)
from app.schemas.join_request import (
    JoinRequestCreate,
    JoinRequestReject,
    JoinRequestResponse,
)
from app.schemas.audit_log import AuditLogResponse
from app.schemas.department import (
    DepartmentBase,
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentHeadAssign,
    DepartmentHeadOut,
    DepartmentResponse,
)
from app.schemas.event import (
    EventCreate,
    EventUpdate,
    EventResponse,
    EventReject,
    EventPublicResponse,
    EventRegistrationOut,
    EventAttendanceOut,
    EventStatsOut,
    ManualAttendanceCreate,
    AttendanceReviewReject,
    AttendanceReviewApprove,
)

__all__ = [
    "PaginatedResponse",
    "UserBase",
    "UserCreate",
    "UserResponse",
    "UserOut",
    "UserSelfUpdate",
    "UserAdminUpdate",
    "UserDepartmentUpdate",
    "LoginRequest",
    "TokenResponse",
    "ChangePasswordRequest",
    "JoinRequestCreate",
    "JoinRequestReject",
    "JoinRequestResponse",
    "AuditLogResponse",
    "DepartmentBase",
    "DepartmentCreate",
    "DepartmentUpdate",
    "DepartmentHeadAssign",
    "DepartmentHeadOut",
    "DepartmentResponse",
    "EventCreate",
    "EventUpdate",
    "EventResponse",
    "EventReject",
    "EventPublicResponse",
    "EventRegistrationOut",
    "EventAttendanceOut",
    "EventStatsOut",
    "ManualAttendanceCreate",
    "AttendanceReviewReject",
    "AttendanceReviewApprove",
]
