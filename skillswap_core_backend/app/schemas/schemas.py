"""
Pydantic v2 schemas for request/response validation.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.models import SkillType


# ---------------------------------------------------------------------------
# Skill schemas
# ---------------------------------------------------------------------------


class SkillBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, examples=["Python", "Figma"])

    @field_validator("name")
    @classmethod
    def normalise_name(cls, v: str) -> str:
        """Strip whitespace and title-case for consistent storage."""
        return v.strip().title()


class SkillRead(SkillBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------------------------------------------------------------------------
# UserSkill schemas
# ---------------------------------------------------------------------------


class UserSkillAdd(BaseModel):
    """Payload to attach a skill to the current user."""

    skill_name: str = Field(..., min_length=1, max_length=128)
    skill_type: SkillType

    @field_validator("skill_name")
    @classmethod
    def normalise_skill_name(cls, v: str) -> str:
        return v.strip().title()


class UserSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    skill: SkillRead
    skill_type: SkillType


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------


class UserRegister(BaseModel):
    """Payload sent by the TMA on first launch."""

    telegram_id: int = Field(..., gt=0)
    username: Optional[str] = Field(None, max_length=64)
    first_name: str = Field(..., min_length=1, max_length=128)
    bio: Optional[str] = Field(None, max_length=1024)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    telegram_id: int
    username: Optional[str]
    first_name: str
    bio: Optional[str]
    karma_balance: float
    rating: float
    user_skills: list[UserSkillRead] = []


# ---------------------------------------------------------------------------
# Swipe schemas
# ---------------------------------------------------------------------------


class SwipeCreate(BaseModel):
    """Payload for POST /api/cards/swipe."""

    to_user_id: int = Field(..., gt=0)
    is_like: bool


class SwipeResult(BaseModel):
    """Response from POST /api/cards/swipe."""

    recorded: bool = True
    match: bool
    matched_user_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Card schema (what the frontend renders)
# ---------------------------------------------------------------------------


class CardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: Optional[str]
    first_name: str
    bio: Optional[str]
    rating: float
    karma_balance: float
    offers: list[str] = Field(default_factory=list, description="Skills this user offers")
    seeks: list[str] = Field(default_factory=list, description="Skills this user seeks")
