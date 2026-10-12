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
    <Box sx={{ minWidth: 0 }}>
      {/* minWidth: 0 on both Boxes: the chart sizes its SVG to this
          element's measured width (no width prop -- see the height prop's
          own doc comment, "if not defined, it takes the [size] of the
          parent"), and a flex/grid ancestor's default min-width:auto would
          otherwise stop that measurement from ever going narrower than the
          chart's unconstrained content size, forcing the page to scroll
          horizontally instead of the chart shrinking to fit. hideLegend:
          there's exactly one series: a color-keyed legend for "Headcount"
          tells a reader nothing the accessible table/caption don't already
          say, and removing it is one less thing claiming vertical space. */}
      <Box role="img" aria-label={`Salary distribution for ${groupLabel}`} sx={{ minWidth: 0 }}>
        <BarChart
          height={300}
          hideLegend
          xAxis={[{ scaleType: 'band', data: rangeLabels }]}
          series={[{ data: distribution.map((bucket) => bucket.count), label: 'Headcount' }]}
        />
      </Box>
      {/* The clipping styles go on this wrapping div, not the <table>
          itself: a <table>'s caption is laid out in the table's anonymous
          wrapper box, which CSS overflow/clipping does not reach the way it
          reaches a <table> element's own box -- forcing width/height/
          overflow onto the table directly left the caption (and the table's
          own auto-layout content width) poking out past the clip, widening
          the page by exactly the hidden content's width. A table shrinks
          and clips the way a div does only when something *else* clips it. */}
      <Box sx={visuallyHiddenSx}>
        <table>
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
        </table>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Each range includes its lower bound and excludes its upper bound, except the last, which
        includes the maximum.
      </Typography>
    </Box>
  )
}
