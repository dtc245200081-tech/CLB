# ============================================================
# Dockerfile cho Backend FastAPI (Python 3.12, Non-root User)
# ============================================================
FROM python:3.12-slim as base

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on

# Cài đặt gói hệ thống tối thiểu
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Tạo người dùng không phải root (appuser)
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/bash -m appuser

# Cài đặt Python dependencies
COPY pyproject.toml ./
RUN pip install --upgrade pip && \
    pip install ".[dev,test]"

# Copy toàn bộ mã nguồn
COPY . .

# Phân quyền cho appuser
RUN chmod +x scripts/*.sh 2>/dev/null || true && \
    chown -R appuser:appgroup /app

# ------------------------------------------------------------
# Stage: Development (Hot reload, root hoặc appuser)
# ------------------------------------------------------------
FROM base as development
USER appuser
EXPOSE 8000
CMD ["/app/scripts/start-dev.sh"]

# ------------------------------------------------------------
# Stage: Production (Non-root user)
# ------------------------------------------------------------
FROM base as production
USER appuser
EXPOSE 8000
CMD ["/app/scripts/start-prod.sh"]
