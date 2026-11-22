import { useRef, useState, type FormEvent } from 'react'

import { FormError, PasswordInput, SubmitButton, TextInput } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api'

import { checkEmailAvailability, checkUsernameAvailability, requestRegistrationOtp } from './auth.api'
import { useAvailability } from './use-availability'
import { getErrorMessage, getFieldErrors } from './validation'

type RegisterFormProps = { onRequested: (email: string) => void }
const usernamePattern = /^[a-z0-9_]{3,20}$/
const emailPattern = /^(?!\.)(?!.*\.\.)[a-z0-9_'+.\-]*[a-z0-9_+\-]@(?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/

function AvailabilityAside({ field, availability }: { field: string; availability: ReturnType<typeof useAvailability> }) {
  if (availability.status === 'checking') return <Spinner label={`Checking ${field} availability`} className="size-4" />
  if (availability.status === 'error') {
    return <Button type="button" variant="ghost" size="sm" aria-label={`Retry ${field} availability`} onClick={availability.retry}>Retry</Button>
  }
  return null
}

export function RegisterForm({ onRequested }: RegisterFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = name.trim()
  const emailValid = emailPattern.test(normalizedEmail)
  const usernameValid = usernamePattern.test(username)
  const emailAvailability = useAvailability(emailValid ? normalizedEmail : '', checkEmailAvailability)
  const usernameAvailability = useAvailability(usernameValid ? username : '', checkUsernameAvailability)
  const canSubmit = normalizedName.length > 0 && normalizedName.length <= 100 && password.length >= 8
    && emailAvailability.status === 'available' && usernameAvailability.status === 'available'

  function clearFieldError(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || submitting.current) return

    submitting.current = true
    setBusy(true)
    setFormError(null)
    setFieldErrors({})
    try {
      await requestRegistrationOtp({ name: normalizedName, email: normalizedEmail, password, username })
      onRequested(normalizedEmail)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'EMAIL_TAKEN') {
        emailAvailability.markTaken()
      } else if (caught instanceof ApiError && caught.code === 'USERNAME_TAKEN') {
        usernameAvailability.markTaken()
      } else {
        setFieldErrors(getFieldErrors(caught))
        setFormError(getErrorMessage(caught))
      }
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Field label="Name" error={fieldErrors.name?.[0]}>
        <TextInput name="name" autoComplete="name" value={name} maxLength={100} disabled={busy}
          onChange={(event) => { setName(event.target.value); clearFieldError('name') }} required />
      </Field>
      <Field label="Email" aside={<AvailabilityAside field="email" availability={emailAvailability} />}
        error={fieldErrors.email?.[0] ?? emailAvailability.error ?? (emailAvailability.status === 'taken'
          ? <span role="status">Email already registered</span>
          : email.trim() && !emailValid ? 'Enter a valid email address.' : undefined)}>
        <TextInput type="email" name="email" autoComplete="email" value={email} disabled={busy}
          aria-busy={emailAvailability.status === 'checking' || undefined}
          onChange={(event) => {
            const next = event.target.value
            if (next.trim().toLowerCase() !== normalizedEmail) emailAvailability.reset()
            setEmail(next)
            clearFieldError('email')
          }} required />
      </Field>
      <Field label="Username" aside={<AvailabilityAside field="username" availability={usernameAvailability} />}
        hint={usernameAvailability.status === 'available'
          ? <span role="status" className="text-green-700 dark:text-green-400">Username is available</span>
          : 'Use 3 to 20 lowercase letters, numbers, or underscores.'}
        error={fieldErrors.username?.[0] ?? usernameAvailability.error ?? (usernameAvailability.status === 'taken'
          ? <span role="status">Username already taken, choose another.</span> : undefined)}>
        <TextInput name="username" autoComplete="username" value={username} disabled={busy}
          aria-busy={usernameAvailability.status === 'checking' || undefined}
          onChange={(event) => {
            const next = event.target.value.toLowerCase()
            if (next !== username) usernameAvailability.reset()
            setUsername(next)
            clearFieldError('username')
          }} required />
      </Field>
      <Field label="Password" hint="At least 8 characters" error={fieldErrors.password?.[0]}>
        <PasswordInput name="password" autoComplete="new-password" value={password} minLength={8} disabled={busy}
          onChange={(event) => { setPassword(event.target.value); clearFieldError('password') }} required />
      </Field>
      <FormError message={formError} />
      <SubmitButton busy={busy} busyLabel="Sending code" disabled={!canSubmit}>Continue</SubmitButton>
    </form>
  )
}
