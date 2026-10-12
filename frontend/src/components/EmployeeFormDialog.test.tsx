import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_BASE_URL, makeEmployee } from '../test/handlers'
import { server } from '../test/server'
import { theme } from '../theme'
import { GlobalSnackbar } from '../notifications/GlobalSnackbar'
import { EmployeeFormDialog } from './EmployeeFormDialog'

function renderDialog(props: Partial<React.ComponentProps<typeof EmployeeFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  const view = render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <EmployeeFormDialog open onClose={onClose} {...props} />
        <GlobalSnackbar />
      </QueryClientProvider>
    </ThemeProvider>,
  )
  const rerenderWithProps = (nextProps: Partial<React.ComponentProps<typeof EmployeeFormDialog>>) =>
    view.rerender(
      <ThemeProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <EmployeeFormDialog open onClose={onClose} {...props} {...nextProps} />
          <GlobalSnackbar />
        </QueryClientProvider>
      </ThemeProvider>,
    )
  return { onClose, rerenderWithProps }
}

beforeEach(() => {
  server.use(
    http.get(`${API_BASE_URL}/employees/options`, () =>
      HttpResponse.json({
        countries: ['US', 'JP'],
        departments: ['Engineering'],
        job_titles: ['Engineer'],
      }),
    ),
    http.get(`${API_BASE_URL}/meta/countries`, () =>
      HttpResponse.json([
        { code: 'JP', currency: 'JPY', minor_unit: 0 },
        { code: 'US', currency: 'USD', minor_unit: 2 },
      ]),
    ),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
  await user.type(screen.getByLabelText(/^email/i), 'ada@example.com')
  await user.type(screen.getByLabelText(/job title/i), 'Engineer')
  await user.type(screen.getByLabelText(/department/i), 'Engineering')
  await user.click(await screen.findByLabelText(/country/i))
  await user.click(await screen.findByRole('option', { name: 'United States' }))
  await user.type(screen.getByLabelText(/annual gross salary/i), '85000.00')
  const hireDateInput = screen.getByLabelText(/hire date/i)
  await user.clear(hireDateInput)
  await user.type(hireDateInput, '2020-01-01')
}

describe('EmployeeFormDialog: add mode', () => {
  it('renders empty fields', async () => {
    renderDialog()

    expect(screen.getByLabelText(/full name/i)).toHaveValue('')
    expect(screen.getByLabelText(/^email/i)).toHaveValue('')
    expect(await screen.findByLabelText(/department/i)).toHaveValue('')
  })

  it('shows required-field errors and does not submit when the form is empty', async () => {
    let requestCount = 0
    server.use(
      http.post(`${API_BASE_URL}/employees`, () => {
        requestCount += 1
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
    expect(requestCount).toBe(0)
  })

  it('shows an error for a salary that is not a plain decimal number', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText(/annual gross salary/i), 'not-a-number')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText(/enter a plain decimal number/i)).toBeInTheDocument()
  })

  it('shows the currency and decimal hint once a country is picked', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByLabelText(/country/i))
    await user.click(await screen.findByRole('option', { name: 'Japan' }))

    expect(await screen.findByText(/JPY, no decimals/i)).toBeInTheDocument()
  })

  it('submits the exact typed salary string (no parsing) and the country code (not its name)', async () => {
    let capturedBody: Record<string, unknown> | undefined
    server.use(
      http.post(`${API_BASE_URL}/employees`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 1, ...capturedBody }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    const { onClose } = renderDialog()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(capturedBody).toBeDefined())
    expect(capturedBody?.annual_gross_salary).toBe('85000.00')
    expect(capturedBody?.country).toBe('US')
    expect(onClose).toHaveBeenCalled()
  })

  it('maps a 422 field error to that field', async () => {
    server.use(
      http.post(`${API_BASE_URL}/employees`, () =>
        HttpResponse.json(
          {
            detail: [
              {
                loc: ['body', 'annual_gross_salary'],
                msg: 'not a valid amount',
                type: 'value_error',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderDialog()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('not a valid amount')).toBeInTheDocument()
  })

  it('maps a 409 to the email field with the server message', async () => {
    server.use(
      http.post(`${API_BASE_URL}/employees`, () =>
        HttpResponse.json(
          { detail: 'An employee with this email already exists' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderDialog()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(
      await screen.findByText('An employee with this email already exists'),
    ).toBeInTheDocument()
  })

  it("resets to empty fields when closed and reopened for Add again (not left with the previous attempt's typed values)", async () => {
    const user = userEvent.setup()
    const { rerenderWithProps } = renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Half-typed name')
    rerenderWithProps({ open: false })
    rerenderWithProps({ open: true })

    expect(screen.getByLabelText(/full name/i)).toHaveValue('')
  })

  it('shows an unmapped error (500) via the global Snackbar, not as a field error', async () => {
    server.use(
      http.post(`${API_BASE_URL}/employees`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderDialog()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})

describe('EmployeeFormDialog: edit mode', () => {
  it('renders prefilled from the given employee', async () => {
    const employee = makeEmployee({ full_name: 'Grace Hopper', country: 'US' })
    renderDialog({ employee })

    expect(screen.getByLabelText(/full name/i)).toHaveValue('Grace Hopper')
    expect(await screen.findByText('United States')).toBeInTheDocument()
  })

  it('submits the full body via PUT when only one field changed', async () => {
    const employee = makeEmployee({ id: 7, full_name: 'Grace Hopper', country: 'US' })
    let capturedMethod = ''
    let capturedBody: Record<string, unknown> | undefined
    server.use(
      http.put(`${API_BASE_URL}/employees/7`, async ({ request }) => {
        capturedMethod = request.method
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 7, ...capturedBody })
      }),
    )
    const user = userEvent.setup()
    renderDialog({ employee })

    const jobTitleInput = screen.getByLabelText(/job title/i)
    await user.clear(jobTitleInput)
    await user.type(jobTitleInput, 'Principal Engineer')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(capturedBody).toBeDefined())
    expect(capturedMethod).toBe('PUT')
    expect(capturedBody?.full_name).toBe('Grace Hopper')
    expect(capturedBody?.job_title).toBe('Principal Engineer')
  })
})
