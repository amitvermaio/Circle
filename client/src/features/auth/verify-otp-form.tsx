import { useState, type FormEvent } from 'react'

import { FormError, SubmitButton, TextInput } from '@/components/auth-shell'
import { Field } from '@/components/ui/field'
import { setAuthToken } from '@/lib/api'
import { connectSocket } from '@/lib/socket'

import { verifyRegistrationOtp } from './auth.api'
import { getErrorMessage } from './validation'

type VerifyOtpFormProps = {
  email: string
  onSuccess: () => void
}

export function VerifyOtpForm({ email, onSuccess }: VerifyOtpFormProps) {
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await verifyRegistrationOtp(email, otp)
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
      <Field label="Verification code" hint="Enter the six-digit code. You have up to five attempts before requesting a new code.">
        <TextInput
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
          required
        />
      </Field>
      <FormError message={error} />
      <SubmitButton busy={busy} busyLabel="Verifying">Verify email</SubmitButton>
    </form>
  )
}
