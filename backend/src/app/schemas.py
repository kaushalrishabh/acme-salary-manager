"""Pydantic request/response schemas.

The API speaks major units throughout (annual_gross_salary,
annual_gross_salary_usd -- no _minor/_usd_cents suffix); the ORM layer keeps
those suffixes. This is Slice 1's subset: list and read schemas only.
Create/update schemas are added with the writes slice.
"""

from datetime import date, datetime

from pydantic import BaseModel


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
