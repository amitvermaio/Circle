import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'

export function BlockUserAction({ name, blocked, onChange }: {
  name: string
  blocked: boolean
  onChange: (blocked: boolean) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)

  async function update(block: boolean) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await onChange(block)
      setConfirming(false)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not update the block. Try again.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="ml-auto min-w-0 text-right">
      <Button type="button" size="sm" variant="outline" disabled={busy} aria-busy={busy || undefined}
        onClick={() => {
          setError('')
          if (blocked) void update(false)
          else setConfirming(true)
        }}>
        {blocked ? 'Unblock' : 'Block'}
      </Button>
      {error && !confirming && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
      {confirming && (
        <ConfirmDialog open title={`Block ${name}?`} confirmLabel="Block" busyLabel="Blocking…"
          typeToConfirm="block" busy={busy} error={error}
          onCancel={() => { setConfirming(false); setError('') }}
          onConfirm={() => void update(true)}>
          Blocking stops direct messages between you. You can still message each other in shared groups.
        </ConfirmDialog>
      )}
    </div>
  )
}
