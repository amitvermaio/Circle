import { ArrowDown, Send } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, getAuthToken } from '@/lib/api'
import { connectSocket, getSocket, type RoomMessage } from '@/lib/socket'
import { cn } from '@/lib/utils'

import { listRoomMessages, type Room } from './chats.api'

const maxMessageLength = 2000
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function mergeMessages(current: RoomMessage[], incoming: RoomMessage[]) {
  const messages = new Map(current.map((message) => [message.messageId, message]))
  for (const message of incoming) {
    if (!messages.has(message.messageId)) messages.set(message.messageId, message)
  }
  return [...messages.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.messageId.localeCompare(b.messageId))
}

export function ChatRoom({ roomId, room, currentUserId }: { roomId: string; room: Room; currentUserId?: string }) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [olderLoading, setOlderLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [retry, setRetry] = useState(0)
  const [joined, setJoined] = useState(false)
  const [socketError, setSocketError] = useState('')
  const [socketRetry, setSocketRetry] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [atLatest, setAtLatest] = useState(true)
  const scrollport = useRef<HTMLDivElement>(null)
  const stayAtLatest = useRef(true)
  const olderRequest = useRef<AbortController | null>(null)
  const olderAnchor = useRef<{ element: HTMLElement; top: number } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void listRoomMessages(roomId, controller.signal).then((page) => {
      if (controller.signal.aborted) return
      setMessages((current) => mergeMessages(current, page.messages))
      setNextCursor(page.nextCursor)
      setHistoryLoading(false)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setHistoryError(error instanceof ApiError ? error.message : 'Could not load messages.')
      setHistoryLoading(false)
    })
    return () => {
      controller.abort()
      olderRequest.current?.abort()
    }
  }, [roomId, retry])

  useEffect(() => {
    const token = getAuthToken()
    if (!token) return

    let socket
    try {
      socket = connectSocket(token)
    } catch {
      setSocketError('The chat connection is unavailable.')
      return
    }
    const activeSocket = socket
    let active = true
    let joinAttempt = 0

    async function join() {
      const attempt = ++joinAttempt
      setSocketError('')
      try {
        const result = await activeSocket.timeout(10_000).emitWithAck('join_room', { roomId })
        if (!active || attempt !== joinAttempt) return
        setJoined(result.success)
        if (!result.success) setSocketError('Could not join this conversation.')
      } catch {
        if (active && attempt === joinAttempt) setSocketError('Joining this conversation timed out.')
      }
    }

    function receive(message: RoomMessage) {
      if (message.roomId !== roomId) return
      setMessages((current) => current.some(({ messageId }) => messageId === message.messageId)
        ? current
        : mergeMessages(current, [message]))
    }

    function disconnect() {
      joinAttempt += 1
      setJoined(false)
    }

    function connectionError() {
      disconnect()
      setSocketError('Could not connect to chat.')
    }

    activeSocket.on('connect', join)
    activeSocket.on('disconnect', disconnect)
    activeSocket.on('connect_error', connectionError)
    activeSocket.on('new_message', receive)
    if (activeSocket.connected) void join()

    return () => {
      active = false
      activeSocket.off('connect', join)
      activeSocket.off('disconnect', disconnect)
      activeSocket.off('connect_error', connectionError)
      activeSocket.off('new_message', receive)
      if (activeSocket.connected) activeSocket.emit('leave_room', { roomId })
    }
  }, [roomId, socketRetry])

  function trackScroll() {
    const panel = scrollport.current
    if (!panel) return
    stayAtLatest.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight <= 32
    setAtLatest(stayAtLatest.current)
  }

  function jumpToLatest() {
    const panel = scrollport.current
    if (!panel) return
    panel.scrollTop = panel.scrollHeight
    stayAtLatest.current = true
    setAtLatest(true)
  }

  useLayoutEffect(() => {
    const panel = scrollport.current
    if (!panel) return
    const anchor = olderAnchor.current
    if (anchor) {
      if (anchor.element.isConnected) panel.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top
      olderAnchor.current = null
      trackScroll()
    } else if (stayAtLatest.current) {
      panel.scrollTop = panel.scrollHeight
    }
  }, [messages, historyLoading, olderLoading])

  async function loadOlder() {
    if (!nextCursor || olderRequest.current) return
    const controller = new AbortController()
    olderRequest.current = controller
    setOlderLoading(true)
    setHistoryError('')
    try {
      const page = await listRoomMessages(roomId, controller.signal, nextCursor)
      if (controller.signal.aborted) return
      const panel = scrollport.current
      if (panel) {
        const top = panel.getBoundingClientRect().top
        const element = Array.from(panel.querySelectorAll<HTMLElement>('[data-message]'))
          .find((row) => row.getBoundingClientRect().bottom > top)
        if (element) olderAnchor.current = { element, top: element.getBoundingClientRect().top }
      }
      setMessages((current) => mergeMessages(current, page.messages))
      setNextCursor(page.nextCursor === nextCursor ? null : page.nextCursor)
    } catch (error) {
      if (!controller.signal.aborted) setHistoryError(error instanceof ApiError ? error.message : 'Could not load older messages.')
    } finally {
      olderRequest.current = null
      if (!controller.signal.aborted) setOlderLoading(false)
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    const socket = getSocket()
    if (!socket?.connected || !joined || !text || text.length > maxMessageLength || sending) return

    setSending(true)
    setSendError('')
    try {
      const result = await socket.timeout(10_000).emitWithAck('send_message', { roomId, text })
      if (result.success) {
        setDraft((current) => current.trim() === text ? '' : current)
        if (stayAtLatest.current) jumpToLatest()
      } else {
        setSendError('Could not send this message. Your draft is still here.')
      }
    } catch {
      setSendError('Delivery could not be confirmed. Check the conversation before sending again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div ref={scrollport} onScroll={trackScroll} tabIndex={0} aria-label="Message history"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [overflow-anchor:none]">
        {nextCursor && (
          <div className="mb-4 flex justify-center">
            <Button type="button" size="sm" variant="outline" disabled={olderLoading} onClick={() => void loadOlder()}>
              {olderLoading ? 'Loading…' : 'Load older'}
            </Button>
          </div>
        )}
        {historyLoading && <p role="status" className="text-sm text-muted-foreground">Loading messages…</p>}
        {historyError && (
          <div className="mb-4 space-y-2">
            <p role="alert" className="text-sm text-destructive">{historyError}</p>
            {!nextCursor && (
              <Button type="button" size="sm" variant="outline" onClick={() => {
                setHistoryError('')
                setHistoryLoading(true)
                setRetry((value) => value + 1)
              }}>Retry</Button>
            )}
          </div>
        )}
        {!historyLoading && !historyError && !messages.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>
        )}
        <ol aria-label="Messages" className="space-y-4">
          {messages.map((message) => {
            const own = message.senderId === currentUserId
            const directUser = room.directUser
            const sender = own ? 'You' : directUser?.userId === message.senderId
              ? directUser.name || directUser.username : `Participant ${message.senderId.slice(-4)}`
            return (
              <li key={message.messageId} data-message className={cn('flex', own ? 'justify-end' : 'justify-start')}>
                <article className={cn('min-w-0 max-w-[85%] rounded-lg border border-border px-3 py-2', own && 'bg-accent')}>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-semibold">{sender}</span>
                    <time dateTime={message.timestamp}>{timeFormat.format(new Date(message.timestamp))}</time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {message.deletedForEveryone ? 'Message deleted' : message.text || (message.media?.length ? 'Attachment' : 'Message unavailable')}
                  </p>
                </article>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="shrink-0 border-t border-border px-4 py-4">
        {!atLatest && (
          <Button type="button" size="sm" variant="ghost" className="mb-2" onClick={jumpToLatest}>
            <ArrowDown aria-hidden /> Jump to latest
          </Button>
        )}
        {socketError ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-destructive">{socketError}</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => {
              setJoined(false)
              setSocketError('')
              setSocketRetry((value) => value + 1)
            }}>Retry connection</Button>
          </div>
        ) : !joined && <p role="status" className="mb-2 text-sm text-muted-foreground">Connecting to chat…</p>}
        {sendError && <p role="alert" className="mb-2 text-sm text-destructive">{sendError}</p>}
        <form className="flex items-center gap-2" onSubmit={sendMessage}>
          <Input aria-label="Message" placeholder="Write a message" value={draft} maxLength={maxMessageLength}
            onChange={(event) => setDraft(event.target.value)} autoComplete="off" />
          <Button type="submit" variant="soft" className="w-10 px-0 sm:w-auto sm:px-4" disabled={!joined || !draft.trim() || sending}>
            <Send aria-hidden />
            <span className="sr-only sm:not-sr-only">{sending ? 'Sending…' : 'Send'}</span>
          </Button>
        </form>
      </div>
    </>
  )
}
