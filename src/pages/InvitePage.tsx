import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { pb } from '../lib/pocketbase'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const { session, userId, userEmail, loading } = useAuth()
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string>('Проверяем приглашение...')

  useEffect(() => {
    const acceptInvite = async (): Promise<void> => {
      if (!token || !userId) return
      setStatus('processing')
      setMessage('Подключаем вас к группе...')
      try {
        const invites = await pb.collection('band_invites').getFullList()
        const invite = invites.find((item) => {
          const itemToken = (item.token as string) ?? ''
          const active = Boolean(item.isActive)
          return itemToken === token && active
        })
        if (!invite) {
          setStatus('error')
          setMessage('Приглашение недействительно или уже отключено.')
          return
        }
        const expiresAt = invite.expiresAt as string | undefined
        if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
          setStatus('error')
          setMessage('Срок действия приглашения истек.')
          try {
            await pb.collection('band_invites').update(invite.id, { isActive: false })
          } catch {
            // ignore status sync errors
          }
          return
        }
        const bandId = invite.band as string

        const memberships = await pb.collection('band_members').getFullList({
          filter: `user="${userId}"`,
        })
        const hasMembership = memberships.some((item) => {
          const membershipBand = item.band as string | string[] | undefined
          if (Array.isArray(membershipBand)) return membershipBand.includes(bandId)
          return membershipBand === bandId
        })
        if (!hasMembership) {
          const authRecord = pb.authStore.record as {
            id?: string
            collectionId?: string
            name?: string
            email?: string
            instrument?: string
            avatar?: string
          } | null
          const memberAvatarUrl =
            authRecord?.avatar && authRecord?.id && authRecord?.collectionId
              ? pb.files.getURL(authRecord as never, authRecord.avatar)
              : ''
          await pb.collection('band_members').create({
            band: bandId,
            user: userId,
            role: 'member',
            memberName: (authRecord?.name ?? '').trim(),
            memberEmail: (authRecord?.email ?? userEmail ?? '').trim(),
            memberInstrument: (authRecord?.instrument ?? '').trim(),
            memberAvatarUrl,
          })
        }

        localStorage.setItem('clicktrack-active-band', bandId)
        setStatus('done')
        setMessage('Готово! Вы подключены к группе.')
      } catch (error) {
        const details = error instanceof Error ? error.message : 'неизвестная ошибка'
        setStatus('error')
        setMessage(`Не удалось принять приглашение: ${details}`)
      }
    }

    void acceptInvite()
  }, [token, userId])

  if (loading) {
    return (
      <main className="authPage">
        <section className="authCard">
          <h1>Приглашение</h1>
          <p>Проверяем сессию...</p>
        </section>
      </main>
    )
  }

  if (!session) {
    const redirect = `/invite/${token ?? ''}`
    return (
      <main className="authPage">
        <section className="authCard">
          <h1>Приглашение в группу</h1>
          <p>Нужно войти или зарегистрироваться, чтобы присоединиться к группе.</p>
          <div className="authButtons">
            <Link to={`/login?redirect=${encodeURIComponent(redirect)}`} className="authBtn primary">Вход</Link>
            <Link to={`/register?redirect=${encodeURIComponent(redirect)}`} className="authBtn">Регистрация</Link>
          </div>
        </section>
      </main>
    )
  }

  if (status === 'done') {
    return <Navigate to="/app" replace />
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <h1>Приглашение</h1>
        <p>{message}</p>
        {status === 'error' && (
          <div className="authButtons">
            <Link to="/app" className="authBtn">Вернуться в приложение</Link>
          </div>
        )}
      </section>
    </main>
  )
}
