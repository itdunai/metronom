import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function RegisterPage() {
  const { signUp, session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    return <Navigate to="/app" replace />
  }

  const search = new URLSearchParams(location.search)
  const redirectPath = search.get('redirect') || '/app'

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setMessage(null)
    const result = await signUp(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage('Регистрация успешна.')
    navigate(redirectPath, { replace: true })
  }

  return (
    <main className="authPage">
      <form className="authCard" onSubmit={onSubmit}>
        <h1>Регистрация</h1>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} required />
        </label>
        {error && <p className="authError">{error}</p>}
        {message && <p className="authInfo">{message}</p>}
        <button className="authBtn primary" type="submit" disabled={submitting}>
          {submitting ? 'Создаем...' : 'Создать аккаунт'}
        </button>
        <p className="authHint">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      </form>
    </main>
  )
}
