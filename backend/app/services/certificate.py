from sqlalchemy.orm import Session

from app.models.certificate import Certificate
from app.models.domain import Domain
from app.scanner.tls import get_certificate


def scan_domain_certificate(
    db: Session,
    domain: Domain,
) -> Certificate:
    result = get_certificate(
        domain.domain_name,
        domain.port,
    )

    certificate = (
        db.query(Certificate)
        .filter(Certificate.domain_id == domain.id)
        .first()
    )

    if certificate:
        certificate.serial_number = result["serial_number"]
        certificate.issuer = str(result["issuer"])
        certificate.subject = str(result["subject"])
        certificate.valid_from = result["not_before"]
        certificate.valid_until = result["not_after"]
        certificate.days_remaining = result["days_remaining"]
    else:
        certificate = Certificate(
            domain_id=domain.id,
            serial_number=result["serial_number"],
            issuer=str(result["issuer"]),
            subject=str(result["subject"]),
            valid_from=result["not_before"],
            valid_until=result["not_after"],
            days_remaining=result["days_remaining"],
        )

        db.add(certificate)

    db.commit()
    db.refresh(certificate)

    return certificate