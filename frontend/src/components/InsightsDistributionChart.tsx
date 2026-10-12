import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import FormControl from '@mui/material/FormControl'
import MenuItem from '@mui/material/MenuItem'
import Select, { type SelectChangeEvent } from '@mui/material/Select'
import { useTheme } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { BarChart } from '@mui/x-charts/BarChart'
import { useId, useState } from 'react'

import type { DistributionBucket } from '../types/insights'
import {
  buildCompactRangeLabels,
  buildPreciseRangeLabels,
  computeBucketPercentage,
} from '../utils/distributionLabels'
import type { SummaryGroup } from './InsightsSummaryTable'

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
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  // Full precision, for the expandable data table and the tooltip's value
  // line -- never shown on the visible axis, which uses the compact
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
          <Box
            role="img"
            aria-label={`Salary distribution for ${groupLabel}, ${headcountFormat.format(headcount)} employees`}
            aria-describedby={showTable ? tableId : undefined}
            sx={{ minWidth: 0 }}
          >
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
                    const pct = computeBucketPercentage(bucket?.count ?? 0, headcount)
                    return `${preciseRangeLabels[dataIndex]} · ${value ?? 0} (${pct}%)`
                  },
                },
              ]}
            />
          </Box>
          <Button
            size="small"
            onClick={() => setShowTable((previous) => !previous)}
            aria-expanded={showTable}
            aria-controls={tableId}
            sx={{ mt: 1 }}
          >
            {showTable ? 'Hide data table' : 'Show data table'}
          </Button>
          {/* Unmounted when collapsed, not hidden via CSS: a visually-hidden
              table (position: absolute + clip-rect, the previous approach)
              measured as extending a real browser's page 41px wider and
              ~550px taller at 1440px -- a <table>'s own auto-layout sizing,
              and its <caption> (laid out in the table's separate anonymous
              wrapper box), aren't reliably contained by clipping styles
              applied to the table itself. A conditionally-rendered element
              can't leak into layout at all, clipped or not. */}
          {showTable && (
            <TableContainer sx={{ mt: 1, minWidth: 0 }}>
              <Table id={tableId} size="small">
                <caption style={{ captionSide: 'top' }}>
                  Salary distribution for {groupLabel}
                </caption>
                <TableHead>
                  <TableRow>
                    <TableCell>Range</TableCell>
                    <TableCell>Headcount</TableCell>
                    <TableCell>Percentage</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {distribution.map((bucket, index) => (
                    <TableRow key={index}>
                      <TableCell>{preciseRangeLabels[index]}</TableCell>
                      <TableCell>{bucket.count}</TableCell>
                      <TableCell>{computeBucketPercentage(bucket.count, headcount)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            Each range includes its lower bound and excludes its upper bound, except the last, which
            includes the maximum.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}
