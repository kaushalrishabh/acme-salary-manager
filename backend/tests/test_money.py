import pytest

from app.money import (
    MAX_SALARY_MAJOR,
    MIN_SALARY_MAJOR,
    InvalidAmountError,
    parse_major_to_minor,
    round_half_even,
    to_usd_cents,
)

# --- round_half_even ---------------------------------------------------------


@pytest.mark.parametrize(
    ("numerator", "denominator", "expected"),
    [
        (8, 4, 2),  # exact
        (9, 4, 2),  # 2.25 rounds down
        (11, 4, 3),  # 2.75 rounds up
        (10, 4, 2),  # 2.5 tie goes to even
        (14, 4, 4),  # 3.5 tie goes to even
        (7, 2, 4),  # average of 3 and 4 cents
        (0, 5, 0),
        (-9, 4, -2),  # -2.25
        (-11, 4, -3),  # -2.75
        (-10, 4, -2),  # -2.5 tie goes to even
        (-14, 4, -4),  # -3.5 tie goes to even
    ],
)
def test_round_half_even(numerator: int, denominator: int, expected: int) -> None:
    assert round_half_even(numerator, denominator) == expected


@pytest.mark.parametrize("denominator", [0, -4])
def test_round_half_even_rejects_non_positive_denominator(denominator: int) -> None:
    with pytest.raises(ValueError):
        round_half_even(10, denominator)


# --- parse_major_to_minor ----------------------------------------------------


@pytest.mark.parametrize(
    ("amount", "minor_unit", "expected"),
    [
        ("85000.50", 2, 8_500_050),
        ("85000.5", 2, 8_500_050),
        ("85000", 2, 8_500_000),
        ("0.01", 2, 1),
        ("1000000", 0, 1_000_000),  # JPY
        ("100.00", 0, 100),  # trailing zeros are not extra precision
        ("007", 0, 7),  # leading zeros are allowed
        ("0", 0, 0),
        ("85000.500", 2, 8_500_050),
    ],
)
def test_parse_major_to_minor(amount: str, minor_unit: int, expected: int) -> None:
    assert parse_major_to_minor(amount, minor_unit) == expected


def test_parse_major_to_minor_is_exact_beyond_default_decimal_precision() -> None:
    # 32 significant digits: more than Decimal's default context precision (28).
    assert (
        parse_major_to_minor("123456789012345678901234567890.12", 2)
        == 12345678901234567890123456789012
    )


@pytest.mark.parametrize(
    ("amount", "minor_unit"),
    [
        ("85000.505", 2),
        ("0.001", 2),
        ("100.5", 0),  # JPY has no minor unit
    ],
)
def test_parse_major_to_minor_rejects_too_many_decimal_places(amount: str, minor_unit: int) -> None:
    with pytest.raises(InvalidAmountError, match="decimal places"):
        parse_major_to_minor(amount, minor_unit)


@pytest.mark.parametrize(
    "amount",
    [
        "",
        "abc",
        "NaN",
        "sNaN",
        "Infinity",
        "-100",  # sign
        "+100",
        "1e3",  # exponent notation
        "1E3",
        "1e999999999",  # must be rejected before any Decimal conversion
        "1_000",  # underscores
        "1,000",
        " 100",  # surrounding whitespace
        "100 ",
        "\t100",
        "100\n",
        "١٠٠",  # Arabic-Indic digits
        "１００",  # fullwidth digits
        "1.2.3",  # more than one decimal point
        "100.",  # decimal point needs digits on both sides
        ".50",
        "1" * 41,  # longer than 40 characters
    ],
)
def test_parse_major_to_minor_rejects_anything_but_plain_digits(amount: str) -> None:
    with pytest.raises(InvalidAmountError, match="not a valid amount"):
        parse_major_to_minor(amount, 2)


def test_parse_major_to_minor_accepts_40_characters() -> None:
    assert parse_major_to_minor("1" * 40, 0) == int("1" * 40)


def test_parse_major_to_minor_returns_int() -> None:
    assert type(parse_major_to_minor("85000.50", 2)) is int


@pytest.mark.parametrize("amount", [85000, None, 85000.5])
def test_parse_major_to_minor_rejects_non_strings(amount: object) -> None:
    with pytest.raises(TypeError):
        parse_major_to_minor(amount, 2)  # type: ignore[arg-type]


@pytest.mark.parametrize("minor_unit", [-1, 4])
def test_parse_major_to_minor_rejects_minor_unit_outside_0_to_3(minor_unit: int) -> None:
    with pytest.raises(ValueError):
        parse_major_to_minor("100", minor_unit)


def test_invalid_amount_error_is_a_value_error() -> None:
    # Pydantic validators turn ValueError into field-level validation errors.
    assert issubclass(InvalidAmountError, ValueError)


# --- to_usd_cents ------------------------------------------------------------

USD_RATE = 1_000_000_000  # 1.0 USD per USD, scaled by 10^9


@pytest.mark.parametrize(
    ("amount_minor", "usd_rate_scaled", "minor_unit", "expected"),
    [
        (12_345, USD_RATE, 2, 12_345),  # USD is unchanged
        (10_000, 1_080_000_000, 2, 10_800),  # 100.00 EUR at 1.08
        (1_000_000, 6_700_000, 0, 670_000),  # 1,000,000 JPY at 0.0067
        (1, 500_000_000, 2, 0),  # 0.5 cents ties to even (0)
        (3, 500_000_000, 2, 2),  # 1.5 cents ties to even (2)
        (1_001, 1_080_000_000, 2, 1_081),  # 10.01 EUR -> 1081.08 cents rounds down
        (1_007, 1_080_000_000, 2, 1_088),  # 10.07 EUR -> 1087.56 cents rounds up
        (1_000, 12_000_000, 2, 12),  # 10.00 INR at 0.012
    ],
)
def test_to_usd_cents(
    amount_minor: int, usd_rate_scaled: int, minor_unit: int, expected: int
) -> None:
    assert to_usd_cents(amount_minor, usd_rate_scaled, minor_unit) == expected


def test_to_usd_cents_returns_int() -> None:
    assert type(to_usd_cents(10_000, 1_080_000_000, 2)) is int


@pytest.mark.parametrize("usd_rate_scaled", [0, -1_080_000_000])
def test_to_usd_cents_rejects_non_positive_rate(usd_rate_scaled: int) -> None:
    with pytest.raises(ValueError):
        to_usd_cents(10_000, usd_rate_scaled, 2)


@pytest.mark.parametrize("minor_unit", [-1, 4])
def test_to_usd_cents_rejects_minor_unit_outside_0_to_3(minor_unit: int) -> None:
    with pytest.raises(ValueError):
        to_usd_cents(10_000, USD_RATE, minor_unit)


# --- salary limits ------------------------------------------------------------


def test_min_salary_major_is_one() -> None:
    assert MIN_SALARY_MAJOR == 1


def test_max_salary_major_is_a_hundred_million() -> None:
    assert MAX_SALARY_MAJOR == 100_000_000


def test_salary_limits_are_ints_ordered_and_fit_comfortably_in_64_bits() -> None:
    assert type(MIN_SALARY_MAJOR) is int
    assert type(MAX_SALARY_MAJOR) is int
    assert 0 < MIN_SALARY_MAJOR < MAX_SALARY_MAJOR
    # The largest minor_unit is 3 decimal places; even then this must fit
    # well inside a 64-bit signed integer (SQLAlchemy's BigInteger).
    assert MAX_SALARY_MAJOR * 10**3 < 2**63
