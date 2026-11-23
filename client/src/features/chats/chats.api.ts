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
  photoUrl?: string
  participants: string[]
  admins: string[]
  createdBy: string
  status?: 'pending' | 'accepted'
  requestedBy?: string
  directUser?: ChatUser
  lastMessage?: { text?: string } | null
  unreadCount?: number
}

export type RoomRequest = Room & {
  status: 'pending'
  requestedBy: string
  lastMessage: { text: string; senderId: string; timestamp: string } | null
}

export function listRoomRequests(signal: AbortSignal) {
  return api<{ rooms: RoomRequest[] }>('/api/v1/rooms/requests', { signal, cache: 'no-store' })
}

export function acceptRoomRequest(roomId: string) {
  return api<{ room: Room }>(roomPath(roomId) + '/accept', { method: 'PATCH' })
}

export function declineRoomRequest(roomId: string) {
  return api<{ declined: true }>(roomPath(roomId) + '/decline', { method: 'PATCH' })
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

function roomPath(roomId: string) {
  return `/api/v1/rooms/${encodeURIComponent(roomId)}`
}

export function createGroup(name: string, memberIds: string[]) {
  return api<{ room: Room }>('/api/v1/rooms/groups', { method: 'POST', body: { name, memberIds } })
}

export function getGroupMembers(roomId: string, signal: AbortSignal) {
  return api<{ members: ChatUser[] }>(roomPath(roomId), { signal })
}

export function updateGroup(roomId: string, details: { name?: string; photoUrl?: string }) {
  return api<{ room: Room }>(roomPath(roomId), { method: 'PATCH', body: details })
}

export function addGroupMember(roomId: string, userId: string) {
  return api<{ room: Room }>(`${roomPath(roomId)}/members`, { method: 'POST', body: { userId } })
}

export function removeGroupMember(roomId: string, userId: string) {
  return api<{ room: Room }>(`${roomPath(roomId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function roomName(room: Room) {
  return room.directUser?.name || room.directUser?.username || room.name || (room.type === 'group' ? 'Group chat' : 'Direct chat')
}
