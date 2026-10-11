"""Read-only aggregates for insights.

Per dimension (country, department, job_title), exactly two queries:
1. One GROUP BY query returning count/sum/min/max.
2. One bulk query returning (group_value, salary) for every row, grouped in
   Python with itertools.groupby in a single pass.

No business logic here (median, buckets, formatting) -- see
insights_service.py.
"""

from __future__ import annotations  # InstrumentedAttribute[...] is stub-only generic at runtime

import itertools
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.models import Employee


@dataclass(frozen=True)
class DimensionAggregate:
    group_value: str
    count: int
    total: int
    minimum: int
    maximum: int


class InsightsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def country_aggregates(self) -> list[DimensionAggregate]:
        return self._aggregates(Employee.country, Employee.annual_gross_salary_minor)

    def country_sorted_salaries(self) -> dict[str, list[int]]:
        return self._sorted_salaries(Employee.country, Employee.annual_gross_salary_minor)

    def department_aggregates(self) -> list[DimensionAggregate]:
        return self._aggregates(Employee.department, Employee.annual_gross_salary_usd_cents)

    def department_sorted_salaries(self) -> dict[str, list[int]]:
        return self._sorted_salaries(Employee.department, Employee.annual_gross_salary_usd_cents)

    def job_title_aggregates(self) -> list[DimensionAggregate]:
        return self._aggregates(Employee.job_title, Employee.annual_gross_salary_usd_cents)

    def job_title_sorted_salaries(self) -> dict[str, list[int]]:
        return self._sorted_salaries(Employee.job_title, Employee.annual_gross_salary_usd_cents)

    def _aggregates(
        self, group_column: InstrumentedAttribute[str], salary_column: InstrumentedAttribute[int]
    ) -> list[DimensionAggregate]:
        # Labelled "headcount", not "count": a Row object's own .count() is
        # a tuple method, and mypy's Row stub types .count as that method
        # regardless of any per-query label, which a label named "count"
        # would otherwise shadow confusingly.
        # ORDER BY group_column: GROUP BY alone does not guarantee any
        # particular row order. SQLite's current query planner happens to
        # return groups sorted (it computes GROUP BY via a sorted temp
        # B-tree), but that is an incidental implementation detail, not a
        # guarantee -- Postgres, which this schema is kept compatible with,
        # can use hash-based grouping that gives no such ordering at all.
        stmt = (
            select(
                group_column.label("group_value"),
                func.count().label("headcount"),
                func.sum(salary_column).label("total"),
                func.min(salary_column).label("minimum"),
                func.max(salary_column).label("maximum"),
            )
            .group_by(group_column)
            .order_by(group_column)
        )
        rows = self.session.execute(stmt).all()
        return [
            DimensionAggregate(
                group_value=row.group_value,
                count=row.headcount,
                total=row.total,
                minimum=row.minimum,
                maximum=row.maximum,
            )
            for row in rows
        ]

    def _sorted_salaries(
        self, group_column: InstrumentedAttribute[str], salary_column: InstrumentedAttribute[int]
    ) -> dict[str, list[int]]:
        # ORDER BY group_column is what makes itertools.groupby correct: it
        # only merges ADJACENT equal keys, so rows must already be sorted by
        # the group key, regardless of insertion order. The secondary
        # ORDER BY on salary_column gives each group's list in ascending
        # order, which the median calculation requires.
        stmt = select(group_column.label("group_value"), salary_column.label("salary")).order_by(
            group_column, salary_column
        )
        rows = self.session.execute(stmt).all()
        return {
            group_value: [row.salary for row in group_rows]
            for group_value, group_rows in itertools.groupby(rows, key=lambda row: row.group_value)
        }
