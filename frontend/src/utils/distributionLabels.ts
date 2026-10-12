import type { DistributionBucket } from '../types/insights'
import { formatCompactMoney, formatMoney } from './money'

// Full precision, for the insights chart's hidden accessible table and its
// tooltip -- never shown on the visible axis, which uses the compact
// labels below instead.
export function buildPreciseRangeLabels(
  distribution: DistributionBucket[],
  currency: string,
): string[] {
  return distribution.map(
    (bucket) =>
      `${formatMoney(bucket.range_min, currency)}–${formatMoney(bucket.range_max, currency)}`,
  )
}

export function buildCompactRangeLabels(
  distribution: DistributionBucket[],
  currency: string,
): string[] {
  return distribution.map(
    (bucket) =>
      `${formatCompactMoney(bucket.range_min, currency)}–${formatCompactMoney(bucket.range_max, currency)}`,
  )
}

// Display-only, derived from integer counts (not money) -- rounds to the
// nearest whole percent for the tooltip's value line and the visible
// bucket table's "Percentage" column.
export function computeBucketPercentage(count: number, headcount: number): number {
  if (headcount <= 0) return 0
  return Math.round((count / headcount) * 100)
}
