import socket
import ssl
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.certificate import Certificate
from app.models.domain import Domain
from app.models.scan_history import ScanHistory
from app.scanner.tls import get_certificate

def scan_domain_certificate(
    db: Session,
    domain: Domain,
) -> Certificate:
    scanned_at = datetime.now(timezone.utc)

    try:
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

            certificate_changed = (
                certificate.fingerprint_sha256
                != result["fingerprint_sha256"]
            )
            certificate.serial_number = result["serial_number"]
            certificate.fingerprint_sha256 = result["fingerprint_sha256"]
            certificate.issuer = str(result["issuer"])
            certificate.subject = str(result["subject"])
            certificate.valid_from = result["not_before"]
            certificate.valid_until = result["not_after"]
            certificate.days_remaining = result["days_remaining"]

        else:
            certificate_changed = False

            certificate = Certificate(
                domain_id=domain.id,
                serial_number=result["serial_number"],
                fingerprint_sha256=result["fingerprint_sha256"],
                issuer=str(result["issuer"]),
                subject=str(result["subject"]),
                valid_from=result["not_before"],
                valid_until=result["not_after"],
                days_remaining=result["days_remaining"],
            )

            db.add(certificate)
            db.flush()

        history = ScanHistory(
            domain_id=domain.id,
            certificate_id=certificate.id,
            scanned_at=scanned_at,
            success=True,
            certificate_changed=certificate_changed,
            days_remaining=result["days_remaining"],
            error_message=None,
        )

        db.add(history)

        db.commit()
        db.refresh(certificate)

        return certificate

    except (socket.gaierror, TimeoutError, ConnectionError, ssl.SSLError) as exc:
        db.rollback()

        history = ScanHistory(
            domain_id=domain.id,
            certificate_id=None,
            scanned_at=scanned_at,
            success=False,
            certificate_changed=False,
            days_remaining=None,
            error_message=str(exc),
        )

        db.add(history)
        db.commit()

        raise

def get_certificate_by_domain(
    db: Session,
    domain_id: int,
) -> Certificate | None:
    return (
        db.query(Certificate)
        .filter(Certificate.domain_id == domain_id)
        .first()
    )