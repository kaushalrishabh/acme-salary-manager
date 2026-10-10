"""Employee routes. Slice 1: reads only (list, options, get by id)."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.employee_repository import EmployeeFilters
from app.employee_service import EmployeeService
from app.schemas import EmployeeListResponse, EmployeeOptionsResponse, EmployeeRead

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("")
def list_employees(
    q: str | None = None,
    country: str | None = None,
    department: str | None = None,
    job_title: str | None = None,
    sort: Literal["full_name", "hire_date", "salary"] = "full_name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> EmployeeListResponse:
    filters = EmployeeFilters(q=q, country=country, department=department, job_title=job_title)
    return EmployeeService(session).list_employees(filters, sort, order, page, page_size)


# Must be registered before "/{employee_id}", or FastAPI would try to parse
# "options" as an int path parameter and 422 instead of routing here.
@router.get("/options")
def get_options(session: Session = Depends(get_session)) -> EmployeeOptionsResponse:
    return EmployeeService(session).get_options()


@router.get("/{employee_id}")
def get_employee(employee_id: int, session: Session = Depends(get_session)) -> EmployeeRead:
    return EmployeeService(session).get_employee(employee_id)
