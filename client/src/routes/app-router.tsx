import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

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

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PlaceholderPage title="Log in" />} />
        <Route path="/register" element={<PlaceholderPage title="Register" />} />
        <Route path="/verify-otp" element={<PlaceholderPage title="Verify email" />} />
        <Route path="/chats" element={<PlaceholderPage title="Chats" />} />
        <Route path="/chats/:roomId" element={<PlaceholderPage title="Chat" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
