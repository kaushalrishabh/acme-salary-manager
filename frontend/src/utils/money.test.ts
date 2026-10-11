import { describe, expect, it } from 'vitest'

import { formatMoney } from './money'

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
