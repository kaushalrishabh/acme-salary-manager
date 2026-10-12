import { HttpResponse, http } from 'msw'

import type { LoginRequest, LoginResponse } from '../types/auth'
import type { Employee, EmployeeListResponse, EmployeeOptions } from '../types/employee'
import type {
  CountryInsightsResponse,
  DepartmentInsightsResponse,
  DistributionBucket,
  JobTitleInsightsResponse,
} from '../types/insights'
import type { CountryMeta } from '../types/meta'

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

export const defaultCountries: CountryMeta[] = [
  { code: 'IN', currency: 'INR', minor_unit: 2 },
  { code: 'JP', currency: 'JPY', minor_unit: 0 },
  { code: 'US', currency: 'USD', minor_unit: 2 },
]

export const TEST_USERNAME = 'hr'
export const TEST_PASSWORD = 'test-password'
export const TEST_TOKEN = 'test-token'

const sampleDistribution: DistributionBucket[] = [
  { range_min: '0.00', range_max: '50000.00', count: 10 },
  { range_min: '50000.00', range_max: '100000.00', count: 25 },
  { range_min: '100000.00', range_max: '150000.00', count: 5 },
]

export const defaultCountryInsights: CountryInsightsResponse = {
  groups: [
    {
      country: 'US',
      currency: 'USD',
      headcount: 50,
      min: '40000.00',
      max: '200000.00',
      average: '95000.00',
      median: '90000.00',
      distribution: sampleDistribution,
    },
    {
      country: 'IN',
      currency: 'INR',
      headcount: 120,
      min: '500000.00',
      max: '3000000.00',
      average: '1200000.00',
      median: '1100000.00',
      distribution: sampleDistribution,
    },
  ],
}

export const defaultDepartmentInsights: DepartmentInsightsResponse = {
  groups: [
    {
      department: 'Engineering',
      headcount: 80,
      min: '60000.00',
      max: '220000.00',
      average: '110000.00',
      median: '100000.00',
      distribution: sampleDistribution,
    },
    {
      department: 'Sales',
      headcount: 30,
      min: '50000.00',
      max: '180000.00',
      average: '90000.00',
      median: '85000.00',
      distribution: sampleDistribution,
    },
  ],
}

export const defaultJobTitleInsights: JobTitleInsightsResponse = {
  groups: [
    {
      job_title: 'Engineer',
      headcount: 60,
      min: '60000.00',
      max: '200000.00',
      average: '105000.00',
      median: '98000.00',
      distribution: sampleDistribution,
    },
    {
      job_title: 'Sales Manager',
      headcount: 20,
      min: '55000.00',
      max: '170000.00',
      average: '92000.00',
      median: '88000.00',
      distribution: sampleDistribution,
    },
  ],
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
  http.get(`${API_BASE_URL}/meta/countries`, () => HttpResponse.json(defaultCountries)),
  http.get(`${API_BASE_URL}/insights/country`, () => HttpResponse.json(defaultCountryInsights)),
  http.get(`${API_BASE_URL}/insights/department`, () =>
    HttpResponse.json(defaultDepartmentInsights),
  ),
  http.get(`${API_BASE_URL}/insights/job-title`, () => HttpResponse.json(defaultJobTitleInsights)),
  http.post(`${API_BASE_URL}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as LoginRequest
    if (body.username === TEST_USERNAME && body.password === TEST_PASSWORD) {
      const response: LoginResponse = { token: TEST_TOKEN, expires_in: 3600 }
      return HttpResponse.json(response)
    }
    return HttpResponse.json({ detail: 'Invalid username or password' }, { status: 401 })
  }),
]
