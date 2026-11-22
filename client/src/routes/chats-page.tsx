import { ArrowLeft, MessageCircle, MessagesSquare, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'

import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { logout } from '@/features/auth/auth.api'
import { ChatRoom } from '@/features/chats/chat-room'
import { listRooms, roomName, type Room } from '@/features/chats/chats.api'
import { NewChatDialog } from '@/features/chats/new-chat-dialog'
import { ApiError, clearAuthToken } from '@/lib/api'
import { disconnectSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

export function ChatsPage() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const [busy, setBusy] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [creating, setCreating] = useState(false)
  const selectedRoom = rooms.find((room) => room.roomId === roomId)

  useEffect(() => {
    const controller = new AbortController()
    void listRooms(controller.signal).then(({ rooms: listed }) => {
      if (controller.signal.aborted) return
      setRooms((current) => [...current.filter((room) => !listed.some(({ roomId }) => roomId === room.roomId)), ...listed])
      setLoading(false)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setError(error instanceof ApiError ? error.message : 'Could not load chats.')
      setLoading(false)
    })
    return () => controller.abort()
  }, [attempt])

  function openRoom(room: Room) {
    setRooms((current) => {
      if (!current.some((item) => item.roomId === room.roomId)) return [room, ...current]
      return current.map((item) => item.roomId === room.roomId ? { ...item, ...room } : item)
    })
    setCreating(false)
    navigate(`/chats/${encodeURIComponent(room.roomId)}`)
  }

  async function handleLogout() {
    setBusy(true)
    try {
      await logout()
    } catch {
      // The local session still needs to end if the server token has expired.
    } finally {
      disconnectSocket()
      clearAuthToken()
      navigate('/login', { replace: true })
    }
  }

  return (
    <main className={cn('mx-auto flex max-w-6xl flex-col px-4 sm:px-8', roomId ? 'h-dvh' : 'min-h-svh')}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-6">
        <h1 className="flex items-center gap-2 text-2xl font-medium tracking-tight sm:text-3xl">
          <MessagesSquare className="size-5" aria-hidden /> Chats
        </h1>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeSwitcher />
          <Button asChild variant="ghost" size="sm"><Link to="/profile">Profile</Link></Button>
          <Button type="button" variant="outline" size="sm" onClick={handleLogout} disabled={busy}>Log out</Button>
        </div>
      </header>
      <div className={cn(
        'mb-6 overflow-hidden rounded-xl border border-border bg-card md:grid md:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)]',
        roomId ? 'flex min-h-0 flex-1' : 'min-h-[28rem]',
      )}>
        <aside aria-label="Chat sidebar" className={roomId ? 'hidden overflow-y-auto border-border md:block md:border-r' : 'border-border md:border-r'}>
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
            <h2 className="font-semibold">Conversations</h2>
            <Button type="button" size="sm" variant="solid" onClick={() => setCreating(true)}>New chat</Button>
          </div>
          {loading && <p role="status" className="p-4 text-sm text-muted-foreground">Loading chats…</p>}
          {error && (
            <div className="space-y-2 p-4">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                setError('')
                setLoading(true)
                setAttempt(attempt + 1)
              }}>Retry</Button>
            </div>
          )}
          {!loading && !error && !rooms.length && (
            <div className="px-4 py-8">
              <MessageCircle className="mb-3 size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-semibold">No conversations yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Start a new chat to find someone by username.</p>
            </div>
          )}
          {rooms.length > 0 && (
            <nav aria-label="Conversations">
              <ul className="space-y-1 p-2">
                {rooms.map((room) => (
                  <li key={room.roomId}>
                    <Button asChild variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2 text-left aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground">
                      <NavLink to={`/chats/${encodeURIComponent(room.roomId)}`} end>
                        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border" aria-hidden>
                          {room.type === 'group' ? <UsersRound /> : <MessageCircle />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{roomName(room)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {room.lastMessage?.text || (room.type === 'group' ? 'Group chat' : room.directUser?.username ? `@${room.directUser.username}` : 'Direct chat')}
                          </span>
                        </span>
                        {!!room.unreadCount && room.unreadCount > 0 && (
                          <span aria-label={`${room.unreadCount} unread`} className="shrink-0 rounded-full border border-border px-2 text-xs tabular-nums">
                            {room.unreadCount}
                          </span>
                        )}
                      </NavLink>
                    </Button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
        {roomId ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-4">
              <Button asChild variant="ghost" size="icon" className="md:hidden">
                <Link to="/chats" aria-label="Back to chats"><ArrowLeft aria-hidden /></Link>
              </Button>
              <h2 className="min-w-0 truncate font-semibold">{selectedRoom ? roomName(selectedRoom) : 'Conversation'}</h2>
            </div>
            <ChatRoom key={roomId} roomId={roomId} room={selectedRoom} />
          </section>
        ) : (
          <section className="hidden place-content-center justify-items-center gap-2 p-6 text-center md:grid">
            <MessagesSquare className="size-6 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-medium">Select a conversation</h2>
            <p className="text-sm text-muted-foreground">Choose a chat from the sidebar or start a new one.</p>
          </section>
        )}
      </div>
      {creating && <NewChatDialog onClose={() => setCreating(false)} onOpenRoom={openRoom} />}
    </main>
  )
}
