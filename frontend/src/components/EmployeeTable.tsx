import ClearIcon from '@mui/icons-material/Clear'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'

import { useEmployeeOptions, useEmployees } from '../api/employees'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useSlowRequest } from '../hooks/useSlowRequest'
import type { EmployeeSortField, SortOrder } from '../types/employee'
import { formatCountryName } from '../utils/country'
import { formatDateOnly } from '../utils/date'
import { formatMoney } from '../utils/money'
import { muiPageToApiPage } from '../utils/pagination'

const DEFAULT_SORT: EmployeeSortField = 'full_name'
const DEFAULT_ORDER: SortOrder = 'asc'
const ALL_VALUE = ''
const SKELETON_ROW_COUNT = 5
const COLUMN_COUNT = 8
const TABLE_MAX_HEIGHT = 560

// Sticky left column (the Name header/cells) so it stays visible while the
// table scrolls horizontally on narrow screens. The header cell deliberately
// has no explicit background here: it inherits MUI's own stickyHeader
// default (theme.palette.background.default), the same token every other
// header cell gets -- the body cells below need their own explicit opaque
// background instead, so scrolled-under content doesn't show through them.
const stickyColumnPositionSx = {
  position: 'sticky' as const,
  left: 0,
}
const stickyBodyCellSx = { ...stickyColumnPositionSx, backgroundColor: 'background.paper' }
const numericCellSx = { fontVariantNumeric: 'tabular-nums' as const }
const nowrapSx = { whiteSpace: 'nowrap' as const }
const hireDateCellSx = { whiteSpace: 'nowrap' as const, minWidth: 130 }

