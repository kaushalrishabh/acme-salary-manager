"""Integration tests for POST /auth/login."""

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")
    with TestClient(app) as test_client:
        yield test_client


def test_login_happy_path(client: TestClient) -> None:
    response = client.post("/auth/login", json={"username": "hr", "password": "test-only-password"})

    assert response.status_code == 200
    body = response.json()
    assert "token" in body
    assert body["expires_in"] == 3600


def test_login_rejects_an_unknown_field(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"username": "hr", "password": "test-only-password", "extra": "nope"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("username", "password"),
    [
        ("wrong", "test-only-password"),
        ("hr", "wrong"),
        ("wrong", "wrong"),
    ],
)
def test_login_wrong_credentials_all_give_the_same_response(
    client: TestClient, username: str, password: str
) -> None:
    response = client.post("/auth/login", json={"username": username, "password": password})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_login_wrong_username_and_wrong_password_responses_are_identical(
    client: TestClient,
) -> None:
    wrong_username = client.post(
        "/auth/login", json={"username": "wrong", "password": "test-only-password"}
    )
    wrong_password = client.post("/auth/login", json={"username": "hr", "password": "wrong"})

    assert wrong_username.status_code == wrong_password.status_code
    assert wrong_username.json() == wrong_password.json()


def test_login_non_ascii_credentials_return_401_not_500(client: TestClient) -> None:
    response = client.post("/auth/login", json={"username": "héllo", "password": "wörld"})

    assert response.status_code == 401


def test_login_returns_401_when_hr_username_is_unset(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("HR_USERNAME", raising=False)

    response = client.post("/auth/login", json={"username": "", "password": ""})

    assert response.status_code == 401


def test_login_returns_401_when_hr_password_is_unset(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("HR_PASSWORD", raising=False)

    response = client.post("/auth/login", json={"username": "", "password": ""})

    assert response.status_code == 401
