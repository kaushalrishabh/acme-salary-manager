import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { EmployeeListParams, EmployeeListResponse, EmployeeOptions } from '../types/employee'
import { apiFetch } from './client'

export function buildEmployeeListSearchParams(params: EmployeeListParams): URLSearchParams {
  const searchParams = new URLSearchParams()

  // Optional filters: omitted entirely when empty, not sent as "".
  if (params.q) searchParams.set('q', params.q)
  if (params.country) searchParams.set('country', params.country)
  if (params.department) searchParams.set('department', params.department)
  if (params.job_title) searchParams.set('job_title', params.job_title)

  // Always sent explicitly, with the same defaults the API itself uses.
  searchParams.set('sort', params.sort ?? 'full_name')
  searchParams.set('order', params.order ?? 'asc')
  searchParams.set('page', String(params.page ?? 1))
  searchParams.set('page_size', String(params.page_size ?? 25))

  return searchParams
}

export function fetchEmployees(params: EmployeeListParams): Promise<EmployeeListResponse> {
  const searchParams = buildEmployeeListSearchParams(params)
  return apiFetch<EmployeeListResponse>(`/employees?${searchParams.toString()}`)
}

export function fetchEmployeeOptions(): Promise<EmployeeOptions> {
  return apiFetch<EmployeeOptions>('/employees/options')
}

export function useEmployees(params: EmployeeListParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => fetchEmployees(params),
    placeholderData: keepPreviousData,
  })
}

export function useEmployeeOptions() {
  return useQuery({
    queryKey: ['employee-options'],
    queryFn: fetchEmployeeOptions,
  })
}
