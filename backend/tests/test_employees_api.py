"""Integration tests for the employees routes.

Slice 1 (reads): GET /employees, /employees/options, /employees/{id}.
Slice 2 (writes): POST /employees, PUT /employees/{id}, DELETE
/employees/{id}. Auth doesn't exist yet (Slice 4) -- these write routes are
unprotected for now; see docs/design-notes.md.
"""

from collections.abc import Generator
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.employee_repository import EmployeeRepository
from app.main import create_app
from app.models import Employee
from app.salary import derive_salary_fields


@pytest.fixture
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    app = create_app(database_url=f"sqlite:///{tmp_path / 'test.db'}")
    with TestClient(app) as test_client:
        yield test_client


def make_employee(
    client: TestClient,
    *,
    full_name: str = "Ada Lovelace",
    email: str = "ada@example.com",
    job_title: str = "Engineer",
    department: str = "Engineering",
    country: str = "US",
    salary_major: str = "70000",
    hire_date: date = date(2020, 1, 1),
) -> Employee:
    fields = derive_salary_fields(country, salary_major)
    with Session(client.app.state.engine) as session:  # type: ignore[attr-defined]
        employee = Employee(
            full_name=full_name,
            email=email,
            job_title=job_title,
            department=department,
            country=country,
            currency=fields.currency,
            annual_gross_salary_minor=fields.annual_gross_salary_minor,
            annual_gross_salary_usd_cents=fields.annual_gross_salary_usd_cents,
            hire_date=hire_date,
        )
        session.add(employee)
        session.commit()
        session.refresh(employee)
        session.expunge(employee)
    return employee


# --- GET /employees -----------------------------------------------------------------


def test_list_employees_default_params(client: TestClient) -> None:
    make_employee(client, full_name="Ada Lovelace", email="ada@example.com")
    make_employee(client, full_name="Grace Hopper", email="grace@example.com")

    response = client.get("/employees")

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["page_size"] == 25
    assert body["total"] == 2
    assert [item["full_name"] for item in body["items"]] == ["Ada Lovelace", "Grace Hopper"]


