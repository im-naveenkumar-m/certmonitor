from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.certificate import CertificateResponse
from app.services.certificate import get_certificate_by_domain


router = APIRouter(
    prefix="/certificates",
)


@router.get(
    "/domain/{domain_id}",
    response_model=CertificateResponse,
)
def get_domain_certificate(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    certificate = get_certificate_by_domain(
        db,
        domain_id,
    )

    if certificate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found for this domain",
        )

    return certificate