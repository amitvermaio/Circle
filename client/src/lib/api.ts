import { clearAuthToken, getAuthToken } from './auth'

type ApiSuccess<T> = { success: true; data: T }
type ApiFailure = {
  success: false
  error: { code: string; message: string }
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

type ApiOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown
  headers?: HeadersInit
}

const apiUrl = import.meta.env.VITE_API_URL

function redirectToLogin(): void {
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  if (!apiUrl) {
    throw new ApiError('The API URL is not configured.', 'CONFIGURATION_ERROR', 0)
  }

  const token = getAuthToken()
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(new URL(path, apiUrl), {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError('Unable to reach the server.', 'NETWORK_ERROR', 0)
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null

  if (!payload || payload.success !== true) {
    const error = payload && 'error' in payload ? payload.error : undefined
    const code = error?.code ?? 'REQUEST_FAILED'
    const message = error?.message ?? 'The request could not be completed.'

    if (response.status === 401) {
      clearAuthToken()
      redirectToLogin()
    }

    throw new ApiError(message, code, response.status)
  }

  return payload.data
}
