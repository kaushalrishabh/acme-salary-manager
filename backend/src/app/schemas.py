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


class DistributionBucket(BaseModel):
    range_min: str
    range_max: str
    count: int


class CountryInsight(BaseModel):
    country: str
    currency: str
    headcount: int
    min: str
    max: str
    average: str
    median: str
    distribution: list[DistributionBucket]


class DepartmentInsight(BaseModel):
    department: str
    # Deliberately no currency field at all (not null, absent): this
    # dimension spans countries, so it has no single local currency.
    headcount: int
    min: str
    max: str
    average: str
    median: str
    distribution: list[DistributionBucket]


class JobTitleInsight(BaseModel):
    job_title: str
    headcount: int
    min: str
    max: str
    average: str
    median: str
    distribution: list[DistributionBucket]


class CountryInsightsResponse(BaseModel):
    groups: list[CountryInsight]


class DepartmentInsightsResponse(BaseModel):
    groups: list[DepartmentInsight]


class JobTitleInsightsResponse(BaseModel):
    groups: list[JobTitleInsight]


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    expires_in: int


class CountryMeta(BaseModel):
    code: str
    currency: str
    minor_unit: int
