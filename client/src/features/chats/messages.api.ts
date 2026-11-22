import { api } from '@/lib/api'
import type { RoomMessage } from '@/lib/socket'

const messages = (roomId: string) => `/api/v1/rooms/${encodeURIComponent(roomId)}/messages`
const message = (roomId: string, messageId: string) => `${messages(roomId)}/${encodeURIComponent(messageId)}`
const pins = (roomId: string) => `/api/v1/rooms/${encodeURIComponent(roomId)}/pins`

export function getRoomMessage(roomId: string, messageId: string, signal: AbortSignal) {
  return api<{ message: RoomMessage }>(message(roomId, messageId), { signal })
}

export function editRoomMessage(roomId: string, messageId: string, text: string) {
  return api<{ message: RoomMessage }>(message(roomId, messageId), { method: 'PATCH', body: { text } })
}

export function deleteRoomMessage(roomId: string, messageId: string, scope: 'me' | 'everyone') {
  return api<{ message: RoomMessage }>(`${message(roomId, messageId)}?scope=${scope}`, { method: 'DELETE' })
}

export function listStarredMessages(signal?: AbortSignal) {
  return api<{ messages: RoomMessage[] }>('/api/v1/users/me/starred', { signal })
}

export function setMessageStar(messageId: string, starred: boolean) {
  return api<{ starred: boolean }>(`/api/v1/messages/${encodeURIComponent(messageId)}/star`, { method: starred ? 'POST' : 'DELETE' })
}

export function listPinnedMessages(roomId: string, signal: AbortSignal) {
  return api<{ messages: RoomMessage[] }>(pins(roomId), { signal })
}

export function setMessagePin(roomId: string, messageId: string, pinned: boolean) {
  return api<{ pinned: boolean }>(`${pins(roomId)}/${encodeURIComponent(messageId)}`, { method: pinned ? 'POST' : 'DELETE' })
}
