"""Business logic for employees: assembles schema-shaped responses from
EmployeeRepository, formats money fields as exact major-unit strings via
app.money.minor_to_major. Slice 1: list, get, options. No HTTP, no writes.
"""

from sqlalchemy.orm import Session

from app.employee_repository import EmployeeFilters, EmployeeRepository
from app.errors import NotFoundError
from app.models import Employee
from app.money import minor_to_major
from app.reference_data import CURRENCIES
from app.schemas import EmployeeListResponse, EmployeeOptionsResponse, EmployeeRead

# The USD column is always cents: two decimal places, regardless of the
# employee's own local currency.
_USD_MINOR_UNIT = 2


class EmployeeService:
    def __init__(self, session: Session) -> None:
        self.repository = EmployeeRepository(session)

    def list_employees(
        self,
        filters: EmployeeFilters,
        sort: str,
        order: str,
        page: int,
        page_size: int,
    ) -> EmployeeListResponse:
        rows, total = self.repository.list_employees(filters, sort, order, page, page_size)
        return EmployeeListResponse(
            items=[self._to_read(row) for row in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get_employee(self, employee_id: int) -> EmployeeRead:
        employee = self.repository.get(employee_id)
        if employee is None:
            raise NotFoundError(f"Employee {employee_id} not found")
        return self._to_read(employee)

    def get_options(self) -> EmployeeOptionsResponse:
        options = self.repository.options()
        return EmployeeOptionsResponse(
            countries=options.countries,
            departments=options.departments,
            job_titles=options.job_titles,
        )

    def _to_read(self, employee: Employee) -> EmployeeRead:
        minor_unit = CURRENCIES[employee.currency].minor_unit
        return EmployeeRead(
            id=employee.id,
            full_name=employee.full_name,
            email=employee.email,
            job_title=employee.job_title,
            department=employee.department,
            country=employee.country,
            currency=employee.currency,
            annual_gross_salary=minor_to_major(employee.annual_gross_salary_minor, minor_unit),
            annual_gross_salary_usd=minor_to_major(
                employee.annual_gross_salary_usd_cents, _USD_MINOR_UNIT
            ),
            hire_date=employee.hire_date,
            created_at=employee.created_at,
            updated_at=employee.updated_at,
        )
