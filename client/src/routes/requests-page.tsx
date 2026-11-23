import { ArrowLeftIcon, TrayIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router'

import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { acceptRoomRequest, declineRoomRequest, roomName, type RoomRequest } from '@/features/chats/chats.api'
import { ApiError } from '@/lib/api'

import type { RequestsContext } from './chats-page'

export function RequestsPage() {
  const { requests, loading, error, retry, onResolved } = useOutletContext<RequestsContext>()
  const [responding, setResponding] = useState<{ roomId: string; action: 'accept' | 'decline' }>()
  const [actionError, setActionError] = useState('')
  const pending = useRef(false)

  async function respond(request: RoomRequest, action: 'accept' | 'decline') {
    if (pending.current) return
    pending.current = true
    setResponding({ roomId: request.roomId, action })
    setActionError('')
    try {
      if (action === 'accept') {
        const { room } = await acceptRoomRequest(request.roomId)
        onResolved(request.roomId, { ...room, directUser: request.directUser })
      } else {
        await declineRoomRequest(request.roomId)
        onResolved(request.roomId)
      }
    } catch (failure) {
      setActionError(failure instanceof ApiError ? failure.message : 'Could not update the request.')
      retry()
    } finally {
      pending.current = false
      setResponding(undefined)
    }
  }

  return (
    <section aria-labelledby="requests-heading" className="flex min-h-0 min-w-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="icon" className="size-8 md:hidden">
          <Link to="/chats" aria-label="Back to chats"><ArrowLeftIcon aria-hidden /></Link>
        </Button>
        <h2 id="requests-heading" className="flex-1 text-sm font-semibold">Message requests</h2>
        <ThemeSwitcher className="size-8 md:hidden [&_svg]:size-4" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
          {loading && <p role="status" className="text-sm text-muted-foreground">Loading requests…</p>}
          {error && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
            </div>
          )}
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          {!loading && !error && requests.length === 0 && (
            <div className="grid justify-items-center gap-2 py-16 text-center">
              <TrayIcon className="size-8 text-brand" aria-hidden />
              <h3 className="text-base font-semibold">No new requests</h3>
            </div>
          )}
          {requests.length > 0 && (
            <ul aria-label="Incoming requests" className="divide-y divide-border rounded-lg border border-border bg-card">
              {requests.map((request) => (
                <li key={request.roomId} className="space-y-3 p-4">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">{roomName(request)}</h3>
                    {request.directUser && <p className="text-xs text-muted-foreground">@{request.directUser.username}</p>}
                    <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">
                      {request.lastMessage ? request.lastMessage.text || 'Attachment' : 'No message yet'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="soft" size="sm" disabled={!!responding} onClick={() => void respond(request, 'accept')}>
                      {responding?.roomId === request.roomId && responding.action === 'accept' ? 'Accepting…' : 'Accept'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="border border-border" disabled={!!responding}
                      onClick={() => void respond(request, 'decline')}>
                      {responding?.roomId === request.roomId && responding.action === 'decline' ? 'Declining…' : 'Decline'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
