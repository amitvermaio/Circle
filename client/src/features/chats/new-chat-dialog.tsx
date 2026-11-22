import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { directContactUnavailable } from '@/features/blocking/blocking.api'
import { ApiError } from '@/lib/api'

import { createDirectRoom, searchUsers, type ChatUser, type Room } from './chats.api'

type Props = {
  onClose: () => void
  onOpenRoom: (room: Room) => void
}

export function NewChatDialog({ onClose, onOpenRoom }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<ChatUser[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => request.current?.abort(), [])

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const username = query.trim().replace(/^@/, '').trim()
    if (!username || opening) return

    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setSearching(true)
    setUsers(null)
    setError('')
    try {
      const { users: matches } = await searchUsers(username, controller.signal)
      if (!controller.signal.aborted) setUsers(matches)
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof ApiError ? error.message : 'Could not search for users.')
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }

  async function openChat(user: ChatUser) {
    if (opening) return
    setOpening(user.userId)
    setError('')
    try {
      const { room } = await createDirectRoom(user.userId)
      onOpenRoom({ ...room, directUser: user })
    } catch (error) {
      setError(error instanceof ApiError
        ? error.code === 'USER_BLOCKED' ? directContactUnavailable : error.message
        : 'Could not open the chat.')
      setOpening(null)
    }
  }

  return (
    <Dialog open onClose={onClose} title="New chat" description="Search for a username, then choose who to chat with."
      busy={opening !== null} initialFocus={input} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <form className="mt-4 flex gap-2" onSubmit={handleSearch}>
        <Input
          ref={input}
          aria-label="Username"
          type="search"
          placeholder="Search by username"
          autoComplete="off"
          maxLength={50}
          value={query}
          disabled={opening !== null}
          onChange={(event) => {
            request.current?.abort()
            setQuery(event.target.value)
            setUsers(null)
            setSearching(false)
            setError('')
          }}
        />
        <Button type="submit" variant="outline" disabled={!query.trim().replace(/^@/, '').trim() || searching || opening !== null}>
          <MagnifyingGlassIcon aria-hidden /> Search
        </Button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {searching && <p role="status" className="mt-4 text-sm text-muted-foreground">Searching…</p>}
      {users?.length === 0 && <p role="status" className="mt-4 text-sm text-muted-foreground">No users found.</p>}
      {!!users?.length && (
        <ul aria-label="Search results" className="mt-4 max-h-60 space-y-1 overflow-y-auto">
          {users.map((user) => (
            <li key={user.userId}>
              <Button
                type="button"
                variant="ghost"
                disabled={opening !== null}
                className="h-auto w-full justify-between py-2 text-left"
                onClick={() => void openChat(user)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{user.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
                </span>
                {opening === user.userId && <span role="status" className="text-xs">Opening…</span>}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onClose} disabled={opening !== null}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
