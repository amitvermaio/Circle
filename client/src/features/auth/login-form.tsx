import { useState, type FormEvent } from 'react'

import { FormError, PasswordInput, SubmitButton, TextInput } from '@/components/auth-shell'
import { Field } from '@/components/ui/field'
import { connectSocket } from '@/lib/socket'
import { setAuthToken } from '@/lib/api'

import { login } from './auth.api'
import { getErrorMessage } from './validation'

type LoginFormProps = { onSuccess: () => void }

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await login({ email, password })
      setAuthToken(result.token)
      connectSocket(result.token)
      onSuccess()
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Field label="Email">
        <TextInput type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </Field>
      <FormError message={error} />
      <SubmitButton busy={busy} busyLabel="Logging in">Log in</SubmitButton>
    </form>
  )
}
