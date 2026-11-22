import { ArrowDown, Check, CheckCheck, Paperclip, Pin, Search, Send, Star, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError, getAuthToken } from '@/lib/api'
import { connectSocket, getSocket, type MessageUpdate, type RoomMessage, type UploadedMedia } from '@/lib/socket'
import { cn } from '@/lib/utils'

import { getGroupMembers, listRoomMessages, type ChatUser, type Room } from './chats.api'
import { attachmentAccept, uploadAttachment, validateAttachment } from './media.api'
import { actionError, maxMessageLength, MessageActionDialog, MessageMenu, MessageReactions, previewText,
  QuotedMessage, StarredMessagesDialog, type MessageAction } from './message-actions'
import { formatFileSize, MessageAttachments } from './message-attachments'
import { deleteRoomMessage, editRoomMessage, listPinnedMessages, listStarredMessages, setMessagePin, setMessageStar } from './messages.api'
import { RoomSearch } from './room-search'
import { useVisibleReads } from './use-visible-reads'

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const typingIntervalMs = 1000
const typingTimeoutMs = 3000
type ReceiptStatus = 'delivered' | 'read'
type MessageChange = Partial<RoomMessage> | null

function mergeMessages(current: RoomMessage[], incoming: RoomMessage[]) {
  const messages = new Map(current.map((message) => [message.messageId, message]))
  for (const message of incoming) {
    if (!messages.has(message.messageId)) messages.set(message.messageId, message)
  }
  return [...messages.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.messageId.localeCompare(b.messageId))
}

