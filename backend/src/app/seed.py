"""Deterministic employee generator for seeding the database.

generate_employees(n, seed) is a pure function: given the same n and seed it
always returns the same list, using its own random.Random(seed) instance and
never the global random module. Salary bands, country pay multipliers, and
department/title weights below are invented for this exercise, not sourced
data (see docs/design-notes.md). GeneratedEmployee is a plain stand-in for
the real EmployeeCreate schema, which doesn't exist yet.
"""

import random
from dataclasses import dataclass
from datetime import date

from app.money import RATE_SCALE, round_half_even
from app.reference_data import COUNTRY_CURRENCY, CURRENCIES
from app.salary import derive_salary_fields

HIRE_DATE_START = date(2015, 1, 1)
HIRE_DATE_END = date(2026, 9, 30)

# Country weights (integers, sum to 100): US and India large, the rest
# smaller, so the per-country charts have real shape.
COUNTRY_WEIGHTS: dict[str, int] = {
    "US": 30,
    "IN": 25,
    "GB": 10,
    "DE": 8,
    "FR": 6,
    "NL": 4,
    "CA": 7,
    "AU": 5,
    "SG": 3,
    "JP": 2,
}

# Pay multiplier per country, applied to a title's USD band before currency
# conversion: "this country pays X% of US-equivalent levels." An exact
# integer fraction (numerator, denominator), never a float.
COUNTRY_PAY_MULTIPLIER: dict[str, tuple[int, int]] = {
    "US": (100, 100),
    "GB": (95, 100),
    "DE": (90, 100),
    "FR": (90, 100),
    "NL": (90, 100),
    "CA": (90, 100),
    "AU": (95, 100),
    "SG": (95, 100),
    "JP": (85, 100),
    "IN": (35, 100),
}

# Rounds a chosen salary to a "neat" figure, per currency.
NEAT_STEP: dict[str, int] = {
    "USD": 500,
    "GBP": 500,
    "EUR": 500,
    "CAD": 500,
    "AUD": 500,
    "SGD": 500,
    "INR": 1_000,
    "JPY": 10_000,
}


@dataclass(frozen=True)
class JobBand:
    department: str
    title: str
    weight: int  # relative weight within its department
    usd_salary_min: int
    usd_salary_max: int


# Six departments, 3-5 titles each, including a seniority ladder in
# Engineering. Weight is relative within the department (a pyramid: more
# junior headcount than senior), not across departments.
JOB_CATALOG: tuple[JobBand, ...] = (
    JobBand("Engineering", "Junior Engineer", 35, 70_000, 90_000),
    JobBand("Engineering", "Engineer", 30, 90_000, 120_000),
    JobBand("Engineering", "Senior Engineer", 20, 120_000, 160_000),
    JobBand("Engineering", "Staff Engineer", 10, 160_000, 210_000),
    JobBand("Engineering", "Engineering Manager", 5, 170_000, 220_000),
    JobBand("Sales", "Sales Associate", 40, 50_000, 70_000),
    JobBand("Sales", "Account Executive", 30, 70_000, 100_000),
    JobBand("Sales", "Senior Account Executive", 20, 100_000, 140_000),
    JobBand("Sales", "Sales Manager", 10, 130_000, 180_000),
    JobBand("Marketing", "Marketing Associate", 50, 55_000, 75_000),
    JobBand("Marketing", "Marketing Manager", 30, 90_000, 130_000),
    JobBand("Marketing", "Marketing Director", 20, 150_000, 200_000),
    JobBand("Product", "Associate Product Manager", 40, 80_000, 100_000),
    JobBand("Product", "Product Manager", 30, 110_000, 150_000),
    JobBand("Product", "Senior Product Manager", 20, 150_000, 190_000),
    JobBand("Product", "Director of Product", 10, 190_000, 240_000),
    JobBand("Finance", "Financial Analyst", 50, 65_000, 85_000),
    JobBand("Finance", "Senior Financial Analyst", 30, 85_000, 115_000),
    JobBand("Finance", "Finance Manager", 20, 120_000, 160_000),
    JobBand("People", "HR Associate", 50, 55_000, 75_000),
    JobBand("People", "HR Business Partner", 30, 85_000, 115_000),
    JobBand("People", "HR Director", 20, 150_000, 200_000),
)

# Engineering and Sales are the largest departments.
DEPARTMENT_WEIGHTS: dict[str, int] = {
    "Engineering": 30,
    "Sales": 20,
    "Product": 15,
    "Marketing": 15,
    "Finance": 10,
    "People": 10,
}

