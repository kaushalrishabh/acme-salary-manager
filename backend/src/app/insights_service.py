"""Business logic for insights: average, median, and the ceiling-width
bucket rule, on top of InsightsRepository's two-query-per-dimension
aggregates. All integer arithmetic; money fields are formatted as exact
major-unit strings via app.money.minor_to_major.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.insights_repository import DimensionAggregate, InsightsRepository
from app.money import minor_to_major, round_half_even
from app.reference_data import COUNTRY_CURRENCY, CURRENCIES
from app.schemas import (
    CountryInsight,
    CountryInsightsResponse,
    DepartmentInsight,
    DepartmentInsightsResponse,
    DistributionBucket,
    JobTitleInsight,
    JobTitleInsightsResponse,
)

# The USD column is always cents: two decimal places, regardless of any one
# employee's own local currency.
_USD_MINOR_UNIT = 2
_BUCKET_COUNT = 10


@dataclass(frozen=True)
class RawBucket:
    range_min: int
    range_max: int
    count: int


def compute_average(total: int, count: int) -> int:
    return round_half_even(total, count)


def compute_median(sorted_values: list[int]) -> int:
    """sorted_values must already be sorted ascending (InsightsRepository
    guarantees this via its ORDER BY)."""
    count = len(sorted_values)
    mid = count // 2
    if count % 2 == 1:
        return sorted_values[mid]
    return round_half_even(sorted_values[mid - 1] + sorted_values[mid], 2)


def compute_buckets(sorted_values: list[int], minimum: int, maximum: int) -> list[RawBucket]:
    """Ceiling-width rule: always exactly 10 buckets, integer maths only.

    width = ceil((max - min + 1) / 10). Bucket i covers
    [min + i*width, min + (i+1)*width), exclusive, except the last
    *non-empty* bucket, whose range_max is clamped to max (inclusive).
    Buckets past the last non-empty one have range_min == range_max == max
    and count 0. min == max needs no special case: width is 1 and every
    value lands in bucket 0 by the same rule.
    """
    n = maximum - minimum + 1
    width = (n + 9) // 10

    counts = [0] * _BUCKET_COUNT
    for value in sorted_values:
        counts[(value - minimum) // width] += 1

    # sorted_values is ascending, and (value - minimum) // width is
    # monotonic non-decreasing in value, so the last element's bucket index
    # is the highest occupied bucket.
    last_nonempty = (sorted_values[-1] - minimum) // width

    buckets = []
    for i in range(_BUCKET_COUNT):
        if i < last_nonempty:
            range_min = minimum + i * width
            range_max = minimum + (i + 1) * width
        elif i == last_nonempty:
            range_min = minimum + i * width
            range_max = maximum
        else:
            range_min = maximum
            range_max = maximum
        buckets.append(RawBucket(range_min=range_min, range_max=range_max, count=counts[i]))
    return buckets


class InsightsService:
    def __init__(self, session: Session) -> None:
        self.repository = InsightsRepository(session)

    def country_insights(self) -> CountryInsightsResponse:
        sorted_salaries = self.repository.country_sorted_salaries()
        groups = []
        for agg in self.repository.country_aggregates():
            currency = COUNTRY_CURRENCY[agg.group_value]
            minor_unit = CURRENCIES[currency].minor_unit
            groups.append(
                CountryInsight(
                    country=agg.group_value,
                    currency=currency,
                    **self._common_fields(agg, sorted_salaries[agg.group_value], minor_unit),
                )
            )
        return CountryInsightsResponse(groups=groups)

    def department_insights(self) -> DepartmentInsightsResponse:
        sorted_salaries = self.repository.department_sorted_salaries()
        groups = [
            DepartmentInsight(
                department=agg.group_value,
                **self._common_fields(agg, sorted_salaries[agg.group_value], _USD_MINOR_UNIT),
            )
            for agg in self.repository.department_aggregates()
        ]
        return DepartmentInsightsResponse(groups=groups)

    def job_title_insights(self) -> JobTitleInsightsResponse:
        sorted_salaries = self.repository.job_title_sorted_salaries()
        groups = [
            JobTitleInsight(
                job_title=agg.group_value,
                **self._common_fields(agg, sorted_salaries[agg.group_value], _USD_MINOR_UNIT),
            )
            for agg in self.repository.job_title_aggregates()
        ]
        return JobTitleInsightsResponse(groups=groups)

    def _common_fields(
        self, agg: DimensionAggregate, sorted_values: list[int], minor_unit: int
    ) -> dict[str, object]:
        raw_buckets = compute_buckets(sorted_values, agg.minimum, agg.maximum)
        return {
            "headcount": agg.count,
            "min": minor_to_major(agg.minimum, minor_unit),
            "max": minor_to_major(agg.maximum, minor_unit),
            "average": minor_to_major(compute_average(agg.total, agg.count), minor_unit),
            "median": minor_to_major(compute_median(sorted_values), minor_unit),
            "distribution": [
                DistributionBucket(
                    range_min=minor_to_major(b.range_min, minor_unit),
                    range_max=minor_to_major(b.range_max, minor_unit),
                    count=b.count,
                )
                for b in raw_buckets
            ],
        }
