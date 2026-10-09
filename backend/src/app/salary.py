"""Derives an employee's currency, minor-unit salary and USD cents.

This is the one place currency is looked up from country and salary is
converted and range-checked. Every create/update path, and the seed
generator, must call this instead of repeating country lookup, conversion
or the salary limits themselves.
"""

from typing import NamedTuple

from app.money import (
    MAX_SALARY_MAJOR,
    MIN_SALARY_MAJOR,
    InvalidAmountError,
    parse_major_to_minor,
    to_usd_cents,
)
from app.reference_data import COUNTRY_CURRENCY, CURRENCIES


class SalaryFields(NamedTuple):
    currency: str
    annual_gross_salary_minor: int
    annual_gross_salary_usd_cents: int


def derive_salary_fields(country: str, amount_major: str) -> SalaryFields:
    """Derive currency from country, then convert and range-check amount_major.

    amount_major is a decimal string in major units, e.g. "85000.50".

    Raises:
        ValueError: country is not in the supported country/currency map.
        InvalidAmountError: amount_major is malformed, has more decimal
            places than the derived currency allows, or falls outside
            MIN_SALARY_MAJOR..MAX_SALARY_MAJOR.
    """
    currency = COUNTRY_CURRENCY.get(country)
    if currency is None:
        raise ValueError(f"unsupported country: {country!r}")

    info = CURRENCIES[currency]
    minor = parse_major_to_minor(amount_major, info.minor_unit)

    scale = 10**info.minor_unit
    if not MIN_SALARY_MAJOR * scale <= minor <= MAX_SALARY_MAJOR * scale:
        raise InvalidAmountError(
            f"amount must be between {MIN_SALARY_MAJOR} and {MAX_SALARY_MAJOR} major units"
        )

    usd_cents = to_usd_cents(minor, info.usd_rate_scaled, info.minor_unit)
    return SalaryFields(
        currency=currency,
        annual_gross_salary_minor=minor,
        annual_gross_salary_usd_cents=usd_cents,
    )
