import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import type { BlockedUser } from './blocking.api'
import { useBlockedUsers } from './use-blocked-users'

export function BlockedUsersPanel() {
  const { users, loadError, refresh, updateBlock } = useBlockedUsers()
  const [busyId, setBusyId] = useState<string>()
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({})
  const pending = useRef(false)

  async function unblock(user: BlockedUser) {
    if (pending.current) return
    pending.current = true
    setBusyId(user.userId)
    setFeedback({})
    try {
      await updateBlock(user, false)
      setFeedback({ success: `${user.name} was unblocked.` })
    } catch (error) {
      setFeedback({ error: error instanceof ApiError ? error.message : 'Could not unblock this user.' })
    } finally {
      pending.current = false
      setBusyId(undefined)
    }
  }

  return (
    <section className="min-w-0 border-t border-border pt-8" aria-labelledby="blocked-users-heading">
      <h3 id="blocked-users-heading" className="text-base font-semibold">Blocked users</h3>
      {!users && !loadError && <p role="status" className="mt-2 text-sm text-muted-foreground">Loading blocked users…</p>}
      {loadError && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button type="button" size="sm" variant="ghost" onClick={refresh}>Retry</Button>
        </div>
      )}
      {users?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">You haven’t blocked anyone.</p>}
      {!!users?.length && (
        <ul className="mt-2 divide-y divide-border">
          {users.map((user) => (
            <li key={user.userId} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
              </span>
              <Button type="button" size="sm" variant="outline" disabled={!!busyId} aria-label={`Unblock ${user.name}`}
                aria-busy={busyId === user.userId || undefined} onClick={() => void unblock(user)}>
                {busyId === user.userId ? 'Unblocking…' : 'Unblock'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {feedback.error && <p role="alert" className="mt-2 text-sm text-destructive">{feedback.error}</p>}
      {feedback.success && <p role="status" className="mt-2 text-sm text-muted-foreground">{feedback.success}</p>}
    </section>
  )
}
