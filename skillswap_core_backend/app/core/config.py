"""
Central configuration — reads from environment variables / .env file.
Етап 2.1: додано BOT_TOKEN та WEBAPP_URL.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://admin:admin@localhost:5432/skillswap"
    DB_ECHO: bool = False

    # ── FastAPI ───────────────────────────────────────────────────────────
    APP_TITLE: str = "SkillSwap API"
    APP_VERSION: str = "0.1.0"

    # ── Telegram Bot ──────────────────────────────────────────────────────
    BOT_TOKEN: str  # обов'язкове поле — без нього додаток не стартує

    # URL Telegram Web App, який відкривається кнопкою в боті
    WEBAPP_URL: str = "https://google.com"

    # ── Валідатор токена ──────────────────────────────────────────────────
    @field_validator("BOT_TOKEN")
    @classmethod
    def validate_bot_token(cls, v: str) -> str:
        v = v.strip()
        # Формат токена: <digits>:<alphanumeric+dash+underscore>
        parts = v.split(":")
        if len(parts) != 2 or not parts[0].isdigit() or len(parts[1]) < 10:
            raise ValueError(
                "BOT_TOKEN має невірний формат. "
                "Очікується: '<bot_id>:<secret>' (отримай у @BotFather)"
            )
        return v


settings = Settings()
