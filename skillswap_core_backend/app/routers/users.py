"""
Router: /api/users
Handles user registration and skill management.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import Skill, SkillType, User, UserSkill
from app.schemas.schemas import UserRead, UserRegister, UserSkillAdd, UserSkillRead

router = APIRouter(prefix="/api/users", tags=["users"])


# ---------------------------------------------------------------------------
# POST /api/users/register
# ---------------------------------------------------------------------------


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register or update a Telegram user",
)
async def register_user(payload: UserRegister, db: AsyncSession = Depends(get_db)) -> UserRead:
    """
    Idempotent: if the telegram_id already exists, update name/bio fields
    and return the existing record (upsert behaviour).
    """
    stmt = (
        select(User)
        .where(User.telegram_id == payload.telegram_id)
        .options(selectinload(User.user_skills).selectinload(UserSkill.skill))
    )
    result = await db.execute(stmt)
    user = result.scalars().first()

    if user is None:
        user = User(
            telegram_id=payload.telegram_id,
            username=payload.username,
            first_name=payload.first_name,
            bio=payload.bio,
        )
        db.add(user)
        await db.flush()
    else:
        user.username = payload.username or user.username
        user.first_name = payload.first_name
        user.bio = payload.bio

    return UserRead.model_validate(user)


# ---------------------------------------------------------------------------
# GET /api/users/{user_id}
# ---------------------------------------------------------------------------


@router.get("/{user_id}", response_model=UserRead, summary="Get user profile")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)) -> UserRead:
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.user_skills).selectinload(UserSkill.skill))
    )
    result = await db.execute(stmt)
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserRead.model_validate(user)


# ---------------------------------------------------------------------------
# POST /api/users/{user_id}/skills
# ---------------------------------------------------------------------------


@router.post(
    "/{user_id}/skills",
    response_model=UserSkillRead,
    status_code=status.HTTP_201_CREATED,
    summary="Attach a skill (offer or seek) to a user",
)
async def add_skill(
    user_id: int,
    payload: UserSkillAdd,
    db: AsyncSession = Depends(get_db),
) -> UserSkillRead:
    # Ensure user exists
    user_result = await db.execute(select(User.id).where(User.id == user_id))
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Get-or-create skill (case-normalised by schema validator)
    skill_result = await db.execute(select(Skill).where(Skill.name == payload.skill_name))
    skill = skill_result.scalars().first()
    if skill is None:
        skill = Skill(name=payload.skill_name)
        db.add(skill)
        await db.flush()

    # Check for duplicate user_skill entry
    existing_stmt = select(UserSkill).where(
        UserSkill.user_id == user_id,
        UserSkill.skill_id == skill.id,
        UserSkill.skill_type == payload.skill_type,
    )
    existing = (await db.execute(existing_stmt)).scalars().first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User already has skill '{payload.skill_name}' as {payload.skill_type.value}",
        )

    user_skill = UserSkill(user_id=user_id, skill_id=skill.id, skill_type=payload.skill_type)
    db.add(user_skill)
    await db.flush()

    # Re-fetch with relations for response serialisation
    refreshed = await db.execute(
        select(UserSkill)
        .where(UserSkill.id == user_skill.id)
        .options(selectinload(UserSkill.skill))
    )
    return UserSkillRead.model_validate(refreshed.scalars().one())
