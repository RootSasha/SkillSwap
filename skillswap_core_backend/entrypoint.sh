#!/bin/sh

DB_TARGET_HOST="${DB_HOST:-skillswap_db}"

echo "⏳ Очікування старту PostgreSQL на хості ${DB_TARGET_HOST}:5432..."

while ! nc -z "$DB_TARGET_HOST" 5432; do
  sleep 0.1
done

echo "✅ PostgreSQL успішно запущено!"

echo "🚀 Запуск міграцій бази даних (Alembic)..."
alembic upgrade head

echo "🌱 Заливка початкових навичок розробників..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "$DB_TARGET_HOST" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -f /code/app/core/seed_skills.sql || echo "⚠️ Сид навичок пропущено або дані вже є"

echo "🔥 Запуск сервера FastAPI + aiogram бота..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
