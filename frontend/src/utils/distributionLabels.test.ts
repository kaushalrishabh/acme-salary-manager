import { describe, expect, it } from 'vitest'

import type { DistributionBucket } from '../types/insights'
import {
  buildCompactRangeLabels,
  buildPreciseRangeLabels,
  computeBucketPercentage,
} from './distributionLabels'

const distribution: DistributionBucket[] = [
  { range_min: '0.00', range_max: '50000.00', count: 10 },
  { range_min: '50000.00', range_max: '100000.00', count: 25 },
]

describe('buildPreciseRangeLabels', () => {
  it('formats each bucket as a full-precision range', () => {
    expect(buildPreciseRangeLabels(distribution, 'USD')).toEqual([
      '$0.00–$50,000.00',
      '$50,000.00–$100,000.00',
    ])
  })
})

describe('buildCompactRangeLabels', () => {
  it('formats each bucket as a compact range', () => {
    expect(buildCompactRangeLabels(distribution, 'USD')).toEqual(['$0–$50K', '$50K–$100K'])
  })
})

describe('computeBucketPercentage', () => {
  it('rounds to the nearest whole percent', () => {
    expect(computeBucketPercentage(25, 100)).toBe(25)
    expect(computeBucketPercentage(1, 3)).toBe(33)
  })

  it('returns 0 when headcount is 0 (avoids dividing by zero)', () => {
    expect(computeBucketPercentage(0, 0)).toBe(0)
  })
})
