"""Integration tests for the insights routes: GET /insights/country,
/insights/department, /insights/job-title. Public: no auth exists, none
is checked.
"""

from collections.abc import Generator
from decimal import ROUND_HALF_EVEN, Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.main import create_app
from app.models import Employee
from app.seeding import seed_employees_if_empty


@pytest.fixture(scope="module")
def seeded_client(
    tmp_path_factory: pytest.TempPathFactory,
) -> Generator[TestClient, None, None]:
    db_path = tmp_path_factory.mktemp("insights") / "test.db"
    app = create_app(database_url=f"sqlite:///{db_path}")
    with TestClient(app) as client:
        with Session(app.state.engine) as session:
            seed_employees_if_empty(session, n=10_000, seed=1)
        yield client


@pytest.fixture
def empty_client(tmp_path: Path) -> Generator[TestClient, None, None]:
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")
    with TestClient(app) as client:
        yield client


# --- shape, no auth, per dimension -----------------------------------------------------


def test_country_insights_returns_200_with_currency(seeded_client: TestClient) -> None:
    response = seeded_client.get("/insights/country")

    assert response.status_code == 200
    body = response.json()
    assert body["groups"]
    group = body["groups"][0]
    assert set(group) == {
        "country",
        "currency",
        "headcount",
        "min",
        "max",
        "average",
        "median",
        "distribution",
    }
    assert len(group["distribution"]) == 10


@pytest.mark.parametrize(
    ("path", "key"), [("/insights/department", "department"), ("/insights/job-title", "job_title")]
)
def test_department_and_job_title_insights_have_no_currency_field(
    seeded_client: TestClient, path: str, key: str
) -> None:
    response = seeded_client.get(path)

    assert response.status_code == 200
    body = response.json()
    assert body["groups"]
    group = body["groups"][0]
    assert set(group) == {
        key,
        "headcount",
        "min",
        "max",
        "average",
        "median",
        "distribution",
    }
    assert "currency" not in group


# --- empty database --------------------------------------------------------------------


@pytest.mark.parametrize(
    "path", ["/insights/country", "/insights/department", "/insights/job-title"]
)
def test_insights_return_empty_groups_on_an_empty_database(
    empty_client: TestClient, path: str
) -> None:
    response = empty_client.get(path)

    assert response.status_code == 200
    assert response.json() == {"groups": []}


# --- headcounts sum to the total -----------------------------------------------------


@pytest.mark.parametrize(
    "path", ["/insights/country", "/insights/department", "/insights/job-title"]
)
def test_headcounts_across_all_groups_sum_to_10000(seeded_client: TestClient, path: str) -> None:
    body = seeded_client.get(path).json()

    assert sum(group["headcount"] for group in body["groups"]) == 10_000


# --- query count: exactly 2 per request --------------------------------------------------


@pytest.mark.parametrize(
    "path", ["/insights/country", "/insights/department", "/insights/job-title"]
)
def test_each_insights_endpoint_executes_exactly_two_queries(
    seeded_client: TestClient, path: str
) -> None:
    statements: list[str] = []

    def _before_execute(conn, clauseelement, multiparams, params, execution_options):  # type: ignore[no-untyped-def]
        statements.append(str(clauseelement))

    engine = seeded_client.app.state.engine  # type: ignore[attr-defined]
    event.listen(engine, "before_execute", _before_execute)
    try:
        response = seeded_client.get(path)
    finally:
        event.remove(engine, "before_execute", _before_execute)

    assert response.status_code == 200
    assert len(statements) == 2, statements


# --- POST + DELETE reflected in insights ------------------------------------------------


def test_insights_reflect_a_post_and_a_delete(empty_client: TestClient) -> None:
    login = empty_client.post(
        "/auth/login", json={"username": "hr", "password": "test-only-password"}
    )
    auth_headers = {"Authorization": f"Bearer {login.json()['token']}"}

    payload = {
        "full_name": "Ada Lovelace",
        "email": "ada@example.com",
        "job_title": "Engineer",
        "department": "Engineering",
        "country": "US",
        "annual_gross_salary": "70000",
        "hire_date": "2020-01-01",
    }
    created = empty_client.post("/employees", json=payload, headers=auth_headers).json()

    body = empty_client.get("/insights/country").json()
    assert body["groups"] == [
        {
            "country": "US",
            "currency": "USD",
            "headcount": 1,
            "min": "70000.00",
            "max": "70000.00",
            "average": "70000.00",
            "median": "70000.00",
            "distribution": body["groups"][0]["distribution"],  # shape checked elsewhere
        }
    ]

    empty_client.delete(f"/employees/{created['id']}", headers=auth_headers)

    body_after = empty_client.get("/insights/country").json()
    assert body_after == {"groups": []}


# --- differential: recompute independently from raw rows, at 10,000 rows ---------------


def _decimal_round_half_even(numerator: int, denominator: int) -> int:
    # An independent recomputation path: Python's decimal module instead of
    # our hand-rolled integer round_half_even, so this can't pass merely
    # because both share the same rounding bug.
    return int(
        (Decimal(numerator) / Decimal(denominator)).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
    )


def _expected_median(sorted_values: list[int]) -> int:
    count = len(sorted_values)
    mid = count // 2
    if count % 2 == 1:
        return sorted_values[mid]
    return _decimal_round_half_even(sorted_values[mid - 1] + sorted_values[mid], 2)


def _expected_buckets(
    sorted_values: list[int], minimum: int, maximum: int
) -> list[tuple[int, int, int]]:
    # Reimplements the same documented ceiling-width rule independently
    # (not by calling app.insights_service.compute_buckets), so this still
    # catches an implementation bug (an off-by-one, a wrong clamp), even
    # though it can't catch a shared misunderstanding of the rule itself.
    n = maximum - minimum + 1
    width = (n + 9) // 10
    counts = [0] * 10
    for v in sorted_values:
        counts[(v - minimum) // width] += 1
    last_nonempty = (sorted_values[-1] - minimum) // width
    result = []
    for i in range(10):
        if i < last_nonempty:
            result.append((minimum + i * width, minimum + (i + 1) * width, counts[i]))
        elif i == last_nonempty:
            result.append((minimum + i * width, maximum, counts[i]))
        else:
            result.append((maximum, maximum, counts[i]))
    return result


def test_country_insights_match_an_independent_recomputation_at_10000_rows(
    seeded_client: TestClient,
) -> None:
    with Session(seeded_client.app.state.engine) as session:  # type: ignore[attr-defined]
        rows = session.execute(
            select(Employee.country, Employee.annual_gross_salary_minor).order_by(
                Employee.country, Employee.annual_gross_salary_minor
            )
        ).all()

    from itertools import groupby

    from app.money import minor_to_major
    from app.reference_data import COUNTRY_CURRENCY, CURRENCIES

    expected_by_country = {}
    for country, group_rows in groupby(rows, key=lambda r: r[0]):
        salaries = [r[1] for r in group_rows]
        minor_unit = CURRENCIES[COUNTRY_CURRENCY[country]].minor_unit
        expected_by_country[country] = {
            "headcount": len(salaries),
            "min": minor_to_major(min(salaries), minor_unit),
            "max": minor_to_major(max(salaries), minor_unit),
            "average": minor_to_major(
                _decimal_round_half_even(sum(salaries), len(salaries)), minor_unit
            ),
            "median": minor_to_major(_expected_median(salaries), minor_unit),
            "distribution": [
                {
                    "range_min": minor_to_major(b[0], minor_unit),
                    "range_max": minor_to_major(b[1], minor_unit),
                    "count": b[2],
                }
                for b in _expected_buckets(salaries, min(salaries), max(salaries))
            ],
        }

    body = seeded_client.get("/insights/country").json()
    actual_by_country = {g["country"]: g for g in body["groups"]}

    assert set(actual_by_country) == set(expected_by_country)
    for country, expected in expected_by_country.items():
        actual = actual_by_country[country]
        assert actual["headcount"] == expected["headcount"]
        assert actual["min"] == expected["min"]
        assert actual["max"] == expected["max"]
        assert actual["average"] == expected["average"]
        assert actual["median"] == expected["median"]
        assert actual["distribution"] == expected["distribution"]


@pytest.mark.parametrize(
    ("path", "column_name"),
    [("/insights/department", "department"), ("/insights/job-title", "job_title")],
)
def test_department_and_job_title_insights_match_an_independent_recomputation_at_10000_rows(
    seeded_client: TestClient, path: str, column_name: str
) -> None:
    from itertools import groupby

    from app.money import minor_to_major

    column = getattr(Employee, column_name)
    with Session(seeded_client.app.state.engine) as session:  # type: ignore[attr-defined]
        rows = session.execute(
            select(column, Employee.annual_gross_salary_usd_cents).order_by(
                column, Employee.annual_gross_salary_usd_cents
            )
        ).all()

    expected_by_group = {}
    for group_value, group_rows in groupby(rows, key=lambda r: r[0]):
        salaries = [r[1] for r in group_rows]
        expected_by_group[group_value] = {
            "headcount": len(salaries),
            "min": minor_to_major(min(salaries), 2),
            "max": minor_to_major(max(salaries), 2),
            "average": minor_to_major(_decimal_round_half_even(sum(salaries), len(salaries)), 2),
            "median": minor_to_major(_expected_median(salaries), 2),
            "distribution": [
                {
                    "range_min": minor_to_major(b[0], 2),
                    "range_max": minor_to_major(b[1], 2),
                    "count": b[2],
                }
                for b in _expected_buckets(salaries, min(salaries), max(salaries))
            ],
        }

    body = seeded_client.get(path).json()
    actual_by_group = {g[column_name]: g for g in body["groups"]}

    assert set(actual_by_group) == set(expected_by_group)
    for group_value, expected in expected_by_group.items():
        actual = actual_by_group[group_value]
        assert actual["headcount"] == expected["headcount"]
        assert actual["min"] == expected["min"]
        assert actual["max"] == expected["max"]
        assert actual["average"] == expected["average"]
        assert actual["median"] == expected["median"]
        assert actual["distribution"] == expected["distribution"]
