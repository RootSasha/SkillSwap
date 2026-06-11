"""
SkillSwap — FastAPI application entry point.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.core.database import engine, Base
from app.routers import cards, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup: nothing special — migrations are handled by Alembic.
    On shutdown: dispose the connection pool cleanly.
    """
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=(
        "SkillSwap Core Backend — fast intellectual barter exchange for "
        "developers, designers, and makers."
    ),
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(users.router)
app.include_router(cards.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health", tags=["infra"])
async def health() -> dict:
    return {"status": "ok", "version": settings.APP_VERSION}
