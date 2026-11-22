import { ArrowSquareOutIcon, ImageBrokenIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { parseMediaUrl } from '@/features/chats/media.api'

import type { Story } from './stories.api'

export type StoryItem = Story & { author: string; own: boolean }

const storyDurationMs = 6000

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

  useEffect(() => {
    if (!story.own) onView(story._id)
  }, [onView, story._id, story.own])

  useEffect(() => {
    if (paused) return
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
  }, [onAdvance, paused])

  return (
    <>
      <div className="flex items-center gap-2">
        <Progress aria-label="Story progress" value={Math.round(elapsed)} max={storyDurationMs}
          className="[&>div]:duration-100 motion-reduce:[&>div]:transition-none" />
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={paused ? 'Resume story' : 'Pause story'}
          onClick={() => setPaused(!paused)}>
          {paused ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
        </Button>
      </div>
      <StoryMedia story={story} />
      {story.caption && <p className="max-h-[16dvh] overflow-y-auto whitespace-pre-wrap break-words text-sm">{story.caption}</p>}
    </>
  )
}

export function StoryViewer({ stories, initialIndex, onClose, onView }: {
  stories: StoryItem[]
  initialIndex: number
  onClose: () => void
  onView: (storyId: string) => void
}) {
  const [index, setIndex] = useState(initialIndex)
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

  return (
    <Dialog open onClose={onClose} title={story.author} className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-3 sm:p-6">
      <div className="mt-2 space-y-2">
        <StorySlide key={story._id} story={story} onAdvance={next} onView={onView} />
        <div className="flex flex-wrap justify-between gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={previous}>Previous</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
          <Button type="button" variant="ghost" size="sm" onClick={next}>{index < stories.length - 1 ? 'Next' : 'Done'}</Button>
        </div>
      </div>
    </Dialog>
  )
}
