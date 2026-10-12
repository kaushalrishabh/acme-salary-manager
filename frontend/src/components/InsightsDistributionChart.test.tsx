import { ThemeProvider } from '@mui/material/styles'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { theme } from '../theme'
import type { DistributionBucket } from '../types/insights'
import { InsightsDistributionChart } from './InsightsDistributionChart'

const distribution: DistributionBucket[] = [
  { range_min: '0.00', range_max: '50000.00', count: 10 },
  { range_min: '50000.00', range_max: '100000.00', count: 25 },
  { range_min: '100000.00', range_max: '150000.00', count: 5 },
]

function renderChart() {
  return render(
    <ThemeProvider theme={theme}>
      <InsightsDistributionChart
        groupLabel="United States"
        currency="USD"
        distribution={distribution}
      />
    </ThemeProvider>,
  )
}

describe('InsightsDistributionChart', () => {
  it('has an accessible name mentioning the group', () => {
    renderChart()

    expect(screen.getByRole('img', { name: /united states/i })).toBeInTheDocument()
  })

  it('includes a visually hidden table with every bucket range and count, for screen readers', () => {
    renderChart()

    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getByText('25')).toBeInTheDocument()
    expect(within(table).getByText('$50,000.00–$100,000.00')).toBeInTheDocument()
  })

  it('shows the range-bounds caption', () => {
    renderChart()

    expect(
      screen.getByText(
        /each range includes its lower bound and excludes its upper bound, except the last, which includes the maximum/i,
      ),
    ).toBeInTheDocument()
  })

  it('does not render a legend (a single-series color key adds width/height but no information)', () => {
    renderChart()

    // "Headcount" still appears exactly once -- the hidden table's header --
    // not a second time from a legend entry.
    expect(screen.getAllByText('Headcount')).toHaveLength(1)
  })
})
