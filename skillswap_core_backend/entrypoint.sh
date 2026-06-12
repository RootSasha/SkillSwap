#!/bin/sh

# Очікуємо, поки підніметься порт бази даних
echo "Waiting for postgres..."
while ! nc -z skillswap_db 5432; do
  sleep 0.1
done
echo "PostgreSQL started"

# 1. Накатуємо міграції Alembic
echo "Running database migrations..."
alembic upgrade head

# 2. Заливаємо стартові скіли (ON CONFLICT DO NOTHING захищає від дублікатів при перезапуску)
echo "Seeding initial skills..."
PGPASSWORD=super_password123 psql -h skillswap_db -U sasha_admin -d skillswap -c "
INSERT INTO skills (name) VALUES 
('Python'), 
('Figma'), 
('React'), 
('Copywriting') 
ON CONFLICT (name) DO NOTHING;"

# 3. Запускаємо сам FastAPI
echo "Starting FastAPI server..."
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
