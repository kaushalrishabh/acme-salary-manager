import { HttpResponse, http } from 'msw'

import type { Employee, EmployeeListResponse, EmployeeOptions } from '../types/employee'

// Keep this in sync with VITE_API_URL used in tests (see src/test/setup.ts).
export const API_BASE_URL = 'http://api.test'

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 1,
    full_name: 'Ada Lovelace',
    email: 'ada@example.com',
    job_title: 'Engineer',
    department: 'Engineering',
    country: 'US',
    currency: 'USD',
    annual_gross_salary: '85000.00',
    annual_gross_salary_usd: '85000.00',
    hire_date: '2020-01-01',
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    ...overrides,
  }
}

export const defaultEmployees: Employee[] = [
  makeEmployee({ id: 1, full_name: 'Ada Lovelace', email: 'ada@example.com' }),
  makeEmployee({
    id: 2,
    full_name: 'Grace Hopper',
    email: 'grace@example.com',
    country: 'IN',
    currency: 'INR',
    department: 'Sales',
    job_title: 'Sales Manager',
    annual_gross_salary: '1200000.00',
    annual_gross_salary_usd: '14400.00',
  }),
]

export const defaultOptions: EmployeeOptions = {
  countries: ['IN', 'US'],
  departments: ['Engineering', 'Sales'],
  job_titles: ['Engineer', 'Sales Manager'],
}

export const handlers = [
  http.get(`${API_BASE_URL}/employees`, () => {
    const body: EmployeeListResponse = {
      items: defaultEmployees,
      total: defaultEmployees.length,
      page: 1,
      page_size: 25,
    }
    return HttpResponse.json(body)
  }),
  http.get(`${API_BASE_URL}/employees/options`, () => HttpResponse.json(defaultOptions)),
]
