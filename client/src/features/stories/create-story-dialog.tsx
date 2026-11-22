import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { attachmentAccept, uploadAttachment, validateAttachment } from '@/features/chats/media.api'
import { ApiError } from '@/lib/api'
import type { UploadedMedia } from '@/lib/socket'

import { createStory, type Story } from './stories.api'

export function CreateStoryDialog({ onClose, onPosted }: { onClose: () => void; onPosted: (story: Story) => void }) {
  const [file, setFile] = useState<File>()
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const uploaded = useRef<UploadedMedia>(undefined)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || request.current) return

    const controller = new AbortController()
    request.current = controller
    setError('')
    setStatus(uploaded.current ? 'Posting…' : 'Uploading…')
    try {
      const media = uploaded.current ?? await uploadAttachment(file, controller.signal)
      if (controller.signal.aborted) return
      uploaded.current = media
      setStatus('Posting…')
      const { story } = await createStory(media, caption.trim(), controller.signal)
      if (!controller.signal.aborted) onPosted(story)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof ApiError ? failure.message : 'Could not post your story. Try again.')
      }
    } finally {
      request.current = null
      if (!controller.signal.aborted) setStatus('')
    }
  }

  return (
    <Dialog open onClose={onClose} title="Create story" busy={!!status} initialFocus={picker}>
      <form className="mt-3 space-y-2" onSubmit={submit}>
        <Field label="Media" hint="JPEG, PNG, WebP, MP4, PDF, or WebM audio. Up to 50 MB.">
          <Input ref={picker} type="file" accept={attachmentAccept} disabled={!!status}
            className="h-auto py-2 file:mr-2 file:rounded file:border-0 file:bg-muted file:px-1 file:text-foreground"
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0]
              const message = selected ? validateAttachment(selected) : undefined
              if (message) event.currentTarget.value = ''
              uploaded.current = undefined
              setFile(message ? undefined : selected)
              setError(message ?? '')
            }} />
        </Field>
        <Field label="Caption" aside="Optional">
          <Textarea value={caption} maxLength={1000} disabled={!!status} className="min-h-12"
            onChange={(event) => setCaption(event.target.value)} />
        </Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
        <DialogActions className="mt-3">
          <Button type="button" variant="ghost" disabled={!!status} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!file || !!status}>Post story</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
