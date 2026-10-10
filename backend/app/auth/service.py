
from sqlalchemy.orm import Session

from app.auth.hashing import verify_password
from app.models.user import User


def get_user_by_username(
    db: Session,
    username: str,
):
    return (
        db.query(User)
        .filter(User.username == username)
        .first()
    )


def authenticate_user(
    db: Session,
    username: str,
    password: str,
):
    user = get_user_by_username(db, username)

    if user is None or not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user
