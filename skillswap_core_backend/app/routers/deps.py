"""
app/routers/deps.py

Спільні FastAPI-залежності для роутерів.

Тут живе get_current_user_id — головна залежність, яку використовують
УСІ захищені ендпоінти замість старого `current_user_id: int = Query(...)`.

Ланцюжок довіри:
  X-Telegram-Init-Data (заголовок)
        │  (Depends: get_verified_telegram_id, перевіряє HMAC-підпис)
        ▼
  telegram_id (довірений, підписаний Telegram)
        │  (Depends: get_current_user_id, SELECT у нашій БД)
        ▼
  User.id (внутрішній PK, яким користується решта коду — cards.py і т.д.)
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.telegram_auth import get_verified_telegram_id
from app.models.models import User


async def get_current_user_id(
    telegram_id: int = Depends(get_verified_telegram_id),
    db: AsyncSession = Depends(get_db),
) -> int:
    """
    Резолвить перевірений telegram_id у внутрішній User.id.

    403, а не 401 — навмисно: initData ВЖЕ перевірено й валідне (це не
    проблема автентифікації), просто для цього telegram_id ще немає
    юзера в нашій БД. За узгодженою архітектурою реєстрація відбувається
    тільки в боті через /start — тож це означає "напиши /start боту
    перш ніж відкривати Mini App", а не технічну помилку.
    """
    result = await db.execute(
        select(User.id).where(User.telegram_id == telegram_id)
    )
    user_id = result.scalar_one_or_none()

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Користувача не знайдено. Напишіть /start боту в Telegram, "
                "щоб зареєструватись, і відкрийте Mini App знову."
            ),
        )

    return user_id
