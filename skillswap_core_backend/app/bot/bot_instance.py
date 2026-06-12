"""
app/bot/bot_instance.py

Єдине місце де створюються об'єкти Bot та Dispatcher.
Імпортуй звідси в будь-яку частину проєкту:

    from app.bot.bot_instance import bot, dp
"""

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from app.core.config import settings

# ── Bot ───────────────────────────────────────────────────────────────────────
# DefaultBotProperties дозволяє встановити parse_mode глобально для всіх
# повідомлень, щоб не передавати його в кожен виклик send_message/answer.
bot = Bot(
    token=settings.BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML),
)

# ── Dispatcher ────────────────────────────────────────────────────────────────
# MemoryStorage — достатньо для Етапу 2 (FSM-стани зберігаються в пам'яті).
# У майбутньому можна замінити на RedisStorage без зміни хендлерів.
dp = Dispatcher(storage=MemoryStorage())
