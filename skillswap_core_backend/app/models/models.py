"""
ORM models for SkillSwap.

Relationships
─────────────
User ──< user_skills >── Skill   (many-to-many, with skill_type attribute)
User ──< swipes                  (self-referential, unique constraint)
"""

import enum
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SkillType(str, enum.Enum):
    offer = "offer"  # юзер пропонує цю навичку
    seek = "seek"    # юзер шукає цю навичку


# ---------------------------------------------------------------------------
# Association table: user_skills  (Many-to-Many with extra column)
# ---------------------------------------------------------------------------


class UserSkill(Base):
    """
    Association object between User and Skill.
    Stores the *type* of relationship (offer / seek).
    """

    __tablename__ = "user_skills"
    __table_args__ = (
        UniqueConstraint("user_id", "skill_id", "skill_type", name="uq_user_skill_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_type: Mapped[SkillType] = mapped_column(
        Enum(SkillType, name="skill_type_enum"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Back-references
    user: Mapped["User"] = relationship(back_populates="user_skills")
    skill: Mapped["Skill"] = relationship(back_populates="user_skills")


# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False, index=True
    )
    username: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Karma accumulates when the user helps others (future feature)
    karma_balance: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Average rating from completed deals (1-5 scale)
    rating: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user_skills: Mapped[List["UserSkill"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    swipes_sent: Mapped[List["Swipe"]] = relationship(
        foreign_keys="Swipe.from_user_id",
        back_populates="from_user",
        cascade="all, delete-orphan",
    )
    swipes_received: Mapped[List["Swipe"]] = relationship(
        foreign_keys="Swipe.to_user_id",
        back_populates="to_user",
        cascade="all, delete-orphan",
    )


# ---------------------------------------------------------------------------
# Skill model
# ---------------------------------------------------------------------------


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)

    user_skills: Mapped[List["UserSkill"]] = relationship(back_populates="skill")


# ---------------------------------------------------------------------------
# Swipe model
# ---------------------------------------------------------------------------


class Swipe(Base):
    """
    Records every swipe action.
    One row per (from_user_id, to_user_id) pair — enforced by unique constraint.
    """

    __tablename__ = "swipes"
    __table_args__ = (
        UniqueConstraint("from_user_id", "to_user_id", name="uq_swipe_pair"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_like: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    from_user: Mapped["User"] = relationship(
        foreign_keys=[from_user_id], back_populates="swipes_sent"
    )
    to_user: Mapped["User"] = relationship(
        foreign_keys=[to_user_id], back_populates="swipes_received"
    )
