from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.notification_event import NotificationEvent
from app.telegram.service import (
    send_certificate_changed_alert,
    send_certificate_expiry_alert,
    send_scan_failure_alert,
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
    """
    Send an SSL certificate expiry notification.

    Notifications are sent once per threshold for each certificate.

    Thresholds:
        30 days
        15 days
        7 days
        1 day
        Expired

    The certificate fingerprint is included in the event key so
    a renewed certificate gets a fresh set of expiry notifications.
    """

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

    event_key = (
        f"domain:{domain_id}:expiry:"
        f"{fingerprint_sha256}:{threshold}"
    )

    if _event_exists(db, event_key):
        return False

    send_certificate_expiry_alert(
        domain=domain,
        port=port,
        days_remaining=days_remaining,
        valid_until=valid_until,
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


def clear_scan_failure_notification(
    db: Session,
    domain_id: int,
) -> None:
    """
    Clear the scan-failure notification after a successful scan.

    This allows a future scan failure to generate a new alert.
    """

    db.query(NotificationEvent).filter(
        NotificationEvent.domain_id == domain_id,
        NotificationEvent.event_type == "scan_failure",
    ).delete(synchronize_session=False)

    db.commit()