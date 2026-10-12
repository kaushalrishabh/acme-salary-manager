import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { theme } from '../theme'
import { API_BASE_URL } from '../test/handlers'
import { server } from '../test/server'
import { InsightsPage } from './InsightsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <InsightsPage />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

describe('InsightsPage', () => {
  it('shows three tabs: Country, Department, Job title', async () => {
    renderPage()

    expect(await screen.findByRole('tab', { name: 'Country' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Department' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Job title' })).toBeInTheDocument()
  })

  it('Country tab: labels groups with their full country name and shows local-currency figures', async () => {
    renderPage()

    expect(await screen.findByText('United States')).toBeInTheDocument()
    expect(screen.getByText('India')).toBeInTheDocument()
    expect(screen.getByText('₹500,000.00')).toBeInTheDocument()
  })

  it('Country tab: defaults the chart to the group with the highest headcount', async () => {
    renderPage()
    await screen.findByText('India')

    // India has headcount 120, the highest in the fixture; US has 50.
    expect(await screen.findByRole('img', { name: /india/i })).toBeInTheDocument()
  })

  it('clicking a different row in the summary table updates the chart', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('img', { name: /india/i })

    await user.click(screen.getByText('United States'))

    expect(await screen.findByRole('img', { name: /united states/i })).toBeInTheDocument()
  })

  it('Department tab: labels are plain department names, figures are USD', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('India')

    await user.click(screen.getByRole('tab', { name: 'Department' }))

    expect(await screen.findByText('Engineering')).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('$60,000.00')).toBeInTheDocument()
  })

  it('Job title tab: labels are plain job titles, figures are USD', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('India')

    await user.click(screen.getByRole('tab', { name: 'Job title' }))

    expect(await screen.findByText('Engineer')).toBeInTheDocument()
    expect(screen.getByText('Sales Manager')).toBeInTheDocument()
  })

  it('shows the range-bounds caption on the chart', async () => {
    renderPage()

    expect(await screen.findByText(/each range includes its lower bound/i)).toBeInTheDocument()
  })

  it('shows "No insights available" when a dimension has no groups', async () => {
    server.use(
      http.get(`${API_BASE_URL}/insights/country`, () => HttpResponse.json({ groups: [] })),
    )
    renderPage()

    expect(await screen.findByText(/no insights available/i)).toBeInTheDocument()
  })

  it('shows an error message with a Retry button, and Retry re-fetches', async () => {
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/insights/country`, () => {
        requestCount += 1
        if (requestCount === 1) {
          return HttpResponse.json({ detail: 'boom' }, { status: 500 })
        }
        return HttpResponse.json({ groups: [] })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /retry/i }))

    expect(await screen.findByText(/no insights available/i)).toBeInTheDocument()
  })

  it('shows the slow-server message once a request has been pending over 5 seconds', async () => {
    server.use(
      http.get(`${API_BASE_URL}/insights/country`, async () => {
        await new Promise(() => {})
        return HttpResponse.json({ groups: [] })
      }),
    )
    renderPage()

    expect(
      await screen.findByText(/waking up the server/i, {}, { timeout: 7000 }),
    ).toBeInTheDocument()
  }, 10000)
})
