from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ScanHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain_id: int
    certificate_id: int | None
    scanned_at: datetime
    success: bool
    certificate_changed: bool
    days_remaining: int | None
    error_message: str | None