def test_list_employees_with_every_query_param(client: TestClient) -> None:
    make_employee(
        client,
        full_name="Ada Lovelace",
        email="ada@example.com",
        country="US",
        department="Engineering",
        job_title="Engineer",
        salary_major="70000",
    )
    make_employee(
        client,
        full_name="Someone Else",
        email="else@example.com",
        country="IN",
        department="Sales",
        job_title="Sales Manager",
        salary_major="1000000",
    )

    response = client.get(
        "/employees",
        params={
            "q": "Ada",
            "country": "US",
            "department": "Engineering",
            "job_title": "Engineer",
            "sort": "salary",
            "order": "desc",
            "page": 1,
            "page_size": 10,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["full_name"] == "Ada Lovelace"
    assert body["page_size"] == 10


def test_list_employees_rejects_an_unknown_sort_field(client: TestClient) -> None:
    response = client.get("/employees", params={"sort": "not-a-real-field"})

    assert response.status_code == 422


def test_list_employees_rejects_a_page_size_over_the_maximum(client: TestClient) -> None:
    response = client.get("/employees", params={"page_size": 101})

    assert response.status_code == 422


# --- GET /employees/options -----------------------------------------------------------


def test_get_options(client: TestClient) -> None:
    make_employee(
        client,
        country="US",
        department="Engineering",
        job_title="Engineer",
        email="a@example.com",
    )
    make_employee(
        client,
        country="IN",
        department="Sales",
        job_title="Sales Manager",
        salary_major="1000000",
        email="b@example.com",
    )

    response = client.get("/employees/options")

    assert response.status_code == 200
    body = response.json()
    assert body["countries"] == ["IN", "US"]
    assert body["departments"] == ["Engineering", "Sales"]
    assert body["job_titles"] == ["Engineer", "Sales Manager"]


# --- GET /employees/{id} ---------------------------------------------------------------


def test_get_employee_by_id(client: TestClient) -> None:
    created = make_employee(client, email="x@example.com")

    response = client.get(f"/employees/{created.id}")

    assert response.status_code == 200
    assert response.json()["id"] == created.id


def test_get_employee_missing_id_returns_404(client: TestClient) -> None:
    response = client.get("/employees/999999")

    assert response.status_code == 404


def _employee_payload(**overrides: Any) -> dict[str, Any]:
    defaults: dict[str, Any] = {
        "full_name": "Ada Lovelace",
        "email": "ada@example.com",
        "job_title": "Engineer",
        "department": "Engineering",
        "country": "US",
        "annual_gross_salary": "70000",
        "hire_date": "2020-01-01",
    }
    defaults.update(overrides)
    return defaults


# --- POST /employees -----------------------------------------------------------------


def test_create_employee_returns_201_with_employee_read_shape(client: TestClient) -> None:
    response = client.post("/employees", json=_employee_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["full_name"] == "Ada Lovelace"
    assert body["email"] == "ada@example.com"
    assert body["currency"] == "USD"
    assert body["annual_gross_salary"] == "70000.00"
    assert "id" in body


def test_create_employee_rejects_an_unknown_field(client: TestClient) -> None:
    response = client.post("/employees", json=_employee_payload(unexpected_field="nope"))

    assert response.status_code == 422


@pytest.mark.parametrize(
    "field",
    [
        "currency",
        "annual_gross_salary_usd",
        "annual_gross_salary_usd_cents",
        "annual_gross_salary_minor",
    ],
)
def test_create_employee_rejects_currency_or_usd_fields_in_the_body(
    client: TestClient, field: str
) -> None:
    response = client.post("/employees", json=_employee_payload(**{field: "anything"}))

    assert response.status_code == 422


def test_create_employee_duplicate_email_returns_409(client: TestClient) -> None:
    client.post("/employees", json=_employee_payload(email="dup@example.com"))

    response = client.post(
        "/employees", json=_employee_payload(email="dup@example.com", full_name="Someone Else")
    )

    assert response.status_code == 409


def test_create_employee_commit_time_integrity_error_returns_409_not_500(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.post("/employees", json=_employee_payload(email="race@example.com"))

    # Simulate a race: the pre-check sees no conflict (as if the other
    # request's commit hadn't landed yet), but the real INSERT still
    # violates the unique constraint -- must surface as 409, not 500.
    monkeypatch.setattr(EmployeeRepository, "get_by_email", lambda self, email: None)

    response = client.post(
        "/employees", json=_employee_payload(email="race@example.com", full_name="Someone Else")
    )

    assert response.status_code == 409


# --- PUT /employees/{id} --------------------------------------------------------------


def test_update_employee_returns_200_with_recomputed_fields(client: TestClient) -> None:
    created = client.post("/employees", json=_employee_payload()).json()

    response = client.put(
        f"/employees/{created['id']}",
        json=_employee_payload(full_name="Ada L.", annual_gross_salary="80000"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Ada L."
    assert body["annual_gross_salary"] == "80000.00"


def test_update_employee_missing_id_returns_404(client: TestClient) -> None:
    response = client.put("/employees/999999", json=_employee_payload())

    assert response.status_code == 404


def test_update_employee_changing_only_country_recomputes_currency_and_usd(
    client: TestClient,
) -> None:
    created = client.post(
        "/employees", json=_employee_payload(country="US", annual_gross_salary="70000")
    ).json()
    original_usd = created["annual_gross_salary_usd"]
    assert created["currency"] == "USD"

    response = client.put(
        f"/employees/{created['id']}",
        json=_employee_payload(country="JP", annual_gross_salary="70000"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["currency"] == "JPY"
    assert body["annual_gross_salary"] == "70000"  # JPY: no decimal point
    assert body["annual_gross_salary_usd"] != original_usd


# --- DELETE /employees/{id} -----------------------------------------------------------


def test_delete_employee_returns_204_then_404_on_get(client: TestClient) -> None:
    created = client.post("/employees", json=_employee_payload()).json()

    delete_response = client.delete(f"/employees/{created['id']}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/employees/{created['id']}")
    assert get_response.status_code == 404
