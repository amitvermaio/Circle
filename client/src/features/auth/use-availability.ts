import { useEffect, useState } from 'react'

import { getErrorMessage } from './validation'

type Availability = {
  value: string
  status: 'checking' | 'available' | 'taken' | 'error'
  error?: string
}

export function useAvailability(value: string, check: (value: string, signal: AbortSignal) => Promise<{ available: boolean }>) {
  const [result, setResult] = useState<Availability>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!value) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setResult({ value, status: 'checking' })
      try {
        const { available } = await check(value, controller.signal)
        if (!controller.signal.aborted) setResult({ value, status: available ? 'available' : 'taken' })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ value, status: 'error', error: getErrorMessage(error) })
      }
    }, 400)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [value, check, attempt])

  const current = value && result?.value === value ? result : undefined
  return {
    status: current?.status,
    error: current?.error,
    reset: () => setResult(undefined),
    retry: () => {
      setResult(undefined)
      setAttempt((current) => current + 1)
    },
    markTaken: () => setResult({ value, status: 'taken' }),
  }
}
