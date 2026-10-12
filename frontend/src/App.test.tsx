import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { getToken, notifySessionExpired, setToken } from './auth/authStore'
import { API_BASE_URL, TEST_PASSWORD, TEST_USERNAME } from './test/handlers'
import { server } from './test/server'
import { routes } from './routes'
import { theme } from './theme'

afterEach(() => {
  setToken(null)
})

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
    await screen.findByRole('tab', { name: 'Country' })

    await user.click(screen.getByRole('link', { name: 'Employees' }))

    expect(await screen.findByRole('textbox', { name: /search/i })).toBeInTheDocument()
  })
})

describe('App auth-aware AppBar', () => {
  it('shows a Login link when logged out', async () => {
    renderApp()
    await screen.findByRole('textbox', { name: /search/i })

    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()
  })

  it('shows a Logout button when logged in, and clicking it logs out', async () => {
    setToken('tok123')
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('textbox', { name: /search/i })
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Logout' }))

    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument()
  })
})

describe('App session-expired handling', () => {
  it('a session expiring redirects to /login with the session-expired message', async () => {
    setToken('tok123')
    renderApp('/insights')
    await screen.findByRole('tab', { name: 'Country' })

    notifySessionExpired()

    expect(await screen.findByText(/session expired, please log in again/i)).toBeInTheDocument()
  })

  it('a write that gets 401 clears the token, shows the message, redirects to /login, and returns to the original page after logging back in', async () => {
    setToken('tok123')
    server.use(
      http.delete(`${API_BASE_URL}/employees/1`, () =>
        HttpResponse.json({ detail: 'Token expired' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderApp('/')
    await screen.findByRole('textbox', { name: /search/i })

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/session expired, please log in again/i)).toBeInTheDocument()
    expect(getToken()).toBeNull()

    await user.type(screen.getByLabelText(/username/i), TEST_USERNAME)
    await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: /log in/i }))

    // Back on the page the 401 happened on (the employee list -- the only
    // page with a write action), not stuck on /login or bounced elsewhere.
    expect(await screen.findByRole('textbox', { name: /search/i })).toBeInTheDocument()
  })

  it('a token already present at page load (as if restored from sessionStorage) that the server rejects triggers the same flow on the first write', async () => {
    // authStore's own unit tests prove it hydrates getToken() from
    // sessionStorage at module load; from apiFetch's point of view a
    // restored token and one set this session are the same string, so
    // setToken() here (rather than a real module reset) exercises the
    // identical first-write-fails code path without the fragility of
    // reloading React's module graph mid-test-file.
    setToken('corrupted-token-value')
    server.use(
      http.delete(`${API_BASE_URL}/employees/1`, () =>
        HttpResponse.json({ detail: 'Token expired' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderApp('/')
    await screen.findByRole('textbox', { name: /search/i })
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/session expired, please log in again/i)).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})
