// Mirrors backend/src/app/schemas.py's EmployeeRead / EmployeeListResponse /
// EmployeeOptionsResponse. Money fields are exact major-unit strings --
// display only (via src/utils/money.ts), never used in arithmetic here.

export interface Employee {
  id: number
  full_name: string
  email: string
  job_title: string
  department: string
  country: string
  currency: string
  annual_gross_salary: string
  annual_gross_salary_usd: string
  hire_date: string // date-only, "YYYY-MM-DD" -- see src/utils/date.ts
  created_at: string // UTC, no timezone suffix -- see src/utils/date.ts
  updated_at: string
}

export interface EmployeeListResponse {
  items: Employee[]
  total: number
  page: number
  page_size: number
}

export interface EmployeeOptions {
  countries: string[]
  departments: string[]
  job_titles: string[]
}

export type EmployeeSortField = 'full_name' | 'hire_date' | 'salary'
export type SortOrder = 'asc' | 'desc'

export interface EmployeeListParams {
  q?: string
  country?: string
  department?: string
  job_title?: string
  sort?: EmployeeSortField
  order?: SortOrder
  page?: number
  page_size?: number
}
