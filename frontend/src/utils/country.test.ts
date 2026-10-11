import { describe, expect, it } from 'vitest'

import { formatCountryName } from './country'

describe('formatCountryName', () => {
  it('formats known ISO country codes as their English display name', () => {
    expect(formatCountryName('US')).toBe('United States')
    expect(formatCountryName('GB')).toBe('United Kingdom')
    expect(formatCountryName('IN')).toBe('India')
  })

  it('falls back to the code itself when there is no display name for it', () => {
    expect(formatCountryName('XX')).toBe('XX')
  })
})
