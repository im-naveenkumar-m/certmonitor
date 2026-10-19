
import pytest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.auth.hashing import hash_password
from app.models.user import User
from app.models.domain import Domain


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    admin = User(
        username="testadmin",
        email="testadmin@example.com",
        hashed_password=hash_password("AdminTestPass123!"),
        is_active=True,
        is_superuser=True,
    )
    db.add(admin)
    db.commit()

    try:
        yield db, admin
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def client(test_db):
    db, _ = test_db

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def admin_headers(client):
    response = client.post(
        "/api/v1/login",
        data={
            "username": "testadmin",
            "password": "AdminTestPass123!",
        },
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_manual_scan_success_sends_telegram_alert(
    client, test_db, admin_headers
):
    db, _ = test_db

    domain = Domain(
        domain_name="example.com",
        port=443,
        enabled=True,
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)

    certificate = {
        "id": 1,
        "domain_id": domain.id,
        "serial_number": "TEST123",
        "fingerprint_sha256": "a" * 64,
        "issuer": "Test Issuer",
        "subject": "example.com",
        "valid_from": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "valid_until": datetime(2027, 1, 1, tzinfo=timezone.utc),
        "days_remaining": 74,
    }

    with (
        patch(
            "app.api.v1.domains.scan_domain_certificate",
            return_value=certificate,
        ) as mock_scan,
        patch(
            "app.api.v1.domains.send_manual_scan_completed_alert"
        ) as mock_alert,
    ):
        response = client.post(
            f"/api/v1/domains/{domain.id}/scan",
            headers=admin_headers,
        )

    assert response.status_code == 200, response.text
    assert response.json()["domain_id"] == domain.id
    assert response.json()["serial_number"] == "TEST123"
    mock_scan.assert_called_once()
    mock_alert.assert_called_once_with("example.com", 443)


def test_manual_scan_succeeds_when_telegram_alert_fails(
    client, test_db, admin_headers
):
    db, _ = test_db

    domain = Domain(
        domain_name="example.org",
        port=443,
        enabled=True,
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)

    certificate = {
        "id": 1,
        "domain_id": domain.id,
        "serial_number": "TEST456",
        "fingerprint_sha256": "b" * 64,
        "issuer": "Test Issuer",
        "subject": "example.org",
        "valid_from": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "valid_until": datetime(2027, 1, 1, tzinfo=timezone.utc),
        "days_remaining": 74,
    }

    with (
        patch(
            "app.api.v1.domains.scan_domain_certificate",
            return_value=certificate,
        ),
        patch(
            "app.api.v1.domains.send_manual_scan_completed_alert",
            side_effect=RuntimeError("Telegram unavailable"),
        ) as mock_alert,
    ):
        response = client.post(
            f"/api/v1/domains/{domain.id}/scan",
            headers=admin_headers,
        )

    assert response.status_code == 200, response.text
    assert response.json()["serial_number"] == "TEST456"
    mock_alert.assert_called_once_with("example.org", 443)


def test_manual_scan_failure_sends_telegram_alert(
    client, test_db, admin_headers
):
    db, _ = test_db

    domain = Domain(
        domain_name="failure.example",
        port=443,
        enabled=True,
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)

    with (
        patch(
            "app.api.v1.domains.scan_domain_certificate",
            side_effect=RuntimeError("Test certificate scan failure"),
        ) as mock_scan,
        patch(
            "app.api.v1.domains.send_scan_failure_alert"
        ) as mock_alert,
    ):
        response = client.post(
            f"/api/v1/domains/{domain.id}/scan",
            headers=admin_headers,
        )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Certificate scan failed: Test certificate scan failure"
    )
    mock_scan.assert_called_once()
    mock_alert.assert_called_once_with(
        "failure.example",
        443,
        "Test certificate scan failure",
    )


def test_manual_scan_failure_preserved_when_telegram_fails(
    client, test_db, admin_headers
):
    db, _ = test_db

    domain = Domain(
        domain_name="telegram-failure.example",
        port=443,
        enabled=True,
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)

    with (
        patch(
            "app.api.v1.domains.scan_domain_certificate",
            side_effect=RuntimeError("Certificate scan failed"),
        ) as mock_scan,
        patch(
            "app.api.v1.domains.send_scan_failure_alert",
            side_effect=RuntimeError("Telegram unavailable"),
        ) as mock_alert,
    ):
        response = client.post(
            f"/api/v1/domains/{domain.id}/scan",
            headers=admin_headers,
        )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Certificate scan failed: Certificate scan failed"
    )
    mock_scan.assert_called_once()
    mock_alert.assert_called_once_with(
        "telegram-failure.example",
        443,
        "Certificate scan failed",
    )
