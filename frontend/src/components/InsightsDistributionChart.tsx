import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'

import type { DistributionBucket } from '../types/insights'
import { formatMoney } from '../utils/money'

// The standard "visually hidden" recipe: still in the accessibility tree
// and announced by screen readers (unlike display:none), just not shown
// visually -- the chart itself is a role="img" summary, this table is the
// real accessible content, since a static image-like chart can't expose
// its own per-bar data any other way.
const visuallyHiddenSx = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  overflow: 'hidden' as const,
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap' as const,
}

export interface InsightsDistributionChartProps {
  groupLabel: string
  currency: string
  distribution: DistributionBucket[]
}

export function InsightsDistributionChart({
  groupLabel,
  currency,
  distribution,
}: InsightsDistributionChartProps) {
  const rangeLabels = distribution.map(
    (bucket) =>
      `${formatMoney(bucket.range_min, currency)}–${formatMoney(bucket.range_max, currency)}`,
  )

  return (
    <Box>
      <Box role="img" aria-label={`Salary distribution for ${groupLabel}`}>
        <BarChart
          height={300}
          xAxis={[{ scaleType: 'band', data: rangeLabels }]}
          series={[{ data: distribution.map((bucket) => bucket.count), label: 'Headcount' }]}
        />
      </Box>
      <Box component="table" sx={visuallyHiddenSx}>
        <caption>Salary distribution for {groupLabel}</caption>
        <thead>
          <tr>
            <th>Range</th>
            <th>Headcount</th>
          </tr>
        </thead>
        <tbody>
          {distribution.map((bucket, index) => (
            <tr key={index}>
              <td>{rangeLabels[index]}</td>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Each range includes its lower bound and excludes its upper bound, except the last, which
        includes the maximum.
      </Typography>
    </Box>
  )
}
