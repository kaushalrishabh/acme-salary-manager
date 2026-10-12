import { ThemeProvider } from '@mui/material/styles'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { theme } from '../theme'
import type { DistributionBucket } from '../types/insights'
import { buildCompactRangeLabels } from '../utils/distributionLabels'
import { InsightsDistributionChart } from './InsightsDistributionChart'
import type { SummaryGroup } from './InsightsSummaryTable'

const distribution: DistributionBucket[] = [
  { range_min: '0.00', range_max: '50000.00', count: 10 },
  { range_min: '50000.00', range_max: '100000.00', count: 25 },
  { range_min: '100000.00', range_max: '150000.00', count: 5 },
]

const groups: SummaryGroup[] = [
  {
    key: 'US',
    label: 'United States',
    currency: 'USD',
    headcount: 35,
    min: '40000.00',
    max: '150000.00',
    average: '90000.00',
    median: '85000.00',
    distribution,
  },
  {
    key: 'JP',
    label: 'Japan',
    currency: 'JPY',
    headcount: 12,
    min: '6700000',
    max: '8500000',
    average: '7200000',
    median: '7100000',
    distribution,
  },
]

function renderChart(props: Partial<React.ComponentProps<typeof InsightsDistributionChart>> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <InsightsDistributionChart
        groupLabel="United States"
        currency="USD"
        headcount={35}
        distribution={distribution}
        groups={groups}
        selectedKey="US"
        onSelectGroup={vi.fn()}
        {...props}
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

  it('puts the clipping styles on a wrapping div, not the table itself (tables do not shrink/clip the way divs do)', () => {
    renderChart()

    const table = screen.getByRole('table', { hidden: true })
    const wrapper = table.parentElement as HTMLElement

    expect(wrapper.tagName).toBe('DIV')
    expect(getComputedStyle(wrapper).position).toBe('absolute')
    expect(getComputedStyle(wrapper).overflow).toBe('hidden')
    expect(getComputedStyle(table).position).not.toBe('absolute')
    expect(getComputedStyle(table).overflow).not.toBe('hidden')
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

  it('has a heading naming the group, with headcount and currency in the subtitle', () => {
    renderChart()

    expect(
      screen.getByRole('heading', { name: 'Salary distribution: United States' }),
    ).toBeInTheDocument()
    expect(screen.getByText('35 employees, amounts in USD')).toBeInTheDocument()
  })

  // @mui/x-charts sizes the chart from the container's measured width
  // (ResizeObserver / getBoundingClientRect), both of which jsdom reports
  // as all-zero since it does no real layout -- the chart never renders
  // visible tick-label text here regardless of what the code does, so
  // there's no reliable way to assert on the rendered SVG in this
  // environment. buildCompactRangeLabels is the extracted, directly
  // testable function that actually produces the x-axis's label strings;
  // InsightsDistributionChart passes its result straight to xAxis[0].data.
  describe('x-axis compact labels (buildCompactRangeLabels)', () => {
    it('formats a USD group ($50K style, one decimal when not a round thousand)', () => {
      expect(buildCompactRangeLabels(distribution, 'USD')).toEqual([
        '$0–$50K',
        '$50K–$100K',
        '$100K–$150K',
      ])
    })

    it('formats a JPY group in millions, Western-style, not the locale-default 10,000s grouping', () => {
      expect(
        buildCompactRangeLabels([{ range_min: '6700000', range_max: '8500000', count: 12 }], 'JPY'),
      ).toEqual(['¥6.7M–¥8.5M'])
    })
  })

  it('has a visible group selector listing every group, in sync with the selected key', async () => {
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    renderChart({ onSelectGroup })

    const select = screen.getByRole('combobox', { name: 'Select group for chart' })
    expect(select).toHaveTextContent('United States')

    await user.click(select)
    await user.click(await screen.findByRole('option', { name: 'Japan' }))

    expect(onSelectGroup).toHaveBeenCalledWith('JP')
  })
})
