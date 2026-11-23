import { api } from '@/lib/api'
import type { UploadedMedia } from '@/lib/socket'

export type Story = {
  _id: string
  userId: string
  mediaUrl: string
  caption: string
  createdAt: string
  expiresAt: string
}

export type OwnStory = Story & { viewerCount: number }

export function listStories(signal: AbortSignal) {
  return api<{ stories: Story[] }>('/api/v1/stories', { signal })
}

export function listOwnStories(signal: AbortSignal) {
  return api<{ stories: OwnStory[] }>('/api/v1/stories/me', { signal })
}

export function createStory(media: UploadedMedia, caption: string, signal: AbortSignal) {
  return api<{ story: Story }>('/api/v1/stories', { method: 'POST', body: { media, caption }, signal })
}

export function recordStoryView(storyId: string) {
  return api<{ viewed: boolean }>(`/api/v1/stories/${encodeURIComponent(storyId)}/views`, { method: 'POST' })
}

export type StoryViewerEntry = {
  userId: string
  username: string | null
  name: string | null
  viewedAt: string | null
}

export function listStoryViewers(storyId: string, signal: AbortSignal) {
  return api<{ viewers: StoryViewerEntry[] }>(
    '/api/v1/stories/' + encodeURIComponent(storyId) + '/viewers', { signal, cache: 'no-store' },
  )
}

export function deleteStory(storyId: string) {
  return api<{ deleted: true }>('/api/v1/stories/' + encodeURIComponent(storyId), { method: 'DELETE' })
}
