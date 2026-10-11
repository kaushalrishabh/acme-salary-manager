"""Tests for InsightsService: average, median, and the ceiling-width
bucket rule, all integer arithmetic, plus the schema-level currency
presence/absence per dimension.
"""

from app.insights_service import compute_average, compute_buckets, compute_median
from app.schemas import CountryInsight, DepartmentInsight, JobTitleInsight

# --- average -------------------------------------------------------------------------


def test_average_uses_round_half_even_not_naive_division() -> None:
    # sum=7, count=2 -> 3.5 -> ties to even -> 4, not 3 (floor) and not a
    # naive "round half up" of 4 either by coincidence; picked so the
    # half-even and half-up conventions would actually agree here, and the
    # *other* parametrized case below is the one that tells them apart.
    assert compute_average(7, 2) == 4


def test_average_tie_where_naive_rounding_would_differ() -> None:
    # sum=201, count=2 -> 100.5. round-half-even rounds to 100 (even stays);
    # naive round-half-up would give 101. This is the case that actually
    # distinguishes the two conventions.
    assert compute_average(201, 2) == 100


def test_average_non_tie_case() -> None:
    assert compute_average(300, 3) == 100


# --- median --------------------------------------------------------------------------


def test_median_odd_count_is_the_middle_value() -> None:
    assert compute_median([10, 20, 30]) == 20


def test_median_even_count_uses_round_half_even_of_the_two_middle_values() -> None:
    assert compute_median([100, 104]) == 102


def test_median_even_count_tie_where_naive_rounding_would_differ() -> None:
    # 100 and 101: sum=201, /2=100.5. round-half-even -> 100 (even stays).
    # A naive "round half up" on the float 100.5 would give 101 instead.
    assert compute_median([100, 101]) == 100


# --- buckets ---------------------------------------------------------------------------


def test_buckets_range_of_9_has_one_value_per_bucket_then_a_trailing_empty_bucket() -> None:
    # n=9, width=(9+9)//10=1. Values 100..108, one each. last_nonempty=8:
    # bucket 8 is the last *non-empty* bucket (clamped to max), bucket 9 is
    # a trailing empty bucket past max -- this is "a range under 10".
    values = list(range(100, 109))
    buckets = compute_buckets(values, minimum=100, maximum=108)

    assert len(buckets) == 10
    for i in range(8):
        assert buckets[i].range_min == 100 + i
        assert buckets[i].range_max == 100 + i + 1
        assert buckets[i].count == 1
    assert buckets[8].range_min == 108
    assert buckets[8].range_max == 108  # clamped to max, inclusive
    assert buckets[8].count == 1
    assert buckets[9].range_min == 108
    assert buckets[9].range_max == 108
    assert buckets[9].count == 0
    assert sum(b.count for b in buckets) == 9


def test_buckets_range_of_99_fills_all_ten_buckets_with_the_last_clamped() -> None:
    # n=99, width=(99+9)//10=10. Values 0..98, one each. last_nonempty=9:
    # every bucket is non-empty, no trailing buckets at all.
    values = list(range(0, 99))
    buckets = compute_buckets(values, minimum=0, maximum=98)

    assert len(buckets) == 10
    for i in range(9):
        assert buckets[i].range_min == i * 10
        assert buckets[i].range_max == (i + 1) * 10
        assert buckets[i].count == 10
    assert buckets[9].range_min == 90
    assert buckets[9].range_max == 98  # clamped to max, inclusive
    assert buckets[9].count == 9
    assert sum(b.count for b in buckets) == 99


def test_buckets_min_equals_max_needs_no_special_case() -> None:
    values = [50_000] * 5
    buckets = compute_buckets(values, minimum=50_000, maximum=50_000)

    assert buckets[0].range_min == 50_000
    assert buckets[0].range_max == 50_000
    assert buckets[0].count == 5
    for i in range(1, 10):
        assert buckets[i].range_min == 50_000
        assert buckets[i].range_max == 50_000
        assert buckets[i].count == 0


def test_buckets_a_different_range_under_10_has_several_trailing_empty_buckets() -> None:
    # n=4, width=1. Values 100..103, one each. last_nonempty=3, so buckets
    # 4..9 (six of them) are all trailing and empty -- distinct from the
    # range-of-9 case above, which only has one trailing bucket.
    values = [100, 101, 102, 103]
    buckets = compute_buckets(values, minimum=100, maximum=103)

    assert buckets[3].range_min == 103
    assert buckets[3].range_max == 103  # clamped
    assert buckets[3].count == 1
    for i in range(4, 10):
        assert buckets[i].range_min == 103
        assert buckets[i].range_max == 103
        assert buckets[i].count == 0
    assert sum(b.count for b in buckets) == 4


def test_bucket_counts_always_sum_to_the_group_headcount() -> None:
    # An irregular, non-round-number spread, not a multiple of 10 or of any
    # width -- a generic check that no value is dropped or double-counted.
    values = sorted(v * 137 % 9973 + 1 for v in range(37))
    buckets = compute_buckets(values, minimum=values[0], maximum=values[-1])

    assert sum(b.count for b in buckets) == len(values)


# --- currency presence per dimension (schema-level, not null -- absent) --------------


def test_country_insight_schema_has_a_currency_field() -> None:
    assert "currency" in CountryInsight.model_fields


def test_department_insight_schema_has_no_currency_field_at_all() -> None:
    assert "currency" not in DepartmentInsight.model_fields


def test_job_title_insight_schema_has_no_currency_field_at_all() -> None:
    assert "currency" not in JobTitleInsight.model_fields
