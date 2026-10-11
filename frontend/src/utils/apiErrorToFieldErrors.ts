import type { ApiError } from '../api/client'

export type FieldErrorMap = Record<string, string>

// Maps an ApiError to per-field messages for the employee form: a 422's
// field errors go to their own field (loc is ["body", "<field>", ...], so
// loc[1] is the field name); a 409 (duplicate email) always means the
// email field, with the server's own message. Anything else -- a network
// failure, a 500 -- returns null, for the caller to show via a Snackbar
// instead, since there's no specific field to attach it to.
export function mapApiErrorToFields(error: ApiError): FieldErrorMap | null {
  if (error.status === 422 && error.fieldErrors) {
    const map: FieldErrorMap = {}
    for (const fieldError of error.fieldErrors) {
      const field = fieldError.loc[1]
      if (typeof field === 'string') {
        map[field] = fieldError.msg
      }
    }
    return Object.keys(map).length > 0 ? map : null
  }

  if (error.status === 409) {
    return { email: error.message }
  }

  return null
}
