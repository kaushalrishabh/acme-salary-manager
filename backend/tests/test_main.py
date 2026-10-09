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

from app.main import create_app
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
