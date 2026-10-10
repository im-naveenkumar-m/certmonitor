
from pydantic import BaseModel, ConfigDict, Field, field_validator


def validate_email_format(value: str) -> str:
    value = value.strip()

    if (
        len(value) > 255
        or value.count("@") != 1
        or not value.split("@")[0]
        or "." not in value.split("@")[1]
        or value.split("@")[1].startswith(".")
        or value.split("@")[1].endswith(".")
        or " " in value
    ):
        raise ValueError("Enter a valid email address")

    return value


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    is_superuser: bool

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=12, max_length=128)
    is_superuser: bool = False

    _validate_email = field_validator("email")(
        validate_email_format
    )


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=100)
    email: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None

    _validate_email = field_validator("email")(
        validate_email_format
    )


class UserPasswordReset(BaseModel):
    new_password: str = Field(min_length=12, max_length=128)
