import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
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
  Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'

import { useEmployeeOptions, useEmployees } from '../api/employees'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useSlowRequest } from '../hooks/useSlowRequest'
import type { EmployeeSortField, SortOrder } from '../types/employee'
import { formatDateOnly } from '../utils/date'
import { formatMoney } from '../utils/money'
import { muiPageToApiPage } from '../utils/pagination'

const DEFAULT_SORT: EmployeeSortField = 'full_name'
const DEFAULT_ORDER: SortOrder = 'asc'
const ALL_VALUE = ''
const SKELETON_ROW_COUNT = 5
const COLUMN_COUNT = 8

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

  function handleFilterChange(setter: (value: string) => void) {
    return (event: SelectChangeEvent) => setter(event.target.value)
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

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <TextField
          label="Search"
          size="small"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          sx={{ minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="country-filter-label">Country</InputLabel>
          <Select
            labelId="country-filter-label"
            label="Country"
            value={country}
            onChange={handleFilterChange(setCountry)}
          >
            <MenuItem value={ALL_VALUE}>All</MenuItem>
            {options?.countries.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="department-filter-label">Department</InputLabel>
          <Select
            labelId="department-filter-label"
            label="Department"
            value={department}
            onChange={handleFilterChange(setDepartment)}
          >
            <MenuItem value={ALL_VALUE}>All</MenuItem>
            {options?.departments.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="job-title-filter-label">Job title</InputLabel>
          <Select
            labelId="job-title-filter-label"
            label="Job title"
            value={jobTitle}
            onChange={handleFilterChange(setJobTitle)}
          >
            <MenuItem value={ALL_VALUE}>All</MenuItem>
            {options?.job_titles.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {employeesQuery.isSuccess && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          {total.toLocaleString()} employees
        </Typography>
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

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'full_name'}
                  direction={sortField === 'full_name' ? sortOrder : 'asc'}
                  onClick={() => handleSortClick('full_name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Job title</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Country</TableCell>
              <TableCell align="right">Salary</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'salary'}
                  direction={sortField === 'salary' ? sortOrder : 'asc'}
                  onClick={() => handleSortClick('salary')}
                >
                  Salary (USD)
                </TableSortLabel>
              </TableCell>
              <TableCell>
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
              <TableRow key={employee.id}>
                <TableCell>{employee.full_name}</TableCell>
                <TableCell>{employee.email}</TableCell>
                <TableCell>{employee.job_title}</TableCell>
                <TableCell>{employee.department}</TableCell>
                <TableCell>{employee.country}</TableCell>
                <TableCell align="right">
                  {formatMoney(employee.annual_gross_salary, employee.currency)}
                </TableCell>
                <TableCell align="right">
                  {formatMoney(employee.annual_gross_salary_usd, 'USD')}
                </TableCell>
                <TableCell>{formatDateOnly(employee.hire_date)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={muiPage}
          onPageChange={handlePageChange}
          rowsPerPage={pageSize}
          onRowsPerPageChange={handlePageSizeChange}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </TableContainer>
    </Box>
  )
}
