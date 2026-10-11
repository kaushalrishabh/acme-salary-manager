// Typed fetch wrapper: builds the request against VITE_API_URL, parses a
// successful JSON body, and converts any failure (an HTTP error response,
// or fetch itself rejecting) into one ApiError shape.

const BASE_URL = import.meta.env.VITE_API_URL as string

export interface FieldError {
  loc: (string | number)[]
  msg: string
  type: string
}

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: FieldError[] | null

  constructor(status: number, message: string, fieldErrors: FieldError[] | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

// 404/409 use {"detail": "..."}; 422 uses {"detail": [{"loc", "msg", "type"}, ...]}.
interface ErrorBody {
  detail: string | FieldError[]
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null || !('detail' in value)) return false
  const detail = (value as { detail: unknown }).detail
  return typeof detail === 'string' || Array.isArray(detail)
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return new ApiError(response.status, response.statusText || 'Request failed')
  }

  if (!isErrorBody(body)) {
    return new ApiError(response.status, response.statusText || 'Request failed')
  }

  if (typeof body.detail === 'string') {
    return new ApiError(response.status, body.detail)
  }

  const message = body.detail.map((fieldError) => fieldError.msg).join('; ')
  return new ApiError(response.status, message, body.detail)
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'Network error: could not reach the server')
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  return (await response.json()) as T
}
