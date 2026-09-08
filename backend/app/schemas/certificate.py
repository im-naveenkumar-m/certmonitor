from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CertificateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain_id: int
    serial_number: str
    issuer: str
    subject: str
    valid_from: datetime
    valid_until: datetime
    days_remaining: int