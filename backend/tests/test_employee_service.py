"""Tests for EmployeeService: assembles schema-shaped responses from the
repository, formats money fields as exact major-unit strings, and raises
NotFoundError for a missing employee.
"""

from collections.abc import Generator
from datetime import date

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.database import create_app_engine
from app.employee_repository import EmployeeFilters
from app.employee_service import EmployeeService
from app.errors import NotFoundError
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
def service(session: Session) -> EmployeeService:
    return EmployeeService(session)


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


# --- list_employees --------------------------------------------------------------


def test_list_employees_assembles_the_response_shape(
    session: Session, service: EmployeeService
) -> None:
    make_employee(session, full_name="Ada Lovelace", email="ada@example.com")
    make_employee(session, full_name="Grace Hopper", email="grace@example.com")

    response = service.list_employees(
        EmployeeFilters(), sort="full_name", order="asc", page=1, page_size=25
    )

    assert response.total == 2
    assert response.page == 1
    assert response.page_size == 25
    assert [item.full_name for item in response.items] == ["Ada Lovelace", "Grace Hopper"]


def test_employee_read_money_fields_are_exact_major_unit_strings(
    session: Session, service: EmployeeService
) -> None:
    make_employee(session, country="US", salary_major="85000.50", email="a@example.com")

    response = service.list_employees(
        EmployeeFilters(), sort="full_name", order="asc", page=1, page_size=25
    )

    item = response.items[0]
    assert item.annual_gross_salary == "85000.50"
    assert "." in item.annual_gross_salary_usd


def test_employee_read_formats_a_zero_decimal_currency_with_no_decimal_point(
    session: Session, service: EmployeeService
) -> None:
    make_employee(session, country="JP", salary_major="5000000", email="jp@example.com")

    response = service.list_employees(
        EmployeeFilters(), sort="full_name", order="asc", page=1, page_size=25
    )

    item = response.items[0]
    assert item.currency == "JPY"
    assert item.annual_gross_salary == "5000000"
    assert "." not in item.annual_gross_salary


# --- get_employee ------------------------------------------------------------------


def test_get_employee_returns_the_matching_employee(
    session: Session, service: EmployeeService
) -> None:
    created = make_employee(session, email="x@example.com")

    result = service.get_employee(created.id)

    assert result.id == created.id


def test_get_employee_raises_not_found_for_a_missing_id(service: EmployeeService) -> None:
    with pytest.raises(NotFoundError):
        service.get_employee(999_999)


# --- get_options -----------------------------------------------------------------


def test_get_options_returns_distinct_values(session: Session, service: EmployeeService) -> None:
    make_employee(
        session,
        country="US",
        department="Engineering",
        job_title="Engineer",
        email="a@example.com",
    )
    make_employee(
        session,
        country="IN",
        department="Sales",
        job_title="Sales Manager",
        salary_major="1000000",
        email="b@example.com",
    )

    options = service.get_options()

    assert options.countries == ["IN", "US"]
    assert options.departments == ["Engineering", "Sales"]
    assert options.job_titles == ["Engineer", "Sales Manager"]
