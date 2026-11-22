import { useEffect, useRef, type RefObject } from 'react'

import { getSocket } from '@/lib/socket'

const minimumVisibility = 0.01
// The server allows 30 read events per socket in a ten-second window.
const readIntervalMs = 350

export function useVisibleReads(roomId: string, joined: boolean, listRef: RefObject<HTMLOListElement | null>) {
  const reported = useRef(new Set<string>())
  const lastReadAt = useRef(-Infinity)

  useEffect(() => {
    const list = listRef.current
    if (!joined || !list) return

    const pending = new Set<string>()
    let timer: number | undefined

    function flush() {
      if (timer !== undefined || !pending.size || document.visibilityState !== 'visible') return
      const socket = getSocket()
      if (!socket?.connected) return

      const wait = lastReadAt.current + readIntervalMs - performance.now()
      if (wait > 0) {
        timer = window.setTimeout(() => {
          timer = undefined
          flush()
        }, wait)
        return
      }
      const messageId = pending.values().next().value
      if (messageId === undefined) return
      pending.delete(messageId)
      reported.current.add(messageId)
      lastReadAt.current = performance.now()
      socket.emit('message_read', { roomId, messageId })
      flush()
    }

    const observer = new IntersectionObserver((entries) => {
      if (document.visibilityState !== 'visible') return
      for (const entry of entries) {
        const messageId = (entry.target as HTMLElement).dataset.unreadMessageId
        if (!messageId || reported.current.has(messageId) || entry.intersectionRatio < minimumVisibility) continue
        pending.add(messageId)
        observer.unobserve(entry.target)
      }
      flush()
    }, { threshold: minimumVisibility })

    function observeUnread() {
      observer.disconnect()
      for (const row of list!.querySelectorAll<HTMLElement>('[data-unread-message-id]')) {
        const messageId = row.dataset.unreadMessageId!
        if (!reported.current.has(messageId) && !pending.has(messageId)) observer.observe(row)
      }
    }

    const changes = new MutationObserver(observeUnread)
    changes.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-unread-message-id'] })
    observeUnread()
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        observeUnread()
        flush()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      observer.disconnect()
      changes.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearTimeout(timer)
    }
  }, [roomId, joined, listRef])
}
