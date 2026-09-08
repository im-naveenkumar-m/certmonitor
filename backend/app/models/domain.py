from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import TimestampMixin


class Domain(Base, TimestampMixin):
    __tablename__ = "domains"

    id: Mapped[int] = mapped_column(primary_key=True)

    domain_name: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    port: Mapped[int] = mapped_column(
        Integer,
        default=443,
    )

    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )

    scan_interval: Mapped[int] = mapped_column(
        Integer,
        default=60,
    )