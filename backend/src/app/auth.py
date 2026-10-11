"""Authentication: the credential check, token issue/verify via
itsdangerous, and the require_auth dependency that protects write routes.

There is one shared HR login (CLAUDE.md), no roles, no refresh, no
logout/revocation: a token is valid until it expires, full stop.
"""

import hmac
import os

from fastapi import Header, HTTPException
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

TOKEN_MAX_AGE_SECONDS = 3600


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"}
    )


def get_auth_secret_key() -> str:
    """AUTH_SECRET_KEY from the environment. No fallback: callers that need
    this to exist at startup (app.main.create_app) call it eagerly so a
    missing key fails fast, not on the first request.
    """
    key = os.environ.get("AUTH_SECRET_KEY")
    if not key:
        raise RuntimeError("AUTH_SECRET_KEY environment variable must be set")
    return key


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_auth_secret_key())


def verify_credentials(username: str, password: str) -> bool:
    """Constant-time check against HR_USERNAME/HR_PASSWORD.

    Both comparisons always run, combined with & (never `and`, which would
    short-circuit and leak which field was wrong through timing). Returns
    False, not an exception, if either env var is unset -- every login
    attempt then fails until both are configured.
    """
    expected_username = os.environ.get("HR_USERNAME")
    expected_password = os.environ.get("HR_PASSWORD")
    if expected_username is None or expected_password is None:
        return False

    # Encode to UTF-8 bytes before compare_digest: given str arguments,
    # compare_digest raises TypeError on non-ASCII content; bytes never do.
    username_ok = hmac.compare_digest(username.encode("utf-8"), expected_username.encode("utf-8"))
    password_ok = hmac.compare_digest(password.encode("utf-8"), expected_password.encode("utf-8"))
    return username_ok & password_ok


def issue_token(username: str) -> str:
    return _serializer().dumps(username)


def require_auth(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency: raises 401 unless Authorization is a valid,
    unexpired 'Bearer <token>'.
    """
    scheme, _, token = (authorization or "").partition(" ")
    if scheme != "Bearer" or not token:
        raise _unauthorized()
    try:
        _serializer().loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        raise _unauthorized() from None
