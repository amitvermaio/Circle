type ApiSuccess<T> = { success: true; data: T }
type ApiFailure = {
  success: false
  error: { code: string; message: string; details?: unknown }
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return typeof value === 'object' && value !== null && 'success' in value && value.success === true && 'data' in value
}

function isApiFailure(value: unknown): value is ApiFailure {
  return typeof value === 'object' && value !== null && 'success' in value && value.success === false && 'error' in value
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: unknown

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

type ApiOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown
  headers?: HeadersInit
  responseType?: 'envelope' | 'raw'
  redirectOnUnauthorized?: boolean
}

const apiUrl = import.meta.env.VITE_API_URL
const TOKEN_STORAGE_KEY = 'chat_token'

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

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

  const payload: unknown = await response.json().catch(() => null)

  if (options.responseType === 'raw') {
    if (!response.ok || payload === null) {
      throw new ApiError('The request could not be completed.', 'REQUEST_FAILED', response.status)
    }
    return payload as T
  }

  if (!isApiSuccess<T>(payload)) {
    const error = isApiFailure(payload) ? payload.error : undefined
    const code = error?.code ?? 'REQUEST_FAILED'
    const message = error?.message ?? 'The request could not be completed.'

    if (response.status === 401 && token === getAuthToken()) {
      clearAuthToken()
      if (options.redirectOnUnauthorized !== false) redirectToLogin()
    }

    throw new ApiError(message, code, response.status, error?.details)
  }

  return payload.data
}
