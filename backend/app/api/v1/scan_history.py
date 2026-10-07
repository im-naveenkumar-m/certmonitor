from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.scan_history import ScanHistoryResponse
from app.services.scan_history import (
    get_scan_history_by_domain,
)

router = APIRouter(
    prefix="/scan-history"
)


@router.get(
    "/domain/{domain_id}",
    response_model=list[ScanHistoryResponse],
)
def get_domain_scan_history(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_scan_history_by_domain(
        db,
        domain_id,
    )