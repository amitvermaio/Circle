import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { logout } from '@/features/auth/auth.api'
import { clearAuthToken } from '@/lib/api'
import { disconnectSocket } from '@/lib/socket'

export function ChatsPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    setBusy(true)
    try {
      await logout()
    } catch {
      // The local session still needs to end if the server token has expired.
    } finally {
      disconnectSocket()
      clearAuthToken()
      navigate('/login', { replace: true })
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl items-center p-4 sm:p-6">
      <section className="w-full border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Chats</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your chat workspace is ready for its next feature.</p>
          </div>
          <Button type="button" variant="outline" onClick={handleLogout} disabled={busy}>Log out</Button>
        </div>
      </section>
    </main>
  )
}
