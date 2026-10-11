"""Tests for InsightsRepository: per dimension, exactly two queries -- a
GROUP BY aggregate (count/sum/min/max) and a bulk (group_value, salary)
fetch, grouped in Python with itertools.groupby.
"""

from collections.abc import Generator
from datetime import date

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.database import create_app_engine
from app.insights_repository import InsightsRepository
from app.models import Base, Employee
from app.salary import derive_salary_fields
from app.seeding import ensure_currency_rates


@pytest.fixture
def engine() -> Generator[Engine, None, None]:
    test_engine = create_app_engine("sqlite:///:memory:")
    Base.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Generator[Session, None, None]:
    with Session(engine) as test_session:
        ensure_currency_rates(test_session)
        test_session.commit()
        yield test_session


@pytest.fixture
def repo(session: Session) -> InsightsRepository:
    return InsightsRepository(session)


def make_employee(
    session: Session,
    *,
    full_name: str = "Ada Lovelace",
    email: str = "ada@example.com",
    job_title: str = "Engineer",
    department: str = "Engineering",
    country: str = "US",
    salary_major: str = "70000",
    hire_date: date = date(2020, 1, 1),
) -> Employee:
    fields = derive_salary_fields(country, salary_major)
    employee = Employee(
        full_name=full_name,
        email=email,
        job_title=job_title,
        department=department,
        country=country,
        currency=fields.currency,
        annual_gross_salary_minor=fields.annual_gross_salary_minor,
        annual_gross_salary_usd_cents=fields.annual_gross_salary_usd_cents,
        hire_date=hire_date,
    )
    session.add(employee)
    session.commit()
    return employee


# --- country aggregates (local column) ---------------------------------------------


def test_country_aggregates_groups_correctly_on_the_local_column(
    session: Session, repo: InsightsRepository
) -> None:
    make_employee(session, country="US", salary_major="60000", email="a@example.com")
    make_employee(session, country="US", salary_major="80000", email="b@example.com")
    make_employee(session, country="IN", salary_major="1000000", email="c@example.com")

    aggregates = {a.group_value: a for a in repo.country_aggregates()}

    us_minor = derive_salary_fields("US", "60000").annual_gross_salary_minor
    us_minor_2 = derive_salary_fields("US", "80000").annual_gross_salary_minor
    assert aggregates["US"].count == 2
    assert aggregates["US"].total == us_minor + us_minor_2
    assert aggregates["US"].minimum == min(us_minor, us_minor_2)
    assert aggregates["US"].maximum == max(us_minor, us_minor_2)

    in_minor = derive_salary_fields("IN", "1000000").annual_gross_salary_minor
    assert aggregates["IN"].count == 1
    assert aggregates["IN"].total == in_minor
    assert aggregates["IN"].minimum == in_minor
    assert aggregates["IN"].maximum == in_minor


# --- department / job_title aggregates (USD column) ---------------------------------


def test_department_aggregates_groups_correctly_on_the_usd_column(
    session: Session, repo: InsightsRepository
) -> None:
    make_employee(
        session, department="Engineering", country="US", salary_major="60000", email="a@example.com"
    )
    make_employee(
        session,
        department="Engineering",
        country="IN",
        salary_major="1000000",
        email="b@example.com",
    )
    make_employee(
        session, department="Sales", country="US", salary_major="90000", email="c@example.com"
    )

    aggregates = {a.group_value: a for a in repo.department_aggregates()}

    us_usd = derive_salary_fields("US", "60000").annual_gross_salary_usd_cents
    in_usd = derive_salary_fields("IN", "1000000").annual_gross_salary_usd_cents
    assert aggregates["Engineering"].count == 2
    assert aggregates["Engineering"].total == us_usd + in_usd
    assert aggregates["Engineering"].minimum == min(us_usd, in_usd)
    assert aggregates["Engineering"].maximum == max(us_usd, in_usd)
    assert aggregates["Sales"].count == 1


def test_job_title_aggregates_groups_correctly_on_the_usd_column(
    session: Session, repo: InsightsRepository
) -> None:
    make_employee(session, job_title="Engineer", salary_major="60000", email="a@example.com")
    make_employee(session, job_title="Engineer", salary_major="80000", email="b@example.com")
    make_employee(session, job_title="Sales Manager", salary_major="90000", email="c@example.com")

    aggregates = {a.group_value: a for a in repo.job_title_aggregates()}

    assert aggregates["Engineer"].count == 2
    assert aggregates["Sales Manager"].count == 1


