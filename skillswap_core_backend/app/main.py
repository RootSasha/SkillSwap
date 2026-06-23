"""
app/main.py

SkillSwap — FastAPI application entry point.
Етап 2.1: бот Aiogram 3.x запускається паралельно з FastAPI
через asyncio.create_task у lifespan-контексті.

ВИПРАВЛЕНО: Додано налаштування CORSMiddleware для запобігання CORS-блокувань.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan — startup / shutdown
# ─────────────────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Послідовність startup:
    1. Підключаємо роутер хендлерів до диспетчера.
    2. Запускаємо Long Polling бота як фонову asyncio-задачу.

    Послідовність shutdown:
    1. Скасовуємо задачу бота (викликає CancelledError всередині polling).
    2. Закриваємо HTTP-сесію бота (звільняємо з'єднання).
    3. Закриваємо пул з'єднань SQLAlchemy.

    Імпорти bot/dp/router — всередині функції, щоб уникнути circular imports
    та щоб Settings вже були повністю ініціалізовані на момент імпорту.
    """
    # ── Імпорти тут, а не на рівні модуля ────────────────────────────────────
    from app.bot.bot_instance import bot, dp
    from app.bot.handlers import router as bot_router

    # ── Startup ───────────────────────────────────────────────────────────────
    logger.info("Підключаємо хендлери до диспетчера...")
    dp.include_router(bot_router)

    logger.info("Запускаємо Telegram Long Polling у фоні...")
    polling_task = asyncio.create_task(
        dp.start_polling(
            bot,
            skip_updates=True,   # ігноруємо повідомлення, що прийшли поки бот не працював
            allowed_updates=dp.resolve_used_update_types(),  # тільки потрібні типу апдейтів
        )
    )

    logger.info("SkillSwap запущено. FastAPI + Telegram Bot активні.")

    # ── Передаємо керування FastAPI ───────────────────────────────────────────
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("Зупиняємо Telegram Bot...")
    polling_task.cancel()

    try:
        await polling_task
    except asyncio.CancelledError:
        # Очікувана поведінка при скасуванні задачі
        pass
    except Exception:
        logger.exception("Неочікувана помилка при зупинці polling")

    # Закриваємо aiohttp-сесію бота — звільняємо TCP з'єднання
    await bot.session.close()
    logger.info("Сесію бота закрито.")

    # Закриваємо пул з'єднань SQLAlchemy
    await engine.dispose()
    logger.info("Пул з'єднань БД закрито.")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=(
        "SkillSwap Core Backend — fast intellectual barter exchange for "
        "developers, designers, and makers."
    ),
    lifespan=lifespan,
)

# ── Налаштування CORS (Виправлено для сумісності з Telegram WebView) ─────────
# ВАЖЛИВО: allow_origins=["*"] разом з allow_credentials=True — невалідна
# комбінація за специфікацією CORS. Браузер/WebView має право ІГНОРУВАТИ
# wildcard "*", якщо запит містить credentials, і вимагає від сервера
# повернути конкретний Origin замість "*". У звичайному Chrome це часто
# "прощалось", але Telegram WebView (особливо на iOS) суворіший і саме
# тут міг ловити "No Access-Control-Allow-Origin" навіть коли CORS
# виглядав налаштованим правильно.
#
# Рішення: allow_origin_regex покриває localhost (будь-який порт, для Vite
# дев-сервера), будь-яку IP-адресу (поточний сервер) і тимчасові HTTPS-тунелі
# (*.trycloudflare.com та *.ngrok-free.app) для тестування в Telegram.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
                        r"|https?://\d+\.\d+\.\d+\.\d+(:\d+)?"
                        r"|https://[a-zA-Z0-9-]+\.trycloudflare\.com"
                        r"|https://[a-zA-Z0-9-]+\.ngrok-free\.app",
    allow_credentials=True,
    allow_methods=["*"],  # Дозволяємо всі HTTP методи (GET, POST, PUT, DELETE тощо)
    allow_headers=["*"],  # Дозволяємо всі HTTP заголовки
)

# ── Роутери FastAPI ───────────────────────────────────────────────────────────
from app.routers import cards, users  # noqa: E402 — після створення app

app.include_router(users.router)
app.include_router(cards.router)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["infra"])
async def health() -> dict:
    return {"status": "ok", "version": settings.APP_VERSION}