export function EmployeeTable() {
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)

  const [country, setCountry] = useState(ALL_VALUE)
  const [department, setDepartment] = useState(ALL_VALUE)
  const [jobTitle, setJobTitle] = useState(ALL_VALUE)

  const [sortField, setSortField] = useState<EmployeeSortField>(DEFAULT_SORT)
  const [sortOrder, setSortOrder] = useState<SortOrder>(DEFAULT_ORDER)

  const [muiPage, setMuiPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  // Any of these changing invalidates the current page of results, so land
  // back on page 1. This compares against the previous render instead of
  // using an effect -- React's documented pattern for "reset state when an
  // input changes" (calling setState during render here is intentional and
  // safe: React re-renders immediately without committing the stale one).
  const filtersKey = JSON.stringify([
    debouncedSearch,
    country,
    department,
    jobTitle,
    sortField,
    sortOrder,
  ])
  const [lastFiltersKey, setLastFiltersKey] = useState(filtersKey)
  if (filtersKey !== lastFiltersKey) {
    setLastFiltersKey(filtersKey)
    setMuiPage(0)
  }

  const optionsQuery = useEmployeeOptions()
  const employeesQuery = useEmployees({
    q: debouncedSearch || undefined,
    country: country || undefined,
    department: department || undefined,
    job_title: jobTitle || undefined,
    sort: sortField,
    order: sortOrder,
    page: muiPageToApiPage(muiPage),
    page_size: pageSize,
  })

  const isSlow = useSlowRequest(employeesQuery.isFetching)

  function handleSortClick(field: EmployeeSortField) {
    if (sortField !== field) {
      setSortField(field)
      setSortOrder('asc')
      return
    }
    if (sortOrder === 'asc') {
      setSortOrder('desc')
      return
    }
    setSortField(DEFAULT_SORT)
    setSortOrder(DEFAULT_ORDER)
  }

  function handlePageChange(_event: unknown, newMuiPage: number) {
    setMuiPage(newMuiPage)
  }

  function handlePageSizeChange(event: ChangeEvent<HTMLInputElement>) {
    setPageSize(Number(event.target.value))
    setMuiPage(0)
  }

  const employees = employeesQuery.data?.items ?? []
  const total = employeesQuery.data?.total ?? 0
  const options = optionsQuery.data

  // Sorted by display name (what the user sees), not by code.
  const countryOptions = [...(options?.countries ?? [])].sort((a, b) =>
    formatCountryName(a).localeCompare(formatCountryName(b)),
  )

  // Matches on the code or the display name, case-insensitively, so typing
  // either "IN" or "ind" finds India -- MUI's default filtering only checks
  // getOptionLabel's string, which here is the name, not the code.
  function filterCountryOptions(optionCodes: string[], state: { inputValue: string }) {
    const input = state.inputValue.trim().toLowerCase()
    if (!input) return optionCodes
    return optionCodes.filter(
      (code) =>
        code.toLowerCase().includes(input) || formatCountryName(code).toLowerCase().includes(input),
    )
  }

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField
              label="Search"
              size="small"
              fullWidth
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              slotProps={{
                input: {
                  endAdornment: searchInput ? (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="Clear search"
                        size="small"
                        onClick={() => setSearchInput('')}
                        edge="end"
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Autocomplete
              size="small"
              openOnFocus
              options={countryOptions}
              getOptionLabel={formatCountryName}
              filterOptions={filterCountryOptions}
              value={country || null}
              onChange={(_, newValue) => setCountry(newValue ?? '')}
              slotProps={{ clearIndicator: { 'aria-label': 'Clear country filter' } }}
              renderInput={(params) => <TextField {...params} label="Country" />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Autocomplete
              size="small"
              openOnFocus
              options={options?.departments ?? []}
              value={department || null}
              onChange={(_, newValue) => setDepartment(newValue ?? '')}
              slotProps={{ clearIndicator: { 'aria-label': 'Clear department filter' } }}
              renderInput={(params) => <TextField {...params} label="Department" />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Autocomplete
              size="small"
              openOnFocus
              options={options?.job_titles ?? []}
              value={jobTitle || null}
              onChange={(_, newValue) => setJobTitle(newValue ?? '')}
              slotProps={{ clearIndicator: { 'aria-label': 'Clear job title filter' } }}
              renderInput={(params) => <TextField {...params} label="Job title" />}
            />
          </Grid>
        </Grid>
      </Paper>

      {isSlow && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Waking up the server, this can take up to a minute on first load.
        </Alert>
      )}

      {employeesQuery.isError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => employeesQuery.refetch()}>
              Retry
            </Button>
          }
        >
          {employeesQuery.error instanceof Error
            ? employeesQuery.error.message
            : 'Failed to load employees.'}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: TABLE_MAX_HEIGHT, overflow: 'auto' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ ...stickyColumnPositionSx, zIndex: 3 }}>
                  <TableSortLabel
                    active={sortField === 'full_name'}
                    direction={sortField === 'full_name' ? sortOrder : 'asc'}
                    onClick={() => handleSortClick('full_name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">Email</TableCell>
                <TableCell align="center">Job title</TableCell>
                <TableCell align="center">Department</TableCell>
                <TableCell align="center">Country</TableCell>
                {/* Local-currency salary is never sortable: values are in
                    different currencies per employee, so they are not
                    comparable without converting first (that's what the
                    USD column is for). */}
                <TableCell align="center" sx={nowrapSx}>
                  Salary
                </TableCell>
                <TableCell align="center" sx={nowrapSx}>
                  <TableSortLabel
                    active={sortField === 'salary'}
                    direction={sortField === 'salary' ? sortOrder : 'asc'}
                    onClick={() => handleSortClick('salary')}
                  >
                    Salary (USD)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={hireDateCellSx}>
                  <TableSortLabel
                    active={sortField === 'hire_date'}
                    direction={sortField === 'hire_date' ? sortOrder : 'asc'}
                    onClick={() => handleSortClick('hire_date')}
                  >
                    Hire date
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employeesQuery.isPending &&
                Array.from({ length: SKELETON_ROW_COUNT }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: COLUMN_COUNT }).map((_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {employeesQuery.isSuccess && employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} align="center">
                    No employees match
                  </TableCell>
                </TableRow>
              )}

              {employees.map((employee) => (
                <TableRow hover key={employee.id}>
                  <TableCell sx={stickyBodyCellSx}>{employee.full_name}</TableCell>
                  <TableCell>{employee.email}</TableCell>
                  <TableCell>{employee.job_title}</TableCell>
                  <TableCell>
                    <Chip label={employee.department} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={formatCountryName(employee.country)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ ...numericCellSx, ...nowrapSx }}>
                    {formatMoney(employee.annual_gross_salary, employee.currency)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...numericCellSx, ...nowrapSx }}>
                    {formatMoney(employee.annual_gross_salary_usd, 'USD')}
                  </TableCell>
                  <TableCell sx={hireDateCellSx}>{formatDateOnly(employee.hire_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={muiPage}
          onPageChange={handlePageChange}
          rowsPerPage={pageSize}
          onRowsPerPageChange={handlePageSizeChange}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Paper>
    </Box>
  )
}