# Plain, fixed first/last name lists: no Faker, whose output for a given
# seed isn't guaranteed stable across its own versions. Deliberately modest
# in size (~40 each) so email-stem collisions are near-certain in a sample
# of a few thousand, which is what makes the uniqueness test meaningful.
FIRST_NAMES: tuple[str, ...] = (
    "Ada",
    "Grace",
    "Alan",
    "Linus",
    "Margaret",
    "John",
    "Katherine",
    "Dennis",
    "Barbara",
    "Edsger",
    "Frances",
    "Donald",
    "Radia",
    "Ken",
    "Shafi",
    "Vint",
    "Hedy",
    "Claude",
    "Jean",
    "Marie",
    "Guido",
    "Tim",
    "Brian",
    "Rob",
    "Anita",
    "James",
    "Karen",
    "Leslie",
    "Peter",
    "Steve",
    "Bjarne",
    "Yukihiro",
    "Rasmus",
    "Larry",
    "Anders",
    "Martin",
    "Joshua",
    "Douglas",
    "Elon",
    "Sundar",
)

LAST_NAMES: tuple[str, ...] = (
    "Lovelace",
    "Hopper",
    "Turing",
    "Torvalds",
    "Hamilton",
    "McCarthy",
    "Johnson",
    "Ritchie",
    "Liskov",
    "Dijkstra",
    "Allen",
    "Knuth",
    "Perlman",
    "Thompson",
    "Okasaki",
    "Cerf",
    "Lamarr",
    "Shannon",
    "Bartik",
    "Curie",
    "Rossum",
    "Engelbart",
    "Kernighan",
    "Pike",
    "Borg",
    "Gosling",
    "Minsky",
    "Lamport",
    "Norvig",
    "Jobs",
    "Stroustrup",
    "Matsumoto",
    "Lerdorf",
    "Wall",
    "Hejlsberg",
    "Odersky",
    "Bloch",
    "Crockford",
    "Musk",
    "Pichai",
)


@dataclass(frozen=True)
class GeneratedEmployee:
    full_name: str
    email: str
    job_title: str
    department: str
    country: str
    currency: str
    annual_gross_salary_minor: int
    annual_gross_salary_usd_cents: int
    hire_date: date


def generate_employees(n: int, seed: int) -> list[GeneratedEmployee]:
    """Generate n deterministic employees for the given seed.

    Uses only this function's own random.Random(seed) instance: the global
    random module is never read or written.
    """
    if n < 0:
        raise ValueError("n must not be negative")

    rng = random.Random(seed)
    countries = list(COUNTRY_WEIGHTS)
    country_weights = list(COUNTRY_WEIGHTS.values())
    departments = list(DEPARTMENT_WEIGHTS)
    department_weights = list(DEPARTMENT_WEIGHTS.values())
    jobs_by_department: dict[str, list[JobBand]] = {department: [] for department in departments}
    for job in JOB_CATALOG:
        jobs_by_department[job.department].append(job)

    start_ordinal = HIRE_DATE_START.toordinal()
    end_ordinal = HIRE_DATE_END.toordinal()

    width = max(4, len(str(n - 1))) if n > 0 else 4

    employees: list[GeneratedEmployee] = []
    for index in range(n):
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        full_name = f"{first} {last}"
        email = _make_email(first, last, index, width)

        country = rng.choices(countries, weights=country_weights, k=1)[0]

        department = rng.choices(departments, weights=department_weights, k=1)[0]
        jobs = jobs_by_department[department]
        job = rng.choices(jobs, weights=[job.weight for job in jobs], k=1)[0]

        hire_date = date.fromordinal(rng.randint(start_ordinal, end_ordinal))

        amount_major = _pick_salary_major(rng, job, country)
        fields = derive_salary_fields(country, str(amount_major))

        employees.append(
            GeneratedEmployee(
                full_name=full_name,
                email=email,
                job_title=job.title,
                department=job.department,
                country=country,
                currency=fields.currency,
                annual_gross_salary_minor=fields.annual_gross_salary_minor,
                annual_gross_salary_usd_cents=fields.annual_gross_salary_usd_cents,
                hire_date=hire_date,
            )
        )

    return employees


def _make_email(first: str, last: str, index: int, width: int) -> str:
    stem = f"{first.lower()}.{last.lower()}"
    stem = "".join(char for char in stem if char.isascii())
    return f"{stem}.{index:0{width}d}@acme.example"


def _pick_salary_major(rng: random.Random, job: JobBand, country: str) -> int:
    raw_usd = rng.randint(job.usd_salary_min, job.usd_salary_max)

    mult_num, mult_den = COUNTRY_PAY_MULTIPLIER[country]
    adjusted_usd = raw_usd * mult_num // mult_den

    currency = COUNTRY_CURRENCY[country]
    info = CURRENCIES[currency]
    local_major_raw = adjusted_usd * RATE_SCALE // info.usd_rate_scaled

    step = NEAT_STEP[currency]
    return round_half_even(local_major_raw, step) * step
