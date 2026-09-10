from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import TimestampMixin


class ScanHistory(Base, TimestampMixin):
    __tablename__ = "scan_history"

    id: Mapped[int] = mapped_column(primary_key=True)

    domain_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("domains.id"),
        nullable=False,
        index=True,
    )

    certificate_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("certificates.id"),
        nullable=True,
        index=True,
    )

    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    success: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
    )

    days_remaining: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    error_message: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )