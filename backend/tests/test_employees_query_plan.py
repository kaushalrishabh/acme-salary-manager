"""Confirms a filtered, sorted employee list query uses the country index,
not a full table scan, at 10,000 rows.
"""

import time
from collections.abc import Generator

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from app.database import create_app_engine
from app.employee_repository import EmployeeFilters, EmployeeRepository
from app.models import Base
from app.seeding import seed_employees_if_empty


@pytest.fixture(scope="module")
def engine(tmp_path_factory: pytest.TempPathFactory) -> Generator[Engine, None, None]:
    db_path = tmp_path_factory.mktemp("query_plan") / "test.db"
    test_engine = create_app_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        seed_employees_if_empty(session, n=10_000, seed=1)
    yield test_engine
    test_engine.dispose()


def _query_plan(session: Session, sort_column: str) -> list[str]:
    plan = session.execute(
        text(
            "EXPLAIN QUERY PLAN "
            "SELECT * FROM employees WHERE country = :country "
            f"ORDER BY {sort_column}, id LIMIT 25 OFFSET 0"
        ),
        {"country": "US"},
    ).all()
    return [row[-1] for row in plan]


def _uses_country_index(plan_lines: list[str]) -> bool:
    # The exact index name, not just the word "SEARCH": SQLite also prints
    # "SCAN employees USING INDEX ix_employees_<sort column>" when it walks
    # the table in a *different* index's order to satisfy ORDER BY and
    # applies country=? as a residual check -- a disguised full scan, still
    # O(n), that a looser "SEARCH ... USING INDEX" check would miss (a
    # query with no country index still shows this line, not a bare scan).
    return any("SEARCH employees USING INDEX ix_employees_country" in line for line in plan_lines)


def test_filtered_sorted_page_uses_the_country_index(engine: Engine) -> None:
    with Session(engine) as session:
        plan_lines = _query_plan(session, "full_name")

    assert _uses_country_index(plan_lines)


@pytest.mark.parametrize("sort_column", ["full_name", "hire_date", "annual_gross_salary_usd_cents"])
def test_filtered_sorted_page_uses_the_country_index_for_every_sort_field(
    engine: Engine, sort_column: str
) -> None:
    with Session(engine) as session:
        plan_lines = _query_plan(session, sort_column)

    assert _uses_country_index(plan_lines)


def test_filtered_sorted_page_responds_quickly_at_10k_rows(engine: Engine) -> None:
    with Session(engine) as session:
        plan_lines = _query_plan(session, "full_name")
        repo = EmployeeRepository(session)
        start = time.perf_counter()
        rows, total = repo.list_employees(
            EmployeeFilters(country="US"), sort="full_name", order="asc", page=1, page_size=25
        )
        elapsed = time.perf_counter() - start

    assert _uses_country_index(plan_lines)
    assert total > 0
    assert len(rows) <= 25
    # A loose smoke guard against an accidental full-scan-scale regression,
    # not a strict perf gate -- design-notes.md already treats timing as
    # measured, not asserted, for the same flakiness reason.
    assert elapsed < 2.0
