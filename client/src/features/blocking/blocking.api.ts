import { api } from '@/lib/api'

export type BlockedUser = { userId: string; name: string; username: string; profilePhotoUrl?: string }

export const directContactUnavailable = 'Direct messaging is unavailable because this conversation is blocked.'

export function listBlockedUsers(signal: AbortSignal) {
  return api<{ users: BlockedUser[] }>('/api/v1/users/me/blocked', { signal })
}

export function setUserBlocked(userId: string, blocked: boolean) {
  return api<{ blocked: boolean }>(`/api/v1/users/${encodeURIComponent(userId)}/block`, {
    method: blocked ? 'POST' : 'DELETE',
  })
}
