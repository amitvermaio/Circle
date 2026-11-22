import { api } from '@/lib/api'
import type { RoomMessage } from '@/lib/socket'

export type ChatUser = {
  userId: string
  name: string
  username: string
}

export type Room = {
  roomId: string
  type: 'direct' | 'group'
  name?: string
  directUser?: ChatUser
  lastMessage?: { text?: string } | null
  unreadCount?: number
}

export function listRooms(signal: AbortSignal) {
  return api<{ rooms: Room[] }>('/api/v1/rooms', { signal })
}

export function listRoomMessages(roomId: string, signal: AbortSignal, cursor?: string) {
  const query = new URLSearchParams({ limit: '30' })
  if (cursor) query.set('cursor', cursor)
  return api<{ messages: RoomMessage[]; nextCursor: string | null }>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/messages?${query}`,
    { signal },
  )
}

export function searchUsers(query: string, signal: AbortSignal) {
  const params = new URLSearchParams({ query })
  return api<{ users: ChatUser[] }>(`/api/v1/users/search?${params}`, { signal })
}

export function createDirectRoom(otherUserId: string) {
  return api<{ room: Room; created: boolean }>('/api/v1/rooms', {
    method: 'POST',
    body: { otherUserId },
  })
}

export function roomName(room: Room) {
  return room.directUser?.name || room.directUser?.username || room.name || (room.type === 'group' ? 'Group chat' : 'Direct chat')
}
