from getpass import getpass
from pydantic import EmailStr, TypeAdapter, ValidationError
from app.auth.hashing import hash_password
from app.db.session import SessionLocal
from app.models.user import User


def create_admin() -> None:
    username = input("Initial admin username: ").strip()
    email_input = input("Initial admin email: ").strip()

    if not 3 <= len(username) <= 100:
        raise SystemExit("Username must be between 3 and 100 characters.")

    try:
        email = TypeAdapter(EmailStr).validate_python(email_input)
    except ValidationError:
        raise SystemExit("Enter a valid email address.")

    password = getpass("Initial admin password: ")
    confirm_password = getpass("Confirm admin password: ")

    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters.")

    if len(password.encode("utf-8")) > 72:
        raise SystemExit("Password must not exceed 72 bytes.")

    if password != confirm_password:
        raise SystemExit("Passwords do not match.")

    db = SessionLocal()

    try:
        if db.query(User).first() is not None:
            raise SystemExit(
                "An account already exists. "
                "Initial admin creation is disabled."
            )

        admin = User(
            username=username,
            email=email,
            hashed_password=hash_password(password),
            is_superuser=True,
            is_active=True,
        )

        db.add(admin)
        db.commit()

        print(f"Initial administrator '{username}' created successfully.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
