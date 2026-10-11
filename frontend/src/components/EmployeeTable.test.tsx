import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { API_BASE_URL, defaultEmployees, makeEmployee } from '../test/handlers'
import { server } from '../test/server'
import { EmployeeTable } from './EmployeeTable'

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <EmployeeTable />
    </QueryClientProvider>,
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

  it('shows the total employee count', async () => {
    renderTable()

    expect(await screen.findByText(/2 employees/i)).toBeInTheDocument()
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

    // Changing the country filter must reset back to page 1.
    await user.click(screen.getByLabelText(/country/i))
    await user.click(await screen.findByRole('option', { name: 'US' }))

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

describe('EmployeeTable filters', () => {
  beforeEach(() => {
    server.use(
      http.get(`${API_BASE_URL}/employees/options`, () =>
        HttpResponse.json({
          countries: ['IN', 'US'],
          departments: ['Engineering', 'Sales'],
          job_titles: ['Engineer', 'Sales Manager'],
        }),
      ),
    )
  })

  it('filter Selects include an "All" option alongside values from /employees/options', async () => {
    renderTable()

    const countrySelect = await screen.findByLabelText(/country/i)
    await userEvent.setup().click(countrySelect)

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: /all/i })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'US' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'IN' })).toBeInTheDocument()
  })
})

describe('EmployeeTable sample employee', () => {
  it('makeEmployee builds a valid default employee for other tests to override', () => {
    const employee = makeEmployee({ full_name: 'Someone Else' })
    expect(employee.full_name).toBe('Someone Else')
    expect(employee.currency).toBe('USD')
  })
})
