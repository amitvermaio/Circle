import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { PasswordInput, TextInput } from '@/components/auth-shell'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { changePassword, type AuthenticatedUser, updateProfile } from '@/features/auth/auth.api'
import { getErrorMessage, getFieldErrors } from '@/features/auth/validation'
import { BlockedUsersPanel } from '@/features/blocking/blocked-users-panel'
import { ApiError, setAuthToken } from '@/lib/api'
import { connectSocket } from '@/lib/socket'

type FieldErrors = Record<string, string[] | undefined>

function FormMessage({ message, tone = 'error' }: { message: string | null; tone?: 'error' | 'success' }) {
  if (!message) return null
  return <p role={tone === 'error' ? 'alert' : 'status'} className={tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>{message}</p>
}

export function ProfilePage({ user, onUserChange }: { user: AuthenticatedUser; onUserChange: (user: AuthenticatedUser) => void }) {
  const [name, setName] = useState(user.name)
  const [username, setUsername] = useState(user.username)
  const [photoUrl, setPhotoUrl] = useState(user.profilePhotoUrl ?? '')
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({})
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({})
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileBusy(true)
    setProfileErrors({})
    setProfileMessage(null)
    try {
      const trimmedPhotoUrl = photoUrl.trim()
      if (editingPhoto && !/^https?:\/\//i.test(trimmedPhotoUrl)) {
        setProfileErrors({ profilePhotoUrl: ['Enter an image URL starting with http:// or https://.'] })
        return
      }
      const result = await updateProfile({ name, username, profilePhotoUrl: editingPhoto ? trimmedPhotoUrl : undefined })
      onUserChange(result.user)
      setName(result.user.name)
      setUsername(result.user.username)
      setPhotoUrl(result.user.profilePhotoUrl ?? '')
      setEditingPhoto(false)
      setProfileMessage('Profile saved.')
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setProfileErrors({ username: [error.message] })
      } else {
        setProfileErrors(fieldErrors)
        setProfileMessage(getErrorMessage(error))
      }
    } finally {
      setProfileBusy(false)
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordBusy(true)
    setPasswordMessage(null)
    setPasswordErrors({})
    try {
      const result = await changePassword({ currentPassword, newPassword })
      setAuthToken(result.token)
      connectSocket(result.token)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordMessage('Password changed. Your session is updated.')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setPasswordErrors({ currentPassword: [error.message] })
      } else {
        const errors = getFieldErrors(error)
        setPasswordErrors(errors)
        if (!Object.keys(errors).length) setPasswordMessage(getErrorMessage(error))
      }
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <section aria-labelledby="profile-heading" className="flex min-h-0 min-w-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="icon" className="size-8 md:hidden">
          <Link to="/chats" aria-label="Back to chats"><ArrowLeftIcon aria-hidden /></Link>
        </Button>
        <h2 id="profile-heading" className="flex-1 text-sm font-semibold">Profile and security</h2>
        <ThemeSwitcher className="size-8 md:hidden [&_svg]:size-4" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:thin]">
        <div className="mx-auto w-full max-w-[544px] space-y-8 px-4 py-6 sm:px-6 sm:py-8">
          <section aria-labelledby="profile-details-heading">
            <h3 id="profile-details-heading" className="text-base font-semibold">Account details</h3>
            <form className="mt-4 space-y-4" onSubmit={submitProfile} noValidate>
              <div className="flex items-center gap-4">
                {user.profilePhotoUrl ? (
                  <img src={user.profilePhotoUrl} alt="" className="size-20 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="grid size-20 shrink-0 place-items-center rounded-full bg-accent text-2xl font-semibold text-brand">
                    {Array.from(user.name.trim() || user.username)[0]?.toLocaleUpperCase()}
                  </span>
                )}
                <div className="min-w-0 space-y-2">
                  <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                  <Button type="button" variant="outline" size="sm" className="rounded-md" aria-expanded={editingPhoto}
                    onClick={() => { setPhotoUrl(user.profilePhotoUrl ?? ''); setEditingPhoto(!editingPhoto) }}>
                    {editingPhoto ? 'Cancel photo change' : 'Change photo'}
                  </Button>
                </div>
              </div>
              {editingPhoto && (
                <Field label="Photo URL" hint="Enter a direct link to an image." error={profileErrors.profilePhotoUrl?.[0]}>
                  <TextInput type="url" value={photoUrl} maxLength={2000} onChange={(event) => setPhotoUrl(event.target.value)} />
                </Field>
              )}
              <Field label="Name" error={profileErrors.name?.[0]}>
                <TextInput name="name" autoComplete="name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required />
              </Field>
              <Field label="Username" error={profileErrors.username?.[0]}>
                <TextInput name="username" autoComplete="username" value={username} maxLength={20} onChange={(event) => setUsername(event.target.value.toLowerCase())} required />
              </Field>
              <FormMessage message={profileMessage} tone={profileMessage === 'Profile saved.' ? 'success' : 'error'} />
              <Button type="submit" variant="soft" disabled={profileBusy} aria-busy={profileBusy || undefined}>Save profile</Button>
            </form>
          </section>

          <section className="border-t border-border pt-8" aria-labelledby="profile-password-heading">
            <h3 id="profile-password-heading" className="text-base font-semibold">Change password</h3>
            <form className="mt-4 space-y-4" onSubmit={submitPassword} noValidate>
              <Field label="Current password" error={passwordErrors.currentPassword?.[0]}>
                <PasswordInput name="currentPassword" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              </Field>
              <Field label="New password" hint="Use at least eight characters." error={passwordErrors.newPassword?.[0]}>
                <PasswordInput name="newPassword" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
              </Field>
              <FormMessage message={passwordMessage} tone={passwordMessage === 'Password changed. Your session is updated.' ? 'success' : 'error'} />
              <Button type="submit" variant="soft" disabled={passwordBusy} aria-busy={passwordBusy || undefined}>Change password</Button>
            </form>
          </section>
          <BlockedUsersPanel />
        </div>
      </div>
    </section>
  )
}
