import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.auth.dependencies import get_current_user
from app.auth.hashing import hash_password, verify_password
from app.models.user import User


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
    normal_user = User(
        username="testuser",
        email="testuser@example.com",
        hashed_password=hash_password("UserTestPass123!"),
        is_active=True,
        is_superuser=False,
    )
    db.add_all([admin, normal_user])
    db.commit()
    db.refresh(admin)
    db.refresh(normal_user)

    try:
        yield db, admin, normal_user
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def client(test_db):
    db, admin, normal_user = test_db

    def override_get_db():
        try:
            yield db
        finally:
            pass

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


@pytest.fixture
def user_headers(client):
    response = client.post(
        "/api/v1/login",
        data={
            "username": "testuser",
            "password": "UserTestPass123!",
        },
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_superuser_can_list_users(client, admin_headers):
    response = client.get("/api/v1/users", headers=admin_headers)

    assert response.status_code == 200
    assert {user["username"] for user in response.json()} == {
        "testadmin",
        "testuser",
    }


def test_non_superuser_cannot_list_users(client, user_headers):
    response = client.get("/api/v1/users", headers=user_headers)

    assert response.status_code == 403


def test_unauthenticated_user_cannot_list_users(client):
    response = client.get("/api/v1/users")

    assert response.status_code == 401


def test_create_user(client, admin_headers):
    response = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "username": "newtestuser",
            "email": "newtestuser@example.com",
            "password": "NewTestPass123!",
            "is_superuser": False,
        },
    )

    assert response.status_code == 201
    assert response.json()["username"] == "newtestuser"
    assert response.json()["email"] == "newtestuser@example.com"
    assert response.json()["is_active"] is True
    assert response.json()["is_superuser"] is False
    assert "hashed_password" not in response.json()


@pytest.mark.parametrize(
    "payload",
    [
        {
            "username": "testuser",
            "email": "another@example.com",
            "password": "AnotherTestPass123!",
        },
        {
            "username": "anotheruser",
            "email": "testuser@example.com",
            "password": "AnotherTestPass123!",
        },
    ],
)
def test_create_user_rejects_duplicate_username_or_email(
    client, admin_headers, payload
):
    response = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json=payload,
    )

    assert response.status_code == 409


def test_create_user_rejects_short_password(client, admin_headers):
    response = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "username": "shortpassuser",
            "email": "shortpass@example.com",
            "password": "short",
        },
    )

    assert response.status_code == 422


def test_create_user_rejects_invalid_email(client, admin_headers):
    response = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "username": "invalidemailuser",
            "email": "not-an-email",
            "password": "ValidTestPass123!",
        },
    )

    assert response.status_code == 422


def test_update_user(client, admin_headers, test_db):
    _, _, normal_user = test_db

    response = client.patch(
        f"/api/v1/users/{normal_user.id}",
        headers=admin_headers,
        json={
            "username": "updateduser",
            "email": "updateduser@example.com",
        },
    )

    assert response.status_code == 200
    assert response.json()["username"] == "updateduser"
    assert response.json()["email"] == "updateduser@example.com"


def test_update_rejects_duplicate_username(client, admin_headers, test_db):
    _, admin, normal_user = test_db

    response = client.patch(
        f"/api/v1/users/{normal_user.id}",
        headers=admin_headers,
        json={"username": admin.username},
    )

    assert response.status_code == 409


def test_update_missing_user_returns_404(client, admin_headers):
    response = client.patch(
        "/api/v1/users/99999",
        headers=admin_headers,
        json={"username": "missinguser"},
    )

    assert response.status_code == 404


def test_reset_password(client, admin_headers, test_db):
    db, _, normal_user = test_db
    new_password = "ResetTestPass123!"

    response = client.post(
        f"/api/v1/users/{normal_user.id}/reset-password",
        headers=admin_headers,
        json={"new_password": new_password},
    )

    assert response.status_code == 204
    db.refresh(normal_user)
    assert verify_password(new_password, normal_user.hashed_password)


def test_last_active_superuser_cannot_be_deactivated(
    client, admin_headers, test_db
):
    _, admin, _ = test_db

    response = client.patch(
        f"/api/v1/users/{admin.id}",
        headers=admin_headers,
        json={"is_active": False},
    )

    assert response.status_code == 400
    assert "last active superuser" in response.json()["detail"]


def test_last_active_superuser_cannot_be_demoted(
    client, admin_headers, test_db
):
    _, admin, _ = test_db

    response = client.patch(
        f"/api/v1/users/{admin.id}",
        headers=admin_headers,
        json={"is_superuser": False},
    )

    assert response.status_code == 400


def test_inactive_user_cannot_log_in(client, test_db):
    db, _, normal_user = test_db
    normal_user.is_active = False
    db.commit()

    response = client.post(
        "/api/v1/login",
        data={
            "username": "testuser",
            "password": "UserTestPass123!",
        },
    )

    assert response.status_code == 401