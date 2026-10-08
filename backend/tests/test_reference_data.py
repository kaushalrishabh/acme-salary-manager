from datetime import date
from fractions import Fraction
from types import MappingProxyType

import pytest

from app.money import RATE_SCALE, to_usd_cents
from app.reference_data import (
    COUNTRY_CURRENCY,
    CURRENCIES,
    RATES_AS_OF,
    RATES_NOTE,
    CurrencyInfo,
)

EXPECTED_COUNTRY_CURRENCY = {
    "IN": "INR",
    "US": "USD",
    "GB": "GBP",
    "DE": "EUR",
    "FR": "EUR",
    "NL": "EUR",
    "CA": "CAD",
    "AU": "AUD",
    "SG": "SGD",
    "JP": "JPY",
}

# The illustrative USD-per-1-major-unit rate for each currency, as an exact
# decimal string (never a float).
RATE_STRINGS = {
    "USD": "1.00",
    "EUR": "1.08",
    "GBP": "1.27",
    "CAD": "0.73",
    "AUD": "0.65",
    "SGD": "0.74",
    "INR": "0.012",
    "JPY": "0.0067",
}

# Round numbers that convert to USD cents with no rounding, so they double as
# an integration check against app.money without depending on tie-breaking.
EXACT_ROUND_TRIPS = [
    ("USD", 12_345, 12_345),  # 123.45 USD is unchanged
    ("EUR", 10_000, 10_800),  # 100.00 EUR -> 108.00 USD
    ("GBP", 10_000, 12_700),  # 100.00 GBP -> 127.00 USD
    ("CAD", 10_000, 7_300),  # 100.00 CAD -> 73.00 USD
    ("AUD", 10_000, 6_500),  # 100.00 AUD -> 65.00 USD
    ("SGD", 10_000, 7_400),  # 100.00 SGD -> 74.00 USD
    ("INR", 100_000, 1_200),  # 1,000.00 INR -> 12.00 USD
    ("JPY", 1_000_000, 670_000),  # 1,000,000 JPY -> 6,700.00 USD
]


# --- COUNTRY_CURRENCY --------------------------------------------------------


def test_country_currency_map_is_exactly_the_expected_countries() -> None:
    assert dict(COUNTRY_CURRENCY) == EXPECTED_COUNTRY_CURRENCY


def test_country_currency_is_immutable() -> None:
    assert isinstance(COUNTRY_CURRENCY, MappingProxyType)
    with pytest.raises(TypeError):
        COUNTRY_CURRENCY["ZZ"] = "USD"  # type: ignore[index]


@pytest.mark.parametrize("country_code", sorted(EXPECTED_COUNTRY_CURRENCY))
def test_country_code_is_two_uppercase_ascii_letters(country_code: str) -> None:
    assert len(country_code) == 2
    assert country_code.isascii()
    assert country_code.isalpha()
    assert country_code == country_code.upper()


# --- CURRENCIES --------------------------------------------------------------


def test_currencies_has_exactly_the_expected_codes() -> None:
    assert set(CURRENCIES) == set(RATE_STRINGS)


def test_every_country_currency_is_a_supported_currency() -> None:
    assert set(COUNTRY_CURRENCY.values()) == set(CURRENCIES)


@pytest.mark.parametrize("currency_code", sorted(RATE_STRINGS))
def test_currency_code_is_three_uppercase_ascii_letters(currency_code: str) -> None:
    assert len(currency_code) == 3
    assert currency_code.isascii()
    assert currency_code.isalpha()
    assert currency_code == currency_code.upper()


def test_currencies_is_immutable() -> None:
    assert isinstance(CURRENCIES, MappingProxyType)
    with pytest.raises(TypeError):
        CURRENCIES["ZZZ"] = CurrencyInfo(minor_unit=2, usd_rate_scaled=RATE_SCALE)  # type: ignore[index]


@pytest.mark.parametrize("currency_code", sorted(RATE_STRINGS))
def test_jpy_has_zero_minor_unit_others_have_two(currency_code: str) -> None:
    expected = 0 if currency_code == "JPY" else 2
    assert CURRENCIES[currency_code].minor_unit == expected


@pytest.mark.parametrize("currency_code", sorted(RATE_STRINGS))
def test_minor_unit_is_an_int_money_accepts(currency_code: str) -> None:
    info = CURRENCIES[currency_code]
    assert type(info.minor_unit) is int
    # Raises ValueError itself if out of app.money's accepted 0..3 range.
    to_usd_cents(0, info.usd_rate_scaled, info.minor_unit)


@pytest.mark.parametrize("currency_code", sorted(RATE_STRINGS))
def test_usd_rate_scaled_is_a_positive_int(currency_code: str) -> None:
    info = CURRENCIES[currency_code]
    assert type(info.usd_rate_scaled) is int
    assert info.usd_rate_scaled > 0


def test_eur_and_jpy_scaled_rates_are_the_expected_literal_values() -> None:
    # Pinned literal values, independent of the Fraction-based check below,
    # so a wrong RATE_SCALE or a wrong derivation can't cancel out.
    assert CURRENCIES["EUR"].usd_rate_scaled == 1_080_000_000
    assert CURRENCIES["JPY"].usd_rate_scaled == 6_700_000


@pytest.mark.parametrize(("currency_code", "rate_string"), sorted(RATE_STRINGS.items()))
def test_usd_rate_scaled_matches_the_illustrative_rate_exactly(
    currency_code: str, rate_string: str
) -> None:
    info = CURRENCIES[currency_code]
    # Independent of how the module derives it: scaled / RATE_SCALE must equal
    # the exact decimal rate, as a fraction (never a float).
    assert Fraction(info.usd_rate_scaled, RATE_SCALE) == Fraction(rate_string)


@pytest.mark.parametrize(("currency_code", "amount_minor", "expected_usd_cents"), EXACT_ROUND_TRIPS)
def test_round_trip_through_money_matches_expected_usd_cents(
    currency_code: str, amount_minor: int, expected_usd_cents: int
) -> None:
    info = CURRENCIES[currency_code]
    assert to_usd_cents(amount_minor, info.usd_rate_scaled, info.minor_unit) == expected_usd_cents


# --- RATES_AS_OF / RATES_NOTE -------------------------------------------------


def test_rates_as_of_is_the_expected_date() -> None:
    assert date(2026, 10, 8) == RATES_AS_OF


def test_rates_note_says_the_rates_are_fixed_illustrative_and_not_live() -> None:
    note = RATES_NOTE.lower()
    assert "illustrative" in note
    assert "not live" in note
