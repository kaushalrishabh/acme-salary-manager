"""Tests for InsightsService: average, median, and the ceiling-width
bucket rule, all integer arithmetic, plus the schema-level currency
presence/absence per dimension.
"""

from collections.abc import Generator
from datetime import date

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.database import create_app_engine
from app.insights_service import InsightsService, compute_average, compute_buckets, compute_median
from app.models import Base, Employee
from app.salary import derive_salary_fields
from app.schemas import CountryInsight, DepartmentInsight, JobTitleInsight
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
def service(session: Session) -> InsightsService:
    return InsightsService(session)


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


# --- end-to-end: median through the real repository, not a pre-sorted list ----------


def test_median_is_correct_even_when_rows_are_inserted_out_of_salary_order(
    session: Session, service: InsightsService
) -> None:
    # Inserted in 90000, 60000, 80000 order (not sorted by salary). The
    # sorted middle value is 80000's equivalent; getting that right depends
    # on InsightsRepository's bulk query actually being sorted by salary
    # within the group, not on insertion order.
    make_employee(session, country="US", salary_major="90000", email="a@example.com")
    make_employee(session, country="US", salary_major="60000", email="b@example.com")
    make_employee(session, country="US", salary_major="80000", email="c@example.com")

    result = service.country_insights()

    us_group = next(g for g in result.groups if g.country == "US")
    assert us_group.median == "80000.00"


# --- average -------------------------------------------------------------------------


def test_average_uses_round_half_even_not_naive_division() -> None:
    # sum=7, count=2 -> 3.5 -> ties to even -> 4, not 3 (floor) and not a
    # naive "round half up" of 4 either by coincidence; picked so the
    # half-even and half-up conventions would actually agree here, and the
    # *other* parametrized case below is the one that tells them apart.
    assert compute_average(7, 2) == 4


def test_average_tie_where_naive_rounding_would_differ() -> None:
    # sum=201, count=2 -> 100.5. round-half-even rounds to 100 (even stays);
    # naive round-half-up would give 101. This is the case that actually
    # distinguishes the two conventions.
    assert compute_average(201, 2) == 100


def test_average_non_tie_case() -> None:
    assert compute_average(300, 3) == 100


# --- median --------------------------------------------------------------------------


def test_median_odd_count_is_the_middle_value() -> None:
    assert compute_median([10, 20, 30]) == 20


def test_median_even_count_uses_round_half_even_of_the_two_middle_values() -> None:
    assert compute_median([100, 104]) == 102


def test_median_even_count_tie_where_naive_rounding_would_differ() -> None:
    # 100 and 101: sum=201, /2=100.5. round-half-even -> 100 (even stays).
    # A naive "round half up" on the float 100.5 would give 101 instead.
    assert compute_median([100, 101]) == 100


# --- buckets ---------------------------------------------------------------------------


def test_buckets_range_of_9_has_one_value_per_bucket_then_a_trailing_empty_bucket() -> None:
    # n=9, width=(9+9)//10=1. Values 100..108, one each. last_nonempty=8:
    # bucket 8 is the last *non-empty* bucket (clamped to max), bucket 9 is
    # a trailing empty bucket past max -- this is "a range under 10".
    values = list(range(100, 109))
    buckets = compute_buckets(values, minimum=100, maximum=108)

    assert len(buckets) == 10
    for i in range(8):
        assert buckets[i].range_min == 100 + i
        assert buckets[i].range_max == 100 + i + 1
        assert buckets[i].count == 1
    assert buckets[8].range_min == 108
    assert buckets[8].range_max == 108  # clamped to max, inclusive
    assert buckets[8].count == 1
    assert buckets[9].range_min == 108
    assert buckets[9].range_max == 108
    assert buckets[9].count == 0
    assert sum(b.count for b in buckets) == 9


def test_buckets_range_of_99_fills_all_ten_buckets_with_the_last_clamped() -> None:
    # n=99, width=(99+9)//10=10. Values 0..98, one each. last_nonempty=9:
    # every bucket is non-empty, no trailing buckets at all.
    values = list(range(0, 99))
    buckets = compute_buckets(values, minimum=0, maximum=98)

    assert len(buckets) == 10
    for i in range(9):
        assert buckets[i].range_min == i * 10
        assert buckets[i].range_max == (i + 1) * 10
        assert buckets[i].count == 10
    assert buckets[9].range_min == 90
    assert buckets[9].range_max == 98  # clamped to max, inclusive
    assert buckets[9].count == 9
    assert sum(b.count for b in buckets) == 99


def test_buckets_min_equals_max_needs_no_special_case() -> None:
    values = [50_000] * 5
    buckets = compute_buckets(values, minimum=50_000, maximum=50_000)

    assert buckets[0].range_min == 50_000
    assert buckets[0].range_max == 50_000
    assert buckets[0].count == 5
    for i in range(1, 10):
        assert buckets[i].range_min == 50_000
        assert buckets[i].range_max == 50_000
        assert buckets[i].count == 0


def test_buckets_a_different_range_under_10_has_several_trailing_empty_buckets() -> None:
    # n=4, width=1. Values 100..103, one each. last_nonempty=3, so buckets
    # 4..9 (six of them) are all trailing and empty -- distinct from the
    # range-of-9 case above, which only has one trailing bucket.
    values = [100, 101, 102, 103]
    buckets = compute_buckets(values, minimum=100, maximum=103)

    assert buckets[3].range_min == 103
    assert buckets[3].range_max == 103  # clamped
    assert buckets[3].count == 1
    for i in range(4, 10):
        assert buckets[i].range_min == 103
        assert buckets[i].range_max == 103
        assert buckets[i].count == 0
    assert sum(b.count for b in buckets) == 4


def test_bucket_counts_always_sum_to_the_group_headcount() -> None:
    # An irregular, non-round-number spread, not a multiple of 10 or of any
    # width -- a generic check that no value is dropped or double-counted.
    values = sorted(v * 137 % 9973 + 1 for v in range(37))
    buckets = compute_buckets(values, minimum=values[0], maximum=values[-1])

    assert sum(b.count for b in buckets) == len(values)


# --- currency presence per dimension (schema-level, not null -- absent) --------------


def test_country_insight_schema_has_a_currency_field() -> None:
    assert "currency" in CountryInsight.model_fields


def test_department_insight_schema_has_no_currency_field_at_all() -> None:
    assert "currency" not in DepartmentInsight.model_fields


def test_job_title_insight_schema_has_no_currency_field_at_all() -> None:
    assert "currency" not in JobTitleInsight.model_fields
