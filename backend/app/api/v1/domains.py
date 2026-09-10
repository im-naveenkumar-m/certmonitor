from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.domain import Domain
from app.models.user import User
from app.schemas.domain import (
    DomainCreate,
    DomainResponse,
    DomainUpdate,
)
from app.services.domain import (
    create_domain,
    delete_domain,
    get_domain,
    get_domains,
    update_domain,
)
from fastapi import HTTPException
from app.services.certificate import scan_domain_certificate
from app.schemas.certificate import CertificateResponse

router = APIRouter(
    prefix="/domains",
)


@router.post(
    "",
    response_model=DomainResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    data: DomainCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(Domain)
        .filter(
            Domain.domain_name == data.domain_name
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Domain already exists",
        )

    return create_domain(db, data)


@router.get(
    "",
    response_model=list[DomainResponse],
)
def list_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_domains(db)


@router.get(
    "/{domain_id}",
    response_model=DomainResponse,
)
def get_one(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    domain = get_domain(db, domain_id)

    if domain is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )

    return domain


@router.put(
    "/{domain_id}",
    response_model=DomainResponse,
)
def update(
    domain_id: int,
    data: DomainUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    domain = get_domain(db, domain_id)

    if domain is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )

    if data.domain_name is not None:
        existing = (
            db.query(Domain)
            .filter(
                Domain.domain_name == data.domain_name,
                Domain.id != domain_id,
            )
            .first()
        )

        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Domain already exists",
            )

    return update_domain(
        db,
        domain,
        data,
    )


@router.delete(
    "/{domain_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    domain = get_domain(db, domain_id)

    if domain is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )

    delete_domain(db, domain)

    return None

@router.post(
    "/{domain_id}/scan",
    response_model=CertificateResponse,
)
def scan_domain(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    domain = get_domain(db, domain_id)

    if domain is None:
        raise HTTPException(
            status_code=404,
            detail="Domain not found",
        )

    if not domain.enabled:
        raise HTTPException(
            status_code=400,
            detail="Domain is disabled",
        )

    try:
        certificate = scan_domain_certificate(db, domain)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Certificate scan failed: {str(exc)}",
        )

    return certificate