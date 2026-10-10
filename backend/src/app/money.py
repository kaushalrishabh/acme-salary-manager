"""Exact money helpers using integer arithmetic only."""

import re
from decimal import Decimal

# `usd_rate_scaled` is "USD per 1 major unit" multiplied by RATE_SCALE.
RATE_SCALE = 10**9

MAX_MINOR_UNIT = 3
MAX_AMOUNT_LENGTH = 40

# Salary limits in major units, shared by the seed generator now and the
# input schemas later, so both enforce the same range.
MIN_SALARY_MAJOR = 1
MAX_SALARY_MAJOR = 100_000_000

# ASCII digits with an optional single decimal point between digits.
_AMOUNT_PATTERN = re.compile(r"[0-9]+(?:\.[0-9]+)?")


class InvalidAmountError(ValueError):
    """An amount string that cannot be stored exactly in minor units."""


def round_half_even(numerator: int, denominator: int) -> int:
    """Return numerator over denominator rounded to the nearest int, ties to even."""
    if denominator <= 0:
        raise ValueError("denominator must be positive")
    quotient, remainder = divmod(numerator, denominator)
    doubled = 2 * remainder
    if doubled > denominator or (doubled == denominator and quotient % 2 == 1):
        quotient += 1
    return quotient


def parse_major_to_minor(amount: str, minor_unit: int) -> int:
    """Convert a major-unit string such as "85000.50" to integer minor units."""
    if not isinstance(amount, str):
        raise TypeError("amount must be a string")
    scale = _minor_unit_scale(minor_unit)
    # Validate the format before Decimal sees it, so inputs like "1e999999999"
    # never reach as_integer_ratio().
    if len(amount) > MAX_AMOUNT_LENGTH or _AMOUNT_PATTERN.fullmatch(amount) is None:
        raise InvalidAmountError("not a valid amount")
    numerator, denominator = Decimal(amount).as_integer_ratio()
    minor, remainder = divmod(numerator * scale, denominator)
    if remainder:
        raise InvalidAmountError(f"too many decimal places (at most {minor_unit} allowed)")
    return minor


def minor_to_major(amount_minor: int, minor_unit: int) -> str:
    """Convert integer minor units to an exact major-unit string.

    The exact inverse of parse_major_to_minor. Pure integer divmod, no
    floats. Not defined for negative amounts: every stored salary is
    constrained positive already.
    """
    scale = _minor_unit_scale(minor_unit)
    whole, fraction = divmod(amount_minor, scale)
    if minor_unit == 0:
        return str(whole)
    return f"{whole}.{fraction:0{minor_unit}d}"


def to_usd_cents(amount_minor: int, usd_rate_scaled: int, minor_unit: int) -> int:
    """Convert a local minor-unit amount to USD cents, rounding half to even."""
    scale = _minor_unit_scale(minor_unit)
    if usd_rate_scaled <= 0:
        raise ValueError("usd_rate_scaled must be positive")
    return round_half_even(
        amount_minor * usd_rate_scaled * 100,
        scale * RATE_SCALE,
    )


def _minor_unit_scale(minor_unit: int) -> int:
    """Return 10 ** minor_unit after checking minor_unit is 0..MAX_MINOR_UNIT."""
    if not 0 <= minor_unit <= MAX_MINOR_UNIT:
        raise ValueError(f"minor_unit must be between 0 and {MAX_MINOR_UNIT}")
    scale: int = 10**minor_unit
    return scale
