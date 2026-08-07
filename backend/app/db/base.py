from app.models.base import Base

# Import all models so Alembic can discover them
from app.models.user import User

__all__ = [
    "Base",
    "User",
]