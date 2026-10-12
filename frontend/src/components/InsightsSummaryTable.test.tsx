import { ThemeProvider } from '@mui/material/styles'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { theme } from '../theme'
import { InsightsSummaryTable, type SummaryGroup } from './InsightsSummaryTable'

const groups: SummaryGroup[] = [
  {
    key: 'US',
    label: 'United States',
    currency: 'USD',
    headcount: 50,
    min: '40000.00',
    max: '200000.00',
    average: '95000.00',
    median: '90000.00',
  },
  {
    key: 'IN',
    label: 'India',
    currency: 'INR',
    headcount: 120,
    min: '500000.00',
    max: '3000000.00',
    average: '1200000.00',
    median: '1100000.00',
  },
]

function renderTable(props: Partial<React.ComponentProps<typeof InsightsSummaryTable>> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <InsightsSummaryTable
        groups={groups}
        groupColumnLabel="Country"
        selectedKey="US"
        onSelectGroup={vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  )
}

describe('InsightsSummaryTable', () => {
  it('renders one row per group, with headcount and formatted money in its own currency', () => {
    renderTable()

    const indiaRow = screen.getByText('India').closest('tr') as HTMLElement
    expect(within(indiaRow).getByText('120')).toBeInTheDocument()
    expect(within(indiaRow).getByText('₹500,000.00')).toBeInTheDocument()
    expect(within(indiaRow).getByText('₹3,000,000.00')).toBeInTheDocument()
  })

  it('every body cell is centred', () => {
    renderTable()

    const row = screen.getByText('India').closest('tr') as HTMLElement
    within(row)
      .getAllByRole('cell')
      .forEach((cell) => {
        expect(cell.className).toContain('MuiTableCell-alignCenter')
      })
  })

  it('sorts by headcount ascending, then descending, on repeated header clicks', async () => {
    const user = userEvent.setup()
    renderTable()

    await user.click(screen.getByRole('button', { name: /headcount/i }))
    let rows = screen.getAllByRole('row').slice(1) // drop the header row
    expect(within(rows[0]).getByText('United States')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /headcount/i }))
    rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('India')).toBeInTheDocument()
  })

  it("clicking a row calls onSelectGroup with that group's key", async () => {
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    renderTable({ onSelectGroup })

    await user.click(screen.getByText('India'))

    expect(onSelectGroup).toHaveBeenCalledWith('IN')
  })
})
