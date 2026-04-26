import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { ClientResponseError } from 'pocketbase'
import { pb } from '../lib/pocketbase'

type AuthContextValue = {
  session: unknown | null
  userId: string | null
  userEmail: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function formatPocketBaseError(error: unknown, fallback: string): string {
  if (error instanceof ClientResponseError) {
    const mainMessage = error.response?.message || error.message || fallback
    const data = error.response?.data
    if (!data || typeof data !== 'object') return mainMessage

    const fieldMessages = Object.entries(data)
      .map(([field, details]) => {
        if (!details || typeof details !== 'object') return null
        const message = (details as { message?: string }).message
        return message ? `${field}: ${message}` : null
      })
      .filter((item): item is string => Boolean(item))

    if (fieldMessages.length === 0) return mainMessage
    return `${mainMessage} (${fieldMessages.join('; ')})`
  }

  if (error instanceof Error) return error.message
  return fallback
}

function buildUsernameFromEmail(email: string): string {
  const [localPart] = email.split('@')
  const normalized = (localPart || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
  const base = normalized || 'user'
  return `${base}_${Date.now().toString(36)}`
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<unknown | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const record = pb.authStore.isValid ? pb.authStore.record : null
    setSession(record)
    setUserId(record?.id ?? null)
    setUserEmail(record?.email ?? null)
    setLoading(false)

    pb.authStore.onChange(() => {
      const nextRecord = pb.authStore.isValid ? pb.authStore.record : null
      setSession(nextRecord)
      setUserId(nextRecord?.id ?? null)
      setUserEmail(nextRecord?.email ?? null)
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId,
      userEmail,
      loading,
      signIn: async (email, password) => {
        try {
          await pb.collection('users').authWithPassword(email, password)
          return { error: null }
        } catch (error) {
          return { error: formatPocketBaseError(error, 'Ошибка входа') }
        }
      },
      signUp: async (email, password) => {
        const username = buildUsernameFromEmail(email)
        try {
          await pb.collection('users').create({
            email,
            username,
            password,
            passwordConfirm: password,
          })
          await pb.collection('users').authWithPassword(email, password)
          return { error: null }
        } catch (error) {
          return { error: formatPocketBaseError(error, 'Ошибка регистрации') }
        }
      },
      signOut: async () => {
        pb.authStore.clear()
      },
    }),
    [session, userId, userEmail, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
