from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    get_current_superuser,
    get_current_user,
)
from app.auth.hashing import hash_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserPasswordReset,
    UserResponse,
    UserUpdate,
)

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def read_current_user(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.get("/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    if db.query(User).filter(
        (User.username == payload.username)
        | (User.email == str(payload.email))
    ).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )

    user = User(
        username=payload.username,
        email=str(payload.email),
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_superuser=payload.is_superuser,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )

    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    changes = payload.model_dump(exclude_unset=True)

    if "username" in changes and changes["username"] is None:
        raise HTTPException(status_code=422, detail="Username cannot be null")

    if "email" in changes and changes["email"] is None:
        raise HTTPException(status_code=422, detail="Email cannot be null")

    if "is_active" in changes and changes["is_active"] is None:
        raise HTTPException(status_code=422, detail="is_active cannot be null")

    if "is_superuser" in changes and changes["is_superuser"] is None:
        raise HTTPException(status_code=422, detail="is_superuser cannot be null")

    new_username = changes.get("username")
    new_email = changes.get("email")

    if new_username and db.query(User).filter(
        User.username == new_username, User.id != user_id
    ).first():
        raise HTTPException(status_code=409, detail="Username already exists")

    if new_email and db.query(User).filter(
        User.email == str(new_email), User.id != user_id
    ).first():
        raise HTTPException(status_code=409, detail="Email already exists")

    will_remain_active_superuser = (
        (changes.get("is_active", user.is_active))
        and (changes.get("is_superuser", user.is_superuser))
    )

    if user.is_active and user.is_superuser and not will_remain_active_superuser:
        active_superusers = db.query(User).filter(
            User.is_active.is_(True),
            User.is_superuser.is_(True),
        ).count()

        if active_superusers <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate or demote the last active superuser",
            )

    for field, value in changes.items():
        setattr(user, field, str(value) if field == "email" else value)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )

    return user


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(
    user_id: int,
    payload: UserPasswordReset,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.hashed_password = hash_password(payload.new_password)
    db.commit()