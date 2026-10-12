import AddIcon from '@mui/icons-material/Add'
import ClearIcon from '@mui/icons-material/Clear'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
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
import { tablePaginationClasses } from '@mui/material/TablePagination'
import type { ChangeEvent, MouseEvent } from 'react'
import { useState } from 'react'

import { useEmployeeOptions, useEmployees } from '../api/employees'
import { useAuth } from '../auth/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useSlowRequest } from '../hooks/useSlowRequest'
import type { Employee, EmployeeSortField, SortOrder } from '../types/employee'
import { formatCountryName } from '../utils/country'
import { formatDateOnly } from '../utils/date'
import { formatMoney } from '../utils/money'
import { muiPageToApiPage } from '../utils/pagination'
import { DeleteEmployeeDialog } from './DeleteEmployeeDialog'
import { EmployeeFormDialog } from './EmployeeFormDialog'

const DEFAULT_SORT: EmployeeSortField = 'full_name'
const DEFAULT_ORDER: SortOrder = 'asc'
const ALL_VALUE = ''
const SKELETON_ROW_COUNT = 5
const TABLE_MAX_HEIGHT = 560

// Sticky left column (the Name header/cells) so it stays visible while the
// table scrolls horizontally on narrow screens. The header cell deliberately
// sets no background of its own: every TableCell inside a <Table
// stickyHeader> automatically gets position:sticky + background.default
// from MUI's own internals (see node_modules/@mui/material/TableCell), so
// all 8 header cells -- Name included -- get that color from the exact same
// rule. An earlier round added an explicit background.default override
// here on the theory that a sticky cell wasn't reliably inheriting it; that
// turned out not to fix the reported mismatch, and re-reading the source
// confirms both paths resolve to the identical literal value (#f1f5f9) --
// so the duplicate was removed rather than kept "just in case": one shared
// rule can't diverge from itself. (zIndex:3 is still needed, to stack above
// the other sticky header cells -- zIndex:2 -- while scrolled horizontally.)
const stickyColumnPositionSx = {
  position: 'sticky' as const,
  left: 0,
}
const stickyHeaderCellSx = {
  ...stickyColumnPositionSx,
  zIndex: 3,
}
const stickyBodyCellSx = { ...stickyColumnPositionSx, backgroundColor: 'background.paper' }
const numericCellSx = { fontVariantNumeric: 'tabular-nums' as const }
const nowrapSx = { whiteSpace: 'nowrap' as const }
const ellipsisSx = {
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
}

// Column width budget at lg (1200px) and up, where table-layout switches
// to fixed (see the Table's sx below) -- see design-notes.md for how each
// percentage was estimated and re-tuned to make room for Actions. Sums to
// 99% including Actions (99% assumes Actions is rendered, i.e. logged in;
// logged out, these same percentages sum to 94%, leaving a harmless 6% of
// unused width at the table's right edge rather than maintaining two
// separate budgets for a cosmetic difference).
const COLUMN_WIDTH_LG = {
  name: '11%',
  email: '18%',
  jobTitle: '16%',
  department: '9%',
  country: '11%',
  salary: '10%',
  salaryUsd: '10%',
  hireDate: '9%',
  actions: '5%',
}

