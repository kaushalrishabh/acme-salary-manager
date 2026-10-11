import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  Employee,
  EmployeeListParams,
  EmployeeListResponse,
  EmployeeOptions,
  EmployeeWriteRequest,
} from '../types/employee'
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

export function createEmployee(data: EmployeeWriteRequest): Promise<Employee> {
  return apiFetch<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) })
}

export function updateEmployee(id: number, data: EmployeeWriteRequest): Promise<Employee> {
  return apiFetch<Employee>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteEmployee(id: number): Promise<void> {
  return apiFetch<void>(`/employees/${id}`, { method: 'DELETE' })
}

// After any successful write, the list, the options (a new department/job
// title/country may now exist, or an old one may no longer), and every
// insights dimension can all be stale.
function invalidateAfterWrite(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['employees'] })
  queryClient.invalidateQueries({ queryKey: ['employee-options'] })
  queryClient.invalidateQueries({ queryKey: ['insights'] })
}

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => invalidateAfterWrite(queryClient),
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: EmployeeWriteRequest }) =>
      updateEmployee(id, data),
    onSuccess: () => invalidateAfterWrite(queryClient),
  })
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => invalidateAfterWrite(queryClient),
  })
}
