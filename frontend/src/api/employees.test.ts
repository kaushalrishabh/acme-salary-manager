import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { API_BASE_URL } from '../test/handlers'
import { server } from '../test/server'
import {
  buildEmployeeListSearchParams,
  createEmployee,
  deleteEmployee,
  updateEmployee,
} from './employees'

const writeBody = {
  full_name: 'Ada Lovelace',
  email: 'ada@example.com',
  job_title: 'Engineer',
  department: 'Engineering',
  country: 'US',
  annual_gross_salary: '85000.00',
  hire_date: '2020-01-01',
}

describe('buildEmployeeListSearchParams', () => {
  it('omits q/country/department/job_title when they are empty or absent', () => {
    const params = buildEmployeeListSearchParams({})

    expect(params.has('q')).toBe(false)
    expect(params.has('country')).toBe(false)
    expect(params.has('department')).toBe(false)
    expect(params.has('job_title')).toBe(false)
  })

  it('omits an empty-string filter the same as an absent one', () => {
    const params = buildEmployeeListSearchParams({ q: '', country: '' })

    expect(params.has('q')).toBe(false)
    expect(params.has('country')).toBe(false)
  })

  it('includes a non-empty filter', () => {
    const params = buildEmployeeListSearchParams({
      q: 'ada',
      country: 'US',
      department: 'Engineering',
      job_title: 'Engineer',
    })

    expect(params.get('q')).toBe('ada')
    expect(params.get('country')).toBe('US')
    expect(params.get('department')).toBe('Engineering')
    expect(params.get('job_title')).toBe('Engineer')
  })

  it('always includes sort, order, page, and page_size, using the given values', () => {
    const params = buildEmployeeListSearchParams({
      sort: 'salary',
      order: 'desc',
      page: 3,
      page_size: 50,
    })

    expect(params.get('sort')).toBe('salary')
    expect(params.get('order')).toBe('desc')
    expect(params.get('page')).toBe('3')
    expect(params.get('page_size')).toBe('50')
  })

  it('defaults sort/order/page/page_size when not given', () => {
    const params = buildEmployeeListSearchParams({})

    expect(params.get('sort')).toBe('full_name')
    expect(params.get('order')).toBe('asc')
    expect(params.get('page')).toBe('1')
    expect(params.get('page_size')).toBe('25')
  })

  it('percent-encodes special characters in the search term', () => {
    const params = buildEmployeeListSearchParams({ q: 'a&b=c d' })

    // URLSearchParams itself does the encoding; toString() is what a real
    // fetch URL would contain.
    expect(params.toString()).toContain('q=a%26b%3Dc+d')
  })
})

describe('createEmployee', () => {
  it('POSTs the write body to /employees and returns the created employee', async () => {
    server.use(
      http.post(`${API_BASE_URL}/employees`, async ({ request }) => {
        const body = await request.json()
        return HttpResponse.json({ id: 1, ...(body as object), currency: 'USD' }, { status: 201 })
      }),
    )

    const result = await createEmployee(writeBody)

    expect(result).toMatchObject({ id: 1, full_name: 'Ada Lovelace' })
  })

  it('sends the salary exactly as given, as a string, not a number', async () => {
    let capturedBody: unknown
    server.use(
      http.post(`${API_BASE_URL}/employees`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )

    await createEmployee({ ...writeBody, annual_gross_salary: '85000.00' })

    expect((capturedBody as { annual_gross_salary: unknown }).annual_gross_salary).toBe('85000.00')
    expect(typeof (capturedBody as { annual_gross_salary: unknown }).annual_gross_salary).toBe(
      'string',
    )
  })
})

describe('updateEmployee', () => {
  it('PUTs the full write body to /employees/:id', async () => {
    let capturedMethod = ''
    server.use(
      http.put(`${API_BASE_URL}/employees/1`, async ({ request }) => {
        capturedMethod = request.method
        const body = await request.json()
        return HttpResponse.json({ id: 1, ...(body as object), currency: 'USD' })
      }),
    )

    const result = await updateEmployee(1, writeBody)

    expect(capturedMethod).toBe('PUT')
    expect(result).toMatchObject({ id: 1, full_name: 'Ada Lovelace' })
  })
})

describe('deleteEmployee', () => {
  it('DELETEs /employees/:id', async () => {
    let capturedMethod = ''
    server.use(
      http.delete(`${API_BASE_URL}/employees/1`, ({ request }) => {
        capturedMethod = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteEmployee(1)

    expect(capturedMethod).toBe('DELETE')
  })
})