// Below lg, table-layout is auto and the table scrolls horizontally inside
// its card (unchanged from before this round): these columns keep a fixed
// pixel minimum/maximum so that still reads well. At lg+, table-layout is
// fixed, so the percentage width is what actually constrains the column,
// and overflowing text truncates (ellipsisSx) instead of forcing the
// column wider -- which is what caused the horizontal scrollbar this round
// fixes.
const nameCellWidthSx = { width: { lg: COLUMN_WIDTH_LG.name } }
const emailCellSx = {
  ...ellipsisSx,
  maxWidth: { xs: 220, lg: 'none' },
  width: { lg: COLUMN_WIDTH_LG.email },
}
const jobTitleCellSx = {
  ...ellipsisSx,
  minWidth: { xs: 220, lg: 0 },
  width: { lg: COLUMN_WIDTH_LG.jobTitle },
}
const departmentCellSx = { width: { lg: COLUMN_WIDTH_LG.department } }
const countryCellSx = { width: { lg: COLUMN_WIDTH_LG.country } }
const hireDateCellSx = {
  ...nowrapSx,
  minWidth: { xs: 130, lg: 0 },
  width: { lg: COLUMN_WIDTH_LG.hireDate },
}
// The figure is just centred text like every other body cell now (no
// fixed-width inline-block -- removed per S7's table-alignment pass, which
// centres every column uniformly); tabular-nums still keeps digit widths
// consistent, it just no longer right-edge-aligns across rows.
const salaryColumnSx = { ...nowrapSx, ...numericCellSx, width: { lg: COLUMN_WIDTH_LG.salary } }
const salaryUsdColumnSx = {
  ...nowrapSx,
  ...numericCellSx,
  width: { lg: COLUMN_WIDTH_LG.salaryUsd },
}
// Centres the sort label + icon as a unit within the (centred) header
// cell, rather than relying solely on the cell's text-align to centre an
// inline-flex element -- more robust across browsers, especially for the
// sticky-positioned Name column.
const sortLabelSx = { width: '100%', justifyContent: 'center' as const }
const actionsCellSx = { ...nowrapSx, width: { lg: COLUMN_WIDTH_LG.actions } }

interface MenuState {
  anchorEl: HTMLElement
  employee: Employee
}

