"""Tests for app.auth: credential check, token issue/verify, and the
require_auth dependency. HR_USERNAME/HR_PASSWORD/AUTH_SECRET_KEY are set
for every test by conftest.py's autouse _default_auth_env fixture, unless a
test explicitly unsets one.
"""

import hmac
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app import auth

# --- verify_credentials ---------------------------------------------------------------


def test_verify_credentials_accepts_the_right_username_and_password() -> None:
    assert auth.verify_credentials("hr", "test-only-password") is True


@pytest.mark.parametrize(
    ("username", "password"),
    [
        ("wrong", "test-only-password"),
        ("hr", "wrong"),
        ("wrong", "wrong"),
    ],
)
def test_verify_credentials_rejects_wrong_username_or_password(
    username: str, password: str
) -> None:
    assert auth.verify_credentials(username, password) is False


def test_verify_credentials_spy_calls_compare_digest_twice_unconditionally(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Proves both comparisons run even when the first one already fails --
    # & does not short-circuit the way `and` would.
    spy = MagicMock(wraps=hmac.compare_digest)
    monkeypatch.setattr(auth.hmac, "compare_digest", spy)

    assert auth.verify_credentials("wrong", "test-only-password") is False

    assert spy.call_count == 2


def test_verify_credentials_handles_non_ascii_without_raising() -> None:
    # hmac.compare_digest raises TypeError on non-ASCII str; encoding to
    # UTF-8 bytes first (as verify_credentials does) avoids that entirely.
    assert auth.verify_credentials("héllo", "wörld") is False


def test_verify_credentials_returns_false_when_hr_username_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("HR_USERNAME", raising=False)
    assert auth.verify_credentials("", "") is False
    assert auth.verify_credentials("hr", "test-only-password") is False


def test_verify_credentials_returns_false_when_hr_password_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("HR_PASSWORD", raising=False)
    assert auth.verify_credentials("", "") is False
    assert auth.verify_credentials("hr", "test-only-password") is False


# --- get_auth_secret_key ---------------------------------------------------------------


def test_get_auth_secret_key_returns_the_env_value() -> None:
    assert auth.get_auth_secret_key() == "test-only-secret-key-never-use-in-production"


def test_get_auth_secret_key_raises_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AUTH_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        auth.get_auth_secret_key()


# --- issue_token / require_auth ---------------------------------------------------------


def test_issued_token_is_accepted_by_require_auth() -> None:
    token = auth.issue_token("hr")

    auth.require_auth(authorization=f"Bearer {token}")  # must not raise


def test_require_auth_rejects_a_tampered_token() -> None:
    token = auth.issue_token("hr")
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")

    with pytest.raises(HTTPException) as exc_info:
        auth.require_auth(authorization=f"Bearer {tampered}")

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers is not None
    assert exc_info.value.headers["WWW-Authenticate"] == "Bearer"


def test_require_auth_rejects_an_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    token = auth.issue_token("hr")
    # -1, not 0: itsdangerous's expiry check is age > max_age, and
    # sub-second timing means an elapsed age of 0 would not exceed max_age=0.
    monkeypatch.setattr(auth, "TOKEN_MAX_AGE_SECONDS", -1)

    with pytest.raises(HTTPException) as exc_info:
        auth.require_auth(authorization=f"Bearer {token}")

    assert exc_info.value.status_code == 401


@pytest.mark.parametrize(
    "header",
    [None, "", "Bearer", "Basic abc", "Bearer "],
)
def test_require_auth_rejects_a_missing_or_malformed_header(header: str | None) -> None:
    with pytest.raises(HTTPException) as exc_info:
        auth.require_auth(authorization=header)

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers is not None
    assert exc_info.value.headers["WWW-Authenticate"] == "Bearer"
