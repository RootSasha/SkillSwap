"""
Router: /api/cards
Handles card discovery (match engine) and swipe actions.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.match_engine import get_next_card, record_swipe
from app.schemas.schemas import CardRead, SwipeCreate, SwipeResult

router = APIRouter(prefix="/api/cards", tags=["cards"])


# ---------------------------------------------------------------------------
# GET /api/cards/next
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# POST /api/cards/swipe
# ---------------------------------------------------------------------------


@router.post(
    "/swipe",
    response_model=SwipeResult,
    status_code=status.HTTP_200_OK,
    summary="Record a swipe and check for a mutual match",
    responses={
        409: {"description": "Duplicate swipe — already swiped this user"},
    },
)
async def swipe(
    payload: SwipeCreate,
    current_user_id: int = Query(..., gt=0, description="ID of the requesting user"),
    db: AsyncSession = Depends(get_db),
) -> SwipeResult:
    """
    Records is_like=True (like) or is_like=False (dislike).

    If both users liked each other → returns `{"match": true, "matched_user_id": <id>}`.
    Otherwise          → returns `{"match": false, "matched_user_id": null}`.
    """
    if current_user_id == payload.to_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot swipe yourself.",
        )

    try:
        result = await record_swipe(
            from_user_id=current_user_id,
            to_user_id=payload.to_user_id,
            is_like=payload.is_like,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return result
