#!/bin/bash
set -e

mkdir -p storage/attendance_photos storage/receipt_photos storage/avatar_photos

echo "=== Đang kiểm tra và áp dụng Alembic Migrations ==="
alembic upgrade head

echo "=== Khởi tạo tài khoản Quản trị viên ban đầu (nếu DB trống) ==="
python -m app.core.seed

echo "=== Khởi động FastAPI Production Server ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
