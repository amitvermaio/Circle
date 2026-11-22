import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import { addGroupMember, createGroup, getGroupMembers, removeGroupMember, updateGroup, type ChatUser, type Room } from './chats.api'

type GroupDialogProps = {
  contacts: ChatUser[]
  onClose: () => void
  onRoomChanged: (room: Room) => void
}

function groupError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  return error.code === 'NOT_CONNECTED' ? 'Only people with an existing direct chat are eligible. Start a direct chat with them first.' : error.message
}

function ContactPicker({ contacts, selected, onPick, disabled }: {
  contacts: ChatUser[]
  selected: string[]
  onPick: (userId: string) => void
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase().replace(/^@/, '')
  const matches = contacts.filter(({ name, username }) => name.toLowerCase().includes(search) || username.toLowerCase().includes(search))

  if (!contacts.length) return <p className="text-sm text-muted-foreground">No eligible direct chats. Start a direct chat first.</p>

  return (
    <div className="space-y-2">
      <Input type="search" aria-label="Filter direct chats" placeholder="Filter direct chats" value={query}
        onChange={(event) => setQuery(event.target.value)} />
      {matches.length ? (
        <ul aria-label="Eligible direct chats" className="max-h-44 space-y-1 overflow-y-auto">
          {matches.map(({ userId, name, username }) => (
            <li key={userId}>
              <Button type="button" variant="ghost" aria-pressed={selected.includes(userId)} disabled={disabled}
                className="h-auto w-full justify-start py-2 text-left aria-pressed:bg-accent" onClick={() => onPick(userId)}>
                <span className="min-w-0">
                  <span className="block truncate">{name || username}</span>
                  <span className="block truncate text-xs text-muted-foreground">@{username}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No matching direct chats.</p>}
    </div>
  )
}

export function NewGroupDialog({ contacts, onClose, onRoomChanged }: GroupDialogProps) {
  const nameInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const eligibleIds = memberIds.filter((id) => contacts.some(({ userId }) => userId === id))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !name.trim() || !eligibleIds.length) return
    setBusy(true)
    setError('')
    try {
      const { room } = await createGroup(name.trim(), eligibleIds)
      onRoomChanged(room)
    } catch (error) {
      setError(groupError(error, 'Could not create the group.'))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title="New group" description="Choose members from your direct chats."
      busy={busy} initialFocus={nameInput} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <form onSubmit={submit} className="mt-4 space-y-4">
        <label className="block space-y-2 text-sm">
          <span>Group name</span>
          <Input ref={nameInput} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
        </label>
        <ContactPicker contacts={contacts} selected={eligibleIds} disabled={busy}
          onPick={(id) => setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />
        <p className="text-sm text-muted-foreground">{eligibleIds.length} selected</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !name.trim() || !eligibleIds.length}>{busy ? 'Creating…' : 'Create group'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function GroupSettingsDialog({ room, currentUserId, contacts, onClose, onRoomChanged }: GroupDialogProps & {
  room: Room
  currentUserId?: string
}) {
  const [profiles, setProfiles] = useState<ChatUser[]>([])
  const [rosterError, setRosterError] = useState('')
  const [nameDraft, setNameDraft] = useState<string>()
  const [photoDraft, setPhotoDraft] = useState<string>()
  const [candidate, setCandidate] = useState<string>()
  const [removing, setRemoving] = useState<string>()
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const rosterKey = room.participants.join(',')
  const isAdmin = currentUserId !== undefined && room.admins.includes(currentUserId)
  const eligibleContacts = contacts.filter(({ userId }) => !room.participants.includes(userId))
  const canAdd = candidate && eligibleContacts.some(({ userId }) => userId === candidate)
  const profileById = new Map([...contacts, ...profiles].map((profile) => [profile.userId, profile]))
  const memberName = (id: string) => id === currentUserId ? 'You' : profileById.get(id)?.name || profileById.get(id)?.username || `Member ${id.slice(-4)}`

  useEffect(() => {
    const controller = new AbortController()
    void getGroupMembers(room.roomId, controller.signal).then(({ members }) => {
      if (controller.signal.aborted) return
      setProfiles(members)
      setRosterError('')
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRosterError(groupError(error, 'Could not load member names.'))
    })
    return () => controller.abort()
  }, [room.roomId, rosterKey])

  async function change(action: () => Promise<{ room: Room }>, complete: () => void, message: string) {
    if (!isAdmin || busy) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await action()
      onRoomChanged(result.room)
      complete()
      setSuccess(message)
    } catch (error) {
      setError(groupError(error, 'Could not update the group.'))
    } finally {
      setBusy(false)
    }
  }

  const name = nameDraft ?? room.name ?? ''
  const photo = photoDraft ?? room.photoUrl ?? ''
  const details = {
    ...(name.trim() !== room.name ? { name: name.trim() } : {}),
    ...(photo.trim() && photo.trim() !== room.photoUrl ? { photoUrl: photo.trim() } : {}),
  }
  const hasChanges = Object.keys(details).length > 0
  const showRemoval = isAdmin && removing && room.participants.includes(removing) && room.participants.length > 2

  return (
    <Dialog open onClose={onClose} title="Group settings" description={room.name} busy={busy}
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      {isAdmin && (
        <form className="mt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault()
          if (hasChanges) void change(() => updateGroup(room.roomId, details), () => {
            setNameDraft(undefined)
            setPhotoDraft(undefined)
          }, 'Group details saved.')
        }}>
          <label className="block space-y-2 text-sm">
            <span>Group name</span>
            <Input value={name} onChange={(event) => setNameDraft(event.target.value)} maxLength={100} required />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Photo URL</span>
            <Input type="url" value={photo} onChange={(event) => setPhotoDraft(event.target.value)} maxLength={2000}
              placeholder="https://example.com/group.jpg" />
          </label>
          <Button type="submit" size="sm" disabled={busy || !hasChanges || !name.trim()}>Save details</Button>
        </form>
      )}
      <section aria-label="Group members" className="mt-5 space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">Members ({room.participants.length})</h3>
        {rosterError && <p role="alert" className="text-sm text-destructive">{rosterError}</p>}
        <ul className="max-h-44 space-y-1 overflow-y-auto">
          {room.participants.map((id) => (
            <li key={id} className="flex min-h-9 items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm">{memberName(id)}</span>
                {room.admins.includes(id) && <span className="text-xs text-muted-foreground">Admin</span>}
              </span>
              {isAdmin && room.participants.length > 2 && id !== room.createdBy && id !== currentUserId && (
                <Button type="button" variant="ghost" size="sm" disabled={busy}
                  aria-label={`Remove ${memberName(id)}`} onClick={() => { setRemoving(id); setConfirmation(''); setError('') }}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        {showRemoval && (
          <form className="space-y-2 rounded-md border border-border p-3" onSubmit={(event) => {
            event.preventDefault()
            if (confirmation === 'remove') void change(() => removeGroupMember(room.roomId, removing), () => setRemoving(undefined), 'Member removed.')
          }}>
            <label className="block space-y-2 text-sm">
              <span>Remove {memberName(removing)} from this group? Type <strong>remove</strong> to confirm.</span>
              <Input aria-label="Type remove to confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving(undefined)}>Keep member</Button>
              <Button type="submit" size="sm" variant="outline" disabled={busy || confirmation !== 'remove'}>Remove member</Button>
            </div>
          </form>
        )}
      </section>
      {isAdmin && (
        <section aria-label="Add group members" className="mt-5 space-y-2 border-t border-border pt-4">
          <h3 className="font-semibold">Add a member</h3>
          <ContactPicker contacts={eligibleContacts} selected={canAdd ? [candidate] : []} disabled={busy}
            onPick={(id) => setCandidate((current) => current === id ? undefined : id)} />
          <Button type="button" size="sm" disabled={busy || !canAdd}
            onClick={() => candidate && void change(() => addGroupMember(room.roomId, candidate), () => setCandidate(undefined), 'Member added.')}>
            Add member
          </Button>
        </section>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {success && <p role="status" className="mt-4 text-sm text-muted-foreground">{success}</p>}
      <DialogActions><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Close</Button></DialogActions>
    </Dialog>
  )
}
