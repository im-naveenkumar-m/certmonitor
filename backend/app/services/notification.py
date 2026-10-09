from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.certificate import Certificate
from app.models.domain import Domain
from app.models.notification_event import NotificationEvent
from app.telegram.service import (
    send_certificate_changed_alert,
    send_certificate_expiry_alert,
    send_scan_failure_alert,
    send_scan_recovery_alert,
)
def _event_exists(db: Session, event_key: str) -> bool:
    return (
        db.query(NotificationEvent)
        .filter(NotificationEvent.event_key == event_key)
        .first()
        is not None
    )
def _record_event(
    db: Session,
    domain_id: int,
    event_type: str,
    event_key: str,
) -> None:
    event = NotificationEvent(
        domain_id=domain_id,
        event_type=event_type,
        event_key=event_key,
        sent_at=datetime.now(timezone.utc),
    )

    db.add(event)
    db.commit()
def send_expiry_notification(
    db: Session,
    domain_id: int,
    domain: str,
    port: int,
    days_remaining: int,
    valid_until: str,
    fingerprint_sha256: str,
) -> bool:
    """Send one expiry alert per certificate fingerprint and threshold."""

    if days_remaining < 0:
        threshold = "expired"
    elif days_remaining <= 1:
        threshold = "1"
    elif days_remaining <= 7:
        threshold = "7"
    elif days_remaining <= 15:
        threshold = "15"
    elif days_remaining <= 30:
        threshold = "30"
    else:
        return False

    event_key = f"certificate:expiry:{fingerprint_sha256}:{threshold}"

    if _event_exists(db, event_key):
        return False

    # Find enabled domains whose current stored certificate
    # has the same fingerprint.
    matching_domains = (
        db.query(Domain)
        .join(Certificate, Certificate.domain_id == Domain.id)
        .filter(
            Certificate.fingerprint_sha256 == fingerprint_sha256,
            Domain.enabled.is_(True),
        )
        .order_by(Domain.domain_name)
        .all()
    )

    shared_domains = [
        f"{item.domain_name}:{item.port}"
        for item in matching_domains
    ]

    matching_domain_ids = {item.id for item in matching_domains}
    matching_domain_ids.add(domain_id)

    current_domain = f"{domain}:{port}"
    if current_domain not in shared_domains:
        shared_domains.append(current_domain)

    # Compatibility check: the old implementation used
    # domain-specific expiry event keys. If one of those alerts
    # was already sent for this fingerprint and threshold, don't
    # send another alert during the transition.
    legacy_event_exists = any(
        _event_exists(
            db,
            f"domain:{matched_id}:expiry:{fingerprint_sha256}:{threshold}",
        )
        for matched_id in matching_domain_ids
    )

    if legacy_event_exists:
        _record_event(
            db=db,
            domain_id=domain_id,
            event_type="expiry",
            event_key=event_key,
        )
        return False

    send_certificate_expiry_alert(
        domain=domain,
        port=port,
        days_remaining=days_remaining,
        valid_until=valid_until,
        shared_domains=shared_domains,
    )

    _record_event(
        db=db,
        domain_id=domain_id,
        event_type="expiry",
        event_key=event_key,
    )

    return True
def send_certificate_changed_notification(
    db: Session,
    domain_id: int,
    domain: str,
    port: int,
    fingerprint_sha256: str,
) -> bool:
    """
    Send one notification for each new certificate fingerprint.
    """

    event_key = (
        f"domain:{domain_id}:certificate_changed:"
        f"{fingerprint_sha256}"
    )

    if _event_exists(db, event_key):
        return False

    send_certificate_changed_alert(
        domain=domain,
        port=port,
    )

    _record_event(
        db=db,
        domain_id=domain_id,
        event_type="certificate_changed",
        event_key=event_key,
    )

    return True
def send_scan_failure_notification(
    db: Session,
    domain_id: int,
    domain: str,
    port: int,
    error_message: str,
) -> bool:
    """
    Send one notification for a scan failure incident.

    A successful scan clears the incident so that a future
    failure can generate a new notification.
    """

    event_key = f"domain:{domain_id}:scan_failure"

    if _event_exists(db, event_key):
        return False

    send_scan_failure_alert(
        domain=domain,
        port=port,
        error_message=error_message,
    )

    _record_event(
        db=db,
        domain_id=domain_id,
        event_type="scan_failure",
        event_key=event_key,
    )

    return True
def send_scan_recovery_notification(
    db: Session,
    domain_id: int,
    domain: str,
    port: int,
) -> bool:
    """
    Send a recovery notification only when a previous
    scan failure event exists.

    Delete the failure event only after Telegram succeeds.
    """

    event_key = f"domain:{domain_id}:scan_failure"

    failure_event = (
        db.query(NotificationEvent)
        .filter(
            NotificationEvent.domain_id == domain_id,
            NotificationEvent.event_type == "scan_failure",
            NotificationEvent.event_key == event_key,
        )
        .first()
    )

    if failure_event is None:
        return False

    # Send the recovery message before clearing the event.
    # If Telegram fails, the failure event remains for retry.
    send_scan_recovery_alert(
        domain=domain,
        port=port,
    )

    db.delete(failure_event)
    db.commit()

    return True