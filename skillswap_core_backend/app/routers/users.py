"""
Router: /api/users
Етап 1.2 — повна реалізація чотирьох ендпоінтів.

Ендпоінти
─────────
POST   /api/users/          — реєстрація / upsert
GET    /api/users/me        — профіль поточного юзера
POST   /api/users/skills    — bulk-replace навичок
GET    /api/users/skills-list — всі доступні навички (алфавітний порядок)
"""
from sqlalchemy.orm.attributes import set_committed_value
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import Skill, SkillType, User, UserSkill
from app.schemas.schemas import (
    SkillResponse,
    UserRegister,
    UserResponse,
    UserSkillsUpdate,
)

router = APIRouter(prefix="/api/users", tags=["users"])


# ---------------------------------------------------------------------------
# Внутрішній хелпер: завантажити юзера з навичками або кинути 404
# ---------------------------------------------------------------------------


async def _get_user_with_skills(user_id: int, db: AsyncSession) -> User:
    """
    Завантажує User разом з user_skills → skill одним запитом (selectinload).
    Кидає 404 якщо юзер не знайдений.
    """
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.user_skills).selectinload(UserSkill.skill)
        )
    )
    result = await db.execute(stmt)
    user = result.scalars().first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Юзера з id={user_id} не знайдено.",
        )
    return user


# ---------------------------------------------------------------------------
# Внутрішній хелпер: конвертувати ORM User → UserResponse
# ---------------------------------------------------------------------------


def _build_user_response(user: User) -> UserResponse:
    """
    Розбиває user.user_skills на два окремих списки offers / seeks.
    user.user_skills має бути вже завантажено (selectinload).
    """
    offers: list[SkillResponse] = []
    seeks: list[SkillResponse] = []

    for us in user.user_skills:
        skill_resp = SkillResponse(id=us.skill.id, name=us.skill.name)
        if us.skill_type == SkillType.offer:
            offers.append(skill_resp)
        else:
            seeks.append(skill_resp)

    return UserResponse(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=user.first_name,
        bio=user.bio,
        karma_balance=user.karma_balance,
        rating=user.rating,
        offers=offers,
        seeks=seeks,
    )


# ===========================================================================
# POST /api/users/  — реєстрація / upsert
# ===========================================================================