export function EmployeeTable() {
  const { isLoggedIn } = useAuth()
  const columnCount = isLoggedIn ? 9 : 8

  const [menuState, setMenuState] = useState<MenuState | null>(null)
  const [formDialog, setFormDialog] = useState<{ open: boolean; employee?: Employee }>({
    open: false,
  })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; employee: Employee | null }>({
    open: false,
    employee: null,
  })

  function handleOpenMenu(event: MouseEvent<HTMLElement>, employee: Employee) {
    setMenuState({ anchorEl: event.currentTarget, employee })
  }

  function handleCloseMenu() {
    setMenuState(null)
  }

  function handleAddClick() {
    setFormDialog({ open: true, employee: undefined })
  }

  function handleEditClick() {
    if (!menuState) return
    setFormDialog({ open: true, employee: menuState.employee })
    setMenuState(null)
  }

  function handleDeleteClick() {
    if (!menuState) return
    setDeleteDialog({ open: true, employee: menuState.employee })
    setMenuState(null)
  }

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

      {isLoggedIn && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddClick}>
            Add employee
          </Button>
        </Box>
      )}

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
        <TableContainer
          sx={{
            // At lg+, size to the viewport (estimated overhead: AppBar
            // 64px + Container's py 64px + filters card ~88px + table
            // card border/pagination ~58px -- see design-notes.md) so the
            // page itself doesn't scroll, only this area does, with the
            // pagination footer always in view. Below lg, kept at the
            // original fixed height.
            maxHeight: { xs: TABLE_MAX_HEIGHT, lg: 'calc(100vh - 320px)' },
            overflow: 'auto',
          }}
        >
          <Table stickyHeader sx={{ tableLayout: { xs: 'auto', lg: 'fixed' } }}>
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ ...stickyHeaderCellSx, ...nameCellWidthSx }}>
                  <TableSortLabel
                    active={sortField === 'full_name'}
                    direction={sortField === 'full_name' ? sortOrder : 'asc'}
                    onClick={() => handleSortClick('full_name')}
                    sx={sortLabelSx}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ width: { lg: COLUMN_WIDTH_LG.email } }}>
                  Email
                </TableCell>
                <TableCell align="center" sx={jobTitleCellSx}>
                  Job title
                </TableCell>
                <TableCell align="center" sx={departmentCellSx}>
                  Department
                </TableCell>
                <TableCell align="center" sx={countryCellSx}>
                  Country
                </TableCell>
                {/* Local-currency salary is never sortable: values are in
                    different currencies per employee, so they are not
                    comparable without converting first (that's what the
                    USD column is for). */}
                <TableCell align="center" sx={salaryColumnSx}>
                  Salary
                </TableCell>
                <TableCell align="center" sx={salaryUsdColumnSx}>
                  <TableSortLabel
                    active={sortField === 'salary'}
                    direction={sortField === 'salary' ? sortOrder : 'asc'}
                    onClick={() => handleSortClick('salary')}
                    sx={sortLabelSx}
                  >
                    Salary (USD)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={hireDateCellSx}>
                  <TableSortLabel
                    active={sortField === 'hire_date'}
                    direction={sortField === 'hire_date' ? sortOrder : 'asc'}
                    onClick={() => handleSortClick('hire_date')}
                    sx={sortLabelSx}
                  >
                    Hire date
                  </TableSortLabel>
                </TableCell>
                {isLoggedIn && (
                  <TableCell align="center" sx={actionsCellSx}>
                    Actions
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {employeesQuery.isPending &&
                Array.from({ length: SKELETON_ROW_COUNT }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: columnCount }).map((_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {employeesQuery.isSuccess && employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columnCount} align="center">
                    No employees match
                  </TableCell>
                </TableRow>
              )}

              {employees.map((employee) => (
                <TableRow hover key={employee.id}>
                  <TableCell
                    align="center"
                    title={employee.full_name}
                    sx={{ ...stickyBodyCellSx, ...ellipsisSx, ...nameCellWidthSx }}
                  >
                    {employee.full_name}
                  </TableCell>
                  <TableCell align="center" title={employee.email} sx={emailCellSx}>
                    {employee.email}
                  </TableCell>
                  <TableCell align="center" title={employee.job_title} sx={jobTitleCellSx}>
                    {employee.job_title}
                  </TableCell>
                  <TableCell align="center" sx={departmentCellSx}>
                    <Chip label={employee.department} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="center" sx={countryCellSx}>
                    <Chip
                      label={formatCountryName(employee.country)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center" sx={salaryColumnSx}>
                    {formatMoney(employee.annual_gross_salary, employee.currency)}
                  </TableCell>
                  <TableCell align="center" sx={salaryUsdColumnSx}>
                    {formatMoney(employee.annual_gross_salary_usd, 'USD')}
                  </TableCell>
                  <TableCell align="center" sx={hireDateCellSx}>
                    {formatDateOnly(employee.hire_date)}
                  </TableCell>
                  {isLoggedIn && (
                    <TableCell align="center" sx={actionsCellSx}>
                      <IconButton
                        aria-label={`Actions for ${employee.full_name}`}
                        size="small"
                        onClick={(event) => handleOpenMenu(event, employee)}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
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
          // At xs, the full toolbar (rows-per-page label + select, range
          // text, prev/next buttons) is wider than a 390px viewport,
          // clipping the next-page button. Hide the rows-per-page control
          // below md, leaving only the range text and prev/next buttons.
          sx={{
            [`& .${tablePaginationClasses.selectLabel}, & .${tablePaginationClasses.input}`]: {
              display: { xs: 'none', md: 'flex' },
            },
            [`& .${tablePaginationClasses.toolbar}`]: {
              flexWrap: 'wrap',
              justifyContent: { xs: 'space-between', md: 'flex-end' },
            },
          }}
        />
      </Paper>

      <Menu anchorEl={menuState?.anchorEl} open={menuState !== null} onClose={handleCloseMenu}>
        <MenuItem onClick={handleEditClick}>Edit</MenuItem>
        <MenuItem onClick={handleDeleteClick}>Delete</MenuItem>
      </Menu>

      <EmployeeFormDialog
        open={formDialog.open}
        employee={formDialog.employee}
        onClose={() => setFormDialog({ open: false })}
      />
      <DeleteEmployeeDialog
        open={deleteDialog.open}
        employee={deleteDialog.employee}
        onClose={() => setDeleteDialog({ open: false, employee: null })}
      />
    </Box>
  )
}
