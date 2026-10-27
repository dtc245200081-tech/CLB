#!/bin/bash
set -e

echo "=== Đang kiểm tra và áp dụng Alembic Migrations ==="
alembic upgrade head

echo "=== Khởi tạo tài khoản Quản trị viên ban đầu (nếu DB trống) ==="
python -m app.core.seed

echo "=== Khởi động FastAPI Dev Server với Hot-reload ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
