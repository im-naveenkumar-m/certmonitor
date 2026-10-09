
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import notification


def make_domain(domain_id, domain_name, port=443):
    return SimpleNamespace(
        id=domain_id,
        domain_name=domain_name,
        port=port,
        enabled=True,
    )


def configure_db(matching_domains):
    db = MagicMock()

    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.all.return_value = matching_domains

    db.query.return_value = query
    return db


@patch("app.services.notification.send_certificate_expiry_alert")
@patch("app.services.notification._record_event")
@patch("app.services.notification._event_exists", return_value=False)
def test_shared_certificate_sends_one_alert(
    event_exists,
    record_event,
    send_alert,
):
    db = configure_db([
        make_domain(1, "google.com"),
        make_domain(5, "youtube.com"),
    ])

    sent = notification.send_expiry_notification(
        db=db,
        domain_id=1,
        domain="google.com",
        port=443,
        days_remaining=7,
        valid_until="2026-12-11T20:00:18+00:00",
        fingerprint_sha256="A" * 64,
    )

    assert sent is True
    send_alert.assert_called_once()

    assert set(
        send_alert.call_args.kwargs["shared_domains"]
    ) == {
        "google.com:443",
        "youtube.com:443",
    }

    record_event.assert_called_once()
    assert record_event.call_args.kwargs["event_key"] == (
        f"certificate:expiry:{'A' * 64}:7"
    )


@patch("app.services.notification.send_certificate_expiry_alert")
@patch("app.services.notification._record_event")
@patch("app.services.notification._event_exists", return_value=True)
def test_existing_shared_event_prevents_duplicate(
    event_exists,
    record_event,
    send_alert,
):
    db = configure_db([
        make_domain(1, "google.com"),
        make_domain(5, "youtube.com"),
    ])

    sent = notification.send_expiry_notification(
        db=db,
        domain_id=1,
        domain="google.com",
        port=443,
        days_remaining=7,
        valid_until="2026-12-11T20:00:18+00:00",
        fingerprint_sha256="A" * 64,
    )

    assert sent is False
    send_alert.assert_not_called()
    record_event.assert_not_called()


@patch("app.services.notification.send_certificate_expiry_alert")
@patch("app.services.notification._record_event")
@patch("app.services.notification._event_exists")
def test_legacy_event_prevents_duplicate(
    event_exists,
    record_event,
    send_alert,
):
    # First call checks the shared key; second checks the legacy
    # key for domain 1.
    event_exists.side_effect = [False, True]

    db = configure_db([
        make_domain(1, "google.com"),
        make_domain(5, "youtube.com"),
    ])

    sent = notification.send_expiry_notification(
        db=db,
        domain_id=1,
        domain="google.com",
        port=443,
        days_remaining=7,
        valid_until="2026-12-11T20:00:18+00:00",
        fingerprint_sha256="A" * 64,
    )

    assert sent is False
    send_alert.assert_not_called()
    record_event.assert_called_once()


@patch("app.services.notification.send_certificate_expiry_alert")
def test_no_expiry_alert_above_30_days(send_alert):
    db = MagicMock()

    sent = notification.send_expiry_notification(
        db=db,
        domain_id=1,
        domain="google.com",
        port=443,
        days_remaining=63,
        valid_until="2026-12-11T20:00:18+00:00",
        fingerprint_sha256="A" * 64,
    )

    assert sent is False
    send_alert.assert_not_called()
    db.query.assert_not_called()
