import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setToken } from '../auth/authStore'
import { GlobalSnackbar } from '../notifications/GlobalSnackbar'
import { theme } from '../theme'
import { API_BASE_URL, defaultEmployees, makeEmployee } from '../test/handlers'
import { server } from '../test/server'
import { EmployeeTable } from './EmployeeTable'

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    // The real app theme, not MUI's default -- some behavior (e.g. the
    // Autocomplete clear indicator's forced visibility) is a theme-level
    // style override that only applies under this ThemeProvider, same as
    // in production. MemoryRouter: the read-only Alert's Login button is a
    // react-router Link, which needs a Router context even outside the
    // real app shell.
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <EmployeeTable />
          <GlobalSnackbar />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

function captureEmployeesRequests(): URL[] {
  const requests: URL[] = []
  server.use(
    http.get(`${API_BASE_URL}/employees`, ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json({
        items: defaultEmployees,
        // Larger than defaultEmployees.length so the "next page" control
        // isn't disabled -- these tests only care about the request sent,
        // not a realistic full result set.
        total: 100,
        page: 1,
        page_size: 25,
      })
    }),
  )
  return requests
}

describe('EmployeeTable', () => {
  it('renders a row per employee returned by the API', async () => {
    renderTable()

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
  })

  it('does not show a standalone employee count above the table; the pagination footer still shows the total', async () => {
    captureEmployeesRequests() // total: 100, distinct from defaultEmployees.length
    renderTable()
    await screen.findByText('Ada Lovelace')

    expect(screen.queryByText(/\d[\d,]*\s+employees/i)).not.toBeInTheDocument()
    expect(screen.getByText(/of 100/i)).toBeInTheDocument()
  })

  it('changing the page sends a request for that page', async () => {
    const requests = captureEmployeesRequests()
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Ada Lovelace')

    await user.click(screen.getByRole('button', { name: /next page/i }))

    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('page')).toBe('2')
    })
  })

  it('clicking a sortable header cycles asc -> desc -> reset to default', async () => {
    const requests = captureEmployeesRequests()
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Ada Lovelace')

    const hireDateHeader = screen.getByRole('button', { name: /hire date/i })

    await user.click(hireDateHeader)
    await waitFor(() => {
      const last = requests.at(-1)
      expect(last?.searchParams.get('sort')).toBe('hire_date')
      expect(last?.searchParams.get('order')).toBe('asc')
    })

    await user.click(hireDateHeader)
    await waitFor(() => {
      const last = requests.at(-1)
      expect(last?.searchParams.get('sort')).toBe('hire_date')
      expect(last?.searchParams.get('order')).toBe('desc')
    })

    await user.click(hireDateHeader)
    await waitFor(() => {
      const last = requests.at(-1)
      expect(last?.searchParams.get('sort')).toBe('full_name')
      expect(last?.searchParams.get('order')).toBe('asc')
    })
  })

  it('changing a filter resets the page to 1', async () => {
    const requests = captureEmployeesRequests()
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Ada Lovelace')

    // Move to page 2 first.
    await user.click(screen.getByRole('button', { name: /next page/i }))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('page')).toBe('2'))

    // Changing the country filter must reset back to page 1. The dropdown
    // shows the full country name; the request still carries the code.
    await user.click(screen.getByLabelText(/country/i))
    await user.click(await screen.findByRole('option', { name: 'United States' }))

    await waitFor(() => {
      const last = requests.at(-1)
      expect(last?.searchParams.get('country')).toBe('US')
      expect(last?.searchParams.get('page')).toBe('1')
    })
  })

  it('debounces the search box: typing several characters sends one request, not one per keystroke', async () => {
    const requests = captureEmployeesRequests()
    const user = userEvent.setup()
    renderTable()
    await waitFor(() => expect(requests.length).toBeGreaterThan(0))

    const requestCountBeforeTyping = requests.length
    const searchBox = screen.getByRole('textbox', { name: /search/i })

    await user.type(searchBox, 'ada')

    // If every keystroke sent a request, this would settle at +3, not +1.
    await waitFor(
      () => {
        expect(requests.length).toBe(requestCountBeforeTyping + 1)
      },
      { timeout: 1000 },
    )
    expect(requests.at(-1)?.searchParams.get('q')).toBe('ada')

    // Give any (incorrect) per-keystroke requests a chance to have fired too.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(requests.length).toBe(requestCountBeforeTyping + 1)
  })

  it('shows "No employees match" when the API returns no items', async () => {
    server.use(
      http.get(`${API_BASE_URL}/employees`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 25 }),
      ),
    )

    renderTable()

    expect(await screen.findByText(/no employees match/i)).toBeInTheDocument()
  })

  it('shows an error message with a Retry button, and Retry re-fetches', async () => {
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/employees`, () => {
        requestCount += 1
        if (requestCount === 1) {
          return HttpResponse.json({ detail: 'boom' }, { status: 500 })
        }
        return HttpResponse.json({
          items: defaultEmployees,
          total: defaultEmployees.length,
          page: 1,
          page_size: 25,
        })
      }),
    )
    const user = userEvent.setup()

    renderTable()
    await screen.findByRole('button', { name: /retry/i })

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('shows the slow-server message once a request has been pending over 5 seconds', async () => {
    server.use(
      http.get(`${API_BASE_URL}/employees`, async () => {
        // Never resolves within the test's lifetime -- simulates a Render
        // cold start that's still spinning up.
        await new Promise(() => {})
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 25 })
      }),
    )

    renderTable()

    expect(
      await screen.findByText(/waking up the server/i, {}, { timeout: 7000 }),
    ).toBeInTheDocument()
  }, 10000)
})

describe('EmployeeTable sortable columns', () => {
  it('only exposes a sort control on Name, Salary (USD), and Hire date', async () => {
    renderTable()
    await screen.findByText('Ada Lovelace')

    expect(screen.getByRole('button', { name: /^name$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salary \(usd\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hire date/i })).toBeInTheDocument()

    // Email, Job title, Department, Country, and local Salary are not
    // sortable (local Salary especially: cross-currency values aren't
    // comparable), and must not expose a clickable sort control either.
    expect(screen.queryByRole('button', { name: /^email$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^job title$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^department$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^country$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^salary$/i })).not.toBeInTheDocument()
  })
})

describe('EmployeeTable layout', () => {
  it('pagination controls are not inside the horizontally-scrolling table container', async () => {
    renderTable()
    await screen.findByText('Ada Lovelace')

    const scrollContainer = document.querySelector('.MuiTableContainer-root')
    const pagination = document.querySelector('.MuiTablePagination-root')
    expect(scrollContainer).not.toBeNull()
    expect(pagination).not.toBeNull()
    expect(scrollContainer?.contains(pagination)).toBe(false)
  })

  it('every column header is centred, including the pinned Name column', async () => {
    renderTable()
    await screen.findByText('Ada Lovelace')

    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(8)
    headers.forEach((header) => {
      expect(header.className).toContain('MuiTableCell-alignCenter')
    })
  })

  it('every body cell is centred, matching the centred headers', async () => {
    renderTable()
    await screen.findByText('Ada Lovelace')

    const row = screen.getByText('Ada Lovelace').closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    expect(cells).toHaveLength(8)
    cells.forEach((cell) => {
      expect(cell.className).toContain('MuiTableCell-alignCenter')
    })
  })

  it('Email and Job title cells expose the full value via a title attribute, for when the text is truncated', async () => {
    renderTable()
    await screen.findByText('Ada Lovelace')

    const emailCell = screen.getByText('ada@example.com').closest('td')
    const jobTitleCell = screen.getByText('Engineer').closest('td')
    expect(emailCell).toHaveAttribute('title', 'ada@example.com')
    expect(jobTitleCell).toHaveAttribute('title', 'Engineer')
  })
})

describe('EmployeeTable filters', () => {
  beforeEach(() => {
    server.use(
      http.get(`${API_BASE_URL}/employees/options`, () =>
        HttpResponse.json({
          countries: ['GB', 'IN', 'US'],
          departments: ['Engineering', 'Sales'],
          job_titles: ['Engineer', 'Sales Manager'],
        }),
      ),
    )
  })

  it('search box shows a clear button once it has text; clearing it drops q and resets to page 1', async () => {
    const requests = captureEmployeesRequests()
    const user = userEvent.setup()
    renderTable()
    await waitFor(() => expect(requests.length).toBeGreaterThan(0))

    const searchBox = screen.getByRole('textbox', { name: /search/i })
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument()

    await user.type(searchBox, 'ada')
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('q')).toBe('ada'))

    await user.click(screen.getByRole('button', { name: /next page/i }))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('page')).toBe('2'))

    await user.click(screen.getByRole('button', { name: /clear search/i }))

    await waitFor(() => {
      const last = requests.at(-1)
      expect(last?.searchParams.get('q')).toBeNull()
      expect(last?.searchParams.get('page')).toBe('1')
    })
    expect(searchBox).toHaveValue('')
  })

  const AUTOCOMPLETE_FILTERS = [
    {
      label: /country/i,
      optionName: 'United Kingdom', // shown/clicked in the dropdown
      paramName: 'country',
      paramValue: 'GB', // the code that must reach the API
      clearLabel: /clear country filter/i,
    },
    {
      label: /department/i,
      optionName: 'Engineering',
      paramName: 'department',
      paramValue: 'Engineering',
      clearLabel: /clear department filter/i,
    },
    {
      label: /job title/i,
      optionName: 'Engineer',
      paramName: 'job_title',
      paramValue: 'Engineer',
      clearLabel: /clear job title filter/i,
    },
  ]

  it.each(AUTOCOMPLETE_FILTERS)(
    '$paramName filter: clear button is reachable by name, clears the filter, drops the param, and resets to page 1',
    async ({ label, optionName, paramName, paramValue, clearLabel }) => {
      const requests = captureEmployeesRequests()
      const user = userEvent.setup()
      renderTable()
      await screen.findByText('Ada Lovelace')

      await user.click(screen.getByLabelText(label))
      await user.click(await screen.findByRole('option', { name: optionName }))
      await waitFor(() => expect(requests.at(-1)?.searchParams.get(paramName)).toBe(paramValue))

      await user.click(screen.getByRole('button', { name: /next page/i }))
      await waitFor(() => expect(requests.at(-1)?.searchParams.get('page')).toBe('2'))

      // The clear button must be clickable cold, with no prior focus or
      // hover on the field -- that's the whole point of forcing it visible
      // on touch devices, which have no hover state at all.
      await user.click(screen.getByRole('button', { name: clearLabel }))

      await waitFor(() => {
        const last = requests.at(-1)
        expect(last?.searchParams.get(paramName)).toBeNull()
        expect(last?.searchParams.get('page')).toBe('1')
      })
    },
  )

  it.each(AUTOCOMPLETE_FILTERS)(
    '$paramName filter: clear button is visible and reachable by name as soon as a value is set, with no hover or focus',
    async ({ label, optionName, clearLabel }) => {
      const user = userEvent.setup()
      renderTable()
      await screen.findByText('Ada Lovelace')

      expect(screen.queryByRole('button', { name: clearLabel })).not.toBeInTheDocument()

      await user.click(screen.getByLabelText(label))
      await user.click(await screen.findByRole('option', { name: optionName }))
      // Selecting an option leaves the field focused; move focus away so
      // this genuinely tests "visible with no focus or hover", not just
      // "visible right after an interaction that happens to leave it focused".
      await user.click(document.body)

      expect(screen.getByRole('button', { name: clearLabel })).toBeInTheDocument()
    },
  )

  it('country Autocomplete offers values from /employees/options, not a freeSolo text entry', async () => {
    renderTable()

    await userEvent.setup().click(await screen.findByLabelText(/country/i))

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: 'United States' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'India' })).toBeInTheDocument()
  })

  it('country filter shows the full country name but sends the two-letter code to the API', async () => {
    const requests = captureEmployeesRequests()
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Ada Lovelace')

    await user.click(screen.getByLabelText(/country/i))
    await user.click(await screen.findByRole('option', { name: 'United Kingdom' }))

    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('country')).toBe('GB')
    })
  })

  it('typing a partial country name or its code both filter to the matching option', async () => {
    const user = userEvent.setup()
    renderTable()
    const countryInput = await screen.findByLabelText(/country/i)

    await user.click(countryInput)
    await user.type(countryInput, 'ind')
    let listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: 'India' })).toBeInTheDocument()

    await user.clear(countryInput)
    await user.type(countryInput, 'IN')
    listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: 'India' })).toBeInTheDocument()
  })
})

describe('EmployeeTable sample employee', () => {
  it('makeEmployee builds a valid default employee for other tests to override', () => {
    const employee = makeEmployee({ full_name: 'Someone Else' })
    expect(employee.full_name).toBe('Someone Else')
    expect(employee.currency).toBe('USD')
  })
})

describe('EmployeeTable CRUD actions', () => {
  afterEach(() => {
    setToken(null)
  })

  it('does not show Add employee or an Actions column when logged out', async () => {
    renderTable()
    await screen.findByText('Ada Lovelace')

    expect(screen.queryByRole('button', { name: /add employee/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actions for Ada Lovelace' }),
    ).not.toBeInTheDocument()
  })

  it('shows Add employee and an Actions column when logged in', async () => {
    setToken('tok123')
    renderTable()
    await screen.findByText('Ada Lovelace')

    expect(screen.getByRole('button', { name: /add employee/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Ada Lovelace' })).toBeInTheDocument()
  })

  it('clicking Add employee opens the form dialog, empty', async () => {
    setToken('tok123')
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Ada Lovelace')

    await user.click(screen.getByRole('button', { name: /add employee/i }))

    expect(screen.getByRole('heading', { name: 'Add employee' })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toHaveValue('')
  })

  it('kebab menu -> Edit opens the form dialog prefilled with that row', async () => {
    setToken('tok123')
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Ada Lovelace')

    await user.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }))
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }))

    expect(screen.getByRole('heading', { name: 'Edit employee' })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Ada Lovelace')
  })

  it('kebab menu -> Delete opens the confirmation dialog naming that employee', async () => {
    setToken('tok123')
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Ada Lovelace')

    await user.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }))
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }))

    expect(screen.getByRole('heading', { name: /delete employee/i })).toBeInTheDocument()
    expect(screen.getAllByText(/ada lovelace/i).length).toBeGreaterThan(0)
  })
})

describe('EmployeeTable read-only alert', () => {
  afterEach(() => {
    setToken(null)
  })

  it('shows a read-only info alert with a Login link when logged out', async () => {
    renderTable()
    await screen.findByText('Ada Lovelace')

    expect(screen.getByText(/viewing in read-only mode/i)).toBeInTheDocument()
    const loginLink = screen.getByRole('link', { name: 'Login' })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('does not show the read-only alert when logged in', async () => {
    setToken('tok123')
    renderTable()
    await screen.findByText('Ada Lovelace')

    expect(screen.queryByText(/viewing in read-only mode/i)).not.toBeInTheDocument()
  })
})
