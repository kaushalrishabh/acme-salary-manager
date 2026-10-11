import { describe, expect, it } from 'vitest'

import { formatDateOnly, formatUtcTimestamp } from './date'

describe('formatDateOnly', () => {
  it('does not shift the date backward a day in a negative-offset timezone', () => {
    // new Date("2020-01-01") parses as UTC midnight; in any timezone west
    // of UTC that displays as 2019-12-31. formatDateOnly must not do that.
    const result = formatDateOnly('2020-01-01')

    expect(result).not.toContain('2019')
    expect(result).toContain('2020')
  })

  it('formats a date in the middle of the month correctly', () => {
    const result = formatDateOnly('2023-06-15')

    expect(result).toContain('2023')
  })
})

describe('formatUtcTimestamp', () => {
  it('appends Z before parsing a timestamp with no timezone suffix', () => {
    // Without the "Z", `new Date("2020-01-01T00:00:00")` is parsed as LOCAL
    // time, not UTC, which would be wrong -- the backend's created_at is UTC.
    const utcMidnight = formatUtcTimestamp('2020-01-01T00:00:00')
    const utcMidnightWithZ = new Date('2020-01-01T00:00:00Z').toLocaleString()

    expect(utcMidnight).toBe(utcMidnightWithZ)
  })

  it('does not double-append Z if already present', () => {
    const withZ = formatUtcTimestamp('2020-01-01T00:00:00Z')
    const withoutZ = formatUtcTimestamp('2020-01-01T00:00:00')

    expect(withZ).toBe(withoutZ)
  })
})
