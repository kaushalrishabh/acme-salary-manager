import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select, { type SelectChangeEvent } from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import { useState, type FormEvent } from 'react'

import { useCreateEmployee, useEmployeeOptions, useUpdateEmployee } from '../api/employees'
import { useCountries } from '../api/meta'
import type { ApiError } from '../api/client'
import { showNotice } from '../notifications/noticeStore'
import type { Employee, EmployeeWriteRequest } from '../types/employee'
import { mapApiErrorToFields, type FieldErrorMap } from '../utils/apiErrorToFieldErrors'
import { formatCountryName } from '../utils/country'

const EMPTY_VALUES: EmployeeWriteRequest = {
  full_name: '',
  email: '',
  job_title: '',
  department: '',
  country: '',
  annual_gross_salary: '',
  hire_date: '',
}

function toWriteRequest(employee: Employee): EmployeeWriteRequest {
  return {
    full_name: employee.full_name,
    email: employee.email,
    job_title: employee.job_title,
    department: employee.department,
    country: employee.country,
    annual_gross_salary: employee.annual_gross_salary,
    hire_date: employee.hire_date,
  }
}

// Rough client-side check only -- a plain decimal number, no currency
// symbol or thousands separators. Exact format/limits are business rules
// enforced server-side (app.money.parse_major_to_minor).
const ROUGH_DECIMAL_PATTERN = /^\d+(\.\d+)?$/

function validate(values: EmployeeWriteRequest): FieldErrorMap {
  const errors: FieldErrorMap = {}
  if (!values.full_name.trim()) errors.full_name = 'Required'
  if (!values.email.trim()) errors.email = 'Required'
  if (!values.job_title.trim()) errors.job_title = 'Required'
  if (!values.department.trim()) errors.department = 'Required'
  if (!values.country) errors.country = 'Required'
  if (!values.hire_date) errors.hire_date = 'Required'
  if (!values.annual_gross_salary.trim()) {
    errors.annual_gross_salary = 'Required'
  } else if (!ROUGH_DECIMAL_PATTERN.test(values.annual_gross_salary.trim())) {
    errors.annual_gross_salary = 'Enter a plain decimal number, e.g. 85000.00'
  }
  return errors
}

export interface EmployeeFormDialogProps {
  open: boolean
  onClose: () => void
  employee?: Employee
}

export function EmployeeFormDialog({ open, onClose, employee }: EmployeeFormDialogProps) {
  const isEdit = employee !== undefined
  // The lazy initializer (not a bare EMPTY_VALUES) matters: the dialog can
  // mount already open (every test, and the real table, always render it
  // with open starting true/false as a controlled prop rather than
  // transitioning into it) -- without reading `employee` here too, Edit
  // would start empty until some *later* open transition the render-time
  // reset below never actually sees on first mount.
  const [values, setValues] = useState<EmployeeWriteRequest>(() =>
    open && employee ? toWriteRequest(employee) : EMPTY_VALUES,
  )
  const [submitted, setSubmitted] = useState(false)
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrorMap>({})

  const optionsQuery = useEmployeeOptions()
  const countriesQuery = useCountries()
  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee()
  const mutation = isEdit ? updateMutation : createMutation

  // Fresh form state on every closed -> open transition, for whichever
  // employee (or none, for Add) it was opened with -- a render-time
  // comparison against the previous render (React's documented "adjusting
  // state when a prop changes" pattern) instead of an effect, which
  // eslint-plugin-react-hooks' set-state-in-effect rule flags as a
  // cascading-render risk.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(employee ? toWriteRequest(employee) : EMPTY_VALUES)
      setSubmitted(false)
      setServerFieldErrors({})
    }
  }

  const clientErrors = validate(values)

  function setField<K extends keyof EmployeeWriteRequest>(
    field: K,
    value: EmployeeWriteRequest[K],
  ) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setServerFieldErrors((previous) => {
      if (!(field in previous)) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }

  function fieldError(field: keyof EmployeeWriteRequest): string | undefined {
    return serverFieldErrors[field] ?? (submitted ? clientErrors[field] : undefined)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(clientErrors).length > 0) return

    const onSuccess = () => {
      showNotice(isEdit ? 'Employee updated' : 'Employee created')
      onClose()
    }
    const onError = (error: unknown) => {
      const mapped = mapApiErrorToFields(error as ApiError)
      if (mapped) {
        setServerFieldErrors(mapped)
      } else {
        showNotice((error as ApiError).message, 'error')
      }
    }

    if (isEdit) {
      updateMutation.mutate({ id: employee.id, data: values }, { onSuccess, onError })
    } else {
      createMutation.mutate(values, { onSuccess, onError })
    }
  }

  const selectedCountry = countriesQuery.data?.find((country) => country.code === values.country)
  const decimalHint = selectedCountry
    ? `${selectedCountry.currency}, ${
        selectedCountry.minor_unit === 0
          ? 'no decimals'
          : `${selectedCountry.minor_unit} decimal places`
      }`
    : undefined

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit employee' : 'Add employee'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <TextField
            label="Full name"
            fullWidth
            margin="normal"
            value={values.full_name}
            onChange={(event) => setField('full_name', event.target.value)}
            error={!!fieldError('full_name')}
            helperText={fieldError('full_name')}
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            value={values.email}
            onChange={(event) => setField('email', event.target.value)}
            error={!!fieldError('email')}
            helperText={fieldError('email')}
          />
          <Autocomplete
            freeSolo
            options={optionsQuery.data?.job_titles ?? []}
            inputValue={values.job_title}
            onInputChange={(_, newValue) => setField('job_title', newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Job title"
                margin="normal"
                error={!!fieldError('job_title')}
                helperText={fieldError('job_title')}
              />
            )}
          />
          <Autocomplete
            freeSolo
            options={optionsQuery.data?.departments ?? []}
            inputValue={values.department}
            onInputChange={(_, newValue) => setField('department', newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Department"
                margin="normal"
                error={!!fieldError('department')}
                helperText={fieldError('department')}
              />
            )}
          />
          <FormControl fullWidth margin="normal" error={!!fieldError('country')}>
            <InputLabel id="employee-form-country-label">Country</InputLabel>
            <Select
              labelId="employee-form-country-label"
              label="Country"
              value={values.country}
              onChange={(event: SelectChangeEvent) => setField('country', event.target.value)}
            >
              {countriesQuery.data?.map((country) => (
                <MenuItem key={country.code} value={country.code}>
                  {formatCountryName(country.code)}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{fieldError('country') ?? decimalHint}</FormHelperText>
          </FormControl>
          <TextField
            label="Annual gross salary"
            fullWidth
            margin="normal"
            value={values.annual_gross_salary}
            onChange={(event) => setField('annual_gross_salary', event.target.value)}
            error={!!fieldError('annual_gross_salary')}
            helperText={fieldError('annual_gross_salary')}
          />
          <TextField
            label="Hire date"
            type="date"
            fullWidth
            margin="normal"
            slotProps={{ inputLabel: { shrink: true } }}
            value={values.hire_date}
            onChange={(event) => setField('hire_date', event.target.value)}
            error={!!fieldError('hire_date')}
            helperText={fieldError('hire_date')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" loading={mutation.isPending}>
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
