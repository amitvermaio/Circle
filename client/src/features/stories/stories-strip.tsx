import { PlusIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ChatUser } from '@/features/chats/chats.api'
import { ApiError } from '@/lib/api'

import { CreateStoryDialog } from './create-story-dialog'
import { listOwnStories, listStories, recordStoryView, type OwnStory, type Story } from './stories.api'
import { StoryViewer, type StoryItem } from './story-viewer'

export function StoriesStrip({ contacts }: { contacts: ChatUser[] }) {
  const [stories, setStories] = useState<Story[]>([])
  const [ownStories, setOwnStories] = useState<OwnStory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<{ items: StoryItem[]; index: number }>()
  const [postNotice, setPostNotice] = useState('')
  const [now, setNow] = useState(Date.now)
  const viewRequests = useRef(new Set<string>())
  const closeViewer = useCallback(() => setViewing(undefined), [])
  const removeOwnStory = useCallback((storyId: string) => {
    setOwnStories((stories) => stories.filter(({ _id }) => _id !== storyId))
    closeViewer()
    setAttempt((value) => value + 1)
  }, [closeViewer])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.allSettled([listOwnStories(controller.signal), listStories(controller.signal)]).then(([own, contacts]) => {
      if (controller.signal.aborted) return
      if (own.status === 'fulfilled') setOwnStories(own.value.stories)
      if (contacts.status === 'fulfilled') setStories(contacts.value.stories)
      const failure = own.status === 'rejected' ? own.reason : contacts.status === 'rejected' ? contacts.reason : undefined
      setError(failure instanceof ApiError ? failure.message : failure ? 'Could not load stories.' : '')
      setNow(Date.now())
      setLoading(false)
    })
    return () => controller.abort()
  }, [attempt])

  const names = new Map(contacts.map(({ userId, name, username }) => [userId, name || username]))
  const isActive = ({ expiresAt }: Story) => Date.parse(expiresAt) > now
  const ownItems = ownStories.filter(isActive)
    .map((story): StoryItem => ({ ...story, own: true, author: 'Your story' }))
  const contactItems = stories.filter(isActive).map((story): StoryItem => ({
    ...story, own: false, author: names.get(story.userId) ?? 'Contact ' + story.userId.slice(-4),
  }))
  const nextExpiry = Math.min(...[...ownItems, ...contactItems].map(({ expiresAt }) => Date.parse(expiresAt)))

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
    <section aria-label="Stories" className="min-w-0 space-y-2 border-b border-border p-4">
      <h2 className="text-sm font-semibold">Stories</h2>
      <ul className="flex gap-2 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:thin]">
        {!!ownItems.length && (
          <li className="shrink-0">
            <Button type="button" variant="ghost" size="sm" aria-label="View your story"
              className="h-auto w-16 flex-col gap-2 px-1 py-1"
              onClick={() => setViewing({ items: ownItems, index: 0 })}>
              <span aria-hidden className="grid size-8 place-items-center rounded-full border-2 border-brand bg-muted text-brand">Y</span>
              <span className="text-xs">Your story</span>
            </Button>
          </li>
        )}
        <li className="shrink-0">
          <Button type="button" variant="ghost" size="sm" className="h-auto w-16 flex-col gap-2 px-1 py-1"
            onClick={() => { setPostNotice(''); setCreating(true) }}>
            <span className="grid size-8 place-items-center rounded-full border border-dashed border-border">
              <PlusIcon className="size-4" aria-hidden />
            </span>
            <span className="text-xs">Add story</span>
          </Button>
        </li>
        {contactItems.map((item, index) => (
          <li key={item._id} className="shrink-0">
            <Button type="button" variant="ghost" size="sm" aria-label={'View story from ' + item.author}
              className="h-auto w-16 flex-col gap-2 px-1 py-1"
              onClick={() => setViewing({ items: contactItems, index })}>
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-foreground/40 bg-muted">
                {item.author.charAt(0).toUpperCase()}
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
          setOwnStories((current) => [{ ...story, viewerCount: 0 }, ...current.filter(({ _id }) => _id !== story._id)])
          setAttempt((value) => value + 1)
          setNow(Date.now())
          setPostNotice('Story posted.')
          setCreating(false)
        }} />
      )}
      {viewing && <StoryViewer stories={viewing.items} initialIndex={viewing.index} onClose={closeViewer} onView={onView} onDeleted={removeOwnStory} />}
    </section>
  )
}
