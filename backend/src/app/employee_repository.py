"""Pure data access for employees: list (filter, search, sort, paginate),
get, and options. No business logic, no HTTP awareness. Methods do not
commit; this repository only ever reads.
"""

from __future__ import annotations  # ColumnElement[bool] is stub-only generic at runtime

from dataclasses import dataclass, field

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models import Employee

# Public sort whitelist, mapped to real columns. "salary" means the USD
# column deliberately: it is the one cross-currency-comparable sort key
# (design-notes.md) -- the local-currency column is never a sort key.
SORT_FIELDS = {
    "full_name": Employee.full_name,
    "hire_date": Employee.hire_date,
    "salary": Employee.annual_gross_salary_usd_cents,
}


@dataclass(frozen=True)
class EmployeeFilters:
    q: str | None = None
    country: str | None = None
    department: str | None = None
    job_title: str | None = None


@dataclass(frozen=True)
class EmployeeOptions:
    countries: list[str] = field(default_factory=list)
    departments: list[str] = field(default_factory=list)
    job_titles: list[str] = field(default_factory=list)


def _escape_like(value: str) -> str:
    """Backslash-escape LIKE's own wildcard characters in user input, so a
    literal % or _ in a search term is matched literally, not as a wildcard.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class EmployeeRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_employees(
        self,
        filters: EmployeeFilters,
        sort: str,
        order: str,
        page: int,
        page_size: int,
    ) -> tuple[list[Employee], int]:
        conditions = self._conditions(filters)

        count_stmt = select(func.count()).select_from(Employee)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = self.session.execute(count_stmt).scalar_one()

        sort_column = SORT_FIELDS[sort]
        order_by = sort_column.desc() if order == "desc" else sort_column.asc()

        stmt = select(Employee)
        if conditions:
            stmt = stmt.where(*conditions)
        stmt = (
            stmt.order_by(order_by, Employee.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = list(self.session.scalars(stmt))
        return rows, total

    def get(self, employee_id: int) -> Employee | None:
        return self.session.get(Employee, employee_id)

    def options(self) -> EmployeeOptions:
        countries = sorted(self.session.scalars(select(Employee.country).distinct()))
        departments = sorted(self.session.scalars(select(Employee.department).distinct()))
        job_titles = sorted(self.session.scalars(select(Employee.job_title).distinct()))
        return EmployeeOptions(countries=countries, departments=departments, job_titles=job_titles)

    def _conditions(self, filters: EmployeeFilters) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if filters.country:
            conditions.append(Employee.country == filters.country)
        if filters.department:
            conditions.append(Employee.department == filters.department)
        if filters.job_title:
            conditions.append(Employee.job_title == filters.job_title)
        if filters.q:
            pattern = f"%{_escape_like(filters.q.lower())}%"
            conditions.append(
                or_(
                    func.lower(Employee.full_name).like(pattern, escape="\\"),
                    func.lower(Employee.email).like(pattern, escape="\\"),
                )
            )
        return conditions
