import { Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { InvitePage } from './pages/InvitePage'
import { GroupRoutePage } from './pages/GroupRoutePage'
import { ProfilePage } from './pages/ProfilePage'
import './auth.css'

export function RootApp() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/group/:bandId"
        element={
          <ProtectedRoute>
            <GroupRoutePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/tracks/:trackId"
        element={
          <ProtectedRoute>
            <GroupRoutePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
