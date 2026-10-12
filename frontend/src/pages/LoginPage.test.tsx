import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { getToken, setToken } from '../auth/authStore'
import { API_BASE_URL, TEST_TOKEN } from '../test/handlers'
import { server } from '../test/server'
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
  it('renders labeled username and password fields, not prefilled', () => {
    renderLoginPage()

    expect(screen.getByLabelText('Username')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('logs in with valid credentials, stores the token, and navigates to the default route', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'hr')
    await user.type(screen.getByLabelText('Password'), 'test-password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Employees page')).toBeInTheDocument()
    expect(getToken()).toBe('test-token')
  })

  it('navigates back to the page the user came from after login', async () => {
    const user = userEvent.setup()
    renderLoginPage({ from: '/some-other-page' })

    await user.type(screen.getByLabelText('Username'), 'hr')
    await user.type(screen.getByLabelText('Password'), 'test-password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Some other page')).toBeInTheDocument()
  })

  it('shows a generic error alert on invalid credentials, without the server wording, and clears the password', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'hr')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect username or password')
    expect(screen.queryByText('Employees page')).not.toBeInTheDocument()
    expect(getToken()).toBeNull()
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('shows a session-expired message when arriving via a redirect', () => {
    renderLoginPage({ sessionExpired: true })

    expect(screen.getByText(/session expired, please log in again/i)).toBeInTheDocument()
  })

  it('disables the submit button while the request is in flight', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ token: TEST_TOKEN, expires_in: 3600 })
      }),
    )
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'hr')
    await user.type(screen.getByLabelText('Password'), 'test-password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled()
    await screen.findByText('Employees page')
  })

  it('the show/hide password toggle switches the field between password and text', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    const passwordField = screen.getByLabelText('Password')
    expect(passwordField).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordField).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordField).toHaveAttribute('type', 'password')
  })

  it('redirects to / when already logged in', () => {
    setToken('tok123')
    renderLoginPage()

    expect(screen.getByText('Employees page')).toBeInTheDocument()
  })

  it('has a "Continue browsing read-only" link back to the employee list', () => {
    renderLoginPage()

    expect(screen.getByRole('link', { name: 'Continue browsing read-only' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
