import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { getToken, setToken } from '../auth/authStore'
import { theme } from '../theme'
import { LoginPage } from './LoginPage'

interface LocationState {
  from?: string
  sessionExpired?: boolean
}

function renderLoginPage(state?: LocationState) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const testRouter = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <div>Employees page</div> },
      { path: '/some-other-page', element: <div>Some other page</div> },
    ],
    { initialEntries: [{ pathname: '/login', state }] },
  )
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={testRouter} />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

afterEach(() => {
  setToken(null)
})

describe('LoginPage', () => {
  it('renders username and password fields, not prefilled', () => {
    renderLoginPage()

    expect(screen.getByLabelText(/username/i)).toHaveValue('')
    expect(screen.getByLabelText(/password/i)).toHaveValue('')
  })

  it('logs in with valid credentials, stores the token, and navigates to the default route', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'hr')
    await user.type(screen.getByLabelText(/password/i), 'test-password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Employees page')).toBeInTheDocument()
    expect(getToken()).toBe('test-token')
  })

  it('navigates back to the page the user came from after login', async () => {
    const user = userEvent.setup()
    renderLoginPage({ from: '/some-other-page' })

    await user.type(screen.getByLabelText(/username/i), 'hr')
    await user.type(screen.getByLabelText(/password/i), 'test-password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Some other page')).toBeInTheDocument()
  })

  it('shows the server error message on invalid credentials and does not navigate', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'hr')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument()
    expect(screen.queryByText('Employees page')).not.toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('shows a session-expired message when arriving via a redirect', () => {
    renderLoginPage({ sessionExpired: true })

    expect(screen.getByText(/session expired, please log in again/i)).toBeInTheDocument()
  })
})
