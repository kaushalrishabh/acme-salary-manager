"""Integration tests for the Slice 1 routes: GET /employees,
/employees/options, /employees/{id}. No writes, no auth exist yet, so test
data is inserted directly via a session against the running app's engine.
"""

from collections.abc import Generator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
