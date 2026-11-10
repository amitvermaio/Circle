import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { getAuthToken } from '@/lib/api'

import { LoginPage, RegisterPage, VerifyOtpPage } from './auth-pages'
import { ChatsPage } from './chats-page'

type PlaceholderPageProps = {
  title: string
}

function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl items-center px-4 py-8 sm:px-6">
      <section className="w-full border border-border bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">This route is ready for its feature implementation.</p>
      </section>
    </main>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return getAuthToken() ? children : <Navigate to="/login" replace />
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/chats" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />
        <Route path="/chats/:roomId" element={<ProtectedRoute><PlaceholderPage title="Chat" /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
