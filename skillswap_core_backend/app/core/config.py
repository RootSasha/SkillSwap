"""
Central configuration — reads from environment variables / .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # PostgreSQL DSN — asyncpg driver is required
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/skillswap"

    # Set True to see generated SQL in logs (dev only)
    DB_ECHO: bool = False

    APP_TITLE: str = "SkillSwap API"
    APP_VERSION: str = "0.1.0"


settings = Settings()
