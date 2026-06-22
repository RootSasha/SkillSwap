"""
app/core/telegram_auth.py

Production-автентифікація Telegram Mini App.

Проблема, яку це вирішує
────────────────────────
Раніше current_user_id передавався як звичайний query-параметр
(?current_user_id=1), яким клієнт керував сам — досить відкрити DevTools
і підставити чужий id, щоб отримати доступ до чужих матчів/даних.
Жодного підпису, жодної перевірки — фронтенд просто "довіряв" собі.

Рішення (офіційна схема Telegram для Mini Apps)
────────────────────────────────────────────────
Telegram WebApp передає рядок `initData` — набір полів (user, auth_date,
query_id, ...), підписаний HMAC-SHA256 ключем, похідним від BOT_TOKEN.
Тільки той, хто знає BOT_TOKEN (тобто наш backend), може перевірити підпис.
Підмінити user.id у такому рядку неможливо без знання токена бота —
підпис миттєво розійдеться.

Алгоритм перевірки (офіційний, з документації Telegram):
  1. Розпарсити initData як querystring у пари key=value.
  2. Витягнути hash, прибрати його з набору полів.
  3. Інші поля посортувати за ключем і зібрати рядок
     "key1=value1\nkey2=value2\n..." (data_check_string).
  4. secret_key = HMAC_SHA256(key=b"WebAppData", msg=BOT_TOKEN)
  5. calculated_hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
  6. Порівняти calculated_hash з hash (constant-time, hmac.compare_digest).
  7. Додатково перевірити auth_date — initData має жити обмежений час
     (захист від replay-атак зі старим, колись підслуханим initData).

Як фронтенд має передавати initData
────────────────────────────────────
В заголовку запиту:  X-Telegram-Init-Data: <window.Telegram.WebApp.initData>
Не в query-параметрі — initData може бути довгим і містити символи,
які гірше живуть в URL, а заголовок це штатне місце для авторизаційних даних.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from urllib.parse import parse_qsl

from fastapi import Header, HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# Скільки секунд initData вважається дійсним після auth_date.
# Telegram оновлює auth_date щоразу, коли Mini App відкривається заново,
# тож на практиці initData "свіжий" з кожним відкриттям. Один день —
# розумний запас для тих, хто тримає Mini App відкритим довго не закриваючи.
INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60


class InitDataValidationError(Exception):
    """Внутрішній виняток — підпис невалідний або дані застарілі/пошкоджені."""


def _build_secret_key(bot_token: str) -> bytes:
    """
    secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    Саме такий derived-ключ Telegram використовує для підпису initData
    (відрізняється від ключа, яким підписані звичні webhook-запити).
    """
    return hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()


def validate_init_data(init_data: str, bot_token: str) -> dict[str, str]:
    """
    Перевіряє підпис initData і повертає розпарсені поля у вигляді dict.

    Кидає InitDataValidationError, якщо:
      • рядок порожній / не парситься;
      • відсутнє поле hash;
      • підпис не співпадає (initData підроблений або BOT_TOKEN інший);
      • auth_date застарів (replay-атака старим initData).
    """
    if not init_data:
        raise InitDataValidationError("initData відсутній")

    # parse_qsl зберігає дублікати ключів і не декодує '+' як пробіл там,
    # де це небажано для нашого випадку — Telegram сам екранує значення
    # стандартним urlencode, тож звичайний parse_qsl коректно це розбере.
    pairs = parse_qsl(init_data, keep_blank_values=True)
    data: dict[str, str] = dict(pairs)

    received_hash = data.pop("hash", None)
    if not received_hash:
        raise InitDataValidationError("Поле hash відсутнє в initData")

    # data_check_string: усі пари "key=value", відсортовані за key,
    # з'єднані символом \n. Саме так вимагає документація Telegram.
    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(data.items())
    )

    secret_key = _build_secret_key(bot_token)
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    # compare_digest — порівняння за постійний час, захищає від timing-атак
    # (зловмисник не може поступово підбирати хеш, вимірюючи мікросекунди
    # відповіді).
    if not hmac.compare_digest(calculated_hash, received_hash):
        raise InitDataValidationError("Підпис initData не співпадає")

    # ── Захист від replay: перевіряємо вік auth_date ────────────────────────
    auth_date_raw = data.get("auth_date")
    if auth_date_raw is None:
        raise InitDataValidationError("Поле auth_date відсутнє в initData")

    try:
        auth_date = int(auth_date_raw)
    except ValueError as exc:
        raise InitDataValidationError("auth_date не є числом") from exc

    age_seconds = time.time() - auth_date
    if age_seconds > INIT_DATA_MAX_AGE_SECONDS:
        raise InitDataValidationError(
            f"initData застарів: {age_seconds:.0f}с > "
            f"{INIT_DATA_MAX_AGE_SECONDS}с"
        )

    return data


def extract_telegram_id(validated_data: dict[str, str]) -> int:
    """
    Витягує telegram_id з уже ПЕРЕВІРЕНОГО (validate_init_data) набору полів.

    Поле "user" в initData — це JSON-рядок виду:
      {"id":123456789,"first_name":"Sasha","username":"sasha_dev",...}
    """
    import json

    user_raw = validated_data.get("user")
    if not user_raw:
        raise InitDataValidationError("Поле user відсутнє в initData")

    try:
        user_obj = json.loads(user_raw)
        telegram_id = int(user_obj["id"])
    except (ValueError, KeyError, TypeError) as exc:
        raise InitDataValidationError(
            "Не вдалося розпарсити user.id з initData"
        ) from exc

    return telegram_id


# ===========================================================================
# FastAPI-залежність
# ===========================================================================


async def get_verified_telegram_id(
    x_telegram_init_data: str | None = Header(
        default=None,
        alias="X-Telegram-Init-Data",
        description=(
            "Сирий рядок window.Telegram.WebApp.initData, "
            "без жодної модифікації з боку фронтенду."
        ),
    ),
) -> int:
    """
    Залежність для Depends(...) — перевіряє initData і повертає telegram_id.

    Використання в ендпоінті:
        @router.get("/me")
        async def get_me(
            telegram_id: int = Depends(get_verified_telegram_id),
            db: AsyncSession = Depends(get_db),
        ):
            ...

    Якщо initData відсутній або невалідний — кидає 401, і запит до бекенду
    далі не йде (FastAPI обробляє Depends ще до тіла ендпоінту).

    Dev-режим: якщо settings.DEV_MODE_BYPASS_AUTH=True (тільки локальний
    .env, ніколи на проді) і заголовок взагалі відсутній — повертає
    DEV_TELEGRAM_ID без жодної перевірки. Якщо заголовок присутній —
    він однаково проходить повну HMAC-перевірку нижче (зручно для
    тестування самого initData локально, наприклад через ngrok).
    """
    if not x_telegram_init_data:
        if settings.DEV_MODE_BYPASS_AUTH:
            logger.warning(
                "DEV_MODE_BYPASS_AUTH активний — пропускаю перевірку initData, "
                "повертаю DEV_TELEGRAM_ID=%s. НЕ повинно бути true на проді!",
                settings.DEV_TELEGRAM_ID,
            )
            return settings.DEV_TELEGRAM_ID

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Відсутній заголовок X-Telegram-Init-Data. "
                "Запит має надсилатись з Telegram Mini App."
            ),
        )

    try:
        validated = validate_init_data(x_telegram_init_data, settings.BOT_TOKEN)
        telegram_id = extract_telegram_id(validated)
    except InitDataValidationError as exc:
        logger.warning("Відхилено невалідний initData: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалідні дані автентифікації Telegram.",
        ) from exc

    return telegram_id
