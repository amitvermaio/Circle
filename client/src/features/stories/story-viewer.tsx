import { ArrowSquareOutIcon, ImageBrokenIcon, PauseIcon, PlayIcon, TrashIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { parseMediaUrl } from '@/features/chats/media.api'

import { ApiError } from '@/lib/api'

import { deleteStory, listStoryViewers, type OwnStory, type Story, type StoryViewerEntry } from './stories.api'

export type StoryItem = { author: string } & ((OwnStory & { own: true }) | (Story & { own: false }))

const storyDurationMs = 6000
const viewedAtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function StoryViewers({ storyId, listId, onLoaded }: { storyId: string; listId: string; onLoaded: (count: number) => void }) {
  const [viewers, setViewers] = useState<StoryViewerEntry[]>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void listStoryViewers(storyId, controller.signal).then(({ viewers }) => {
      if (controller.signal.aborted) return
      setViewers(viewers)
      onLoaded(viewers.length)
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof ApiError ? failure.message : 'Could not load viewers.')
    })
    return () => controller.abort()
  }, [attempt, onLoaded, storyId])

  return (
    <section id={listId} aria-label="Story viewers" className="rounded-md border border-border bg-background p-3">
      {error ? (
        <div className="flex items-center justify-between gap-2">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setError(''); setAttempt((value) => value + 1) }}>
            Retry
          </Button>
        </div>
      ) : !viewers ? <p role="status" className="text-sm text-muted-foreground">Loading viewers…</p>
        : viewers.length === 0 ? <p className="text-sm text-muted-foreground">No views yet</p>
          : (
            <ul className="max-h-40 divide-y divide-border overflow-y-auto">
              {viewers.map(({ userId, name, username, viewedAt }) => {
                const label = name || username || 'Unknown viewer'
                return (
                  <li key={userId} className="flex flex-wrap items-center gap-2 py-2">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs text-brand">
                      {Array.from(label)[0]?.toLocaleUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">{label}</span>
                    {viewedAt ? <time dateTime={viewedAt} className="text-xs text-muted-foreground">{viewedAtFormat.format(new Date(viewedAt))}</time>
                      : <span className="text-xs text-muted-foreground">Time unavailable</span>}
                  </li>
                )
              })}
            </ul>
          )}
    </section>
  )
}

function StoryMedia({ story }: { story: StoryItem }) {
  const url = parseMediaUrl(story.mediaUrl)
  const [failed, setFailed] = useState(false)
  const label = `Story from ${story.author}`

  if (!url || failed) {
    return (
      <p className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
        <ImageBrokenIcon className="size-4" aria-hidden /> Media unavailable
      </p>
    )
  }

  const path = url.pathname.toLowerCase()
  const className = 'max-h-[48dvh] w-full rounded-md bg-muted object-contain'
  if (/\.(jpe?g|png|webp)$/.test(path)) {
    return <img src={url.href} alt={label} className={className} onError={() => setFailed(true)} />
  }
  if (path.endsWith('.mp4')) {
    return <video src={url.href} aria-label={label} controls playsInline preload="metadata"
      className={className} onError={() => setFailed(true)} />
  }
  if (path.endsWith('.webm')) {
    return <audio src={url.href} aria-label={label} controls preload="metadata" className="max-w-full"
      onError={() => setFailed(true)} />
  }
  return (
    <Button asChild variant="outline" size="sm">
      <a href={url.href} target="_blank" rel="noopener noreferrer">
        <ArrowSquareOutIcon aria-hidden /> Open attachment
      </a>
    </Button>
  )
}

