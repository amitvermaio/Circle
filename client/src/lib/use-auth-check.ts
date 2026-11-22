import { useEffect, useState } from 'react'

import { getCurrentUser, type AuthResponse, type AuthenticatedUser } from '@/features/auth/auth.api'

import { ApiError, clearAuthToken, getAuthToken, setAuthToken } from './api'

type AuthState =
  | { status: 'checking' | 'unauthenticated' }
  | { status: 'authenticated'; user: AuthenticatedUser }
  | { status: 'unavailable'; message: string }

export function useAuthCheck() {
  const [session, setSession] = useState<AuthState>(() => ({
    status: getAuthToken() ? 'checking' : 'unauthenticated',
  }))
  const status = session.status

  useEffect(() => {
    if (status !== 'checking') return
    if (!getAuthToken()) {
      setSession({ status: 'unauthenticated' })
      return
    }

    const controller = new AbortController()
    void getCurrentUser(controller.signal).then(({ user }) => {
      if (!controller.signal.aborted) setSession({ status: 'authenticated', user })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && error.status === 401) {
        // The API helper has already cleared the rejected token.
        setSession({ status: 'unauthenticated' })
      } else {
        setSession({
          status: 'unavailable',
          message: error instanceof ApiError ? error.message : 'Could not check your session.',
        })
      }
    })
    return () => controller.abort()
  }, [status])

  return {
    session,
    retry: () => setSession({ status: 'checking' }),
    signIn: ({ token, user }: AuthResponse) => {
      setAuthToken(token)
      setSession({ status: 'authenticated', user })
    },
    signOut: () => {
      clearAuthToken()
      setSession({ status: 'unauthenticated' })
    },
    updateUser: (user: AuthenticatedUser) => setSession((current) =>
      current.status === 'authenticated' ? { status: 'authenticated', user } : current),
  }
}
