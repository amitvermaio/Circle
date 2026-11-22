import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'

import { ThemeProvider } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAuthCheck } from '@/lib/use-auth-check'

import { LoginPage, RegisterPage, VerifyOtpPage } from './auth-pages'
import { ChatsPage } from './chats-page'
import { HomePage } from './home-page'
import { ProfilePage } from './profile-page'

type RouteGuardProps = { authenticated: boolean; children: React.ReactNode }

function ProtectedRoute({ authenticated, children }: RouteGuardProps) {
  return authenticated ? children : <Navigate to="/login" replace />
}

function GuestRoute({ authenticated, children }: RouteGuardProps) {
  return authenticated ? <Navigate to="/chats" replace /> : children
}

export function AppRouter() {
  const { session, signIn, signOut, updateUser, retry } = useAuthCheck()

  if (session.status === 'checking') {
    return <main className="grid min-h-dvh place-items-center"><Spinner label="Checking your session" /></main>
  }

  if (session.status === 'unavailable') {
    return (
      <main className="grid min-h-dvh place-content-center justify-items-center gap-2 px-4 text-center">
        <p role="alert" className="text-sm text-muted-foreground">{session.message}</p>
        <Button type="button" variant="outline" onClick={retry}>Retry session check</Button>
      </main>
    )
  }

  const user = session.status === 'authenticated' ? session.user : undefined
  const authenticated = !!user

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={authenticated ? '/chats' : '/home'} replace />} />
        <Route path="/home" element={<GuestRoute authenticated={authenticated}><HomePage /></GuestRoute>} />
        <Route path="/login" element={<GuestRoute authenticated={authenticated}><LoginPage onSignIn={signIn} /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute authenticated={authenticated}><RegisterPage /></GuestRoute>} />
        <Route path="/verify-otp" element={<GuestRoute authenticated={authenticated}><VerifyOtpPage onSignIn={signIn} /></GuestRoute>} />
        <Route element={<ProtectedRoute authenticated={authenticated}><ThemeProvider><Outlet /></ThemeProvider></ProtectedRoute>}>
          <Route path="/chats/:roomId?" element={user && <ChatsPage user={user} onLogout={signOut} />} />
          <Route path="/profile" element={user && <ProfilePage user={user} onUserChange={updateUser} />} />
        </Route>
        <Route path="*" element={<Navigate to={authenticated ? '/chats' : '/home'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
