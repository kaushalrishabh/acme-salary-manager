"""Employee routes.

Slice 1: reads (list, options, get by id). Slice 2: writes (create, update,
delete). No try/except here -- the handlers registered in app.main
translate NotFoundError/DuplicateEmailError/FieldValidationError to their
HTTP responses.

Unprotected for now: Depends(require_auth) is not added until Slice 4. Do
not deploy these write routes before auth exists (see docs/design-notes.md).
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.employee_repository import EmployeeFilters
from app.employee_service import EmployeeService
from app.schemas import (
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeOptionsResponse,
    EmployeeRead,
    EmployeeUpdate,
)

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


@router.post("", status_code=201)
def create_employee(data: EmployeeCreate, session: Session = Depends(get_session)) -> EmployeeRead:
    return EmployeeService(session).create_employee(data)


@router.put("/{employee_id}")
def update_employee(
    employee_id: int, data: EmployeeUpdate, session: Session = Depends(get_session)
) -> EmployeeRead:
    return EmployeeService(session).update_employee(employee_id, data)


@router.delete("/{employee_id}", status_code=204)
def delete_employee(employee_id: int, session: Session = Depends(get_session)) -> None:
    EmployeeService(session).delete_employee(employee_id)
