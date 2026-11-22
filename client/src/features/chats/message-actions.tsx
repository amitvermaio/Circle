import { DotsThreeIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import type { RoomMessage } from '@/lib/socket'

import { roomName, type Room } from './chats.api'
import { getRoomMessage } from './messages.api'

export const maxMessageLength = 2000
const editWindowMs = 15 * 60_000
const emojiChoices = [['👍', 'Thumbs up'], ['❤️', 'Heart'], ['😂', 'Laugh'], ['😮', 'Surprised'], ['😢', 'Sad'], ['🙏', 'Thanks']] as const

export type MessageAction = 'edit' | 'delete-me' | 'delete-everyone' | 'forward'

export function previewText(message: RoomMessage) {
  if (message.deletedForEveryone) return 'Message deleted'
  return message.text || (message.media?.length ? 'Attachment' : 'Message unavailable')
}

export function actionError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function QuotedMessage({ roomId, messageId, known, change, nameFor }: {
  roomId: string
  messageId: string
  known?: RoomMessage
  change?: Partial<RoomMessage> | null
  nameFor: (id: string) => string
}) {
  const [fetched, setFetched] = useState<RoomMessage | null>()
  const shouldFetch = !known && change !== null && !change?.deletedForEveryone

  useEffect(() => {
    if (!shouldFetch) return
    const controller = new AbortController()
    void getRoomMessage(roomId, messageId, controller.signal).then(({ message }) => {
      if (!controller.signal.aborted) setFetched(message)
    }).catch(() => {
      if (!controller.signal.aborted) setFetched(null)
    })
    return () => controller.abort()
  }, [roomId, messageId, shouldFetch])

  const source = known ?? fetched
  const unavailable = change === null || change?.deletedForEveryone || source?.deletedForEveryone
  return (
    <blockquote className="message-quote my-2 min-w-0 rounded-lg border-l-2 border-border p-2 text-xs text-muted-foreground">
      {source && !unavailable && <span className="block truncate font-medium">{nameFor(source.senderId)}</span>}
      <p className="truncate">{unavailable ? 'Message unavailable' : source ? previewText({ ...source, ...change })
        : fetched === null ? 'Message unavailable' : 'Loading quoted message…'}</p>
    </blockquote>
  )
}

export function MessageMenu({ message, own, starred, pinned, canPin, joined, onReply, onAction, onStar, onPin, onReact }: {
  message: RoomMessage
  own: boolean
  starred: boolean
  pinned: boolean
  canPin: boolean
  joined: boolean
  onReply: () => void
  onAction: (action: MessageAction) => void
  onStar: () => void
  onPin: () => void
  onReact: (emoji: string) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const canEdit = own && now - Date.parse(message.timestamp) <= editWindowMs

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setNow(Date.now()) }}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Message actions"><DotsThreeIcon aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>React</DropdownMenuLabel>
        <div className="flex flex-wrap gap-1 px-1">
          {emojiChoices.map(([emoji, title]) => (
            <DropdownMenuItem key={emoji} disabled={!joined} onSelect={() => onReact(emoji)} aria-label={title} className="px-2">
              <span aria-hidden>{emoji}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReply}>Reply</DropdownMenuItem>
        <DropdownMenuItem disabled={!joined} onSelect={() => onAction('forward')}>Forward</DropdownMenuItem>
        {canEdit && <DropdownMenuItem onSelect={() => onAction('edit')}>Edit</DropdownMenuItem>}
        <DropdownMenuItem onSelect={onStar}>{starred ? 'Unstar' : 'Star'}</DropdownMenuItem>
        {canPin && <DropdownMenuItem onSelect={onPin}>{pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAction('delete-me')}>Delete for me</DropdownMenuItem>
        {canEdit && <DropdownMenuItem onSelect={() => onAction('delete-everyone')}>Delete for everyone</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MessageReactions({ reactions, nameFor }: { reactions: Record<string, string[]>; nameFor: (id: string) => string }) {
  const [details, setDetails] = useState<string>()
  const people = details ? reactions[details] ?? [] : []
  return (
    <div className="message-reactions relative -mb-6 mt-2 flex flex-wrap gap-1">
      {Object.entries(reactions).filter(([, ids]) => ids.length > 0).map(([emoji, ids]) => {
        const title = emojiChoices.find(([value]) => value === emoji)?.[1] ?? emoji
        return (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-6 rounded-full px-2 text-xs" aria-label={`${title}, ${ids.length} reactions`} onClick={() => setDetails(emoji)}>
                {emoji} {ids.length}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{ids.map(nameFor).join(', ')}</TooltipContent>
          </Tooltip>
        )
      })}
      {details && (
        <Dialog open title={`Reactions ${details}`} onClose={() => setDetails(undefined)}>
          <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto text-sm">
            {people.map((userId) => <li key={userId}>{nameFor(userId)}</li>)}
          </ul>
          <DialogActions><Button onClick={() => setDetails(undefined)}>Close</Button></DialogActions>
        </Dialog>
      )}
    </div>
  )
}

export function MessageActionDialog({ action, message, rooms, onClose, onSubmit }: {
  action: MessageAction
  message: RoomMessage
  rooms: Room[]
  onClose: () => void
  onSubmit: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(action === 'edit' ? message.text ?? '' : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const safeChoice = useRef<HTMLButtonElement>(null)
  const deleting = action === 'delete-me' || action === 'delete-everyone'
  const title = {
    edit: 'Edit message',
    forward: 'Forward message',
    'delete-me': 'Delete for me',
    'delete-everyone': 'Delete for everyone',
  }[action]

  async function submit(input: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(input)
      onClose()
    } catch (error) {
      setError(actionError(error, 'Could not complete this message action.'))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={title} busy={busy} role={deleting ? 'alertdialog' : 'dialog'}
      initialFocus={deleting ? safeChoice : undefined}
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      description={action === 'delete-everyone' ? 'This removes the message content for everyone in the chat. Type delete to confirm.'
        : action === 'delete-me' ? 'This hides the message from your own chat history.' : undefined}>
      {action === 'forward' ? (
        <>
          <ul aria-label="Destination chats" className="mt-4 max-h-56 space-y-1 overflow-y-auto">
            {rooms.map((room) => <li key={room.roomId}>
              <Button type="button" variant="ghost" className="w-full justify-start" disabled={busy}
                onClick={() => void submit(room.roomId)}><span className="truncate">{roomName(room)}</span></Button>
            </li>)}
          </ul>
          {!rooms.length && <p className="mt-4 text-sm text-muted-foreground">No chats available.</p>}
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <DialogActions><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button></DialogActions>
        </>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault()
          void submit(value.trim())
        }}>
          {action !== 'delete-me' && (
            <label className="mt-4 block space-y-2 text-sm">
              <span>{action === 'edit' ? 'Message text' : 'Type delete to confirm'}</span>
              <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={maxMessageLength} />
            </label>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <DialogActions>
            <Button ref={safeChoice} type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button type="submit" variant={deleting ? 'danger' : 'soft'}
              disabled={busy || (action === 'edit' && (!value.trim() || value.trim() === message.text)) || (action === 'delete-everyone' && value !== 'delete')}>
              {busy ? 'Saving…' : deleting ? 'Delete message' : 'Save edit'}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  )
}

export function StarredMessagesDialog({ messages, rooms, loading, error, onClose }: {
  messages: RoomMessage[]
  rooms: Room[]
  loading: boolean
  error: string
  onClose: () => void
}) {
  return (
    <Dialog open title="Starred messages" onClose={onClose} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      {loading && <p role="status" className="mt-4 text-sm text-muted-foreground">Loading starred messages…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {!loading && !error && !messages.length && <p className="mt-4 text-sm text-muted-foreground">No starred messages yet.</p>}
      <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
        {messages.map((message) => {
          const room = rooms.find(({ roomId }) => roomId === message.roomId)
          return (
            <li key={message.messageId}>
              <Button asChild variant="ghost" className="h-auto w-full justify-start py-2 text-left">
                <Link to={`/chats/${encodeURIComponent(message.roomId)}`} onClick={onClose}>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-muted-foreground">{room ? roomName(room) : 'Conversation'}</span>
                    <span className="block truncate">{previewText(message)}</span>
                  </span>
                </Link>
              </Button>
            </li>
          )
        })}
      </ul>
      <DialogActions><Button variant="ghost" onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  )
}
