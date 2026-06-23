FROM python:3.12-slim

# Встановлюємо netcat та postgres-client для роботи entrypoint скрипта
RUN apt-get update && apt-get install -y netcat-openbsd postgresql-client && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY ./app /code/app
COPY ./alembic.ini /code/alembic.ini
COPY ./alembic /code/alembic
COPY ./entrypoint.sh /code/entrypoint.sh

# chmod +x прямо тут — git/zip-перенос файлів на інший сервер не завжди
# зберігає executable-біт (особливо при розпакуванні zip через GUI-архіватори
# чи копіюванні з Windows). Без цього рядка контейнер падає з:
#   "exec: /code/entrypoint.sh: permission denied"
# навіть якщо в репозиторії файл мав правильні права.
RUN chmod +x /code/entrypoint.sh

# Замість прямого запуску uvicorn — викликаємо наш скрипт
ENTRYPOINT ["/code/entrypoint.sh"]