# --- bulk sorted-salary fetch, grouped via itertools.groupby ------------------------


def test_country_sorted_salaries_groups_correctly_with_interleaved_insertion_order(
    session: Session, repo: InsightsRepository
) -> None:
    # Inserted in US, IN, US, IN order (interleaved, not grouped by country).
    # This is exactly the shape that would break itertools.groupby if the
    # query's ORDER BY group_value were missing: groupby only merges
    # ADJACENT equal keys, so an ungrouped sequence (e.g. natural insertion
    # order) would split each country into two separate single-row groups
    # instead of one. With the ORDER BY in place, every row for a country
    # ends up in that country's single list, regardless of insertion order.
    make_employee(session, country="US", salary_major="60000", email="a@example.com")
    make_employee(session, country="IN", salary_major="1000000", email="b@example.com")
    make_employee(session, country="US", salary_major="80000", email="c@example.com")
    make_employee(session, country="IN", salary_major="2000000", email="d@example.com")

    salaries = repo.country_sorted_salaries()

    us_60k = derive_salary_fields("US", "60000").annual_gross_salary_minor
    us_80k = derive_salary_fields("US", "80000").annual_gross_salary_minor
    in_1m = derive_salary_fields("IN", "1000000").annual_gross_salary_minor
    in_2m = derive_salary_fields("IN", "2000000").annual_gross_salary_minor

    assert salaries["US"] == sorted([us_60k, us_80k])
    assert salaries["IN"] == sorted([in_1m, in_2m])


def test_department_sorted_salaries_are_ascending_within_each_group(
    session: Session, repo: InsightsRepository
) -> None:
    make_employee(session, department="Engineering", salary_major="90000", email="a@example.com")
    make_employee(session, department="Engineering", salary_major="60000", email="b@example.com")
    make_employee(session, department="Engineering", salary_major="80000", email="c@example.com")

    salaries = repo.department_sorted_salaries()["Engineering"]

    assert salaries == sorted(salaries)
    assert len(salaries) == 3


def test_job_title_sorted_salaries_returns_every_group(
    session: Session, repo: InsightsRepository
) -> None:
    make_employee(session, job_title="Engineer", email="a@example.com")
    make_employee(session, job_title="Sales Manager", email="b@example.com")

    salaries = repo.job_title_sorted_salaries()

    assert set(salaries) == {"Engineer", "Sales Manager"}
    assert len(salaries["Engineer"]) == 1
    assert len(salaries["Sales Manager"]) == 1


# --- empty database ------------------------------------------------------------------


def test_aggregates_and_sorted_salaries_are_empty_on_an_empty_table(
    repo: InsightsRepository,
) -> None:
    assert repo.country_aggregates() == []
    assert repo.country_sorted_salaries() == {}
    assert repo.department_aggregates() == []
    assert repo.job_title_aggregates() == []


# --- deterministic group ordering ----------------------------------------------------


def test_country_aggregates_are_returned_in_ascending_group_order(
    session: Session, repo: InsightsRepository
) -> None:
    # Inserted in a scrambled, non-alphabetical order: GROUP BY alone gives
    # no ordering guarantee, so this only passes reliably because of the
    # repository's own explicit ORDER BY group_column.
    for country in ["SG", "US", "AU", "IN", "CA"]:
        make_employee(
            session, country=country, salary_major="60000", email=f"{country}@example.com"
        )

    group_values = [a.group_value for a in repo.country_aggregates()]

    assert group_values == sorted(group_values)


def test_department_aggregates_are_returned_in_ascending_group_order(
    session: Session, repo: InsightsRepository
) -> None:
    for i, department in enumerate(["Sales", "Engineering", "Finance", "People", "Marketing"]):
        make_employee(session, department=department, email=f"d{i}@example.com")

    group_values = [a.group_value for a in repo.department_aggregates()]

    assert group_values == sorted(group_values)


def test_job_title_aggregates_are_returned_in_ascending_group_order(
    session: Session, repo: InsightsRepository
) -> None:
    for i, job_title in enumerate(["Sales Manager", "Engineer", "Finance Manager", "HR Associate"]):
        make_employee(session, job_title=job_title, email=f"j{i}@example.com")

    group_values = [a.group_value for a in repo.job_title_aggregates()]

    assert group_values == sorted(group_values)
