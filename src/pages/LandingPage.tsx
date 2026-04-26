import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function LandingPage() {
  const { session, loading } = useAuth()

  if (!loading && session) {
    return <Navigate to="/app" replace />
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <h1>ClickTrack</h1>
        <p>Метроном для барабанщика с треками и сет-листами.</p>
        <div className="authButtons">
          <Link to="/login" className="authBtn primary">Вход</Link>
          <Link to="/register" className="authBtn">Регистрация</Link>
        </div>
      </section>
    </main>
  )
}
