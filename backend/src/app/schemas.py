"""Pydantic request/response schemas.

The API speaks major units throughout (annual_gross_salary,
annual_gross_salary_usd -- no _minor/_usd_cents suffix); the ORM layer keeps
those suffixes.

EmployeeCreate/EmployeeUpdate hold structural rules only (right types,
length bounds, extra="forbid"). Country membership and salary
format/limits are business rules, not structure, so they are not
duplicated here -- they are enforced once, by app.salary.derive_salary_fields,
via the service.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmployeeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    job_title: str = Field(min_length=1, max_length=100)
    department: str = Field(min_length=1, max_length=100)
    country: str
    annual_gross_salary: str
    hire_date: date


class EmployeeUpdate(EmployeeCreate):
    """Identical shape to EmployeeCreate: PUT is always a full body."""


class EmployeeRead(BaseModel):
    id: int
    full_name: str
    email: str
    job_title: str
    department: str
    country: str
    currency: str
    annual_gross_salary: str
    annual_gross_salary_usd: str
    hire_date: date
    created_at: datetime
    updated_at: datetime


class EmployeeListResponse(BaseModel):
    items: list[EmployeeRead]
    total: int
    page: int
    page_size: int


class EmployeeOptionsResponse(BaseModel):
    countries: list[str]
    departments: list[str]
    job_titles: list[str]
