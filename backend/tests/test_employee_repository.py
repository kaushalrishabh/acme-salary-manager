"""Tests for EmployeeRepository: list (filter, search, sort, paginate),
get, and options. Each test builds exactly the rows it needs.
"""

from collections.abc import Generator
from datetime import date

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.database import create_app_engine
from app.employee_repository import EmployeeFilters, EmployeeRepository
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
def repo(session: Session) -> EmployeeRepository:
    return EmployeeRepository(session)


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


# --- list: default sort --------------------------------------------------------


def test_list_with_no_filters_returns_all_rows_sorted_by_full_name_then_id(
    session: Session, repo: EmployeeRepository
) -> None:
    make_employee(session, full_name="Zoe Zimmerman", email="zoe@example.com")
    make_employee(session, full_name="Amy Adams", email="amy1@example.com")
    make_employee(session, full_name="Amy Adams", email="amy2@example.com")  # ties on name

    rows, total = repo.list_employees(
        EmployeeFilters(), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 3
    names_and_ids = [(row.full_name, row.id) for row in rows]
    assert names_and_ids == sorted(names_and_ids)


# --- list: filters --------------------------------------------------------------


def test_list_filters_by_country(session: Session, repo: EmployeeRepository) -> None:
    make_employee(session, country="US", email="a@example.com")
    make_employee(session, country="IN", salary_major="1000000", email="b@example.com")

    rows, total = repo.list_employees(
        EmployeeFilters(country="IN"), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 1
    assert rows[0].country == "IN"


def test_list_filters_by_department(session: Session, repo: EmployeeRepository) -> None:
    make_employee(session, department="Engineering", email="a@example.com")
    make_employee(session, department="Sales", job_title="Sales Manager", email="b@example.com")

    rows, total = repo.list_employees(
        EmployeeFilters(department="Sales"), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 1
    assert rows[0].department == "Sales"


def test_list_filters_by_job_title(session: Session, repo: EmployeeRepository) -> None:
    make_employee(session, job_title="Engineer", email="a@example.com")
    make_employee(session, job_title="Senior Engineer", email="b@example.com")

    rows, total = repo.list_employees(
        EmployeeFilters(job_title="Senior Engineer"),
        sort="full_name",
        order="asc",
        page=1,
        page_size=50,
    )

    assert total == 1
    assert rows[0].job_title == "Senior Engineer"


def test_list_filters_combine_with_and_not_or(session: Session, repo: EmployeeRepository) -> None:
    make_employee(session, country="US", department="Engineering", email="a@example.com")
    make_employee(
        session,
        country="US",
        department="Sales",
        job_title="Sales Manager",
        email="b@example.com",
    )
    make_employee(
        session,
        country="IN",
        department="Engineering",
        salary_major="1000000",
        email="c@example.com",
    )

    rows, total = repo.list_employees(
        EmployeeFilters(country="US", department="Engineering"),
        sort="full_name",
        order="asc",
        page=1,
        page_size=50,
    )

    assert total == 1
    assert rows[0].email == "a@example.com"


def test_list_total_reflects_the_filtered_count_not_the_overall_count(
    session: Session, repo: EmployeeRepository
) -> None:
    make_employee(session, country="US", email="a@example.com")
    make_employee(session, country="US", email="b@example.com")
    make_employee(session, country="IN", salary_major="1000000", email="c@example.com")

    _, total = repo.list_employees(
        EmployeeFilters(country="US"), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 2


# --- list: search ----------------------------------------------------------------


def test_list_search_matches_full_name_case_insensitively(
    session: Session, repo: EmployeeRepository
) -> None:
    make_employee(session, full_name="Grace Hopper", email="grace@example.com")
    make_employee(session, full_name="Alan Turing", email="alan@example.com")

    rows, total = repo.list_employees(
        EmployeeFilters(q="GRACE"), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 1
    assert rows[0].full_name == "Grace Hopper"


def test_list_search_matches_email_case_insensitively(
    session: Session, repo: EmployeeRepository
) -> None:
    make_employee(session, full_name="Grace Hopper", email="grace.h@example.com")
    make_employee(session, full_name="Alan Turing", email="alan.t@example.com")

    rows, total = repo.list_employees(
        EmployeeFilters(q="ALAN.T"), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 1
    assert rows[0].email == "alan.t@example.com"


def test_list_search_treats_a_literal_percent_as_a_literal_character(
    session: Session, repo: EmployeeRepository
) -> None:
    make_employee(session, full_name="100% Done", email="hundred.percent@example.com")
    make_employee(session, full_name="100X Done", email="hundred.x@example.com")

    rows, total = repo.list_employees(
        EmployeeFilters(q="100% Done"), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 1
    assert rows[0].full_name == "100% Done"


def test_list_search_treats_a_literal_underscore_as_a_literal_character(
    session: Session, repo: EmployeeRepository
) -> None:
    make_employee(session, full_name="Bob Underscore", email="bob_test@example.com")
    make_employee(session, full_name="Bob Ex", email="bobxtest@example.com")

    rows, total = repo.list_employees(
        EmployeeFilters(q="bob_test"), sort="full_name", order="asc", page=1, page_size=50
    )

    assert total == 1
    assert rows[0].email == "bob_test@example.com"


# --- list: sort ---------------------------------------------------------------


@pytest.mark.parametrize("order", ["asc", "desc"])
@pytest.mark.parametrize(
    ("field", "attr"),
    [
        ("full_name", "full_name"),
        ("hire_date", "hire_date"),
        ("salary", "annual_gross_salary_usd_cents"),
    ],
)
def test_list_sorts_by_each_whitelisted_field(
    session: Session, repo: EmployeeRepository, field: str, attr: str, order: str
) -> None:
    make_employee(
        session,
        full_name="Bravo",
        email="bravo@example.com",
        hire_date=date(2021, 1, 1),
        salary_major="80000",
    )
    make_employee(
        session,
        full_name="Alpha",
        email="alpha@example.com",
        hire_date=date(2019, 1, 1),
        salary_major="60000",
    )
    make_employee(
        session,
        full_name="Charlie",
        email="charlie@example.com",
        hire_date=date(2023, 1, 1),
        salary_major="100000",
    )

    rows, _ = repo.list_employees(EmployeeFilters(), sort=field, order=order, page=1, page_size=50)

    values = [getattr(row, attr) for row in rows]
    assert values == sorted(values, reverse=(order == "desc"))


def test_list_sort_breaks_ties_with_id(session: Session, repo: EmployeeRepository) -> None:
    make_employee(session, hire_date=date(2020, 1, 1), email="a@example.com")
    make_employee(session, hire_date=date(2020, 1, 1), email="b@example.com")

    rows, _ = repo.list_employees(
        EmployeeFilters(), sort="hire_date", order="asc", page=1, page_size=50
    )

    assert [row.email for row in rows] == ["a@example.com", "b@example.com"]


# --- list: pagination -----------------------------------------------------------


def test_list_pagination_slices_correctly(session: Session, repo: EmployeeRepository) -> None:
    for i in range(5):
        make_employee(session, full_name=f"Person{i}", email=f"p{i}@example.com")

    page1, total1 = repo.list_employees(
        EmployeeFilters(), sort="full_name", order="asc", page=1, page_size=2
    )
    page2, total2 = repo.list_employees(
        EmployeeFilters(), sort="full_name", order="asc", page=2, page_size=2
    )

    assert total1 == 5
    assert total2 == 5
    assert [row.full_name for row in page1] == ["Person0", "Person1"]
    assert [row.full_name for row in page2] == ["Person2", "Person3"]


# --- get ------------------------------------------------------------------------


def test_get_returns_the_matching_employee(session: Session, repo: EmployeeRepository) -> None:
    created = make_employee(session, email="x@example.com")

    found = repo.get(created.id)

    assert found is not None
    assert found.id == created.id


def test_get_returns_none_for_a_missing_id(repo: EmployeeRepository) -> None:
    assert repo.get(999_999) is None


# --- options ----------------------------------------------------------------------


def test_options_returns_distinct_sorted_values(session: Session, repo: EmployeeRepository) -> None:
    make_employee(
        session,
        country="US",
        department="Engineering",
        job_title="Engineer",
        email="a@example.com",
    )
    make_employee(
        session,
        country="US",
        department="Engineering",
        job_title="Engineer",
        email="b@example.com",
    )
    make_employee(
        session,
        country="IN",
        department="Sales",
        job_title="Sales Manager",
        salary_major="1000000",
        email="c@example.com",
    )

    options = repo.options()

    assert options.countries == ["IN", "US"]
    assert options.departments == ["Engineering", "Sales"]
    assert options.job_titles == ["Engineer", "Sales Manager"]
