"""Integration tests for app.main's lifespan: it always ensures
currency_rates, and seeds employees only when SEED_ON_EMPTY is truthy and
the employees table is empty.

These use a real SQLite file under pytest's tmp_path, never the default
database file and never :memory: -- an in-memory SQLite database is private
to the connection that created it, so a later connection opened to inspect
what the lifespan wrote would see an empty database of its own, not the
lifespan's.
"""

import logging
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session

from app.main import create_app, get_cors_allowed_origins
from app.models import CurrencyRate, Employee
from app.reference_data import CURRENCIES


def _employee_count(engine: Engine) -> int:
    with Session(engine) as session:
        return session.execute(select(func.count()).select_from(Employee)).scalar_one()


def _currency_rate_codes(engine: Engine) -> set[str]:
    with Session(engine) as session:
        return set(session.scalars(select(CurrencyRate.currency_code)))


def test_lifespan_does_not_seed_when_seed_on_empty_is_off(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.delenv("SEED_ON_EMPTY", raising=False)
    caplog.set_level(logging.INFO)
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")

    with TestClient(app):
        pass

    assert _employee_count(app.state.engine) == 0
    # currency_rates is filled unconditionally, regardless of the flag.
    assert _currency_rate_codes(app.state.engine) == set(CURRENCIES)
    assert not any("Seeded" in record.getMessage() for record in caplog.records)


def test_lifespan_seeds_when_seed_on_empty_is_on(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SEED_ON_EMPTY", "true")
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}", seed_count=20)

    with TestClient(app):
        pass

    assert _employee_count(app.state.engine) == 20


def test_lifespan_logs_rows_seeded_and_elapsed_time(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("SEED_ON_EMPTY", "true")
    caplog.set_level(logging.INFO)
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}", seed_count=20)

    with TestClient(app):
        pass

    messages = [record.getMessage() for record in caplog.records]
    assert any(re.search(r"Seeded 20 employees in \d+\.\d+s", message) for message in messages)


# --- AUTH_SECRET_KEY fail-fast -------------------------------------------------------


def test_create_app_fails_fast_when_auth_secret_key_is_unset(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("AUTH_SECRET_KEY", raising=False)

    with pytest.raises(RuntimeError):
        create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")


# --- CORS -----------------------------------------------------------------------------


def test_cors_allows_an_origin_listed_in_cors_allowed_origins(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com,https://other.example")
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")

    with TestClient(app) as client:
        response = client.get("/health", headers={"Origin": "https://example.com"})

    assert response.headers.get("access-control-allow-origin") == "https://example.com"


def test_cors_rejects_an_origin_not_in_the_list(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")

    with TestClient(app) as client:
        response = client.get("/health", headers={"Origin": "https://not-allowed.example"})

    assert "access-control-allow-origin" not in response.headers


def test_cors_allows_nothing_when_the_env_var_is_unset(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")

    with TestClient(app) as client:
        response = client.get("/health", headers={"Origin": "https://example.com"})

    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("value", ["", "   "])
def test_get_cors_allowed_origins_is_empty_when_set_but_blank(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    # A literal `CORS_ALLOWED_ORIGINS=` left in a copied .env.example must
    # behave like unset (no origins allowed), not like an empty-string
    # origin ending up in the list.
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", value)
    assert get_cors_allowed_origins() == []


# --- CORS: preflight (OPTIONS) for the write methods -----------------------------------


@pytest.mark.parametrize("method", ["PUT", "POST", "DELETE"])
def test_cors_preflight_allows_the_write_method_and_auth_header_from_an_allowed_origin(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, method: str
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")

    with TestClient(app) as client:
        response = client.options(
            "/employees/1",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://example.com"
    allowed_methods = response.headers.get("access-control-allow-methods", "")
    assert method in allowed_methods
    allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed_headers


def test_cors_preflight_rejects_a_disallowed_origin(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")

    with TestClient(app) as client:
        response = client.options(
            "/employees/1",
            headers={
                "Origin": "https://not-allowed.example",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert "access-control-allow-origin" not in response.headers
