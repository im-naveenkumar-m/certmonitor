import httpx

from app.core.config import settings


class TelegramError(Exception):
    pass


def send_message(
    message: str,
) -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        raise TelegramError(
            "Telegram bot token is not configured"
        )

    if not settings.TELEGRAM_CHAT_ID:
        raise TelegramError(
            "Telegram chat ID is not configured"
        )

    url = (
        f"https://api.telegram.org/"
        f"bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    )

    payload = {
        "chat_id": settings.TELEGRAM_CHAT_ID,
        "text": message,
    }

    try:
        response = httpx.post(
            url,
            json=payload,
            timeout=10.0,
        )

        response.raise_for_status()

        data = response.json()

        if not data.get("ok"):
            raise TelegramError(
                "Telegram API rejected the message"
            )

    except httpx.HTTPError as exc:
        raise TelegramError(
            "Unable to connect to Telegram"
        ) from exc