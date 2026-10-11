import { describe, expect, it } from 'vitest'

import { buildEmployeeListSearchParams } from './employees'

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
