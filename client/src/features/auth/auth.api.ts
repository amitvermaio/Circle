import { api } from '@/lib/api'

export type AuthenticatedUser = {
  userId: string
  name: string
  email: string
  username: string
}

export type RegisterInput = {
  name: string
  email: string
  password: string
  username: string
}

export type LoginInput = Pick<RegisterInput, 'email' | 'password'>

type AuthResponse = {
  user: AuthenticatedUser
  token: string
}

export function requestRegistrationOtp(input: RegisterInput): Promise<{ message: string }> {
  return api('/api/v1/auth/register/request-otp', { method: 'POST', body: input })
}

export function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  return api(`/api/v1/users/username-available?username=${encodeURIComponent(username)}`, {
    responseType: 'raw',
  })
}

export function verifyRegistrationOtp(email: string, otp: string): Promise<AuthResponse> {
  return api('/api/v1/auth/register/verify-otp', { method: 'POST', body: { email, otp } })
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return api('/api/v1/auth/login', { method: 'POST', body: input })
}

export function logout(): Promise<{ message: string }> {
  return api('/api/v1/auth/logout', { method: 'POST' })
}
