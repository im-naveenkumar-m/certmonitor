from sqlalchemy.orm import Session

from app.models.domain import Domain
from app.models.certificate import Certificate
from app.models.scan_history import ScanHistory


def get_domains(db: Session):
    return db.query(Domain).all()


def get_domain(
    db: Session,
    domain_id: int,
):
    return (
        db.query(Domain)
        .filter(Domain.id == domain_id)
        .first()
    )


def create_domain(
    db: Session,
    data,
):
    domain = Domain(
        **data.model_dump()
    )

    db.add(domain)
    db.commit()
    db.refresh(domain)

    return domain


def update_domain(
    db: Session,
    domain: Domain,
    data,
):
    update_data = data.model_dump(
        exclude_unset=True
    )

    for field, value in update_data.items():
        setattr(domain, field, value)

    db.commit()
    db.refresh(domain)

    return domain


def delete_domain(
    db: Session,
    domain: Domain,
):
    try:
        # Delete scan history first because it references
        # the certificate and domain.
        db.query(ScanHistory).filter(
            ScanHistory.domain_id == domain.id
        ).delete(
            synchronize_session=False
        )

        # Delete the current certificate for this domain.
        db.query(Certificate).filter(
            Certificate.domain_id == domain.id
        ).delete(
            synchronize_session=False
        )

        # Finally delete the domain.
        db.delete(domain)

        db.commit()

    except Exception:
        db.rollback()
        raise