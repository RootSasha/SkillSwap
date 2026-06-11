"""
Match Engine — core business logic for SkillSwap.

Functions
─────────
get_next_card(current_user_id, db)
    Finds the best candidate for the current user to swipe.
    Priority 1: mirror match  — candidate offers what I seek AND seeks what I offer.
    Priority 2: partial match — candidate offers what I seek (one-directional).
    Returns a single User ORM object or None when the deck is exhausted.

record_swipe(from_user_id, to_user_id, is_like, db)
    Persists the swipe and checks for a mutual like (match).
    Returns SwipeResult.
"""

from sqlalchemy import and_, exists, func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Skill, SkillType, Swipe, User, UserSkill
from app.schemas.schemas import CardRead, SwipeResult


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_card(user: User) -> CardRead:
    """Convert a User ORM object (with loaded user_skills) into a CardRead."""
    offers = [us.skill.name for us in user.user_skills if us.skill_type == SkillType.offer]
    seeks = [us.skill.name for us in user.user_skills if us.skill_type == SkillType.seek]
    return CardRead(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        bio=user.bio,
        rating=user.rating,
        karma_balance=user.karma_balance,
        offers=offers,
        seeks=seeks,
    )


# ---------------------------------------------------------------------------
# Sub-queries (reusable building blocks)
# ---------------------------------------------------------------------------


def _already_swiped_subq(current_user_id: int):
    """
    Scalar subquery: IDs of users that current_user has already swiped.
    Used to exclude them from the candidate pool.
    """
    return select(Swipe.to_user_id).where(Swipe.from_user_id == current_user_id).scalar_subquery()


def _my_seek_skill_ids_subq(current_user_id: int):
    """Skill IDs that the current user is *seeking*."""
    return (
        select(UserSkill.skill_id)
        .where(
            and_(
                UserSkill.user_id == current_user_id,
                UserSkill.skill_type == SkillType.seek,
            )
        )
        .scalar_subquery()
    )


def _my_offer_skill_ids_subq(current_user_id: int):
    """Skill IDs that the current user *offers*."""
    return (
        select(UserSkill.skill_id)
        .where(
            and_(
                UserSkill.user_id == current_user_id,
                UserSkill.skill_type == SkillType.offer,
            )
        )
        .scalar_subquery()
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_next_card(current_user_id: int, db: AsyncSession) -> CardRead | None:
    """
    Return the single best candidate for the current user.

    Algorithm (two-pass):
    ─────────────────────
    Pass 1 — mirror match:
        Candidate offers ≥1 skill I seek
        AND candidate seeks ≥1 skill I offer.

    Pass 2 — partial match (fallback):
        Candidate offers ≥1 skill I seek.

    In both passes the candidate:
        • is not me
        • has not been swiped by me yet

    Within each pass we pick randomly (func.random()) so the deck feels
    fresh on every call rather than always returning the same top result.
    """

    already_swiped = _already_swiped_subq(current_user_id)
    my_seeks = _my_seek_skill_ids_subq(current_user_id)
    my_offers = _my_offer_skill_ids_subq(current_user_id)

    # ── shared WHERE clauses ──────────────────────────────────────────────
    base_filters = [
        User.id != current_user_id,
        User.id.not_in(already_swiped),
    ]

    # ── EXISTS helpers ────────────────────────────────────────────────────
    candidate_offers_my_seek = exists(
        select(UserSkill.id).where(
            and_(
                UserSkill.user_id == User.id,
                UserSkill.skill_type == SkillType.offer,
                UserSkill.skill_id.in_(my_seeks),
            )
        )
    )

    candidate_seeks_my_offer = exists(
        select(UserSkill.id).where(
            and_(
                UserSkill.user_id == User.id,
                UserSkill.skill_type == SkillType.seek,
                UserSkill.skill_id.in_(my_offers),
            )
        )
    )

    # Eagerly load skills in the same round-trip to avoid N+1
    load_skills = selectinload(User.user_skills).selectinload(UserSkill.skill)

    # ── Pass 1: mirror match ──────────────────────────────────────────────
    mirror_stmt = (
        select(User)
        .where(and_(*base_filters, candidate_offers_my_seek, candidate_seeks_my_offer))
        .options(load_skills)
        .order_by(func.random())
        .limit(1)
    )
    result = await db.execute(mirror_stmt)
    candidate = result.scalars().first()

    if candidate:
        return _build_card(candidate)

    # ── Pass 2: partial match — candidate offers what I seek ──────────────
    partial_stmt = (
        select(User)
        .where(and_(*base_filters, candidate_offers_my_seek))
        .options(load_skills)
        .order_by(func.random())
        .limit(1)
    )
    result = await db.execute(partial_stmt)
    candidate = result.scalars().first()

    return _build_card(candidate) if candidate else None


async def record_swipe(
    from_user_id: int,
    to_user_id: int,
    is_like: bool,
    db: AsyncSession,
) -> SwipeResult:
    """
    Persist a swipe.

    If is_like=True, check whether the target already liked back →
    return match=True and matched_user_id.

    Raises ValueError on a duplicate swipe attempt (caught by the router).
    """

    # Duplicate-swipe guard (the DB unique constraint is the final safety net,
    # but we check here to return a clear error before hitting the DB).
    existing_stmt = select(Swipe.id).where(
        and_(Swipe.from_user_id == from_user_id, Swipe.to_user_id == to_user_id)
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing is not None:
        raise ValueError("Duplicate swipe: you have already swiped this user.")

    # Persist swipe
    swipe = Swipe(from_user_id=from_user_id, to_user_id=to_user_id, is_like=is_like)
    db.add(swipe)
    await db.flush()  # write to DB within the transaction without committing yet

    # Check for mutual like
    if is_like:
        mutual_stmt = select(Swipe.id).where(
            and_(
                Swipe.from_user_id == to_user_id,
                Swipe.to_user_id == from_user_id,
                Swipe.is_like.is_(True),
            )
        )
        mutual = (await db.execute(mutual_stmt)).scalar_one_or_none()
        if mutual is not None:
            return SwipeResult(match=True, matched_user_id=to_user_id)

    return SwipeResult(match=False)
