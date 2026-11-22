import { ArrowLeft, MessageCircle, MessagesSquare, Settings, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'

import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { getCurrentUser, logout } from '@/features/auth/auth.api'
import { ChatRoom } from '@/features/chats/chat-room'
import { listRooms, roomName, type Room } from '@/features/chats/chats.api'
import { GroupSettingsDialog, NewGroupDialog } from '@/features/chats/group-dialogs'
import { NewChatDialog } from '@/features/chats/new-chat-dialog'
import { ApiError, clearAuthToken, getAuthToken } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

export function ChatsPage() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const [busy, setBusy] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [creating, setCreating] = useState<'direct' | 'group' | null>(null)
  const [settingsRoomId, setSettingsRoomId] = useState<string>()
  const [currentUserId, setCurrentUserId] = useState<string>()
  const selectedRoom = rooms.find((room) => room.roomId === roomId)
  const contacts = [...new Map(rooms.flatMap((room) => room.type === 'direct' && room.directUser
    ? [[room.directUser.userId, room.directUser] as const] : [])).values()]

  useEffect(() => {
    const controller = new AbortController()
    void listRooms(controller.signal).then(({ rooms: listed }) => {
      if (controller.signal.aborted) return
      setRooms(listed)
      setError('')
      setLoading(false)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setError(error instanceof ApiError ? error.message : 'Could not load chats.')
      setLoading(false)
    })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const controller = new AbortController()
    void getCurrentUser(controller.signal).then(({ user }) => {
      if (!controller.signal.aborted) setCurrentUserId(user.userId)
    }).catch(() => { /* Admin actions stay hidden until identity is confirmed. */ })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const token = getAuthToken()
    if (!token) return
    let socket: ReturnType<typeof connectSocket>
    try {
      socket = connectSocket(token)
    } catch {
      return
    }
    function refreshRooms() {
      setAttempt((value) => value + 1)
    }
    function onMembership(update: { roomId: string; userId: string; action: 'join' | 'leave' }) {
      if (update.action === 'leave' && update.userId === currentUserId) {
        setRooms((current) => current.filter((room) => room.roomId !== update.roomId))
        if (roomId === update.roomId) {
          setSettingsRoomId(undefined)
          navigate('/chats', { replace: true })
        }
      }
      refreshRooms()
    }
    socket.on('connect', refreshRooms)
    socket.on('update_membership', onMembership)
    return () => {
      socket.off('connect', refreshRooms)
      socket.off('update_membership', onMembership)
    }
  }, [currentUserId, navigate, roomId])

  function updateRoom(room: Room) {
    setRooms((current) => {
      if (!current.some((item) => item.roomId === room.roomId)) return [room, ...current]
      return current.map((item) => item.roomId === room.roomId ? { ...item, ...room } : item)
    })
    setAttempt((value) => value + 1)
  }

  function openRoom(room: Room) {
    updateRoom(room)
    setCreating(null)
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
          <div className="space-y-2 border-b border-border px-4 py-4">
            <h2 className="font-semibold">Conversations</h2>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="solid" onClick={() => setCreating('direct')}>New chat</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setCreating('group')}>New group</Button>
            </div>
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
                            {room.lastMessage?.text || (room.type === 'group' ? `${room.participants.length} members` : room.directUser?.username ? `@${room.directUser.username}` : 'Direct chat')}
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
              <h2 className="min-w-0 flex-1 truncate font-semibold">{selectedRoom ? roomName(selectedRoom) : 'Conversation'}</h2>
              {selectedRoom?.type === 'group' && (
                <Button type="button" variant="ghost" size="icon" aria-label="Group settings"
                  onClick={() => setSettingsRoomId(roomId)}>
                  <Settings aria-hidden />
                </Button>
              )}
            </div>
            {selectedRoom ? <ChatRoom key={roomId} roomId={roomId} room={selectedRoom} currentUserId={currentUserId} />
              : <p className="p-4 text-sm text-muted-foreground">{loading ? 'Loading conversation…' : error || 'Conversation unavailable.'}</p>}
          </section>
        ) : (
          <section className="hidden place-content-center justify-items-center gap-2 p-6 text-center md:grid">
            <MessagesSquare className="size-6 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-medium">Select a conversation</h2>
            <p className="text-sm text-muted-foreground">Choose a chat from the sidebar or start a new one.</p>
          </section>
        )}
      </div>
      {creating === 'direct' && <NewChatDialog onClose={() => setCreating(null)} onOpenRoom={openRoom} />}
      {creating === 'group' && <NewGroupDialog contacts={contacts} onClose={() => setCreating(null)} onRoomChanged={openRoom} />}
      {settingsRoomId && selectedRoom?.type === 'group' && settingsRoomId === selectedRoom.roomId && (
        <GroupSettingsDialog key={settingsRoomId} room={selectedRoom} currentUserId={currentUserId} contacts={contacts}
          onClose={() => setSettingsRoomId(undefined)} onRoomChanged={updateRoom} />
      )}
    </main>
  )
}
