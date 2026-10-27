import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

# Cấu hình logger riêng cho audit nhật ký an toàn
logger = logging.getLogger("clb.audit")
logger.setLevel(logging.INFO)

# Formatter chuẩn cho audit log
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[AUDIT] %(asctime)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


def log_audit(
    action: str,
    actor: str,
    target: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Union[Dict[str, Any], str]] = None,
) -> None:
    """Ghi nhật ký console an toàn:
    Ai làm (actor), làm gì (action), tác động đến ai/cái gì (target), từ IP nào (ip_address), lúc nào (timestamp).
    """
    now = datetime.now(timezone.utc).isoformat()
    msg = f"ACTION='{action}' | ACTOR='{actor}'"
    if target:
        msg += f" | TARGET='{target}'"
    if ip_address:
        msg += f" | IP='{ip_address}'"
    if details:
        msg += f" | DETAILS={details}"
    msg += f" | TIME='{now}'"

    logger.info(msg)


async def record_audit_event(
    db: AsyncSession,
    action: str,
    actor: str,
    target: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Union[Dict[str, Any], str]] = None,
) -> AuditLog:
    """Ghi audit log vừa ra console vừa lưu vào CSDL cho Admin tra cứu."""
    log_audit(action=action, actor=actor, target=target, ip_address=ip_address, details=details)

    details_str = (
        json.dumps(details, ensure_ascii=False, default=str)
        if isinstance(details, dict)
        else (str(details) if details else None)
    )
    audit_entry = AuditLog(
        action=action,
        actor=actor,
        target=target,
        ip_address=ip_address,
        details=details_str,
    )
    db.add(audit_entry)
    return audit_entry
