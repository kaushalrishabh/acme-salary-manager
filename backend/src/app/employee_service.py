"""Business logic for employees: assembles schema-shaped responses from
EmployeeRepository, formats money fields as exact major-unit strings via
app.money.minor_to_major, and owns the write paths (create/update/delete).

Commit boundary: the repository never commits (see employee_repository.py);
this service commits once per write operation, catching IntegrityError on
that commit as a last-resort guard against a race with the pre-commit
duplicate-email check, and translating it to DuplicateEmailError.
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.employee_repository import EmployeeFilters, EmployeeRepository
from app.errors import DuplicateEmailError, FieldValidationError, NotFoundError
from app.models import Employee
from app.money import InvalidAmountError, minor_to_major
from app.reference_data import CURRENCIES
from app.salary import SalaryFields, derive_salary_fields
from app.schemas import (
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeOptionsResponse,
    EmployeeRead,
    EmployeeUpdate,
)

# The USD column is always cents: two decimal places, regardless of the
# employee's own local currency.
_USD_MINOR_UNIT = 2


class EmployeeService:
    def __init__(self, session: Session) -> None:
        self.session = session
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

    def create_employee(self, data: EmployeeCreate) -> EmployeeRead:
        email = data.email.strip().lower()
        if self.repository.get_by_email(email) is not None:
            raise DuplicateEmailError(f"An employee with email {email!r} already exists")

        fields = self._derive_salary_fields(data.country, data.annual_gross_salary)

        employee = self.repository.create(
            {
                "full_name": data.full_name,
                "email": email,
                "job_title": data.job_title,
                "department": data.department,
                "country": data.country,
                "currency": fields.currency,
                "annual_gross_salary_minor": fields.annual_gross_salary_minor,
                "annual_gross_salary_usd_cents": fields.annual_gross_salary_usd_cents,
                "hire_date": data.hire_date,
            }
        )
        self._commit_or_raise_duplicate()
        return self._to_read(employee)

    def update_employee(self, employee_id: int, data: EmployeeUpdate) -> EmployeeRead:
        employee = self.repository.get(employee_id)
        if employee is None:
            raise NotFoundError(f"Employee {employee_id} not found")

        email = data.email.strip().lower()
        existing = self.repository.get_by_email(email)
        if existing is not None and existing.id != employee_id:
            raise DuplicateEmailError(f"An employee with email {email!r} already exists")

        fields = self._derive_salary_fields(data.country, data.annual_gross_salary)

        self.repository.update(
            employee,
            {
                "full_name": data.full_name,
                "email": email,
                "job_title": data.job_title,
                "department": data.department,
                "country": data.country,
                "currency": fields.currency,
                "annual_gross_salary_minor": fields.annual_gross_salary_minor,
                "annual_gross_salary_usd_cents": fields.annual_gross_salary_usd_cents,
                "hire_date": data.hire_date,
            },
        )
        self._commit_or_raise_duplicate()
        return self._to_read(employee)

    def delete_employee(self, employee_id: int) -> None:
        employee = self.repository.get(employee_id)
        if employee is None:
            raise NotFoundError(f"Employee {employee_id} not found")
        self.repository.delete(employee)
        self.session.commit()

    def _derive_salary_fields(self, country: str, annual_gross_salary: str) -> SalaryFields:
        try:
            return derive_salary_fields(country, annual_gross_salary)
        except InvalidAmountError as exc:
            # Catch before plain ValueError: InvalidAmountError is itself a
            # ValueError subclass, and the two map to different fields.
            raise FieldValidationError("annual_gross_salary", str(exc)) from exc
        except ValueError as exc:
            raise FieldValidationError("country", str(exc)) from exc

    def _commit_or_raise_duplicate(self) -> None:
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise DuplicateEmailError("An employee with this email already exists") from exc

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
