from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "CertMonitor"
    APP_VERSION: str = "0.1.0"

    DEBUG: bool = True

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    DATABASE_URL: str

    SECRET_KEY: str

    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    class Config:
        env_file = ".env"


settings = Settings()