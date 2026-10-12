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

  describe('data table disclosure (replaces the old visually-hidden table)', () => {
    it('is collapsed by default: button aria-expanded="false", table not in the accessibility tree', () => {
      renderChart()

      const button = screen.getByRole('button', { name: 'Show data table' })
      expect(button).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('expands on click, showing the caption, every bucket range/count/percentage, and collapses again on a second click', async () => {
      const user = userEvent.setup()
      renderChart()

      await user.click(screen.getByRole('button', { name: 'Show data table' }))

      const table = screen.getByRole('table')
      expect(within(table).getByText('Salary distribution for United States')).toBeInTheDocument()
      expect(within(table).getByText('$50,000.00–$100,000.00')).toBeInTheDocument()
      expect(within(table).getByText('25')).toBeInTheDocument()
      // 25 of 35 total -- see the `groups`/`headcount` fixture above.
      expect(within(table).getByText('71%')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hide data table' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )

      await user.click(screen.getByRole('button', { name: 'Hide data table' }))

      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show data table' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })

    it('expands via keyboard Enter and Space, not just a click', async () => {
      const user = userEvent.setup()
      renderChart()

      screen.getByRole('button', { name: 'Show data table' }).focus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('table')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Hide data table' }))
      expect(screen.queryByRole('table')).not.toBeInTheDocument()

      screen.getByRole('button', { name: 'Show data table' }).focus()
      await user.keyboard(' ')
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it("the chart's aria-describedby points at the table only while it's expanded", async () => {
      const user = userEvent.setup()
      renderChart()

      const img = screen.getByRole('img', { name: /united states/i })
      expect(img).not.toHaveAttribute('aria-describedby')

      await user.click(screen.getByRole('button', { name: 'Show data table' }))

      const table = screen.getByRole('table')
      expect(img).toHaveAttribute('aria-describedby', table.id)
    })
  })

  it('shows the range-bounds caption', () => {
    renderChart()

    expect(
      screen.getByText(
        /each range includes its lower bound and excludes its upper bound, except the last, which includes the maximum/i,
      ),
    ).toBeInTheDocument()
  })

  it('does not render a legend (a single-series color key adds width/height but no information)', async () => {
    const user = userEvent.setup()
    renderChart()
    await user.click(screen.getByRole('button', { name: 'Show data table' }))

    // "Headcount" still appears exactly once -- the expanded table's
    // column header -- not a second time from a legend entry.
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
