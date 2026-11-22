import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RoomMessage } from '@/lib/socket'

import { actionError, previewText } from './message-actions'
import { searchRoomMessages } from './messages.api'

type SearchPage = Awaited<ReturnType<typeof searchRoomMessages>>

export function RoomSearch({ roomId, historyBusy, jumpError, onSelect, resolveMessage, nameFor, timeFormat }: {
  roomId: string
  historyBusy: boolean
  jumpError: string
  onSelect: (messageId: string) => void
  resolveMessage: (message: RoomMessage) => RoomMessage[]
  nameFor: (id: string) => string
  timeFormat: Intl.DateTimeFormat
}) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<{ query: string; page?: SearchPage; error?: string }>()
  const [loadingMore, setLoadingMore] = useState(false)
  const request = useRef<AbortController | null>(null)
  const query = input.trim()
  const current = result?.query === query ? result : undefined
  const page = current?.page
  const matches = page?.messages.flatMap(resolveMessage).filter((message) => !message.deletedForEveryone)

  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    request.current = controller
    const timer = window.setTimeout(async () => {
      try {
        const page = await searchRoomMessages(roomId, query, controller.signal)
        if (!controller.signal.aborted) setResult({ query, page })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ query, error: actionError(error, 'Could not search messages.') })
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, roomId])

  async function loadMore() {
    const controller = request.current
    if (!controller || controller.signal.aborted || !page?.nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await searchRoomMessages(roomId, query, controller.signal, page.nextCursor)
      if (controller.signal.aborted) return
      const seen = new Set(page.messages.map(({ messageId }) => messageId))
      setResult({ query, page: {
        messages: [...page.messages, ...next.messages.filter(({ messageId }) => !seen.has(messageId))],
        nextCursor: next.nextCursor === page.nextCursor ? null : next.nextCursor,
      } })
    } catch (error) {
      if (!controller.signal.aborted) setResult({ query, page, error: actionError(error, 'Could not load more results.') })
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false)
    }
  }

  return (
    <section aria-label="Search messages" className="shrink-0 space-y-2 border-b border-border px-4 py-2">
      <Input type="search" aria-label="Search messages in this chat" placeholder="Search messages" autoFocus
        maxLength={100} value={input} onChange={(event) => {
          const value = event.target.value
          if (value.trim() !== query) {
            request.current?.abort()
            setResult(undefined)
            setLoadingMore(false)
          }
          setInput(value)
        }} />
      {query && !current && <p role="status" className="text-xs text-muted-foreground">Searching…</p>}
      {current?.error && <p role="alert" className="text-xs text-destructive">{current.error}</p>}
      {jumpError && <p role="alert" className="text-xs text-destructive">{jumpError}</p>}
      {matches && matches.length === 0 && <p role="status" className="text-xs text-muted-foreground">No matching messages.</p>}
      {matches && matches.length > 0 && (
        <ul aria-label="Search results" className="max-h-[25dvh] space-y-1 overflow-y-auto overscroll-contain">
          {matches.map((message) => (
            <li key={message.messageId}>
              <Button type="button" variant="ghost" disabled={historyBusy} onClick={() => onSelect(message.messageId)}
                className="h-auto w-full min-w-0 justify-start px-2 py-1 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted-foreground">
                    {nameFor(message.senderId)} · <time dateTime={message.timestamp}>{timeFormat.format(new Date(message.timestamp))}</time>
                  </span>
                  <span className="block truncate text-sm">{previewText(message)}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor && (
        <Button type="button" variant="ghost" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Loading results…' : 'More results'}
        </Button>
      )}
    </section>
  )
}
