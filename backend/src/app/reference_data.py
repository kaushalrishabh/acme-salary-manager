"""Fixed reference data: country -> currency map and currency rates to USD.

Rates are illustrative and fixed for this exercise, not live market data.
Changing a value here means running the recompute script (see
docs/design-notes.md) so every stored annual_gross_salary_usd_cents is
refreshed to match.
"""

from datetime import date
from types import MappingProxyType
from typing import NamedTuple

from app.money import RATE_SCALE

RATES_AS_OF = date(2026, 10, 8)

RATES_NOTE = "Fixed, illustrative rates to USD; not live market rates."

# One fixed currency per country. A currency may serve several countries
# (EUR), but a country never has more than one currency.
COUNTRY_CURRENCY: MappingProxyType[str, str] = MappingProxyType(
    {
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
)


class CurrencyInfo(NamedTuple):
    minor_unit: int
    usd_rate_scaled: int


# usd_rate_scaled is USD per 1 major unit, multiplied by RATE_SCALE. Each
# value is built from its rate's integer numerator and denominator, e.g.
# 1.08 is 108 / 100, so usd_rate_scaled = 108 * RATE_SCALE // 100. RATE_SCALE
# (10**9) divides evenly by every denominator used below (100, 1_000, 10_000),
# so these divisions are exact, never truncating.
CURRENCIES: MappingProxyType[str, CurrencyInfo] = MappingProxyType(
    {
        "USD": CurrencyInfo(minor_unit=2, usd_rate_scaled=100 * RATE_SCALE // 100),  # 1.00
        "EUR": CurrencyInfo(minor_unit=2, usd_rate_scaled=108 * RATE_SCALE // 100),  # 1.08
        "GBP": CurrencyInfo(minor_unit=2, usd_rate_scaled=127 * RATE_SCALE // 100),  # 1.27
        "CAD": CurrencyInfo(minor_unit=2, usd_rate_scaled=73 * RATE_SCALE // 100),  # 0.73
        "AUD": CurrencyInfo(minor_unit=2, usd_rate_scaled=65 * RATE_SCALE // 100),  # 0.65
        "SGD": CurrencyInfo(minor_unit=2, usd_rate_scaled=74 * RATE_SCALE // 100),  # 0.74
        "INR": CurrencyInfo(minor_unit=2, usd_rate_scaled=12 * RATE_SCALE // 1_000),  # 0.012
        "JPY": CurrencyInfo(minor_unit=0, usd_rate_scaled=67 * RATE_SCALE // 10_000),  # 0.0067
    }
)
