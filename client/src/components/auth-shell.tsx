'use client'

import { EyeIcon, EyeSlashIcon, GithubLogoIcon, GoogleLogoIcon } from '@phosphor-icons/react'
import * as React from 'react'

import { cn } from '@/lib/utils'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/** Shared presentation and form controls for the authentication flow. */
export type OAuthProvider = 'google' | 'github'

/** Returns nothing on success, or a message to show the person. */
export type SubmitResult = void | string | Promise<void | string>

export function AuthShell({
  title,
  description,
  children,
  below,
  homeHref = '/',
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  /** Under the card, e.g. "New here? Create an account". */
  below?: React.ReactNode
  homeHref?: string
}) {
  return (
    <div className="circle-auth grid min-h-dvh [--spacing:0.25rem] lg:grid-cols-[42%_minmax(0,1fr)]">
      <aside aria-label="Circle" className="circle-auth-brand relative isolate hidden min-h-dvh flex-col p-12 lg:flex">
        <a href={homeHref} aria-label="Circle home" className="w-fit rounded-md focus-visible:outline-ring">
          <Logo className="gap-2 [&>svg]:size-5" />
        </a>
        <div className="my-auto max-w-sm py-16">
          <p className="font-onest text-4xl leading-tight font-semibold tracking-tight">Your people.<br />A little closer.</p>
          <p className="mt-6 text-base leading-relaxed opacity-80">A place for the conversations and small moments you share.</p>
        </div>
        <p className="text-xs opacity-70">Circle · Made for staying close.</p>
      </aside>
      <main className="flex min-w-0 flex-col px-6 py-8 sm:px-12">
        <a href={homeHref} aria-label="Circle home" className="mb-10 w-fit rounded-md focus-visible:outline-ring lg:hidden">
          <Logo className="gap-2 [&>svg]:size-5" />
        </a>
        <div className="mx-auto my-auto w-full max-w-[440px] py-8">
          <header className="mb-8">
            <h1 className="font-onest text-3xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-4 break-words text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </header>
          {children}
          {below && <p className="mt-8 text-center text-sm text-muted-foreground">{below}</p>}
        </div>
        <footer className="pt-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Circle</footer>
      </main>
    </div>
  )
}

/** A text link in auth copy: quiet until hovered, then the brand colour. */
export function AuthLink({ className, ...props }: React.ComponentProps<'a'>) {
  return (
    <a
      className={cn('font-medium text-brand underline-offset-4 transition-colors duration-200 hover:underline focus-visible:underline', className)}
      {...props}
    />
  )
}

/** The shared Field, re-exported so the auth pages import from one place. */
export { Field }

export function TextInput(props: React.ComponentProps<'input'>) {
  return <Input {...props} className={cn('h-10', props.className)} />
}

/** A password box with a show and hide toggle. */
export function PasswordInput(props: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = React.useState(false)
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={cn('h-10 pr-10', props.className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute top-1/2 right-1.5 size-7 -translate-y-1/2 text-muted-foreground"
      >
        {shown ? <EyeSlashIcon aria-hidden /> : <EyeIcon aria-hidden />}
      </Button>
    </div>
  )
}

/** The one solid button on the page. Shows `busyLabel` while the request runs. */
export function SubmitButton({ busy, busyLabel, children, disabled }: {
  busy: boolean; busyLabel: string; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <Button type="submit" variant="solid" size="lg" iconRight={null} className="h-12 w-full rounded-full" disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy ? busyLabel : children}
    </Button>
  )
}

/** The form-level error, announced when it appears. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  )
}

const providerMeta: Record<OAuthProvider, { label: string; icon: React.ReactNode }> = {
  google: { label: 'Google', icon: <GoogleLogoIcon aria-hidden /> },
  github: { label: 'GitHub', icon: <GithubLogoIcon aria-hidden /> },
}

/**
 * Sign in with Google or GitHub, in the toolbar field's boxed style so they
 * stay quieter than the solid submit button.
 */
export function OAuthButtons({ providers, onSelect, verb = 'Continue' }: { providers: OAuthProvider[]; onSelect: (p: OAuthProvider) => void; verb?: string }) {
  if (!providers.length) return null
  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {providers.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            onClick={() => onSelect(p)}
            className="w-full"
          >
            {providerMeta[p].icon}
            {verb} with {providerMeta[p].label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}

/** Hands a provider to `onOAuth`, or explains that it is not wired yet. */
export function oauthHandler(onOAuth: ((p: OAuthProvider) => void) | undefined, fail: (m: string) => void) {
  return (p: OAuthProvider) =>
    onOAuth ? onOAuth(p) : fail(`Signing in with ${providerMeta[p].label} is not connected yet. Pass onOAuth to wire it.`)
}

/**
 * Runs a submit handler with a busy flag and a form-level error. Without a
 * handler it says so, rather than pretending to sign anyone in.
 */
export function useAuthSubmit(handler?: () => SubmitResult) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const run = async () => {
    setError(null)
    if (!handler) {
      setError('This form is not connected yet. Pass onSubmit to wire it to your auth provider.')
      return false
    }
    setBusy(true)
    try {
      const message = await handler()
      if (message) {
        setError(message)
        return false
      }
      return true
    } catch {
      setError('Something went wrong. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, fail: setError }
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
