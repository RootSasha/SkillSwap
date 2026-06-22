"""
app/routers/cards.py
 
Router: /api/cards
Етап 2.2 + 3.4 (production) — ендпоінт POST /swipe надсилає match-нотифікації
через app/bot/notifications.py при взаємному лайку.

ВАЖЛИВО: current_user_id більше не Query-параметр (?current_user_id=1),
яким міг керувати клієнт напряму — тепер Depends(get_current_user_id),
що резолвиться з підписаного Telegram initData. Без цього будь-хто міг
підставити чужий ID і свайпати/дивитись матчі від чужого імені.
"""
 
import logging
 
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
 
from app.bot.notifications import send_match_notification
from app.core.database import get_db
from app.core.match_engine import get_next_card, record_swipe, _build_card
from app.models.models import SkillType, Swipe, User, UserSkill
from app.routers.deps import get_current_user_id
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
    current_user_id: int = Depends(get_current_user_id),
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
 
 
@router.get("/matches", response_model=list[CardRead])
async def get_matches(
    current_user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[CardRead]:
    """Повертає список юзерів з якими є взаємний лайк."""
    # ВИПРАВЛЕНО (2): прибрано .join(Swipe, ...) у головному select(User) —
    # він спричиняв вимогу .unique() через комбінацію JOIN + selectinload.
    #
    # ВИПРАВЛЕНО (3): додано явний .correlate(User) на кожному EXISTS-підзапиті.
    # Без цього SQLAlchemy 2.x під час компіляції SQL іноді намагається
    # "авто-корелювати" підзапит і прибирає таблицю swipes з його власного
    # FROM, бо єдина пряма колонка-референс у where — це User.id (зовнішня
    # кореляція), а сам Swipe.id у select() підзапиту не рятує від цього.
    # Результат — InvalidRequestError: "returned no FROM clauses due to
    # auto-correlation", що падало як 500 на /api/cards/matches.
    # .correlate(User) явно каже: "корелюй тільки User, а swipes лишай
    # власною таблицею цього підзапиту" — і прибирає двозначність.
    stmt = (
        select(User)
        .where(
            exists(
                select(Swipe.id)
                .where(
                    Swipe.from_user_id == current_user_id,
                    Swipe.to_user_id == User.id,
                    Swipe.is_like.is_(True),
                )
                .correlate(User)
            ),
            exists(
                select(Swipe.id)
                .where(
                    Swipe.from_user_id == User.id,
                    Swipe.to_user_id == current_user_id,
                    Swipe.is_like.is_(True),
                )
                .correlate(User)
            ),
        )
        .options(selectinload(User.user_skills).selectinload(UserSkill.skill))
    )
    result = await db.execute(stmt)
    users = result.scalars().unique().all()
    return [_build_card(u) for u in users]
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
    current_user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SwipeResult:
    """
    Записує свайп і повертає результат.
 
    Флоу при is_like=True та взаємному лайку (match):
    1. record_swipe() → зберігає свайп, виявляє матч, повертає SwipeResult
    2. Транзакція комітиться через get_db (автоматично після yield)
    3. send_match_notification() → надсилає картку кожного юзера іншому
       у Telegram (виконується після коміту — дані вже в БД)
    4. Повертаємо SwipeResult клієнту
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
            logger.exception(
                "Не вдалося надіслати match-нотифікацію "
                "initiator=%s matched=%s",
                current_user_id,
                result.matched_user_id,
            )
 
    return result
