import { useQuery } from '@tanstack/react-query'

import type {
  CountryInsightsResponse,
  DepartmentInsightsResponse,
  JobTitleInsightsResponse,
} from '../types/insights'
import { apiFetch } from './client'

export function fetchCountryInsights(): Promise<CountryInsightsResponse> {
  return apiFetch<CountryInsightsResponse>('/insights/country')
}

export function fetchDepartmentInsights(): Promise<DepartmentInsightsResponse> {
  return apiFetch<DepartmentInsightsResponse>('/insights/department')
}

export function fetchJobTitleInsights(): Promise<JobTitleInsightsResponse> {
  return apiFetch<JobTitleInsightsResponse>('/insights/job-title')
}

export function useCountryInsights() {
  return useQuery({ queryKey: ['insights', 'country'], queryFn: fetchCountryInsights })
}

export function useDepartmentInsights() {
  return useQuery({ queryKey: ['insights', 'department'], queryFn: fetchDepartmentInsights })
}

export function useJobTitleInsights() {
  return useQuery({ queryKey: ['insights', 'job_title'], queryFn: fetchJobTitleInsights })
}
