'use client'

import { EyeIcon, EyeSlashIcon, GithubLogoIcon, GoogleLogoIcon } from '@phosphor-icons/react'
import * as React from 'react'

import { cn } from '@/lib/utils'
import { Backdrop } from '@/components/backdrop'
import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/**
 * The pieces every auth page is made of. The page is quiet on purpose: the
 * background, the logo, one warm hairline card in the middle and nothing
 * else to look at. The submit button is the one solid button on the screen.
 *
 * Nothing here talks to a server. Each page takes an `onSubmit` that you
 * point at your auth provider; return a message to show it as an error.
 */
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
    <div className="flex min-h-dvh flex-col">
      <Backdrop />
      <header className="flex items-center justify-between px-6 py-5 sm:px-12">
        <a href={homeHref} aria-label="Circle home" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Logo />
        </a>
        <ThemeSwitcher />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pt-8 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 text-sm text-neutral-700 sm:text-base dark:text-neutral-400">{description}</p>}
          </div>
          <div className="card-chai p-6 sm:p-8">{children}</div>
          {below && <p className="mt-6 text-center text-sm text-muted-foreground">{below}</p>}
        </div>
      </main>

      <footer className="px-6 py-6 text-center font-montserrat text-[13px] text-gray-500">© {new Date().getFullYear()} Circle. All rights reserved.</footer>
    </div>
  )
}

/** A text link in auth copy: quiet until hovered, then the brand colour. */
export function AuthLink({ className, ...props }: React.ComponentProps<'a'>) {
  return (
    <a
      className={cn('font-medium text-foreground underline-offset-4 transition-colors duration-200 hover:text-brand hover:underline focus-visible:underline', className)}
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
    <Button type="submit" variant="solid" size="lg" iconRight={null} className="w-full" disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy ? busyLabel : children}
    </Button>
  )
}

/** The form-level error, announced when it appears. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
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
