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
from app.errors import DuplicateEmailError, FieldValidationError, NotFoundError
from app.models import Base, Employee
from app.money import minor_to_major
from app.salary import derive_salary_fields
from app.schemas import EmployeeCreate, EmployeeUpdate
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


def _create_data(**overrides: object) -> EmployeeCreate:
    defaults: dict[str, object] = {
        "full_name": "Ada Lovelace",
        "email": "ada@example.com",
        "job_title": "Engineer",
        "department": "Engineering",
        "country": "US",
        "annual_gross_salary": "70000",
        "hire_date": date(2020, 1, 1),
    }
    defaults.update(overrides)
    return EmployeeCreate(**defaults)


def _update_data(**overrides: object) -> EmployeeUpdate:
    defaults: dict[str, object] = {
        "full_name": "Ada Lovelace",
        "email": "ada@example.com",
        "job_title": "Engineer",
        "department": "Engineering",
        "country": "US",
        "annual_gross_salary": "70000",
        "hire_date": date(2020, 1, 1),
    }
    defaults.update(overrides)
    return EmployeeUpdate(**defaults)


# --- create_employee ---------------------------------------------------------------


def test_create_employee_derives_money_fields_through_derive_salary_fields(
    service: EmployeeService,
) -> None:
    result = service.create_employee(_create_data(country="JP", annual_gross_salary="5000000"))

    expected = derive_salary_fields("JP", "5000000")
    assert result.currency == "JPY"
    assert result.annual_gross_salary == "5000000"
    assert result.annual_gross_salary_usd == minor_to_major(
        expected.annual_gross_salary_usd_cents, 2
    )


def test_create_employee_trims_and_lowercases_email(service: EmployeeService) -> None:
    result = service.create_employee(_create_data(email="  Ada@Example.COM  "))

    assert result.email == "ada@example.com"


def test_create_employee_raises_duplicate_email_error_case_insensitively(
    session: Session, service: EmployeeService
) -> None:
    make_employee(session, email="ada@example.com")

    with pytest.raises(DuplicateEmailError):
        service.create_employee(_create_data(email="ADA@example.com"))


def test_create_employee_raises_field_validation_error_for_an_unsupported_country(
    service: EmployeeService,
) -> None:
    with pytest.raises(FieldValidationError) as exc_info:
        service.create_employee(_create_data(country="ZZ"))

    assert exc_info.value.field == "country"


def test_create_employee_raises_field_validation_error_for_a_malformed_amount(
    service: EmployeeService,
) -> None:
    with pytest.raises(FieldValidationError) as exc_info:
        service.create_employee(_create_data(annual_gross_salary="not-a-number"))

    assert exc_info.value.field == "annual_gross_salary"


# --- update_employee ----------------------------------------------------------------


def test_update_employee_recomputes_money_fields_even_when_only_country_changed(
    service: EmployeeService,
) -> None:
    created = service.create_employee(_create_data(country="US", annual_gross_salary="70000"))

    updated = service.update_employee(
        created.id, _update_data(country="JP", annual_gross_salary="70000")
    )

    expected = derive_salary_fields("JP", "70000")
    assert updated.currency == "JPY"
    assert updated.annual_gross_salary == "70000"
    assert updated.annual_gross_salary_usd == minor_to_major(
        expected.annual_gross_salary_usd_cents, 2
    )


def test_update_employee_raises_not_found_for_a_missing_id(service: EmployeeService) -> None:
    with pytest.raises(NotFoundError):
        service.update_employee(999_999, _update_data())


def test_update_employee_does_not_raise_duplicate_for_its_own_unchanged_email(
    service: EmployeeService,
) -> None:
    created = service.create_employee(_create_data(email="ada@example.com"))

    result = service.update_employee(
        created.id, _update_data(email="ada@example.com", full_name="Ada L.")
    )

    assert result.full_name == "Ada L."


def test_update_employee_raises_duplicate_for_a_different_employees_email(
    session: Session, service: EmployeeService
) -> None:
    make_employee(session, email="other@example.com")
    created = service.create_employee(_create_data(email="ada@example.com"))

    with pytest.raises(DuplicateEmailError):
        service.update_employee(created.id, _update_data(email="other@example.com"))


# --- delete_employee ----------------------------------------------------------------


def test_delete_employee_raises_not_found_for_a_missing_id(service: EmployeeService) -> None:
    with pytest.raises(NotFoundError):
        service.delete_employee(999_999)
