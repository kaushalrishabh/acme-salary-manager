import { useQuery } from '@tanstack/react-query'

import type { CountryMeta } from '../types/meta'
import { apiFetch } from './client'

export function fetchCountries(): Promise<CountryMeta[]> {
  return apiFetch<CountryMeta[]>('/meta/countries')
}

export function useCountries() {
  return useQuery({ queryKey: ['meta', 'countries'], queryFn: fetchCountries })
}
