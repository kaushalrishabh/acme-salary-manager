"""Fills currency_rates and employees, and reads the SEED_ON_EMPTY flag.

Commit boundaries, so callers know what's already durable and what isn't:
- ensure_currency_rates does NOT commit; the caller decides when.
- bulk_insert_employees commits itself: it is the one transaction for the
  employee insert, an executemany rather than one ORM object at a time.
- seed_employees_if_empty commits once right after ensure_currency_rates,
  before deciding whether there's anything to seed, so a currency-rates
  fill is never lost even on a run that turns out to insert no employees.
  It then relies on bulk_insert_employees's own commit for the employees.
"""

import logging
import os

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import CurrencyRate, Employee
from app.reference_data import CURRENCIES
from app.seed import GeneratedEmployee, generate_employees

logger = logging.getLogger(__name__)

DEFAULT_EMPLOYEE_COUNT = 10_000
DEFAULT_SEED = 42

_TRUTHY_VALUES = {"1", "true", "yes", "on"}


def ensure_currency_rates(session: Session) -> int:
    """Insert every currency from app.reference_data not already present.

    Idempotent, and never overwrites an existing row even if its rate
    differs from app.reference_data -- updating an existing rate is the
    recompute script's job, not this function's. Does not commit; the
    caller decides when.

    Returns the number of rows inserted.
    """
    existing = set(session.scalars(select(CurrencyRate.currency_code)))
    missing = [
        {
            "currency_code": code,
            "minor_unit": info.minor_unit,
            "usd_rate_scaled": info.usd_rate_scaled,
        }
        for code, info in CURRENCIES.items()
        if code not in existing
    ]
    if missing:
        session.execute(insert(CurrencyRate), missing)
    return len(missing)


def employees_table_is_empty(session: Session) -> bool:
    """True if the employees table has no rows.

    This check *is* the reseed-on-empty definition, nothing more. Read-only;
    nothing to commit.
    """
    return session.execute(select(Employee.id).limit(1)).first() is None


def bulk_insert_employees(session: Session, records: list[GeneratedEmployee]) -> int:
    """Bulk-insert records in one transaction: one executemany, one commit,
    not one ORM object added at a time. Commits itself.

    Does not check whether the table is already populated, and does not
    ensure currency_rates -- callers that skip that step will see an
    IntegrityError from the currency foreign key.
    """
    if not records:
        return 0
    session.execute(
        insert(Employee),
        [
            {
                "full_name": record.full_name,
                "email": record.email,
                "job_title": record.job_title,
                "department": record.department,
                "country": record.country,
                "currency": record.currency,
                "annual_gross_salary_minor": record.annual_gross_salary_minor,
                "annual_gross_salary_usd_cents": record.annual_gross_salary_usd_cents,
                "hire_date": record.hire_date,
            }
            for record in records
        ],
    )
    session.commit()
    return len(records)


def seed_employees_if_empty(
    session: Session, n: int = DEFAULT_EMPLOYEE_COUNT, seed: int = DEFAULT_SEED
) -> int:
    """Ensure currency_rates exists, then bulk-insert n employees only if
    the employees table is currently empty.

    Safe to call regardless of call order elsewhere: it ensures its own
    prerequisite. Commits after ensure_currency_rates (see module
    docstring), then relies on bulk_insert_employees's own commit.

    Returns the number of rows inserted (0 if the table already had rows).
    """
    ensure_currency_rates(session)
    session.commit()

    if not employees_table_is_empty(session):
        return 0

    records = generate_employees(n, seed)
    return bulk_insert_employees(session, records)


def seed_on_empty_enabled() -> bool:
    """SEED_ON_EMPTY from the environment: off unless explicitly truthy."""
    return os.environ.get("SEED_ON_EMPTY", "").strip().lower() in _TRUTHY_VALUES
