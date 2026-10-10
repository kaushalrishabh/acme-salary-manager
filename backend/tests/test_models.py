from collections.abc import Generator
from datetime import date
from typing import cast

import pytest
from sqlalchemy import Engine, Table, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import create_app_engine
from app.models import Base, CurrencyRate, Employee
from app.reference_data import CURRENCIES

# DeclarativeBase types __table__ as the more generic FromClause; at runtime
# it is always a Table, and the structural checks below need that.
EMPLOYEE_TABLE = cast(Table, Employee.__table__)
CURRENCY_RATE_TABLE = cast(Table, CurrencyRate.__table__)

EXPECTED_SINGLE_COLUMN_INDEXES = {
    "full_name",
    "job_title",
    "department",
    "country",
    "hire_date",
    "annual_gross_salary_usd_cents",
}


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


@pytest.fixture
def seeded_currencies(session: Session) -> Session:
    for code, info in CURRENCIES.items():
        session.add(
            CurrencyRate(
                currency_code=code,
                minor_unit=info.minor_unit,
                usd_rate_scaled=info.usd_rate_scaled,
            )
        )
    session.commit()
    return session


def make_employee(**overrides: object) -> Employee:
    defaults: dict[str, object] = {
        "full_name": "Ada Lovelace",
        "email": "ada@example.com",
        "job_title": "Engineer",
        "department": "Engineering",
        "country": "GB",
        "currency": "GBP",
        "annual_gross_salary_minor": 8_500_000,
        "annual_gross_salary_usd_cents": 10_800_000,
        # SQLite's Date type rejects a plain string with StatementError, not
        # the IntegrityError these tests check for, so this must be a date.
        "hire_date": date(2020, 1, 1),
    }
    defaults.update(overrides)
    return Employee(**defaults)


# --- create_all ---------------------------------------------------------


def test_create_all_builds_both_tables(engine: Engine) -> None:
    assert set(inspect(engine).get_table_names()) == {"currency_rates", "employees"}


# --- filling currency_rates from reference data --------------------------


def test_currency_rates_table_can_be_filled_from_reference_data(
    seeded_currencies: Session,
) -> None:
    rows = seeded_currencies.query(CurrencyRate).all()
    assert len(rows) == len(CURRENCIES)

    eur = seeded_currencies.get(CurrencyRate, "EUR")
    assert eur is not None
    assert eur.minor_unit == CURRENCIES["EUR"].minor_unit
    assert eur.usd_rate_scaled == CURRENCIES["EUR"].usd_rate_scaled


# --- constraints ----------------------------------------------------------


def test_duplicate_email_is_rejected(seeded_currencies: Session) -> None:
    # Case-insensitive matching (e.g. lowercasing before save) is the
    # service's job, not the database's; this only checks exact duplicates.
    seeded_currencies.add(make_employee(email="dup@example.com"))
    seeded_currencies.commit()

    seeded_currencies.add(make_employee(email="dup@example.com", full_name="Grace Hopper"))
    with pytest.raises(IntegrityError):
        seeded_currencies.commit()


def test_the_unique_constraint_itself_is_case_sensitive(seeded_currencies: Session) -> None:
    # Documents why the lowercase-before-save invariant is load-bearing:
    # SQLite's default TEXT comparison (and this column's unique constraint)
    # is case-sensitive, so "Dup@Example.com" and "dup@example.com" are two
    # different strings as far as the database is concerned, and BOTH
    # inserts succeed here. Case-insensitive uniqueness exists only because
    # every caller is expected to lowercase email before it reaches this
    # table (EmployeeService does; nothing in the schema enforces it).
    seeded_currencies.add(make_employee(email="dup@example.com"))
    seeded_currencies.add(make_employee(email="Dup@Example.com", full_name="Grace Hopper"))
    seeded_currencies.commit()  # must not raise

    assert seeded_currencies.query(Employee).count() == 2


def test_unknown_currency_is_rejected(seeded_currencies: Session) -> None:
    seeded_currencies.add(make_employee(country="US", currency="ZZZ"))
    with pytest.raises(IntegrityError):
        seeded_currencies.commit()


@pytest.mark.parametrize("salary", [0, -1])
def test_non_positive_salary_is_rejected(seeded_currencies: Session, salary: int) -> None:
    seeded_currencies.add(make_employee(annual_gross_salary_minor=salary))
    with pytest.raises(IntegrityError):
        seeded_currencies.commit()


def test_negative_usd_cents_is_rejected(seeded_currencies: Session) -> None:
    seeded_currencies.add(make_employee(annual_gross_salary_usd_cents=-1))
    with pytest.raises(IntegrityError):
        seeded_currencies.commit()


def test_zero_usd_cents_is_allowed(seeded_currencies: Session) -> None:
    seeded_currencies.add(make_employee(annual_gross_salary_usd_cents=0))
    seeded_currencies.commit()  # must not raise


@pytest.mark.parametrize("usd_rate_scaled", [0, -1])
def test_currency_rate_rejects_non_positive_usd_rate_scaled(
    session: Session, usd_rate_scaled: int
) -> None:
    session.add(CurrencyRate(currency_code="USD", minor_unit=2, usd_rate_scaled=usd_rate_scaled))
    with pytest.raises(IntegrityError):
        session.commit()


@pytest.mark.parametrize("minor_unit", [-1, 4])
def test_currency_rate_rejects_minor_unit_outside_0_to_3(session: Session, minor_unit: int) -> None:
    session.add(
        CurrencyRate(currency_code="USD", minor_unit=minor_unit, usd_rate_scaled=1_000_000_000)
    )
    with pytest.raises(IntegrityError):
        session.commit()


REQUIRED_EMPLOYEE_COLUMNS = [
    "full_name",
    "email",
    "job_title",
    "department",
    "country",
    "currency",
    "annual_gross_salary_minor",
    "annual_gross_salary_usd_cents",
    "hire_date",
]


@pytest.mark.parametrize("column", REQUIRED_EMPLOYEE_COLUMNS)
def test_employee_rejects_none_for_each_required_column(
    seeded_currencies: Session, column: str
) -> None:
    seeded_currencies.add(make_employee(**{column: None}))
    with pytest.raises(IntegrityError):
        seeded_currencies.commit()


# --- indexes, named in design-notes.md ------------------------------------


def test_employees_has_exactly_the_expected_single_column_indexes() -> None:
    indexed_columns = {index.columns.keys()[0] for index in EMPLOYEE_TABLE.indexes}
    assert indexed_columns == EXPECTED_SINGLE_COLUMN_INDEXES


def test_email_is_unique_constrained() -> None:
    assert EMPLOYEE_TABLE.c.email.unique is True


def test_currency_foreign_key_targets_currency_rates() -> None:
    (fk,) = EMPLOYEE_TABLE.c.currency.foreign_keys
    assert fk.target_fullname == "currency_rates.currency_code"


# --- naming convention -----------------------------------------------------


def test_check_constraint_names_follow_the_naming_convention() -> None:
    for table in (EMPLOYEE_TABLE, CURRENCY_RATE_TABLE):
        check_names = [
            constraint.name
            for constraint in table.constraints
            if constraint.__class__.__name__ == "CheckConstraint"
        ]
        assert check_names
        for name in check_names:
            assert isinstance(name, str)
            assert name.startswith("ck_")


def test_foreign_key_constraint_name_follows_the_naming_convention() -> None:
    (fk_constraint,) = EMPLOYEE_TABLE.foreign_key_constraints
    name = fk_constraint.name
    assert isinstance(name, str)
    assert name.startswith("fk_")
