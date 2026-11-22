import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '@/lib/api'

import { listBlockedUsers, setUserBlocked, type BlockedUser } from './blocking.api'

export function useBlockedUsers(enabled = true) {
  const [users, setUsers] = useState<BlockedUser[]>()
  const [loadError, setLoadError] = useState('')
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    if (!enabled) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoadError('')
    void listBlockedUsers(controller.signal).then(({ users }) => {
      if (!controller.signal.aborted) setUsers(users)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof ApiError ? error.message : 'Could not load blocked users.')
      }
    })
  }, [enabled])

  useEffect(() => {
    refresh()
    return () => request.current?.abort()
  }, [refresh])

  async function updateBlock(user: BlockedUser, blocked: boolean) {
    const result = await setUserBlocked(user.userId, blocked)
    request.current?.abort()
    setLoadError('')
    setUsers((current) => {
      const remaining = (current ?? []).filter(({ userId }) => userId !== user.userId)
      return result.blocked ? [...remaining, user] : remaining
    })
    return result.blocked
  }

  return { users, loadError, refresh, updateBlock }
}
