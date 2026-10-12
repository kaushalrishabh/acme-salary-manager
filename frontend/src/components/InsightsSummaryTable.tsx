import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Paper from '@mui/material/Paper'
import { useState } from 'react'

import { formatMoney } from '../utils/money'

export interface SummaryGroup {
  key: string
  label: string
  currency: string
  headcount: number
  min: string
  max: string
  average: string
  median: string
}

type SortField = 'label' | 'headcount' | 'min' | 'max' | 'average' | 'median'

const SORT_COLUMNS: { field: SortField; label: string }[] = [
  { field: 'headcount', label: 'Headcount' },
  { field: 'min', label: 'Min' },
  { field: 'max', label: 'Max' },
  { field: 'average', label: 'Average' },
  { field: 'median', label: 'Median' },
]

// Money fields are strings, never used in arithmetic for display -- this
// Number() conversion is sort-order comparison only, not a stored or
// displayed value, so it isn't the kind of "arithmetic on money" this
// project avoids (which is about not computing new money amounts).
function compareValues(a: SummaryGroup, b: SummaryGroup, field: SortField): number {
  if (field === 'label') return a.label.localeCompare(b.label)
  if (field === 'headcount') return a.headcount - b.headcount
  return Number(a[field]) - Number(b[field])
}

export interface InsightsSummaryTableProps {
  groups: SummaryGroup[]
  groupColumnLabel: string
  selectedKey: string
  onSelectGroup: (key: string) => void
}

export function InsightsSummaryTable({
  groups,
  groupColumnLabel,
  selectedKey,
  onSelectGroup,
}: InsightsSummaryTableProps) {
  const [sortField, setSortField] = useState<SortField>('headcount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  function handleSortClick(field: SortField) {
    if (field !== sortField) {
      setSortField(field)
      setSortOrder('desc')
      return
    }
    setSortOrder((previous) => (previous === 'desc' ? 'asc' : 'desc'))
  }

  const sortedGroups = [...groups].sort((a, b) => {
    const comparison = compareValues(a, b, sortField)
    return sortOrder === 'asc' ? comparison : -comparison
  })

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell align="center">
              <TableSortLabel
                active={sortField === 'label'}
                direction={sortField === 'label' ? sortOrder : 'asc'}
                onClick={() => handleSortClick('label')}
              >
                {groupColumnLabel}
              </TableSortLabel>
            </TableCell>
            {SORT_COLUMNS.map(({ field, label }) => (
              <TableCell key={field} align="center">
                <TableSortLabel
                  active={sortField === field}
                  direction={sortField === field ? sortOrder : 'asc'}
                  onClick={() => handleSortClick(field)}
                >
                  {label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedGroups.map((group) => (
            <TableRow
              hover
              key={group.key}
              selected={group.key === selectedKey}
              onClick={() => onSelectGroup(group.key)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell align="center">{group.label}</TableCell>
              <TableCell align="center">{group.headcount}</TableCell>
              <TableCell align="center">{formatMoney(group.min, group.currency)}</TableCell>
              <TableCell align="center">{formatMoney(group.max, group.currency)}</TableCell>
              <TableCell align="center">{formatMoney(group.average, group.currency)}</TableCell>
              <TableCell align="center">{formatMoney(group.median, group.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