export function ChatRoom({ roomId, room, rooms, currentUserId }: { roomId: string; room: Room; rooms: Room[]; currentUserId?: string }) {
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
  const [attachment, setAttachment] = useState<{ file: File; uploaded?: UploadedMedia }>()
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [atLatest, setAtLatest] = useState(true)
  const [changes, setChanges] = useState<Record<string, MessageChange>>({})
  const [replyTo, setReplyTo] = useState<string>()
  const [selectedAction, setSelectedAction] = useState<{ action: MessageAction; message: RoomMessage }>()
  const [actionFeedback, setActionFeedback] = useState<{ error?: string; success?: string }>({})
  const [stars, setStars] = useState<RoomMessage[]>([])
  const [showStars, setShowStars] = useState(false)
  const [starLoading, setStarLoading] = useState(true)
  const [starError, setStarError] = useState('')
  const [starRevision, setStarRevision] = useState(0)
  const [pins, setPins] = useState<RoomMessage[]>([])
  const [pinRevision, setPinRevision] = useState(0)
  const [pinError, setPinError] = useState('')
  const [groupMembers, setGroupMembers] = useState<ChatUser[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [receipts, setReceipts] = useState<Record<string, ReceiptStatus>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [jumpError, setJumpError] = useState('')
  const [jumpTarget, setJumpTarget] = useState<string>()
  const [highlightedMessage, setHighlightedMessage] = useState<string>()
  const lastTypingAt = useRef(-Infinity)
  const currentUserRef = useRef(currentUserId)
  const composer = useRef<HTMLInputElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const sendRequest = useRef<AbortController | null>(null)
  const messageList = useRef<HTMLOListElement>(null)
  const scrollport = useRef<HTMLDivElement>(null)
  const stayAtLatest = useRef(true)
  const olderRequest = useRef<AbortController | null>(null)
  const olderAnchor = useRef<{ element: HTMLElement; top: number } | null>(null)
  useVisibleReads(roomId, joined, messageList)

  useEffect(() => {
    currentUserRef.current = currentUserId
  }, [currentUserId])

  useEffect(() => () => sendRequest.current?.abort(), [roomId])

  const rosterKey = room.type === 'group' ? room.participants.join(',') : null
  const allowPin = !!currentUserId && (room.type === 'direct' || room.admins.includes(currentUserId))
  const known = new Map([...pins, ...messages].map((message) => [message.messageId, message]))
  const nameById = new Map([...rooms.flatMap(({ directUser }) => directUser ? [directUser] : []), ...groupMembers]
    .map((user) => [user.userId, user.name || user.username]))

  function nameFor(id: string) {
    return id === currentUserId ? 'You' : nameById.get(id) ?? `Participant ${id.slice(-4)}`
  }

  const typingNames = typingUsers.filter((id) => id !== currentUserId).map(nameFor)

  function visibleMessage(message: RoomMessage) {
    const change = changes[message.messageId]
    return change === null ? [] : [{ ...message, ...change }]
  }

  const visibleMessages = messages.flatMap(visibleMessage)
  const visiblePins = pins.flatMap(visibleMessage).filter((message) => !message.deletedForEveryone)
  const visibleStars = stars.flatMap(visibleMessage).filter((message) => !message.deletedForEveryone)
  const reply = replyTo && changes[replyTo] !== null ? known.get(replyTo) : undefined
  const replySource = reply && !reply.deletedForEveryone && !changes[reply.messageId]?.deletedForEveryone
    ? { ...reply, ...changes[reply.messageId] } : undefined

  const patchMessage = useCallback((messageId: string, change: MessageChange) => {
    setChanges((current) => {
      const previous = current[messageId]
      if (previous === null) return current
      if (change === null) return { ...current, [messageId]: null }
      if (previous?.deletedForEveryone) return current
      if (change.editedAt && previous?.editedAt && change.editedAt < previous.editedAt) return current
      return { ...current, [messageId]: { ...previous, ...change } }
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void listStarredMessages(controller.signal).then(({ messages }) => {
      if (controller.signal.aborted) return
      setStars(messages)
      setStarError('')
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setStarError(actionError(error, 'Could not load starred messages.'))
    }).finally(() => {
      if (!controller.signal.aborted) setStarLoading(false)
    })
    return () => controller.abort()
  }, [starRevision])

  useEffect(() => {
    const controller = new AbortController()
    void listPinnedMessages(roomId, controller.signal).then(({ messages }) => {
      if (controller.signal.aborted) return
      setPins(messages)
      setPinError('')
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setPinError(actionError(error, 'Could not load pinned messages.'))
    })
    return () => controller.abort()
  }, [roomId, pinRevision])

  useEffect(() => {
    if (rosterKey === null) return
    const controller = new AbortController()
    void getGroupMembers(roomId, controller.signal).then(({ members }) => {
      if (!controller.signal.aborted) setGroupMembers(members)
    }).catch(() => { /* Keep the participant fallback label when profiles could not load. */ })
    return () => controller.abort()
  }, [roomId, rosterKey])

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
    const typingTimers = new Map<string, number>()
    const reportedDeliveries = new Set<string>()

    async function join() {
      const attempt = ++joinAttempt
      setSocketError('')
      try {
        const result = await activeSocket.timeout(10_000).emitWithAck('join_room', { roomId })
        if (!active || attempt !== joinAttempt) return
        setJoined(result.success)
        if (!result.success) setSocketError('Could not join this conversation.')
        else setPinRevision((value) => value + 1)
      } catch {
        if (active && attempt === joinAttempt) setSocketError('Joining this conversation timed out.')
      }
    }

    function receive(message: RoomMessage) {
      if (message.roomId !== roomId) return
      setMessages((current) => current.some(({ messageId }) => messageId === message.messageId)
        ? current
        : mergeMessages(current, [message]))
      if (activeSocket.connected && message.senderId !== currentUserRef.current && !reportedDeliveries.has(message.messageId)) {
        reportedDeliveries.add(message.messageId)
        // The server rejects self-receipts even before the current user's profile loads.
        activeSocket.emit('message_delivered', { roomId, messageId: message.messageId })
      }
    }

    function onTyping({ roomId: eventRoomId, senderId }: { roomId: string; senderId: string }) {
      if (eventRoomId !== roomId) return
      window.clearTimeout(typingTimers.get(senderId))
      setTypingUsers((current) => current.includes(senderId) ? current : [...current, senderId])
      typingTimers.set(senderId, window.setTimeout(() => {
        typingTimers.delete(senderId)
        setTypingUsers((current) => current.filter((id) => id !== senderId))
      }, typingTimeoutMs))
    }

    function recordReceipt(event: { roomId: string; messageId: string }, status: ReceiptStatus) {
      if (event.roomId !== roomId) return
      setReceipts((current) => current[event.messageId] === 'read' || current[event.messageId] === status
        ? current
        : { ...current, [event.messageId]: status })
    }

    const onDelivered = (event: { roomId: string; messageId: string }) => recordReceipt(event, 'delivered')
    const onRead = (event: { roomId: string; messageId: string }) => recordReceipt(event, 'read')

    function clearTypingTimers() {
      typingTimers.forEach((timer) => window.clearTimeout(timer))
      typingTimers.clear()
    }

    function disconnect() {
      joinAttempt += 1
      setJoined(false)
      clearTypingTimers()
      setTypingUsers([])
    }

    function updateMessage(update: MessageUpdate) {
      if (update.roomId !== roomId) return
      if (update.action === 'deleted_for_me') {
        // The server sends delete-for-me updates only to that user's sockets.
        patchMessage(update.messageId, null)
      } else if (update.action === 'deleted_for_everyone') {
        patchMessage(update.messageId, { deletedForEveryone: true, text: undefined, media: undefined, reactions: undefined, replyTo: undefined })
      } else {
        patchMessage(update.messageId, { text: update.text, editedAt: update.editedAt })
      }
    }

    function updateReactions(update: { roomId: string; messageId: string; reactions: Record<string, string[]> }) {
      if (update.roomId === roomId) patchMessage(update.messageId, { reactions: update.reactions })
    }

    function updatePins(update: { roomId: string }) {
      if (update.roomId === roomId) setPinRevision((value) => value + 1)
    }

    function connectionError() {
      disconnect()
      setSocketError('Could not connect to chat.')
    }

    activeSocket.on('connect', join)
    activeSocket.on('disconnect', disconnect)
    activeSocket.on('connect_error', connectionError)
    activeSocket.on('new_message', receive)
    activeSocket.on('typing', onTyping)
    activeSocket.on('message_delivered', onDelivered)
    activeSocket.on('message_read', onRead)
    activeSocket.on('message_updated', updateMessage)
    activeSocket.on('message_reacted', updateReactions)
    activeSocket.on('pins_updated', updatePins)
    if (activeSocket.connected) void join()

    return () => {
      active = false
      activeSocket.off('connect', join)
      activeSocket.off('disconnect', disconnect)
      activeSocket.off('connect_error', connectionError)
      activeSocket.off('new_message', receive)
      activeSocket.off('typing', onTyping)
      activeSocket.off('message_delivered', onDelivered)
      activeSocket.off('message_read', onRead)
      activeSocket.off('message_updated', updateMessage)
      activeSocket.off('message_reacted', updateReactions)
      activeSocket.off('pins_updated', updatePins)
      clearTypingTimers()
      if (activeSocket.connected) activeSocket.emit('leave_room', { roomId })
    }
  }, [roomId, socketRetry, patchMessage])

  function updateDraft(text: string) {
    setDraft(text)
    const socket = getSocket()
    const now = performance.now()
    if (joined && socket?.connected && text.trim() && now - lastTypingAt.current >= typingIntervalMs) {
      lastTypingAt.current = now
      socket.volatile.emit('typing', { roomId })
    }
  }

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
    setHighlightedMessage(undefined)
  }

  useLayoutEffect(() => {
    const panel = scrollport.current
    if (!panel) return
    const anchor = olderAnchor.current
    if (jumpTarget) {
      const target = panel.querySelector<HTMLElement>(`[data-message="${CSS.escape(jumpTarget)}"] article`)
      olderAnchor.current = null
      if (target) {
        if (searchOpen) {
          setSearchOpen(false)
          return
        }
        stayAtLatest.current = false
        panel.scrollTop += target.getBoundingClientRect().top - panel.getBoundingClientRect().top
          - Math.max(0, (panel.clientHeight - target.offsetHeight) / 2)
        setHighlightedMessage(jumpTarget)
        target.focus({ preventScroll: true })
        trackScroll()
      } else {
        setJumpError('That message is no longer available in history.')
      }
      setJumpTarget(undefined)
    } else if (anchor) {
      if (anchor.element.isConnected) panel.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top
      olderAnchor.current = null
      trackScroll()
    } else if (stayAtLatest.current) {
      panel.scrollTop = panel.scrollHeight
    }
  }, [messages, historyLoading, olderLoading, changes, jumpTarget, searchOpen])

  async function loadOlder(targetId?: string) {
    if (historyLoading || olderRequest.current) return
    setJumpError('')
    if (targetId && visibleMessages.some(({ messageId }) => messageId === targetId)) {
      setJumpTarget(targetId)
      return
    }
    if (!nextCursor) {
      if (targetId) setJumpError(historyError || 'That message is no longer available in history.')
      return
    }
    const controller = new AbortController()
    olderRequest.current = controller
    setOlderLoading(true)
    setHistoryError('')
    let cursor: string | null = nextCursor
    let found = false
    const olderMessages: RoomMessage[] = []
    try {
      do {
        const page = await listRoomMessages(roomId, controller.signal, cursor)
        if (controller.signal.aborted) return
        olderMessages.push(...page.messages)
        found = page.messages.some(({ messageId }) => messageId === targetId)
        cursor = page.nextCursor && page.nextCursor < cursor ? page.nextCursor : null
      } while (targetId && cursor && !found)
      if (found) setJumpTarget(targetId)
      else if (targetId) setJumpError('That message is no longer available in history.')
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = actionError(error, 'Could not load older messages.')
        if (targetId) setJumpError(message)
        else setHistoryError(message)
      }
    } finally {
      olderRequest.current = null
      if (!controller.signal.aborted) {
        const panel = scrollport.current
        if (panel && !found && olderMessages.length) {
          const top = panel.getBoundingClientRect().top
          const element = Array.from(panel.querySelectorAll<HTMLElement>('[data-message]'))
            .find((row) => row.getBoundingClientRect().bottom > top)
          if (element) olderAnchor.current = { element, top: element.getBoundingClientRect().top }
        }
        if (olderMessages.length) setMessages((current) => mergeMessages(current, olderMessages))
        setNextCursor(cursor)
        setOlderLoading(false)
      }
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    const socket = getSocket()
    if (!socket?.connected || !joined || (!text && !attachment) || text.length > maxMessageLength || sendRequest.current) return

    const controller = new AbortController()
    sendRequest.current = controller
    setSending(true)
    setSendError('')
    let upload = attachment?.uploaded
    try {
      if (attachment && !upload) {
        upload = await uploadAttachment(attachment.file, controller.signal)
        if (controller.signal.aborted) return
        setAttachment({ file: attachment.file, uploaded: upload })
      }
      if (!socket.connected) {
        setSendError('The chat connection was interrupted. Reconnect and try sending again.')
        return
      }
      const result = await socket.timeout(10_000).emitWithAck('send_message', {
        roomId, text, replyTo: replySource?.messageId, media: upload ? [upload] : undefined,
      })
      if (controller.signal.aborted) return
      if (result.success) {
        setDraft((current) => current.trim() === text ? '' : current)
        setAttachment(undefined)
        setReplyTo((current) => current === replySource?.messageId ? undefined : current)
        if (stayAtLatest.current) jumpToLatest()
      } else {
        setSendError(upload
          ? 'The server rejected the message with its attachment. Try again or choose a different file.'
          : 'Could not send this message. Your draft is still here.')
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSendError(attachment && !upload
          ? actionError(error, 'Could not upload the attachment. Try again.')
          : 'Delivery could not be confirmed. Check the conversation before sending again.')
      }
    } finally {
      sendRequest.current = null
      if (!controller.signal.aborted) setSending(false)
    }
  }

  async function submitAction(action: MessageAction, message: RoomMessage, value: string) {
    const { messageId } = message
    if (action === 'edit') {
      const { message: edited } = await editRoomMessage(roomId, messageId, value)
      patchMessage(messageId, { text: edited.text, editedAt: edited.editedAt })
    } else if (action === 'forward') {
      const socket = getSocket()
      if (!socket?.connected || !joined) throw new ApiError('Reconnect to chat before forwarding.', 'SOCKET_UNAVAILABLE', 0)
      const result = await socket.timeout(10_000).emitWithAck('forward_message', { targetRoomId: value, messageId })
      if (!result.success) throw new ApiError('Could not forward the message to that conversation.', 'FORWARD_FAILED', 0)
      setActionFeedback({ success: 'Message forwarded.' })
    } else {
      const scope = action === 'delete-me' ? 'me' : 'everyone'
      await deleteRoomMessage(roomId, messageId, scope)
      patchMessage(messageId, scope === 'me' ? null : { deletedForEveryone: true, text: undefined, media: undefined, replyTo: undefined })
    }
  }

  async function toggleStar(messageId: string, starred: boolean) {
    setActionFeedback({})
    try {
      await setMessageStar(messageId, starred)
      setStarRevision((value) => value + 1)
    } catch (error) {
      setActionFeedback({ error: actionError(error, 'Could not update the star.') })
    }
  }

  async function togglePin(messageId: string, pinned: boolean) {
    setActionFeedback({})
    try {
      await setMessagePin(roomId, messageId, pinned)
      setPinRevision((value) => value + 1)
    } catch (error) {
      setActionFeedback({ error: actionError(error, 'Could not update the pin.') })
    }
  }

  async function react(messageId: string, emoji: string) {
    setActionFeedback({})
    const socket = getSocket()
    try {
      if (!socket?.connected || !joined) throw new Error()
      const result = await socket.timeout(10_000).emitWithAck('react_message', { roomId, messageId, emoji })
      if (!result.success) throw new Error()
    } catch {
      setActionFeedback({ error: 'Could not update the reaction.' })
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-1">
        <Button type="button" size="sm" variant="ghost" className="px-2" aria-expanded={searchOpen}
          disabled={searchOpen && olderLoading} onClick={() => {
            setJumpError('')
            setSearchOpen((open) => !open)
          }}>
          <Search aria-hidden /> <span className="sr-only sm:not-sr-only">{searchOpen ? 'Close search' : 'Search messages'}</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" className="px-2" onClick={() => {
          setStarLoading(true)
          setStarError('')
          setStarRevision((value) => value + 1)
          setShowStars(true)
        }}><Star aria-hidden /> <span className="sr-only sm:not-sr-only">Starred messages</span></Button>
        {pinError && <p role="alert" className="text-xs text-destructive">{pinError}</p>}
        {visiblePins.length > 0 && (
          <details className="min-w-0 flex-1 py-1 text-xs">
            <summary className="cursor-pointer truncate rounded focus-visible:outline-ring">
              Pinned messages ({visiblePins.length}) <span className="text-muted-foreground">· {previewText(visiblePins[0])}</span>
            </summary>
            <ul className="mt-1 max-h-20 space-y-1 overflow-y-auto" aria-label="Pinned messages">
              {visiblePins.map((message) => (
                <li key={message.messageId} className="flex items-center gap-2">
                  <Pin className="size-3 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{previewText(message)}</span>
                  {allowPin && <Button type="button" size="sm" variant="ghost"
                    onClick={() => void togglePin(message.messageId, false)}>Unpin</Button>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {searchOpen && (
        <RoomSearch roomId={roomId} historyBusy={historyLoading || olderLoading}
          jumpError={jumpError} onSelect={(id) => void loadOlder(id)} resolveMessage={visibleMessage}
          nameFor={nameFor} timeFormat={timeFormat} />
      )}
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
        {!historyLoading && !historyError && !visibleMessages.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>
        )}
        <ol ref={messageList} aria-label="Messages" className="space-y-4">
          {visibleMessages.map((message) => {
            const own = message.senderId === currentUserId
            const starred = visibleStars.some(({ messageId }) => messageId === message.messageId)
            const pinned = visiblePins.some(({ messageId }) => messageId === message.messageId)
            const unread = currentUserId && !own && !message.deletedForEveryone && !message.readBy?.includes(currentUserId)
            const media = message.deletedForEveryone ? undefined : message.media
            const liveStatus = receipts[message.messageId]
            // In a group, a tick advances when at least one recipient confirms the status.
            const status = liveStatus === 'read' || message.readBy?.length ? 'Read'
              : liveStatus === 'delivered' || message.deliveredTo?.length ? 'Delivered' : 'Sent'
            return (
              <li key={message.messageId} data-message={message.messageId} data-unread-message-id={unread ? message.messageId : undefined}
                className={cn('flex', own ? 'justify-end' : 'justify-start')}>
                <article tabIndex={-1} className={cn('min-w-0 max-w-[85%] rounded-lg border border-border px-3 py-2',
                  own && 'bg-accent', highlightedMessage === message.messageId && 'ring-2 ring-inset ring-ring',
                  media?.some(({ type }) => type.startsWith('image/') || type === 'video/mp4') && 'w-md')}>
                  <div className="flex items-start gap-1 text-xs text-muted-foreground">
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                      <span className="break-words font-semibold">{nameFor(message.senderId)}</span>
                      <time dateTime={message.timestamp}>{timeFormat.format(new Date(message.timestamp))}</time>
                      {own && !message.deletedForEveryone && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0} role="img" aria-label={status}
                              className={cn('inline-flex rounded focus-visible:outline-ring', status === 'Read' && 'text-blue-700 dark:text-blue-300')}>
                              {status === 'Sent' ? <Check className="size-4" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{status}</TooltipContent>
                        </Tooltip>
                      )}
                      {message.editedAt && !message.deletedForEveryone && <span>Edited</span>}
                      {starred && <Star className="size-3" aria-label="Starred" />}
                      {pinned && <Pin className="size-3" aria-label="Pinned" />}
                    </div>
                    {!message.deletedForEveryone && (
                      <MessageMenu message={message} own={own} starred={starred} pinned={pinned} canPin={allowPin} joined={joined}
                        onReply={() => {
                          setReplyTo(message.messageId)
                          composer.current?.focus()
                        }}
                        onAction={(action) => setSelectedAction({ action, message })}
                        onStar={() => void toggleStar(message.messageId, !starred)}
                        onPin={() => void togglePin(message.messageId, !pinned)}
                        onReact={(emoji) => void react(message.messageId, emoji)} />
                    )}
                  </div>
                  {message.forwardedFrom && !message.deletedForEveryone && <p className="text-xs text-muted-foreground">Forwarded</p>}
                  {message.replyTo && !message.deletedForEveryone && (
                    <QuotedMessage roomId={roomId} messageId={message.replyTo} known={known.get(message.replyTo)}
                      change={changes[message.replyTo]} nameFor={nameFor} />
                  )}
                  {(!media?.length || message.text) && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{previewText(message)}</p>
                  )}
                  {!!media?.length && <MessageAttachments media={media} />}
                  {message.reactions && !message.deletedForEveryone && (
                    <MessageReactions reactions={message.reactions} nameFor={nameFor} />
                  )}
                </article>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="shrink-0 border-t border-border px-2 py-4 sm:px-4">
        <p role="status" aria-atomic="true" className={cn(typingNames.length ? 'mb-2 truncate text-xs text-muted-foreground' : 'sr-only')}>
          {typingNames.length === 1 ? `${typingNames[0]} is typing…`
            : typingNames.length > 1 ? `${typingNames.join(', ')} are typing…` : ''}
        </p>
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
        {actionFeedback.error && <p role="alert" className="mb-2 text-sm text-destructive">{actionFeedback.error}</p>}
        {actionFeedback.success && <p role="status" className="mb-2 text-sm text-muted-foreground">{actionFeedback.success}</p>}
        {replySource && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-border px-2">
            <div className="min-w-0 flex-1">
              <QuotedMessage roomId={roomId} messageId={replySource.messageId} known={replySource} nameFor={nameFor} />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Cancel reply" onClick={() => setReplyTo(undefined)}><X aria-hidden /></Button>
          </div>
        )}
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
            <Paperclip className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{attachment.file.name}</span>
              <span className="block text-xs text-muted-foreground">{formatFileSize(attachment.file.size)}</span>
            </span>
            {sending && <span role="status" className="text-xs text-muted-foreground">
              {attachment.uploaded ? 'Sending…' : 'Uploading…'}
            </span>}
            <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 sm:size-9" aria-label="Remove attachment" disabled={sending}
              onClick={() => { setAttachment(undefined); setSendError('') }}><X aria-hidden /></Button>
          </div>
        )}
        <form className="flex items-center gap-1 sm:gap-2" onSubmit={sendMessage}>
          <Input type="file" ref={filePicker} className="hidden" accept={attachmentAccept} aria-label="Choose an attachment"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (!file || sendRequest.current) return
              const error = validateAttachment(file)
              setSendError(error ?? '')
              if (!error) setAttachment({ file })
            }} />
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 sm:size-9" aria-label="Attach a file" disabled={sending}
            onClick={() => filePicker.current?.click()}><Paperclip aria-hidden /></Button>
          <Input ref={composer} aria-label="Message" placeholder="Write a message" value={draft} maxLength={maxMessageLength}
            onChange={(event) => updateDraft(event.target.value)} autoComplete="off" />
          <Button type="submit" variant="soft" className="w-8 shrink-0 px-0 sm:w-auto sm:px-4"
            disabled={!joined || (!draft.trim() && !attachment) || sending}>
            <Send aria-hidden />
            <span className="sr-only sm:not-sr-only">{sending ? 'Sending…' : 'Send'}</span>
          </Button>
        </form>
      </div>
      {selectedAction && changes[selectedAction.message.messageId] !== null
        && !changes[selectedAction.message.messageId]?.deletedForEveryone && (
        <MessageActionDialog action={selectedAction.action} message={selectedAction.message} rooms={rooms}
          onClose={() => setSelectedAction(undefined)} onSubmit={(value) => submitAction(selectedAction.action, selectedAction.message, value)} />
      )}
      {showStars && <StarredMessagesDialog messages={visibleStars} rooms={rooms} loading={starLoading} error={starError} onClose={() => setShowStars(false)} />}
    </>
  )
}
