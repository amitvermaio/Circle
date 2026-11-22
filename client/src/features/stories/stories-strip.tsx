import { Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ChatUser } from '@/features/chats/chats.api'
import { ApiError } from '@/lib/api'

import { CreateStoryDialog } from './create-story-dialog'
import { listStories, recordStoryView, type Story } from './stories.api'
import { StoryViewer, type StoryItem } from './story-viewer'

export function StoriesStrip({ contacts, currentUserId }: { contacts: ChatUser[]; currentUserId?: string }) {
  const [stories, setStories] = useState<Story[]>([])
  const [posted, setPosted] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<{ items: StoryItem[]; index: number }>()
  const [postNotice, setPostNotice] = useState('')
  const [now, setNow] = useState(Date.now)
  const viewRequests = useRef(new Set<string>())
  const closeViewer = useCallback(() => setViewing(undefined), [])

  useEffect(() => {
    const controller = new AbortController()
    void listStories(controller.signal).then(({ stories }) => {
      if (controller.signal.aborted) return
      setStories(stories)
      setNow(Date.now())
      setLoading(false)
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      setError(failure instanceof ApiError ? failure.message : 'Could not load stories.')
      setLoading(false)
    })
    return () => controller.abort()
  }, [attempt])

  const names = new Map(contacts.map(({ userId, name, username }) => [userId, name || username]))
  const items = [...posted, ...stories].filter(({ expiresAt }) => Date.parse(expiresAt) > now)
    .map((story): StoryItem => {
      const own = story.userId === currentUserId || posted.includes(story)
      return { ...story, own, author: own ? 'Your story' : names.get(story.userId) ?? `Contact ${story.userId.slice(-4)}` }
    })
  const nextExpiry = Math.min(...items.map(({ expiresAt }) => Date.parse(expiresAt)))

  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - Date.now()))
    return () => window.clearTimeout(timer)
  }, [nextExpiry])

  const onView = useCallback((storyId: string) => {
    if (viewRequests.current.has(storyId)) return
    viewRequests.current.add(storyId)
    // A successful view is recorded once. If the request fails, reopening can retry it.
    void recordStoryView(storyId).catch(() => viewRequests.current.delete(storyId))
  }, [])

  return (
    <section aria-label="Stories" className="min-w-0 space-y-2 border-b border-border px-2 py-2 sm:px-4">
      <h2 className="text-sm font-semibold">Stories</h2>
      <ul className="flex gap-1 overflow-x-auto overscroll-x-contain p-1">
        <li className="shrink-0">
          <Button type="button" variant="ghost" size="sm" className="h-auto w-10 flex-col gap-1 px-0 py-1"
            onClick={() => { setPostNotice(''); setCreating(true) }}>
            <span className="grid size-6 place-items-center rounded-full border border-dashed border-border">
              <Plus className="size-4" aria-hidden />
            </span>
            <span className="text-xs">Add story</span>
          </Button>
        </li>
        {items.map((item, index) => (
          <li key={item._id} className="shrink-0">
            <Button type="button" variant="ghost" size="sm" aria-label={`View ${item.own ? 'your story' : `story from ${item.author}`}`}
              className="h-auto w-10 flex-col gap-1 px-0 py-1"
              onClick={() => setViewing({ items, index })}>
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full border border-foreground/40 bg-muted">
                {item.own ? 'Y' : item.author.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-full truncate text-xs">{item.author}</span>
            </Button>
          </li>
        ))}
      </ul>
      {loading && <p role="status" className="text-xs text-muted-foreground">Loading stories…</p>}
      {error && (
        <div className="flex flex-wrap items-center gap-1">
          <p role="alert" className="text-xs text-destructive">{error}</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => {
            setError('')
            setLoading(true)
            setAttempt((value) => value + 1)
          }}>Retry</Button>
        </div>
      )}
      {postNotice && <p role="status" className="text-xs text-muted-foreground">{postNotice}</p>}
      {creating && (
        <CreateStoryDialog onClose={() => setCreating(false)} onPosted={(story) => {
          setPosted((current) => [story, ...current])
          setNow(Date.now())
          setPostNotice('Story posted.')
          setCreating(false)
        }} />
      )}
      {viewing && <StoryViewer stories={viewing.items} initialIndex={viewing.index} onClose={closeViewer} onView={onView} />}
    </section>
  )
}
