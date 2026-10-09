"""Tests for app.seeding: filling currency_rates, bulk-inserting employees,
and the SEED_ON_EMPTY environment flag.
"""

from collections.abc import Generator

import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import create_app_engine
from app.models import Base, CurrencyRate, Employee
from app.reference_data import CURRENCIES
from app.seed import generate_employees
from app.seeding import (
    bulk_insert_employees,
    employees_table_is_empty,
    ensure_currency_rates,
    seed_employees_if_empty,
    seed_on_empty_enabled,
)


@pytest.fixture
def engine() -> Generator[Engine, None, None]:
    test_engine = create_app_engine("sqlite:///:memory:")
    Base.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Generator[Session, None, None]:
    with Session(engine) as test_session:
        yield test_session


def _employee_count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(Employee)).scalar_one()


def _currency_rate_count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(CurrencyRate)).scalar_one()


# --- ensure_currency_rates ----------------------------------------------------


def test_ensure_currency_rates_inserts_every_currency_from_reference_data(
    session: Session,
) -> None:
    ensure_currency_rates(session)
    session.commit()

    rows = {row.currency_code: row for row in session.query(CurrencyRate).all()}
    assert set(rows) == set(CURRENCIES)
    for code, info in CURRENCIES.items():
        assert rows[code].minor_unit == info.minor_unit
        assert rows[code].usd_rate_scaled == info.usd_rate_scaled


def test_ensure_currency_rates_is_idempotent(session: Session) -> None:
    ensure_currency_rates(session)
    session.commit()

    inserted_second_time = ensure_currency_rates(session)
    session.commit()

    assert inserted_second_time == 0
    assert _currency_rate_count(session) == len(CURRENCIES)


def test_ensure_currency_rates_leaves_an_existing_row_with_a_different_rate_untouched(
    session: Session,
) -> None:
    # A row already present with a stale/manually-edited rate must survive:
    # ensure_currency_rates only fills what's missing, it never updates.
    session.add(CurrencyRate(currency_code="USD", minor_unit=2, usd_rate_scaled=999))
    session.commit()

    ensure_currency_rates(session)
    session.commit()

    usd = session.get(CurrencyRate, "USD")
    assert usd is not None
    assert usd.usd_rate_scaled == 999


# --- employees_table_is_empty --------------------------------------------------


def test_employees_table_is_empty_is_true_on_a_fresh_table(session: Session) -> None:
    assert employees_table_is_empty(session) is True


def test_employees_table_is_empty_is_false_once_a_row_exists(session: Session) -> None:
    ensure_currency_rates(session)
    session.commit()
    bulk_insert_employees(session, generate_employees(1, seed=1))

    assert employees_table_is_empty(session) is False


# --- bulk_insert_employees / seed_employees_if_empty ---------------------------


def test_seed_employees_if_empty_inserts_n_rows(session: Session) -> None:
    inserted = seed_employees_if_empty(session, n=50, seed=1)

    assert inserted == 50
    assert _employee_count(session) == 50
    # seed_employees_if_empty must ensure currency_rates itself: callers
    # shouldn't have to remember the ordering.
    assert _currency_rate_count(session) == len(CURRENCIES)


def test_seed_employees_if_empty_second_call_inserts_nothing(session: Session) -> None:
    seed_employees_if_empty(session, n=50, seed=1)

    second_call_inserted = seed_employees_if_empty(session, n=50, seed=1)

    assert second_call_inserted == 0
    assert _employee_count(session) == 50


def test_bulk_inserting_employees_without_currency_rates_violates_the_foreign_key(
    session: Session,
) -> None:
    # bulk_insert_employees alone, bypassing ensure_currency_rates entirely,
    # against a session whose currency_rates table is genuinely empty.
    records = generate_employees(5, seed=1)
    with pytest.raises(IntegrityError):
        bulk_insert_employees(session, records)


def test_every_inserted_employee_row_satisfies_the_check_constraints(session: Session) -> None:
    seed_employees_if_empty(session, n=200, seed=1)

    rows = session.query(Employee).all()
    assert rows
    for row in rows:
        assert row.annual_gross_salary_minor > 0
        assert row.annual_gross_salary_usd_cents >= 0


# --- seed_on_empty_enabled ------------------------------------------------------


def test_seed_on_empty_enabled_defaults_to_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SEED_ON_EMPTY", raising=False)
    assert seed_on_empty_enabled() is False


@pytest.mark.parametrize("value", ["1", "true", "True", "TRUE", "yes", "YES", "on", "On"])
def test_seed_on_empty_enabled_accepts_truthy_values(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("SEED_ON_EMPTY", value)
    assert seed_on_empty_enabled() is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "anything-else"])
def test_seed_on_empty_enabled_treats_other_values_as_false(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("SEED_ON_EMPTY", value)
    assert seed_on_empty_enabled() is False
