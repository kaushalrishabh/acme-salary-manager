"""Reference-data routes for the frontend: countries, their currency and
decimal places. Public: no auth needed for read-only reference data.
"""

from fastapi import APIRouter

from app.reference_data import COUNTRY_CURRENCY, CURRENCIES
from app.schemas import CountryMeta

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/countries")
def countries() -> list[CountryMeta]:
    return [
        CountryMeta(code=code, currency=currency, minor_unit=CURRENCIES[currency].minor_unit)
        for code, currency in sorted(COUNTRY_CURRENCY.items())
    ]
