"""Tests for GET /meta/countries: a public endpoint the employee form
uses to show the currency and decimal places for a chosen country.
Country *display names* come from the frontend's own formatCountryName
helper, not from this endpoint.
"""

from fastapi.testclient import TestClient

from app.reference_data import COUNTRY_CURRENCY, CURRENCIES


def test_meta_countries_returns_200_and_a_list(client: TestClient) -> None:
    response = client.get("/meta/countries")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_meta_countries_entry_shape(client: TestClient) -> None:
    response = client.get("/meta/countries")

    for entry in response.json():
        assert set(entry.keys()) == {"code", "currency", "minor_unit"}
        assert isinstance(entry["code"], str)
        assert isinstance(entry["currency"], str)
        assert isinstance(entry["minor_unit"], int)


def test_meta_countries_is_sorted_by_code(client: TestClient) -> None:
    response = client.get("/meta/countries")

    codes = [entry["code"] for entry in response.json()]
    assert codes == sorted(codes)


def test_meta_countries_covers_every_supported_country(client: TestClient) -> None:
    response = client.get("/meta/countries")

    codes = {entry["code"] for entry in response.json()}
    assert codes == set(COUNTRY_CURRENCY)


def test_meta_countries_currency_and_minor_unit_match_reference_data(
    client: TestClient,
) -> None:
    response = client.get("/meta/countries")

    for entry in response.json():
        expected_currency = COUNTRY_CURRENCY[entry["code"]]
        assert entry["currency"] == expected_currency
        assert entry["minor_unit"] == CURRENCIES[expected_currency].minor_unit
