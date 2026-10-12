import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { useCountryInsights, useDepartmentInsights, useJobTitleInsights } from '../api/insights'
import { InsightsDistributionChart } from '../components/InsightsDistributionChart'
import { InsightsSummaryTable, type SummaryGroup } from '../components/InsightsSummaryTable'
import { useSlowRequest } from '../hooks/useSlowRequest'
import type { CountryInsight, DepartmentInsight, JobTitleInsight } from '../types/insights'
import { formatCountryName } from '../utils/country'

type TabKey = 'country' | 'department' | 'job_title'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'country', label: 'Country' },
  { key: 'department', label: 'Department' },
  { key: 'job_title', label: 'Job title' },
]

// Country figures are in that country's own local currency; Department
// and Job title span every country, so there's no single local currency
// for either -- both are always USD (the backend's own DepartmentInsight/
// JobTitleInsight schemas have no currency field at all, not a null one).
function normalizeCountry(groups: CountryInsight[]): SummaryGroup[] {
  return groups.map((group) => ({
    key: group.country,
    label: formatCountryName(group.country),
    currency: group.currency,
    headcount: group.headcount,
    min: group.min,
    max: group.max,
    average: group.average,
    median: group.median,
    distribution: group.distribution,
  }))
}

function normalizeDepartment(groups: DepartmentInsight[]): SummaryGroup[] {
  return groups.map((group) => ({
    key: group.department,
    label: group.department,
    currency: 'USD',
    headcount: group.headcount,
    min: group.min,
    max: group.max,
    average: group.average,
    median: group.median,
    distribution: group.distribution,
  }))
}

function normalizeJobTitle(groups: JobTitleInsight[]): SummaryGroup[] {
  return groups.map((group) => ({
    key: group.job_title,
    label: group.job_title,
    currency: 'USD',
    headcount: group.headcount,
    min: group.min,
    max: group.max,
    average: group.average,
    median: group.median,
    distribution: group.distribution,
  }))
}

function highestHeadcountKey(groups: SummaryGroup[]): string | null {
  if (groups.length === 0) return null
  return groups.reduce((best, group) => (group.headcount > best.headcount ? group : best)).key
}

// Only what this component actually reads from a useQuery result -- not
// tied to any one dimension's response shape, since `groups` (already
// normalized) is passed separately.
interface QueryStatus {
  isPending: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

interface InsightsTabContentProps {
  query: QueryStatus
  groups: SummaryGroup[]
  groupColumnLabel: string
}

function InsightsTabContent({ query, groups, groupColumnLabel }: InsightsTabContentProps) {
  const isSlow = useSlowRequest(query.isFetching)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const effectiveSelectedKey = selectedKey ?? highestHeadcountKey(groups)
  const selected = groups.find((group) => group.key === effectiveSelectedKey) ?? null

  // The slow-server banner is additive (shown alongside whatever else is
  // rendering), not a replacement for it -- same pattern as EmployeeTable,
  // since a slow *refetch* (not just the first load) can happen too.
  return (
    <Box sx={{ mt: 2 }}>
      {isSlow && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Waking up the server, this can take up to a minute on first load.
        </Alert>
      )}

      {query.isPending && <Skeleton variant="rectangular" height={200} />}

      {!query.isPending && query.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => query.refetch()}>
              Retry
            </Button>
          }
        >
          {query.error instanceof Error ? query.error.message : 'Failed to load insights.'}
        </Alert>
      )}

      {!query.isPending && !query.isError && groups.length === 0 && (
        <Typography color="text.secondary">No insights available</Typography>
      )}

      {!query.isPending && !query.isError && groups.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <InsightsSummaryTable
            groups={groups}
            groupColumnLabel={groupColumnLabel}
            selectedKey={effectiveSelectedKey ?? ''}
            onSelectGroup={setSelectedKey}
          />
          {selected && (
            <InsightsDistributionChart
              groupLabel={selected.label}
              currency={selected.currency}
              distribution={selected.distribution}
            />
          )}
        </Box>
      )}
    </Box>
  )
}

export function InsightsPage() {
  const [tab, setTab] = useState<TabKey>('country')

  const countryQuery = useCountryInsights()
  const departmentQuery = useDepartmentInsights()
  const jobTitleQuery = useJobTitleInsights()

  return (
    <Box>
      <Tabs value={tab} onChange={(_, value: TabKey) => setTab(value)}>
        {TABS.map(({ key, label }) => (
          <Tab key={key} value={key} label={label} />
        ))}
      </Tabs>

      {tab === 'country' && (
        <InsightsTabContent
          query={countryQuery}
          groups={normalizeCountry(countryQuery.data?.groups ?? [])}
          groupColumnLabel="Country"
        />
      )}
      {tab === 'department' && (
        <InsightsTabContent
          query={departmentQuery}
          groups={normalizeDepartment(departmentQuery.data?.groups ?? [])}
          groupColumnLabel="Department"
        />
      )}
      {tab === 'job_title' && (
        <InsightsTabContent
          query={jobTitleQuery}
          groups={normalizeJobTitle(jobTitleQuery.data?.groups ?? [])}
          groupColumnLabel="Job title"
        />
      )}
    </Box>
  )
}

export default InsightsPage
