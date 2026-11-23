import { ArrowLeftIcon, ChatCircleIcon, ChatsCircleIcon, SignOutIcon, UserCircleIcon, UsersIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router'

import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { logout, type AuthenticatedUser } from '@/features/auth/auth.api'
import { ChatRoom } from '@/features/chats/chat-room'
import { listRooms, roomName, type Room } from '@/features/chats/chats.api'
import { GroupSettingsDialog, NewGroupDialog } from '@/features/chats/group-dialogs'
import { NewChatDialog } from '@/features/chats/new-chat-dialog'
import { StoriesStrip } from '@/features/stories/stories-strip'
import { ApiError, getAuthToken } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

export function ChatsPage({ user, onLogout }: { user: AuthenticatedUser; onLogout: () => void }) {
  const { userId: currentUserId } = user
  const accountName = user.name.trim() || user.username
  const navigate = useNavigate()
  const roomId = useMatch('/chats/:roomId')?.params.roomId
  const viewingProfile = !!useMatch('/profile')
  const [busy, setBusy] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [creating, setCreating] = useState<'direct' | 'group' | null>(null)
  const [settingsRoomId, setSettingsRoomId] = useState<string>()
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
      onLogout()
    }
  }

  return (
    <main className="chat-workspace grid h-dvh grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden [--spacing:0.25rem] md:grid-cols-[300px_minmax(0,1fr)]">
      <aside aria-label="Chat sidebar" className={cn(
        'flex min-h-0 min-w-0 flex-col bg-card md:border-r md:border-border',
        (roomId || viewingProfile) && 'hidden md:flex',
      )}>
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <ChatsCircleIcon className="size-5" aria-hidden /> Chats
          </h1>
          <ThemeSwitcher className="size-8 [&_svg]:size-4" />
        </header>
        <div aria-label="Chat sidebar content" className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:thin]">
          <StoriesStrip contacts={contacts} currentUserId={currentUserId} />
          <div className="space-y-2 border-b border-border p-4">
            <h2 className="text-sm font-semibold">Conversations</h2>
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
              <ChatCircleIcon className="mb-3 size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-semibold">No conversations yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Start a new chat to find someone by username.</p>
            </div>
          )}
          {rooms.length > 0 && (
            <nav aria-label="Conversations">
              <ul className="space-y-1 px-4 py-2">
                {rooms.map((room) => (
                  <li key={room.roomId}>
                    <Button asChild variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2 text-left aria-[current=page]:bg-[var(--chat-selection)] aria-[current=page]:text-brand">
                      <NavLink to={`/chats/${encodeURIComponent(room.roomId)}`} end>
                        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border" aria-hidden>
                          {room.type === 'group' ? <UsersIcon /> : <ChatCircleIcon />}
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
        </div>
        <footer aria-label="Account" className="shrink-0 space-y-2 border-t border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {user.profilePhotoUrl ? (
              <img src={user.profilePhotoUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-brand">
                {Array.from(accountName)[0]?.toLocaleUpperCase()}
              </span>
            )}
            <span className="min-w-0 truncate text-sm font-semibold" title={accountName}>{accountName}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-2 border border-border px-2">
              <NavLink to="/profile" className="aria-[current=page]:bg-accent aria-[current=page]:text-brand"><UserCircleIcon className="size-4" aria-hidden />Profile</NavLink>
            </Button>
            <Button type="button" variant="ghost" size="sm"
              className="gap-2 border border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleLogout} disabled={busy}>
              <SignOutIcon className="size-4" aria-hidden />Log out
            </Button>
          </div>
        </footer>
      </aside>
      {viewingProfile ? <Outlet /> : roomId ? (
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {selectedRoom ? (
            <ChatRoom key={roomId} roomId={roomId} room={selectedRoom} rooms={rooms} currentUserId={currentUserId}
              onOpenGroupSettings={() => setSettingsRoomId(roomId)} />
          ) : (
            <>
              <header className="bg-card flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                <Button asChild variant="ghost" size="icon" className="size-8 md:hidden">
                  <Link to="/chats" aria-label="Back to chats"><ArrowLeftIcon aria-hidden /></Link>
                </Button>
                <h2 className="text-sm font-semibold">Conversation</h2>
              </header>
              <p className="p-4 text-sm text-muted-foreground">{loading ? 'Loading conversation…' : error || 'Conversation unavailable.'}</p>
            </>
          )}
        </section>
      ) : (
        <section className="hidden min-w-0 place-content-center justify-items-center gap-2 p-6 text-center md:grid">
          <h2><Logo className="gap-2 [&>svg]:size-7" wordmarkClassName="text-5xl" /></h2>
          <p className="text-sm text-muted-foreground">Select a conversation to start chatting.</p>
        </section>
      )}
      {creating === 'direct' && <NewChatDialog onClose={() => setCreating(null)} onOpenRoom={openRoom} />}
      {creating === 'group' && <NewGroupDialog contacts={contacts} onClose={() => setCreating(null)} onRoomChanged={openRoom} />}
      {settingsRoomId && selectedRoom?.type === 'group' && settingsRoomId === selectedRoom.roomId && (
        <GroupSettingsDialog key={settingsRoomId} room={selectedRoom} currentUserId={currentUserId} contacts={contacts}
          onClose={() => setSettingsRoomId(undefined)} onRoomChanged={updateRoom} />
      )}
    </main>
  )
}
