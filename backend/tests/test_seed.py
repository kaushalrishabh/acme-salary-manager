"""Tests for the employee seed generator (app.seed.generate_employees).

No test pins an exact generated value (a specific name, email or salary
figure tied to the PRNG sequence); every check is structural, a range, a
comparison between groups, or a round trip through a real conversion
function.
"""

import random
import re
from collections import Counter
from datetime import date

import pytest

from app.money import MAX_SALARY_MAJOR, MIN_SALARY_MAJOR
from app.reference_data import COUNTRY_CURRENCY, CURRENCIES
from app.salary import derive_salary_fields
from app.seed import (
    FIRST_NAMES,
    HIRE_DATE_END,
    HIRE_DATE_START,
    LAST_NAMES,
    GeneratedEmployee,
    generate_employees,
)
from app.seeding import DEFAULT_SEED

# Mirrors the neat-rounding step app.seed uses per currency, kept local so
# this test doesn't just restate the implementation's own constant.
NEAT_STEP = {
    "USD": 500,
    "GBP": 500,
    "EUR": 500,
    "CAD": 500,
    "AUD": 500,
    "SGD": 500,
    "INR": 1_000,
    "JPY": 10_000,
}

# The fixed job catalog, hard-coded here so a reshuffle of app.seed's
# departments or titles shows up as a test failure, not a silent drift.
EXPECTED_TITLE_DEPARTMENT = {
    "Junior Engineer": "Engineering",
    "Engineer": "Engineering",
    "Senior Engineer": "Engineering",
    "Staff Engineer": "Engineering",
    "Engineering Manager": "Engineering",
    "Sales Associate": "Sales",
    "Account Executive": "Sales",
    "Senior Account Executive": "Sales",
    "Sales Manager": "Sales",
    "Marketing Associate": "Marketing",
    "Marketing Manager": "Marketing",
    "Marketing Director": "Marketing",
    "Associate Product Manager": "Product",
    "Product Manager": "Product",
    "Senior Product Manager": "Product",
    "Director of Product": "Product",
    "Financial Analyst": "Finance",
    "Senior Financial Analyst": "Finance",
    "Finance Manager": "Finance",
    "HR Associate": "People",
    "HR Business Partner": "People",
    "HR Director": "People",
}

EMAIL_PATTERN = re.compile(r"^[a-z]+\.[a-z]+\.[0-9]{4,}@acme\.example$")
NAME_PATTERN = re.compile(r"[A-Za-z]+")


def test_first_and_last_names_are_plain_ascii_letters() -> None:
    # Tests the lists directly, not a generated sample -- a single bad name
    # (a space, a hyphen, an accent) must fail here regardless of whether
    # that name happens to get drawn in any one sample.
    for name in FIRST_NAMES:
        assert NAME_PATTERN.fullmatch(name), name
    for name in LAST_NAMES:
        assert NAME_PATTERN.fullmatch(name), name


# Shared, read-only samples for the tests below that only inspect output,
# never mutate it. The determinism tests call generate_employees themselves
# instead of using these, since that's exactly what they're testing.
@pytest.fixture(scope="module")
def employees_500() -> list[GeneratedEmployee]:
    return generate_employees(500, seed=1)


@pytest.fixture(scope="module")
def employees_5000() -> list[GeneratedEmployee]:
    return generate_employees(5_000, seed=1)


# --- basic shape --------------------------------------------------------------


def test_generate_employees_returns_exactly_n_records(
    employees_500: list[GeneratedEmployee],
) -> None:
    assert len(employees_500) == 500


def test_generate_employees_with_zero_returns_an_empty_list() -> None:
    assert generate_employees(0, seed=1) == []


def test_generate_employees_rejects_a_negative_n() -> None:
    with pytest.raises(ValueError):
        generate_employees(-1, seed=1)


# --- determinism ----------------------------------------------------------------


def test_generate_employees_is_deterministic_for_the_same_seed() -> None:
    assert generate_employees(500, seed=1) == generate_employees(500, seed=1)


def test_generate_employees_differs_for_a_different_seed() -> None:
    assert generate_employees(500, seed=1) != generate_employees(500, seed=2)


def test_generate_employees_ignores_the_global_random_module_state() -> None:
    baseline = generate_employees(500, seed=1)
    random.seed(999)
    random.random()
    perturbed = generate_employees(500, seed=1)
    assert perturbed == baseline


# --- emails -----------------------------------------------------------------------


def test_emails_are_unique() -> None:
    # A larger, one-off sample: with ~40x40 name combinations, collisions in
    # the name stem alone are near-certain here if the index suffix were
    # ever dropped, which is what makes this test meaningful.
    employees = generate_employees(2_000, seed=1)
    assert len({e.email for e in employees}) == len(employees)


def test_emails_match_the_expected_pattern(employees_500: list[GeneratedEmployee]) -> None:
    for employee in employees_500:
        assert EMAIL_PATTERN.fullmatch(employee.email), employee.email


