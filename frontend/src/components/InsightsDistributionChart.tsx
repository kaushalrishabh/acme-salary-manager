import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import FormControl from '@mui/material/FormControl'
import MenuItem from '@mui/material/MenuItem'
import Select, { type SelectChangeEvent } from '@mui/material/Select'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { BarChart } from '@mui/x-charts/BarChart'

import type { DistributionBucket } from '../types/insights'
import { buildCompactRangeLabels, buildPreciseRangeLabels } from '../utils/distributionLabels'
import type { SummaryGroup } from './InsightsSummaryTable'

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

const headcountFormat = new Intl.NumberFormat('en-US')

export interface InsightsDistributionChartProps {
  groupLabel: string
  currency: string
  headcount: number
  distribution: DistributionBucket[]
  groups: SummaryGroup[]
  selectedKey: string
  onSelectGroup: (key: string) => void
}

export function InsightsDistributionChart({
  groupLabel,
  currency,
  headcount,
  distribution,
  groups,
  selectedKey,
  onSelectGroup,
}: InsightsDistributionChartProps) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  // Full precision, for the hidden accessible table and the tooltip's
  // value line -- never shown on the visible axis, which uses the compact
  // labels below instead.
  const preciseRangeLabels = buildPreciseRangeLabels(distribution, currency)
  const compactRangeLabels = buildCompactRangeLabels(distribution, currency)

  return (
    <Card variant="outlined" sx={{ minWidth: 0 }}>
      <CardHeader
        title={`Salary distribution: ${groupLabel}`}
        subheader={`${headcountFormat.format(headcount)} employees, amounts in ${currency}`}
        slotProps={{ title: { component: 'h3', variant: 'subtitle1' } }}
        action={
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              value={selectedKey}
              onChange={(event: SelectChangeEvent) => onSelectGroup(event.target.value)}
              inputProps={{ 'aria-label': 'Select group for chart' }}
            >
              {groups.map((group) => (
                <MenuItem key={group.key} value={group.key}>
                  {group.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        }
      />
      <CardContent sx={{ pt: 0 }}>
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
        <Box sx={{ minWidth: 0 }}>
          <Box role="img" aria-label={`Salary distribution for ${groupLabel}`} sx={{ minWidth: 0 }}>
            <BarChart
              height={isXs ? 220 : 300}
              hideLegend
              colors={[theme.palette.primary.main]}
              xAxis={[
                {
                  scaleType: 'band',
                  data: compactRangeLabels,
                  // 'auto' lets MUI hide every label rather than overlap
                  // them, which with compact ("$50K") labels only actually
                  // triggers at xs -- so show every tick otherwise, and
                  // thin to every other one once it would collide.
                  tickLabelInterval: isXs ? (_value, index) => index % 2 === 0 : () => true,
                  tickLabelStyle: isXs ? { angle: -30, textAnchor: 'end' } : undefined,
                },
              ]}
              yAxis={[{ label: 'Employees' }]}
              series={[
                {
                  data: distribution.map((bucket) => bucket.count),
                  label: 'Headcount',
                  valueFormatter: (value, { dataIndex }) => {
                    const bucket = distribution[dataIndex]
                    const pct =
                      headcount > 0 ? Math.round(((bucket?.count ?? 0) / headcount) * 100) : 0
                    return `${preciseRangeLabels[dataIndex]} · ${value ?? 0} (${pct}%)`
                  },
                },
              ]}
            />
          </Box>
          {/* The clipping styles go on this wrapping div, not the <table>
              itself: a <table>'s caption is laid out in the table's anonymous
              wrapper box, which CSS overflow/clipping does not reach the way it
              reaches a <table> element's own box -- forcing width/height/
              overflow onto the table directly left the caption (and the
              table's own auto-layout content width) poking out past the clip,
              widening the page by exactly the hidden content's width. A table
              shrinks and clips the way a div does only when something *else*
              clips it. */}
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
                    <td>{preciseRangeLabels[index]}</td>
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
      </CardContent>
    </Card>
  )
}
