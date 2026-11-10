import { Link, useLocation, useNavigate } from 'react-router'

import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from '@/features/auth/login-form'
import { RegisterForm } from '@/features/auth/register-form'
import { VerifyOtpForm } from '@/features/auth/verify-otp-form'

export function LoginPage() {
  const navigate = useNavigate()
  return (
    <AuthShell title="Welcome back" description="Log in to continue your conversations." below={<><span>New here? </span><Link className="font-medium text-foreground underline-offset-4 hover:text-brand hover:underline" to="/register">Create an account</Link></>}>
      <LoginForm onSuccess={() => navigate('/chats', { replace: true })} />
    </AuthShell>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  return (
    <AuthShell title="Create your account" description="We will email you a verification code." below={<><span>Already have an account? </span><Link className="font-medium text-foreground underline-offset-4 hover:text-brand hover:underline" to="/login">Log in</Link></>}>
      <RegisterForm onRequested={(email) => navigate('/verify-otp', { state: { email } })} />
    </AuthShell>
  )
}

type VerifyLocationState = { email?: string }

export function VerifyOtpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = (location.state as VerifyLocationState | null)?.email

  if (!email) {
    return (
      <AuthShell title="Verify your email" description="Start registration first, then enter the verification code we send.">
        <Link className="font-medium text-foreground underline-offset-4 hover:text-brand hover:underline" to="/register">Go to registration</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Verify your email" description={`We sent a six-digit code to ${email}.`}>
      <VerifyOtpForm email={email} onSuccess={() => navigate('/chats', { replace: true })} />
    </AuthShell>
  )
}
