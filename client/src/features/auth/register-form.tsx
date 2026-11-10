import { useState, type FormEvent } from 'react'

import { FormError, PasswordInput, SubmitButton, TextInput } from '@/components/auth-shell'
import { Field } from '@/components/ui/field'

import { requestRegistrationOtp } from './auth.api'
import { getErrorMessage, getFieldErrors } from './validation'
import { useUsernameAvailability } from './use-username-availability'

type RegisterFormProps = { onRequested: (email: string) => void }

export function RegisterForm({ onRequested }: RegisterFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usernameStatus = useUsernameAvailability(username)

  const usernameHint =
    usernameStatus === 'checking'
      ? 'Checking availability'
      : usernameStatus === 'available'
        ? 'Username is available'
        : usernameStatus === 'taken'
          ? 'Username is already taken'
          : 'Use 3 to 20 lowercase letters, numbers, or underscores.'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return

    setBusy(true)
    setFormError(null)
    setFieldErrors({})
    try {
      await requestRegistrationOtp({ name, email, password, username })
      onRequested(email.trim().toLowerCase())
    } catch (caught) {
      setFieldErrors(getFieldErrors(caught))
      setFormError(getErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Field label="Name" error={fieldErrors.name?.[0]}>
        <TextInput name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label="Email" error={fieldErrors.email?.[0]}>
        <TextInput type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </Field>
      <Field label="Username" hint={usernameHint} error={fieldErrors.username?.[0] ?? (usernameStatus === 'taken' ? 'Username is already taken' : undefined)}>
        <TextInput name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} required />
      </Field>
      <Field label="Password" hint="At least 8 characters" error={fieldErrors.password?.[0]}>
        <PasswordInput name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </Field>
      <FormError message={formError} />
      <SubmitButton busy={busy} busyLabel="Sending code">Continue</SubmitButton>
    </form>
  )
}
