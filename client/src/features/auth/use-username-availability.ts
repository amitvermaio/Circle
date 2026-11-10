import { useEffect, useState } from 'react'

import { checkUsernameAvailability } from './auth.api'

export type UsernameAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const usernamePattern = /^[a-z0-9_]{3,20}$/

export function useUsernameAvailability(username: string): UsernameAvailability {
  const [status, setStatus] = useState<UsernameAvailability>('idle')

  useEffect(() => {
    const normalized = username.trim().toLowerCase()
    if (!normalized) {
      setStatus('idle')
      return
    }
    if (!usernamePattern.test(normalized)) {
      setStatus('invalid')
      return
    }

    let active = true
    setStatus('checking')
    const timer = window.setTimeout(() => {
      void checkUsernameAvailability(normalized)
        .then(({ available }) => {
          if (active) setStatus(available ? 'available' : 'taken')
        })
        .catch(() => {
          if (active) setStatus('idle')
        })
    }, 400)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [username])

  return status
}