function StorySlide({ story, onAdvance, onView }: {
  story: StoryItem
  onAdvance: () => void
  onView: (storyId: string) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const elapsedRef = useRef(0)
  const [showViewers, setShowViewers] = useState(false)
  const [viewerCount, setViewerCount] = useState(story.own ? story.viewerCount : 0)
  const viewersId = useId()

  useEffect(() => {
    if (!story.own) onView(story._id)
  }, [onView, story._id, story.own])

  useEffect(() => {
    if (paused || showViewers) return
    const start = performance.now() - elapsedRef.current
    const timer = window.setInterval(() => {
      const time = Math.min(storyDurationMs, performance.now() - start)
      elapsedRef.current = time
      setElapsed(time)
      if (time === storyDurationMs) {
        window.clearInterval(timer)
        onAdvance()
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [onAdvance, paused, showViewers])

  return (
    <>
      <div className="flex items-center gap-2">
        <Progress aria-label="Story progress" value={Math.round(elapsed)} max={storyDurationMs}
          className="[&>div]:duration-100 motion-reduce:[&>div]:transition-none" />
        <Button type="button" variant="ghost" size="icon" className="size-7" disabled={showViewers} aria-label={paused ? 'Resume story' : 'Pause story'}
          onClick={() => setPaused(!paused)}>
          {paused ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
        </Button>
      </div>
      <StoryMedia story={story} />
      {story.own && (
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" className="text-brand"
            aria-expanded={showViewers} aria-controls={showViewers ? viewersId : undefined}
            onClick={() => setShowViewers(!showViewers)}>
            {viewerCount} {viewerCount === 1 ? 'view' : 'views'}
          </Button>
          {showViewers && <StoryViewers storyId={story._id} listId={viewersId} onLoaded={setViewerCount} />}
        </div>
      )}
      {story.caption && <p className="max-h-[16dvh] overflow-y-auto whitespace-pre-wrap break-words text-sm">{story.caption}</p>}
    </>
  )
}

export function StoryViewer({ stories, initialIndex, onClose, onView, onDeleted }: {
  stories: StoryItem[]
  initialIndex: number
  onClose: () => void
  onView: (storyId: string) => void
  onDeleted: (storyId: string) => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deletePending = useRef(false)
  const story = stories[index]
  const next = useCallback(() => {
    const nextIndex = stories.findIndex(({ expiresAt }, i) => i > index && Date.parse(expiresAt) > Date.now())
    if (nextIndex < 0) onClose()
    else setIndex(nextIndex)
  }, [index, onClose, stories])

  function previous() {
    const previousIndex = stories.findLastIndex(({ expiresAt }, i) => i < index && Date.parse(expiresAt) > Date.now())
    if (previousIndex >= 0) setIndex(previousIndex)
  }

  async function confirmDelete() {
    if (deletePending.current || !story.own) return
    deletePending.current = true
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteStory(story._id)
      onDeleted(story._id)
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) {
        onDeleted(story._id)
      } else {
        setDeleteError(failure instanceof ApiError ? failure.message : 'Could not delete this story.')
      }
    } finally {
      deletePending.current = false
      setDeleting(false)
    }
  }

  if (confirming) {
    return (
      <ConfirmDialog open title="Delete this story?" confirmLabel="Delete story" busyLabel="Deleting…"
        busy={deleting} error={deleteError} onConfirm={() => void confirmDelete()} onCancel={() => setConfirming(false)}>
        This story will be removed for everyone.
      </ConfirmDialog>
    )
  }

  return (
    <Dialog open onClose={onClose} title={story.author}>
      <div className="mt-2 space-y-2">
        <StorySlide key={story._id} story={story} onAdvance={next} onView={onView} />
        <div className="flex flex-wrap justify-between gap-1">
          <Button type="button" variant="ghost" size="sm" className="px-2" disabled={index === 0} onClick={previous}>Previous</Button>
          <Button type="button" variant="ghost" size="sm" className="px-2" onClick={onClose}>Close</Button>
          {story.own && (
            <Button type="button" variant="ghost" size="sm" className="px-2 text-muted-foreground"
              onClick={() => { setDeleteError(''); setConfirming(true) }}>
              <TrashIcon aria-hidden /> Delete
            </Button>
          )}
          <Button type="button" variant={story.own ? 'soft' : 'ghost'} size="sm" className="px-2" onClick={next}>
            {index < stories.length - 1 ? 'Next' : 'Done'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
