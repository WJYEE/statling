'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue, type AuthResult } from '@/lib/auth/auth-context'
import {
  clearSession,
  loadSession,
  registerUser,
  SESSION_STORAGE_KEY,
  verifyCredentials,
} from '@/lib/auth/local-auth-store'

const ERROR_MESSAGES = {
  duplicate: '이미 가입된 이메일이에요. 로그인해주세요.',
  'weak-password': '비밀번호는 6자 이상이어야 해요.',
  invalid: '이메일 또는 비밀번호가 올바르지 않아요.',
  google: 'Google 로그인은 아직 준비 중이에요. 이메일로 계속해주세요.',
} as const

/**
 * localStorage-backed auth — the current default (see lib/auth/auth-provider.tsx).
 * Every account, password hash, and session lives only in this browser's
 * localStorage; there is no server, so "로그인 상태 유지" means "this device
 * remembers you," not "any device with your credentials." Satisfies the
 * same AuthContextValue contract as lib/auth/supabase-auth-provider.tsx so
 * switching to real Supabase auth later is a one-line swap in
 * lib/auth/auth-provider.tsx.
 */
export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ReturnType<typeof loadSession>>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUser(loadSession())
    setLoading(false)

    // Keeps multiple tabs of the same browser in sync with sign-in/sign-out,
    // mirroring what Supabase's onAuthStateChange gives us for free.
    function handleStorage(event: StorageEvent) {
      if (event.key !== SESSION_STORAGE_KEY) return
      setUser(loadSession())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const value: AuthContextValue = {
    user,
    loading,
    isConfigured: true,
    // No Supabase, so nothing to restore/upload — always trivially "ready",
    // never a conflict. See auth-context.tsx's doc comments.
    restoreReady: true,
    restoreFailed: false,
    restoreConflict: null,
    useServerStatling() {},
    keepLocalStatling() {},

    async signInWithGoogle(): Promise<AuthResult> {
      return { error: ERROR_MESSAGES.google }
    },

    async signInWithPassword(email, password): Promise<AuthResult> {
      const result = await verifyCredentials(email, password)
      if ('error' in result) return { error: ERROR_MESSAGES[result.error] }
      setUser(result.user)
      return { error: null }
    },

    async signUpWithPassword(email, password): Promise<AuthResult> {
      const result = await registerUser(email, password)
      if ('error' in result) return { error: ERROR_MESSAGES[result.error] }
      setUser(result.user)
      return { error: null, needsEmailConfirmation: false }
    },

    async signOut(): Promise<void> {
      clearSession()
      setUser(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