def test_names_are_ascii_and_emails_are_lowercase(
    employees_500: list[GeneratedEmployee],
) -> None:
    for employee in employees_500:
        assert employee.full_name.isascii()
        assert employee.email.isascii()
        assert employee.email == employee.email.lower()


# --- country / currency --------------------------------------------------------------


def test_every_record_currency_matches_its_country(
    employees_500: list[GeneratedEmployee],
) -> None:
    for employee in employees_500:
        assert employee.currency == COUNTRY_CURRENCY[employee.country]


def test_country_distribution_is_weighted_not_uniform(
    employees_5000: list[GeneratedEmployee],
) -> None:
    counts = Counter(e.country for e in employees_5000)
    assert counts["US"] > counts["SG"]
    assert counts["US"] > counts["JP"]
    assert counts["IN"] > counts["SG"]
    assert counts["IN"] > counts["JP"]


# --- departments / titles --------------------------------------------------------------


def test_title_to_department_pairs_are_the_expected_fixed_catalog() -> None:
    # A one-off, larger sample so every one of the 22 titles is very likely
    # to appear at least once (the rarest, Engineering Manager, still has an
    # expected count in the dozens at this size).
    employees = generate_employees(3_000, seed=1)
    seen_pairs = {(e.job_title, e.department) for e in employees}
    for title, department in seen_pairs:
        assert EXPECTED_TITLE_DEPARTMENT.get(title) == department
    assert {title for title, _ in seen_pairs} == set(EXPECTED_TITLE_DEPARTMENT)


def test_engineering_is_the_largest_department(employees_5000: list[GeneratedEmployee]) -> None:
    counts = Counter(e.department for e in employees_5000)
    assert counts["Engineering"] == max(counts.values())


def test_junior_engineers_outnumber_engineering_managers(
    employees_5000: list[GeneratedEmployee],
) -> None:
    counts = Counter(e.job_title for e in employees_5000)
    assert counts["Junior Engineer"] > counts["Engineering Manager"]


# --- hire date --------------------------------------------------------------------------


def test_hire_date_is_within_the_fixed_range(employees_500: list[GeneratedEmployee]) -> None:
    for employee in employees_500:
        assert HIRE_DATE_START <= employee.hire_date <= HIRE_DATE_END


def test_hire_date_range_is_the_documented_fixed_range() -> None:
    assert date(2015, 1, 1) == HIRE_DATE_START
    assert date(2026, 9, 30) == HIRE_DATE_END


# --- salary -----------------------------------------------------------------------------


def test_salary_round_trips_through_derive_salary_fields(
    employees_500: list[GeneratedEmployee],
) -> None:
    # Every record must be exactly what derive_salary_fields would produce
    # for its (country, major-unit amount) -- proof the generator calls it
    # rather than repeating the conversion itself.
    for employee in employees_500:
        minor_unit = CURRENCIES[employee.currency].minor_unit
        major = employee.annual_gross_salary_minor // 10**minor_unit
        fields = derive_salary_fields(employee.country, str(major))
        assert fields.currency == employee.currency
        assert fields.annual_gross_salary_minor == employee.annual_gross_salary_minor
        assert fields.annual_gross_salary_usd_cents == employee.annual_gross_salary_usd_cents


def test_salary_is_within_the_configured_min_and_max(
    employees_500: list[GeneratedEmployee],
) -> None:
    for employee in employees_500:
        minor_unit = CURRENCIES[employee.currency].minor_unit
        major = employee.annual_gross_salary_minor // 10**minor_unit
        assert MIN_SALARY_MAJOR <= major <= MAX_SALARY_MAJOR


def test_salary_is_a_neat_figure(employees_500: list[GeneratedEmployee]) -> None:
    for employee in employees_500:
        minor_unit = CURRENCIES[employee.currency].minor_unit
        major = employee.annual_gross_salary_minor // 10**minor_unit
        assert major % NEAT_STEP[employee.currency] == 0


def test_salary_ordering_is_preserved_within_a_country_across_seniority(
    employees_5000: list[GeneratedEmployee],
) -> None:
    for country in COUNTRY_CURRENCY:
        juniors = [
            e.annual_gross_salary_minor
            for e in employees_5000
            if e.country == country and e.job_title == "Junior Engineer"
        ]
        managers = [
            e.annual_gross_salary_minor
            for e in employees_5000
            if e.country == country and e.job_title == "Engineering Manager"
        ]
        if juniors and managers:
            assert max(juniors) <= min(managers)


def test_all_10000_emails_from_the_real_default_seed_are_lowercase() -> None:
    # Verifies the actual production seed (n=10,000, DEFAULT_SEED), not a
    # smaller sample: every email must be exactly its own lowercase form.
    # This matters because case-insensitive duplicate-email detection
    # (EmployeeService) relies entirely on every stored email already being
    # lowercase -- SQLite's own unique constraint on email is case-sensitive
    # (see test_models.py), so a seed that produced mixed-case emails could
    # silently violate the uniqueness guarantee the service assumes.
    employees = generate_employees(10_000, seed=DEFAULT_SEED)
    for employee in employees:
        assert employee.email == employee.email.lower(), employee.email
