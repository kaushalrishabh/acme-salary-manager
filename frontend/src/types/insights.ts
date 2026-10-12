// Mirrors backend/src/app/schemas.py's DistributionBucket / CountryInsight /
// DepartmentInsight / JobTitleInsight / *InsightsResponse. All money
// fields are exact strings -- display only, via src/utils/money.ts.

export interface DistributionBucket {
  range_min: string
  range_max: string
  count: number
}

export interface CountryInsight {
  country: string
  currency: string
  headcount: number
  min: string
  max: string
  average: string
  median: string
  distribution: DistributionBucket[]
}

export interface DepartmentInsight {
  department: string
  headcount: number
  min: string
  max: string
  average: string
  median: string
  distribution: DistributionBucket[]
}

export interface JobTitleInsight {
  job_title: string
  headcount: number
  min: string
  max: string
  average: string
  median: string
  distribution: DistributionBucket[]
}

export interface CountryInsightsResponse {
  groups: CountryInsight[]
}

export interface DepartmentInsightsResponse {
  groups: DepartmentInsight[]
}

export interface JobTitleInsightsResponse {
  groups: JobTitleInsight[]
}
