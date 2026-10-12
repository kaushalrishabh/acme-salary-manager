import { describe, expect, it } from 'vitest'

import { formatCompactMoney, formatMoney } from './money'

describe('formatMoney', () => {
  it('formats a 2-decimal currency with the currency symbol and two decimals', () => {
    const result = formatMoney('85000.50', 'USD')

    expect(result).toContain('85,000.50')
  })

  it('formats JPY with no decimal places', () => {
    const result = formatMoney('6500000', 'JPY')

    expect(result).toContain('6,500,000')
    expect(result).not.toContain('.00')
  })

  it('formats a currency other than USD/JPY with its own symbol', () => {
    const result = formatMoney('1234.00', 'INR')

    expect(result).toContain('1,234.00')
  })
})

describe('formatCompactMoney', () => {
  it('formats USD as a whole-K compact amount', () => {
    expect(formatCompactMoney('50000.00', 'USD')).toBe('$50K')
  })

  it('shows one decimal place when the value is not a round thousand', () => {
    expect(formatCompactMoney('68800.00', 'USD')).toBe('$68.8K')
  })

  it('formats JPY in millions, not the locale-default 10,000s grouping', () => {
    expect(formatCompactMoney('6700000', 'JPY')).toBe('¥6.7M')
    expect(formatCompactMoney('8500000', 'JPY')).toBe('¥8.5M')
  })
})
