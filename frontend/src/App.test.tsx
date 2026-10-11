import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { routes } from './routes'
import { theme } from './theme'

// A fresh router per test (createMemoryRouter, not the app's shared
// createBrowserRouter singleton in router.tsx): the real router's
// navigation history would otherwise leak across tests, since it's one
// module-level object reused by every render(<App />).
function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const testRouter = createMemoryRouter(routes, { initialEntries: [initialPath] })
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={testRouter} />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

describe('App routing', () => {
  it('renders the app title as a heading, on the default (employees) route', async () => {
    renderApp()

    expect(screen.getByRole('heading', { name: 'HR Salary Manager' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: /search/i })).toBeInTheDocument()
  })

  it('navigates to the Insights route via the nav link', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('textbox', { name: /search/i })

    await user.click(screen.getByRole('link', { name: 'Insights' }))

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /search/i })).not.toBeInTheDocument()
    })
  })

  it('navigates back to Employees via the nav link', async () => {
    const user = userEvent.setup()
    renderApp('/insights')
    await screen.findByText('Insights dashboard coming soon.')

    await user.click(screen.getByRole('link', { name: 'Employees' }))

    expect(await screen.findByRole('textbox', { name: /search/i })).toBeInTheDocument()
  })
})
