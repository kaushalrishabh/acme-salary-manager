"""Tests for app.salary.derive_salary_fields: the one function that turns a
country and a major-unit amount into currency, minor units and USD cents, so
no other code re-derives currency or re-converts money by hand.
"""

from decimal import Decimal
from fractions import Fraction

import pytest

from app.money import InvalidAmountError
from app.salary import SalaryFields, derive_salary_fields

# Mirrors app.reference_data's rates, kept local so this file checks
# derive_salary_fields's correctness independently rather than restating it.
COUNTRY_RATE_STRINGS = {
    "US": "1.00",
    "GB": "1.27",
    "DE": "1.08",
    "FR": "1.08",
    "NL": "1.08",
    "CA": "0.73",
    "AU": "0.65",
    "SG": "0.74",
    "IN": "0.012",
    "JP": "0.0067",
}


def test_derive_salary_fields_derives_currency_from_country() -> None:
    assert derive_salary_fields("DE", "1000").currency == "EUR"
    assert derive_salary_fields("US", "1000").currency == "USD"
    assert derive_salary_fields("JP", "1000").currency == "JPY"


def test_derive_salary_fields_rejects_an_unsupported_country() -> None:
    with pytest.raises(ValueError, match="country"):
        derive_salary_fields("ZZ", "1000")


def test_derive_salary_fields_propagates_invalid_amount_errors() -> None:
    with pytest.raises(InvalidAmountError):
        derive_salary_fields("US", "not-a-number")


def test_derive_salary_fields_rejects_too_many_decimal_places_for_the_currency() -> None:
    # JP -> JPY has zero decimal places.
    with pytest.raises(InvalidAmountError):
        derive_salary_fields("JP", "100.5")


@pytest.mark.parametrize(
    ("country", "amount_major", "expected_minor"),
    [
        ("US", "123.45", 12_345),
        ("DE", "100.00", 10_000),
        ("JP", "1000000", 1_000_000),
        ("IN", "1000.00", 100_000),
    ],
)
def test_derive_salary_fields_converts_to_minor_units(
    country: str, amount_major: str, expected_minor: int
) -> None:
    assert derive_salary_fields(country, amount_major).annual_gross_salary_minor == expected_minor


@pytest.mark.parametrize(
    ("country", "amount_major", "expected_usd_cents"),
    [
        ("US", "123.45", 12_345),
        ("DE", "100.00", 10_800),  # 100 EUR -> 108.00 USD
        ("JP", "1000000", 670_000),  # 1,000,000 JPY -> 6,700.00 USD
        ("IN", "1000.00", 1_200),  # 1,000 INR -> 12.00 USD
    ],
)
def test_derive_salary_fields_usd_cents_matches_known_exact_round_trips(
    country: str, amount_major: str, expected_usd_cents: int
) -> None:
    assert (
        derive_salary_fields(country, amount_major).annual_gross_salary_usd_cents
        == expected_usd_cents
    )


@pytest.mark.parametrize(
    ("country", "amount_major"),
    [
        ("US", "54321.67"),
        ("DE", "88888.88"),
        ("GB", "40000.01"),
        ("CA", "123456.78"),
        ("AU", "99999.99"),
        ("SG", "1234.56"),
        ("IN", "7654321.55"),
        ("JP", "12345678"),
    ],
)
def test_derive_salary_fields_usd_cents_is_within_half_a_cent_of_the_exact_value(
    country: str, amount_major: str
) -> None:
    # Independent of app.money: computes the exact USD value straight from
    # the decimal rate, so this can't pass merely because
    # derive_salary_fields and this check share the same rounding mistake.
    fields = derive_salary_fields(country, amount_major)
    rate = Fraction(COUNTRY_RATE_STRINGS[country])
    exact_usd_cents = Fraction(Decimal(amount_major)) * rate * 100
    assert abs(Fraction(fields.annual_gross_salary_usd_cents) - exact_usd_cents) <= Fraction(1, 2)


@pytest.mark.parametrize("amount_major", ["0", "0.50"])
def test_derive_salary_fields_rejects_amounts_below_the_minimum(amount_major: str) -> None:
    with pytest.raises(InvalidAmountError):
        derive_salary_fields("US", amount_major)


@pytest.mark.parametrize("amount_major", ["1", "100000000"])
def test_derive_salary_fields_accepts_amounts_within_the_configured_limits(
    amount_major: str,
) -> None:
    derive_salary_fields("US", amount_major)  # must not raise


def test_derive_salary_fields_rejects_an_amount_above_the_maximum() -> None:
    with pytest.raises(InvalidAmountError):
        derive_salary_fields("US", "100000001")


def test_salary_fields_is_a_plain_tuple_of_the_three_derived_values() -> None:
    assert derive_salary_fields("US", "100") == SalaryFields(
        currency="USD",
        annual_gross_salary_minor=10_000,
        annual_gross_salary_usd_cents=10_000,
    )
