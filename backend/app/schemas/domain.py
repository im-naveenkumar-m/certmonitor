from pydantic import BaseModel, ConfigDict


class DomainCreate(BaseModel):
    domain_name: str
    port: int = 443
    enabled: bool = True
    scan_interval: int = 60


class DomainUpdate(BaseModel):
    domain_name: str | None = None
    port: int | None = None
    enabled: bool | None = None
    scan_interval: int | None = None


class DomainResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain_name: str
    port: int
    enabled: bool
    scan_interval: int