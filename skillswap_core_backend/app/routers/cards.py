"""
app/routers/cards.py

Router: /api/cards
Етап 2.2 — ендпоінт POST /swipe тепер надсилає match-нотифікації
через app/bot/notifications.py при взаємному лайку.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.notifications import send_match_notification
from app.core.database import get_db
from app.core.match_engine import get_next_card, record_swipe
from app.schemas.schemas import CardRead, SwipeCreate, SwipeResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cards", tags=["cards"])


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/cards/next
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/next",
    response_model=CardRead,
    summary="Get the next candidate card for the current user",
    responses={
        404: {"description": "No more cards available — deck is exhausted"},
    },
)
async def next_card(
    current_user_id: int = Query(..., gt=0, description="ID of the requesting user"),
    db: AsyncSession = Depends(get_db),
) -> CardRead:
    """
    Returns the best-matched candidate using the Match Engine.

    Priority order:
    1. Mirror match — candidate offers what I seek AND seeks what I offer.
    2. Partial match — candidate offers at least one skill I seek.
    3. 404 when no unswiped, compatible user exists.
    """
    card = await get_next_card(current_user_id=current_user_id, db=db)
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No more cards available. You've seen everyone!",
        )
    return card


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/cards/swipe
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/swipe",
    response_model=SwipeResult,
    status_code=status.HTTP_200_OK,
    summary="Record a swipe and check for a mutual match",
    responses={
        400: {"description": "Cannot swipe yourself"},
        409: {"description": "Duplicate swipe — already swiped this user"},
    },
)
async def swipe(
    payload: SwipeCreate,
    current_user_id: int = Query(..., gt=0, description="ID of the requesting user"),
    db: AsyncSession = Depends(get_db),
) -> SwipeResult:
    """
    Записує свайп і повертає результат.

    Флоу при is_like=True та взаємному лайку (match):
    ─────────────────────────────────────────────────
    1. record_swipe() → зберігає свайп, виявляє матч, повертає SwipeResult
    2. Транзакція комітиться через get_db (автоматично після yield)
    3. send_match_notification() → надсилає картку кожного юзера іншому
       у Telegram (виконується після коміту — дані вже в БД)
    4. Повертаємо SwipeResult клієнту

    Чому нотифікація ПІСЛЯ коміту, а не всередині транзакції:
    ──────────────────────────────────────────────────────────
    Якщо Telegram API впаде або буде timeout — транзакція з свайпом
    НЕ відкотиться. Свайп завжди зберігається. Нотифікація — це
    best-effort side effect, а не частина бізнес-транзакції.
    Помилка нотифікації логується, але не впливає на HTTP-відповідь.
    """
    if current_user_id == payload.to_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot swipe yourself.",
        )

    # ── 1. Записуємо свайп і визначаємо матч ─────────────────────────────────
    try:
        result = await record_swipe(
            from_user_id=current_user_id,
            to_user_id=payload.to_user_id,
            is_like=payload.is_like,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    # ── 2. Якщо матч — надсилаємо нотифікації обом юзерам ───────────────────
    #
    # get_db виконає commit після виходу з ендпоінту (після return).
    # Але нам потрібно щоб нотифікація пішла ПІСЛЯ того як дані вже в БД,
    # щоб _load_user_with_skills всередині notifications.py бачив актуальні дані.
    #
    # Рішення: flush вже зроблено в record_swipe → дані видимі в поточній сесії.
    # Нотифікація використовує ту саму db-сесію → бачить незакомічені дані.
    # Це безпечно: читаємо в рамках тієї ж транзакції.
    #
    if result.match and result.matched_user_id is not None:
        logger.info(
            "Match! initiator_id=%s matched_user_id=%s",
            current_user_id,
            result.matched_user_id,
        )
        try:
            await send_match_notification(
                initiator_id=current_user_id,
                matched_user_id=result.matched_user_id,
                db=db,
            )
        except Exception:
            # Нотифікація — best-effort. Помилка не скасовує свайп.
            logger.exception(
                "Не вдалося надіслати match-нотифікацію "
                "initiator=%s matched=%s",
                current_user_id,
                result.matched_user_id,
            )

    return result