@router.post(
    "/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Реєстрація або оновлення Telegram-юзера (upsert)",
)
async def register_user(
    payload: UserRegister,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Idempotent upsert:
    - Якщо telegram_id НЕ існує → створює нового юзера з karma_balance=1.
    - Якщо telegram_id вже є → оновлює username та first_name.
    В обох випадках повертає актуальний UserResponse з навичками.
    """
    # Шукаємо існуючого юзера одразу з навичками
    stmt = (
        select(User)
        .where(User.telegram_id == payload.telegram_id)
        .options(selectinload(User.user_skills).selectinload(UserSkill.skill))
    )
    result = await db.execute(stmt)
    user = result.scalars().first()

    if user is None:
        # ── Новий юзер ──────────────────────────────────────────────────────
        user = User(
            telegram_id=payload.telegram_id,
            username=payload.username,
            first_name=payload.first_name,
            bio=payload.bio,
            karma_balance=1.0,   # стартовий бонус
            rating=5.0,
        )
        db.add(user)
        await db.flush()         # отримуємо user.id до commit

        # Кажемо SQLAlchemy, що у нового юзера немає навичок (захист від Lazy Load)
        set_committed_value(user, "user_skills", [])
        return _build_user_response(user)

    # ── Існуючий юзер: оновлюємо тільки змінювані поля ─────────────────────
    user.username = payload.username
    user.first_name = payload.first_name
    if payload.bio is not None:
        user.bio = payload.bio

    await db.flush()

    # Про всяк випадок перевіряємо: якщо user_skills чомусь не підвантажився, 
    # ставимо порожній список замість падіння в greenlet_spawn
    if "user_skills" not in user.__dict__:
        set_committed_value(user, "user_skills", [])

    return _build_user_response(user)


# ===========================================================================
# GET /api/users/me  — профіль поточного юзера
# ===========================================================================


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Профіль поточного юзера з поділом навичок на offers/seeks",
)
async def get_me(
    current_user_id: int = Query(..., gt=0, description="ID поточного юзера"),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Повертає повний профіль юзера.
    Навички розбиті на два списки: offers та seeks.

    У реальному продакшні current_user_id витягувався б із JWT/Telegram
    init-data токена через middleware. Поки передаємо як query-param.
    """
    user = await _get_user_with_skills(current_user_id, db)
    return _build_user_response(user)


# ===========================================================================
# POST /api/users/skills  — bulk-replace навичок
# ===========================================================================


@router.post(
    "/skills",
    response_model=UserResponse,
    summary="Повна заміна навичок користувача (offer + seek)",
)
async def update_skills(
    payload: UserSkillsUpdate,
    current_user_id: int = Query(..., gt=0, description="ID поточного юзера"),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Стратегія: DELETE + bulk INSERT (два запити замість N).

    1. Перевіряємо, що всі передані skill_id реально існують у таблиці skills.
    2. Видаляємо ВСІ поточні записи user_skills для цього юзера одним DELETE.
    3. Вставляємо нові записи одним bulk INSERT (executemany через Core).
    4. Повертаємо оновлений профіль.

    Транзакція керується через get_db — rollback при будь-якому винятку.
    """
    # ── 0. Перевірка що юзер існує ──────────────────────────────────────────
    user_exists = await db.execute(select(User.id).where(User.id == current_user_id))
    if user_exists.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Юзера з id={current_user_id} не знайдено.",
        )

    # ── 1. Валідація: перевіряємо що всі skill_id існують ───────────────────
    all_requested_ids = list(set(payload.offers + payload.seeks))

    if all_requested_ids:
        existing_stmt = select(Skill.id).where(Skill.id.in_(all_requested_ids))
        existing_result = await db.execute(existing_stmt)
        existing_ids: set[int] = {row for row in existing_result.scalars()}

        missing = set(all_requested_ids) - existing_ids
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Навички з такими ID не існують: {sorted(missing)}",
            )

    # ── 2. Видаляємо всі старі записи одним DELETE ──────────────────────────
    await db.execute(
        delete(UserSkill).where(UserSkill.user_id == current_user_id)
    )

    # ── 3. Bulk INSERT нових записів ─────────────────────────────────────────
    #   Використовуємо SQLAlchemy Core insert для одного round-trip до БД.
    #   Якщо обидва масиви пусті — просто пропускаємо INSERT.
    rows: list[dict] = []

    for skill_id in payload.offers:
        rows.append({
            "user_id": current_user_id,
            "skill_id": skill_id,
            "skill_type": SkillType.offer,
        })

    for skill_id in payload.seeks:
        rows.append({
            "user_id": current_user_id,
            "skill_id": skill_id,
            "skill_type": SkillType.seek,
        })

    if rows:
        await db.execute(pg_insert(UserSkill).values(rows))

    await db.flush()

    # ── 4. Повертаємо оновлений профіль ─────────────────────────────────────
    user = await _get_user_with_skills(current_user_id, db)
    return _build_user_response(user)


# ===========================================================================
# GET /api/users/skills-list  — всі навички (для фронтенд-пікера)
# ===========================================================================


@router.get(
    "/skills-list",
    response_model=list[SkillResponse],
    summary="Список усіх доступних навичок (A→Z)",
)
async def list_all_skills(
    db: AsyncSession = Depends(get_db),
) -> list[SkillResponse]:
    """
    Повертає всі записи з таблиці skills відсортовані за алфавітом.
    Фронтенд використовує цей список для побудови пікера навичок.
    """
    stmt = select(Skill).order_by(Skill.name.asc())
    result = await db.execute(stmt)
    skills = result.scalars().all()
    return [SkillResponse(id=s.id, name=s.name) for s in skills]
