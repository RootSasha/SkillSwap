"""
app/bot/notifications.py

Сервіс пуш-повідомлень для SkillSwap.

Єдина публічна функція:
    send_match_notification(initiator_id, matched_user_id, db) -> None

Викликається з роутера після фіксації взаємного лайку.
Відправляє обом юзерам картку один одного через Telegram Bot API.

Архітектурне рішення — чому окремий модуль, а не в record_swipe:
───────────────────────────────────────────────────────────────────
  record_swipe живе в match_engine.py і працює суто з БД.
  Він не повинен знати про існування Telegram-бота (принцип SRP).
  Роутер cards.py є точкою оркестрації: отримав SwipeResult.match=True
  → викликав send_match_notification → повернув відповідь клієнту.
  Так само легко підключити WebSocket або email-нотифікацію в майбутньому.
"""

import logging
from typing import Optional

from aiogram.exceptions import TelegramForbiddenError, TelegramBadRequest
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.bot.bot_instance import bot
from app.core.config import settings
from app.models.models import Skill, SkillType, User, UserSkill

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Внутрішні хелпери
# ─────────────────────────────────────────────────────────────────────────────


async def _load_user_with_skills(user_id: int, db: AsyncSession) -> Optional[User]:
    """
    Завантажує User разом зі скілами одним запитом.
    Повертає None якщо юзер не знайдений (не кидає виключення —
    нотифікація не повинна валити основний флоу).
    """
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.user_skills).selectinload(UserSkill.skill))
    )
    result = await db.execute(stmt)
    return result.scalars().first()


def _build_match_message(viewer: User, matched: User) -> str:
    """
    Формує текст повідомлення для viewer про матч з matched.

    viewer  — той хто отримає повідомлення
    matched — картка яку йому покажемо
    """
    display_name = f"@{matched.username}" if matched.username else matched.first_name

    # Розбиваємо навички на offers та seeks
    offers = [
        us.skill.name
        for us in matched.user_skills
        if us.skill_type == SkillType.offer
    ]
    seeks = [
        us.skill.name
        for us in matched.user_skills
        if us.skill_type == SkillType.seek
    ]

    offers_str = ", ".join(offers) if offers else "—"
    seeks_str = ", ".join(seeks) if seeks else "—"

    bio_section = ""
    if matched.bio:
        bio_section = f"\n💬 <i>{matched.bio}</i>\n"

    text = (
        f"🎉 <b>У тебе новий Матч!</b>\n\n"
        f"Познайомся з {display_name}{bio_section}\n"
        f"✅ <b>Пропонує:</b> {offers_str}\n"
        f"🔍 <b>Шукає:</b> {seeks_str}\n\n"
        f"⭐️ Рейтинг: {matched.rating:.1f}  |  "
        f"🪙 Карма: {matched.karma_balance:.0f}\n\n"
        f"Відкрий додаток, щоб написати першим 👇"
    )
    return text


def _build_webapp_keyboard() -> InlineKeyboardMarkup:
    """Інлайн-кнопка що відкриває TMA."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Відкрити SkillSwap",
                    web_app=WebAppInfo(url=settings.WEBAPP_URL),
                )
            ]
        ]
    )


async def _safe_send(telegram_id: int, text: str, keyboard: InlineKeyboardMarkup) -> None:
    """
    Відправляє повідомлення з обробкою типових Telegram-помилок.

    TelegramForbiddenError — юзер заблокував бота (не критично, логуємо).
    TelegramBadRequest     — невалідний chat_id або інша помилка API.
    """
    try:
        await bot.send_message(
            chat_id=telegram_id,
            text=text,
            reply_markup=keyboard,
        )
        logger.info("Match-нотифікація відправлена telegram_id=%s", telegram_id)
    except TelegramForbiddenError:
        logger.warning(
            "Не вдалося відправити нотифікацію: юзер %s заблокував бота",
            telegram_id,
        )
    except TelegramBadRequest as e:
        logger.error(
            "TelegramBadRequest для telegram_id=%s: %s",
            telegram_id,
            e,
        )
    except Exception:
        logger.exception(
            "Неочікувана помилка при відправці нотифікації telegram_id=%s",
            telegram_id,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Публічний API
# ─────────────────────────────────────────────────────────────────────────────


async def send_match_notification(
    initiator_id: int,
    matched_user_id: int,
    db: AsyncSession,
) -> None:
    """
    Відправляє match-повідомлення обом юзерам у Telegram.

    initiator_id    — той хто щойно поставив лайк (замкнув матч)
    matched_user_id — той хто лайкнув раніше

    Схема нотифікацій:
    ┌─────────────────────────────────────────────────────────┐
    │  initiator  отримує картку  matched_user               │
    │  matched_user отримує картку  initiator                │
    └─────────────────────────────────────────────────────────┘

    Завантажуємо обох юзерів одним запитом (WHERE id IN (...))
    щоб уникнути двох окремих SELECT.
    """
    # ── Завантажуємо обох юзерів одним запитом ───────────────────────────────
    stmt = (
        select(User)
        .where(User.id.in_([initiator_id, matched_user_id]))
        .options(selectinload(User.user_skills).selectinload(UserSkill.skill))
    )
    result = await db.execute(stmt)
    users_map: dict[int, User] = {u.id: u for u in result.scalars().all()}

    initiator = users_map.get(initiator_id)
    matched = users_map.get(matched_user_id)

    if not initiator or not matched:
        logger.error(
            "send_match_notification: не знайдено юзерів initiator_id=%s matched_user_id=%s",
            initiator_id,
            matched_user_id,
        )
        return

    keyboard = _build_webapp_keyboard()

    # ── Нотифікація для initiator — показуємо картку matched ─────────────────
    await _safe_send(
        telegram_id=initiator.telegram_id,
        text=_build_match_message(viewer=initiator, matched=matched),
        keyboard=keyboard,
    )

    # ── Нотифікація для matched — показуємо картку initiator ─────────────────
    await _safe_send(
        telegram_id=matched.telegram_id,
        text=_build_match_message(viewer=matched, matched=initiator),
        keyboard=keyboard,
    )
