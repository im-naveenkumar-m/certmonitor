from sqlalchemy.orm import Session

from app.models.domain import Domain


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
    db.delete(domain)
    db.commit()