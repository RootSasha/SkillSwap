"""
Pydantic v2 schemas for SkillSwap — Етап 1.2.

Ієрархія:
  SkillBase / SkillResponse
  UserBase / UserRegister / UserResponse   (offers + seeks розділені)
  UserSkillsUpdate                          (bulk replace за ID)
  SwipeCreate / SwipeResult
  CardRead                                  (для match engine)
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ============================================================================
# Skill
# ============================================================================


class SkillBase(BaseModel):
    """Мінімальна схема навички — використовується як вхідна та базова."""

    name: str = Field(..., min_length=1, max_length=128, examples=["Python", "Figma"])

    @field_validator("name")
    @classmethod
    def normalise_name(cls, v: str) -> str:
        """Прибираємо зайві пробіли, title-case для єдиного написання."""
        return v.strip().title()


class SkillResponse(SkillBase):
    """Відповідь API зі скілом — додаємо id."""

    model_config = ConfigDict(from_attributes=True)

    id: int


# ============================================================================
# User
# ============================================================================


class UserBase(BaseModel):
    """Спільні поля для читання і запису."""

    telegram_id: int = Field(..., gt=0, description="Унікальний Telegram user ID")
    username: Optional[str] = Field(None, max_length=64, description="@username без @")
    first_name: str = Field(..., min_length=1, max_length=128)


class UserRegister(UserBase):
    """
    Payload для POST /api/users/
    Якщо юзер вже є — upsert (оновлює username та first_name).
    """

    bio: Optional[str] = Field(None, max_length=1024)


class UserResponse(BaseModel):
    """
    Повна відповідь профілю.
    Навички розділені на два окремих списки — offers та seeks —
    щоб фронтенд не робив зайвий filter на клієнті.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    telegram_id: int
    username: Optional[str]
    first_name: str
    bio: Optional[str]
    karma_balance: float
    rating: float
    offers: list[SkillResponse] = Field(
        default_factory=list,
        description="Навички, які користувач пропонує",
    )
    seeks: list[SkillResponse] = Field(
        default_factory=list,
        description="Навички, які користувач шукає",
    )


# ============================================================================
# UserSkills — bulk update
# ============================================================================


class UserSkillsUpdate(BaseModel):
    """
    Payload для POST /api/users/skills

    Передаються масиви INTEGER ID навичок із таблиці skills.
    Сервер повністю замінює поточні записи в user_skills.
    Дублікати в масивах ігноруються (set dedup на рівні валідатора).
    """

    offers: list[int] = Field(
        default_factory=list,
        description="ID навичок, які пропоную (offer)",
    )
    seeks: list[int] = Field(
        default_factory=list,
        description="ID навичок, які шукаю (seek)",
    )

    @field_validator("offers", "seeks", mode="before")
    @classmethod
    def dedup_and_validate(cls, v: list) -> list[int]:
        """Знімаємо дублікати, переконуємось що значення > 0."""
        seen: set[int] = set()
        result: list[int] = []
        for item in v:
            skill_id = int(item)
            if skill_id <= 0:
                raise ValueError(f"Skill ID має бути > 0, отримано: {skill_id}")
            if skill_id not in seen:
                seen.add(skill_id)
                result.append(skill_id)
        return result

    @model_validator(mode="after")
    def check_no_overlap(self) -> "UserSkillsUpdate":
        """Один і той самий скіл не може бути одночасно offer та seek."""
        overlap = set(self.offers) & set(self.seeks)
        if overlap:
            raise ValueError(
                f"Навички не можуть бути одночасно offer та seek: ID {overlap}"
            )
        return self


# ============================================================================
# Swipe
# ============================================================================


class SwipeCreate(BaseModel):
    """Payload для POST /api/cards/swipe."""

    to_user_id: int = Field(..., gt=0, description="ID кандидата якому ставимо свайп")
    is_like: bool = Field(..., description="True = лайк, False = дизлайк")


class SwipeResult(BaseModel):
    """Відповідь після запису свайпу."""

    recorded: bool = True
    match: bool = Field(..., description="True якщо обидва лайкнули один одного")
    matched_user_id: Optional[int] = Field(
        None, description="ID matched юзера (якщо match=True)"
    )


# ============================================================================
# Card (Match Engine response)
# ============================================================================


class CardRead(BaseModel):
    """
    Картка кандидата, яку бачить юзер під час свайпу.
    Формується в match_engine.py з ORM-об'єкта.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: Optional[str]
    first_name: str
    bio: Optional[str]
    rating: float
    karma_balance: float
    offers: list[str] = Field(default_factory=list)
    seeks: list[str] = Field(default_factory=list)
