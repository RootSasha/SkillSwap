"""
app/bot/handlers.py

Хендлери Telegram-бота для SkillSwap — Етап 2.1 (виправлена версія).

Зміни відносно попередньої версії:
- Додано всі відсутні імпорти (Router та інші)
- Команда /start використовує PostgreSQL UPSERT (ON CONFLICT DO UPDATE)
  через sqlalchemy.dialects.postgresql.insert — повністю виключає
  UniqueViolationError при паралельних запитах або повторних /start.
"""

import logging

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.models import User

logger = logging.getLogger(__name__)

# Роутер підключається до dp у main.py через dp.include_router(router)
router = Router(name="main_handlers")


# ─────────────────────────────────────────────────────────────────────────────
# /start
# ─────────────────────────────────────────────────────────────────────────────


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """
    Обробник команди /start.

    Використовує PostgreSQL UPSERT (INSERT ... ON CONFLICT DO UPDATE) —
    один атомарний запит замість SELECT + INSERT/UPDATE.

    Переваги перед SELECT-then-INSERT:
    ┌─────────────────────────────────────────────────────────────────┐
    │  Стара логіка (SELECT → INSERT або UPDATE):                     │
    │  • Race condition: два /start одночасно → UniqueViolationError  │
    │  • Два round-trip до БД замість одного                          │
    │                                                                 │
    │  UPSERT (ON CONFLICT DO UPDATE):                                │
    │  • Атомарний — база сама вирішує конфлікт                       │
    │  • Один round-trip до БД                                        │
    │  • Не може кинути UniqueViolationError за telegram_id           │
    └─────────────────────────────────────────────────────────────────┘
    """
    tg_user = message.from_user
    if tg_user is None:
        # Технічне повідомлення без відправника — ігноруємо
        return

    telegram_id: int = tg_user.id
    username: str | None = tg_user.username
    first_name: str = tg_user.first_name or "Користувач"

    # ── PostgreSQL UPSERT ─────────────────────────────────────────────────────
    #
    # Генерований SQL (спрощено):
    #
    #   INSERT INTO users (telegram_id, username, first_name, bio,
    #                      karma_balance, rating)
    #   VALUES (:telegram_id, :username, :first_name, NULL, 1.0, 5.0)
    #   ON CONFLICT (telegram_id)
    #   DO UPDATE SET
    #       username   = EXCLUDED.username,
    #       first_name = EXCLUDED.first_name
    #   RETURNING id;
    #
    # EXCLUDED — псевдо-таблиця PostgreSQL з даними що намагались вставити.
    # Поля karma_balance, rating, bio — НЕ оновлюємо, щоб не затерти
    # накопичені дані існуючого юзера.

    stmt = (
        pg_insert(User)
        .values(
            telegram_id=telegram_id,
            username=username,
            first_name=first_name,
            bio=None,
            karma_balance=1.0,
            rating=5.0,
        )
        .on_conflict_do_update(
            index_elements=["telegram_id"],   # колонка з UNIQUE-індексом
            set_={
                "username": username,
                "first_name": first_name,
                # karma_balance та rating навмисно НЕ оновлюємо
            },
        )
        .returning(User.id)
    )

    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                result = await session.execute(stmt)
                user_id = result.scalar_one()
                logger.info(
                    "UPSERT юзера: telegram_id=%s username=%s → user.id=%s",
                    telegram_id,
                    username,
                    user_id,
                )
    except Exception:
        logger.exception(
            "Критична помилка UPSERT для telegram_id=%s", telegram_id
        )
        await message.answer(
            "⚠️ Сталася помилка при реєстрації. Спробуй ще раз через хвилину."
        )
        return

    # ── Формуємо відповідь ───────────────────────────────────────────────────
    display_name = f"@{username}" if username else first_name

    text = (
        f"👋 Привіт, <b>{display_name}</b>!\n\n"
        f"Ласкаво просимо до <b>SkillSwap</b> — біржі інтелектуального бартеру.\n\n"
        f"🔄 Тут ти можеш обмінятися навичками з іншими:\n"
        f"  • <i>код</i> на <i>дизайн</i>\n"
        f"  • <i>таргет</i> на <i>копірайтинг</i>\n"
        f"  • і все що завгодно!\n\n"
        f"Натисни кнопку нижче, щоб почати свайпати 👇"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Відкрити SkillSwap",
                    web_app=WebAppInfo(url=settings.WEBAPP_URL),
                )
            ]
        ]
    )

    await message.answer(text=text, reply_markup=keyboard)
