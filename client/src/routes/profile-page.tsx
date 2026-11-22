import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { Backdrop } from '@/components/backdrop'
import { PasswordInput, TextInput } from '@/components/auth-shell'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { changePassword, getCurrentUser, type AuthenticatedUser, updateProfile } from '@/features/auth/auth.api'
import { getErrorMessage, getFieldErrors } from '@/features/auth/validation'
import { BlockedUsersPanel } from '@/features/blocking/blocked-users-panel'
import { ApiError, setAuthToken } from '@/lib/api'
import { connectSocket } from '@/lib/socket'

type FieldErrors = Record<string, string[] | undefined>

function FormMessage({ message, tone = 'error' }: { message: string | null; tone?: 'error' | 'success' }) {
  if (!message) return null
  return <p role={tone === 'error' ? 'alert' : 'status'} className={tone === 'error' ? 'text-sm text-red-700 dark:text-red-400' : 'text-sm text-green-700 dark:text-green-400'}>{message}</p>
}

export function ProfilePage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({})
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)

  useEffect(() => {
    let active = true
    void getCurrentUser()
      .then(({ user: currentUser }) => {
        if (!active) return
        setUser(currentUser)
        setName(currentUser.name)
        setUsername(currentUser.username)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [])

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileBusy(true)
    setProfileErrors({})
    setProfileMessage(null)
    try {
      const result = await updateProfile({ name, username })
      setUser(result.user)
      setName(result.user.name)
      setUsername(result.user.username)
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
    try {
      const result = await changePassword({ currentPassword, newPassword })
      setAuthToken(result.token)
      connectSocket(result.token)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordMessage('Password changed. Your session is updated.')
    } catch (error) {
      setPasswordMessage(getErrorMessage(error))
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <div className="min-h-dvh">
      <Backdrop />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between p-4 sm:p-6">
        <Button asChild type="button" variant="ghost"><Link to="/chats">Chats</Link></Button>
        <ThemeSwitcher />
      </header>
      <main className="mx-auto w-full max-w-6xl p-4 pb-12 sm:p-6 sm:pb-12">
        <div className="mb-8">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Profile and security</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your account details and password.</p>
        </div>

        {loadError ? <FormMessage message={loadError} /> : null}
        {!user && !loadError ? <p className="text-sm text-muted-foreground">Loading your profile.</p> : null}
        {user ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card-chai p-6 sm:p-8">
              <h2 className="font-montserrat text-lg font-semibold">Profile</h2>
              <p className="mt-2 text-sm text-muted-foreground">Signed in as {user.email}</p>
              <form className="mt-6 space-y-4" onSubmit={submitProfile} noValidate>
                <Field label="Name" error={profileErrors.name?.[0]}>
                  <TextInput name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
                </Field>
                <Field label="Username" error={profileErrors.username?.[0]}>
                  <TextInput name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} required />
                </Field>
                <FormMessage message={profileMessage} tone={profileMessage === 'Profile saved.' ? 'success' : 'error'} />
                <Button type="submit" variant="solid" disabled={profileBusy} aria-busy={profileBusy || undefined}>Save profile</Button>
              </form>
            </section>

            <section className="card-chai p-6 sm:p-8">
              <h2 className="font-montserrat text-lg font-semibold">Change password</h2>
              <p className="mt-2 text-sm text-muted-foreground">Use a new password with at least eight characters.</p>
              <form className="mt-6 space-y-4" onSubmit={submitPassword} noValidate>
                <Field label="Current password">
                  <PasswordInput name="currentPassword" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                </Field>
                <Field label="New password">
                  <PasswordInput name="newPassword" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                </Field>
                <FormMessage message={passwordMessage} tone={passwordMessage === 'Password changed. Your session is updated.' ? 'success' : 'error'} />
                <Button type="submit" variant="soft" disabled={passwordBusy} aria-busy={passwordBusy || undefined}>Change password</Button>
              </form>
            </section>
            <BlockedUsersPanel />
          </div>
        ) : null}
      </main>
    </div>
  )
}
