from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.scheduler.worker import is_domain_due


def test_new_domain_is_due():
    domain = SimpleNamespace(
        enabled=True,
        scan_interval=60,
    )

    now = datetime.now(timezone.utc)

    assert is_domain_due(
        domain,
        None,
        now,
    ) is True


def test_domain_not_due():
    domain = SimpleNamespace(
        enabled=True,
        scan_interval=60,
    )

    now = datetime.now(timezone.utc)

    last_scan_at = now - timedelta(minutes=30)

    assert is_domain_due(
        domain,
        last_scan_at,
        now,
    ) is False


def test_domain_is_due():
    domain = SimpleNamespace(
        enabled=True,
        scan_interval=60,
    )

    now = datetime.now(timezone.utc)

    last_scan_at = now - timedelta(minutes=61)

    assert is_domain_due(
        domain,
        last_scan_at,
        now,
    ) is True


def test_disabled_domain_is_not_due():
    domain = SimpleNamespace(
        enabled=False,
        scan_interval=60,
    )

    now = datetime.now(timezone.utc)

    assert is_domain_due(
        domain,
        None,
        now,
    ) is False