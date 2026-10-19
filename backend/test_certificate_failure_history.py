from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.models.scan_history import ScanHistory
from app.services.certificate import scan_domain_certificate


def test_oserror_records_failed_scan_and_reraises():
    db = MagicMock()
    domain = SimpleNamespace(
        id=42,
        domain_name="google.com",
        port=443,
    )
    error = OSError(101, "Network is unreachable")

    with patch(
        "app.services.certificate.get_certificate",
        side_effect=error,
    ) as mock_scan:
        with pytest.raises(OSError, match="Network is unreachable"):
            scan_domain_certificate(db, domain)

    mock_scan.assert_called_once_with("google.com", 443)
    db.rollback.assert_called_once()
    db.commit.assert_called_once()

    # Verify the failed scan was submitted to the database session.
    db.add.assert_called_once()
    history = db.add.call_args.args[0]

    assert isinstance(history, ScanHistory)
    assert history.domain_id == 42
    assert history.success is False
    assert history.certificate_id is None
    assert history.certificate_changed is False
    assert history.days_remaining is None
    assert history.error_message == str(error)
