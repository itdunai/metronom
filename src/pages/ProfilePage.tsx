import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { useAuth } from '../auth/AuthProvider'

type UserProfileRecord = {
  id: string
  email: string
  name?: string
  instrument?: string
  avatar?: string
}

export function ProfilePage() {
  const { userId, loading, session } = useAuth()
  const [name, setName] = useState('')
  const [instrument, setInstrument] = useState('')
  const [email, setEmail] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const loadProfile = async (): Promise<void> => {
      if (!userId) return
      try {
        const record = (await pb.collection('users').getOne(userId)) as unknown as UserProfileRecord
        setEmail(record.email ?? '')
        setName(record.name ?? '')
        setInstrument(record.instrument ?? '')
        if (record.avatar) {
          setAvatarUrl(pb.files.getURL(record as never, record.avatar))
        } else {
          setAvatarUrl('')
        }
      } catch {
        setError('Не удалось загрузить профиль')
      }
    }
    void loadProfile()
  }, [userId])

  if (!loading && !session) {
    return <Navigate to="/login" replace />
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!userId) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        instrument: instrument.trim(),
      }
      if (avatarFile) payload.avatar = avatarFile
      const updated = (await pb.collection('users').update(userId, payload)) as unknown as UserProfileRecord
      const memberships = await pb.collection('band_members').getFullList({
        filter: `user="${userId}"`,
      })
      await Promise.all(
        memberships.map((membership) =>
          pb.collection('band_members').update(membership.id, {
            memberName: (updated.name ?? '').trim(),
            memberEmail: updated.email ?? '',
            memberInstrument: (updated.instrument ?? '').trim(),
            memberAvatarUrl: updated.avatar ? pb.files.getURL(updated as never, updated.avatar) : '',
            ...(avatarFile ? { memberAvatar: avatarFile } : {}),
          }),
        ),
      )
      if (updated.avatar) {
        setAvatarUrl(pb.files.getURL(updated as never, updated.avatar))
      }
      setAvatarFile(null)
      setMessage('Профиль сохранен')
    } catch {
      setError('Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="authPage">
      <form className="authCard" onSubmit={(e) => void handleSubmit(e)}>
        <h1>Профиль</h1>
        <p>Заполните личные данные для корректного отображения в группах.</p>

        {avatarUrl && (
          <div className="profileAvatarWrap">
            <img src={avatarUrl} alt="Аватар профиля" className="profileAvatar" />
          </div>
        )}

        <label>
          Email
          <input value={email} disabled />
        </label>
        <label>
          ФИО
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Иван Иванов" />
        </label>
        <label>
          Инструмент
          <input
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            placeholder="Например: Барабаны"
          />
        </label>
        <label>
          Аватар
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {error && <div className="authError">{error}</div>}
        {message && <div className="authInfo">{message}</div>}

        <div className="authButtons">
          <Link to="/app" className="authBtn">Назад</Link>
          <button type="submit" className="authBtn primary" disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </main>
  )
}
