import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { getAuthToken } from '@/lib/api'

import { LoginPage, RegisterPage, VerifyOtpPage } from './auth-pages'
import { ChatsPage } from './chats-page'
import { ProfilePage } from './profile-page'

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
        <Route path="/chats/:roomId?" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
