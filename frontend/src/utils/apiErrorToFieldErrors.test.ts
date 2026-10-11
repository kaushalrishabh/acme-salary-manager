import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/client'
import { mapApiErrorToFields } from './apiErrorToFieldErrors'

describe('mapApiErrorToFields', () => {
  it('maps a 422 field error to its field, via loc[1]', () => {
    const error = new ApiError(422, 'not a valid amount', [
      { loc: ['body', 'annual_gross_salary'], msg: 'not a valid amount', type: 'value_error' },
    ])

    expect(mapApiErrorToFields(error)).toEqual({
      annual_gross_salary: 'not a valid amount',
    })
  })

  it('maps multiple 422 field errors at once', () => {
    const error = new ApiError(422, 'combined', [
      { loc: ['body', 'full_name'], msg: 'required', type: 'missing' },
      { loc: ['body', 'email'], msg: 'not a valid email', type: 'value_error' },
    ])

    expect(mapApiErrorToFields(error)).toEqual({
      full_name: 'required',
      email: 'not a valid email',
    })
  })

  it('maps a 409 to the email field with the server message', () => {
    const error = new ApiError(409, 'An employee with this email already exists')

    expect(mapApiErrorToFields(error)).toEqual({
      email: 'An employee with this email already exists',
    })
  })

  it('returns null for an unmapped error (e.g. a 500), for the caller to show via a Snackbar', () => {
    const error = new ApiError(500, 'Internal Server Error')

    expect(mapApiErrorToFields(error)).toBeNull()
  })

  it('returns null for a network failure (status 0)', () => {
    const error = new ApiError(0, 'Network error: could not reach the server')

    expect(mapApiErrorToFields(error)).toBeNull()
  })
})
