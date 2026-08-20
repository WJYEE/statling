'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { AuthContext, type AuthContextValue, type AuthUser } from '@/lib/auth/auth-context'
import { triggerBackgroundMigration } from '@/lib/migration/trigger-background-migration'

const NOT_CONFIGURED_ERROR = '로그인 기능이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.'

/** Supabase's raw error messages translated to the copy used elsewhere in the app. */
function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않아요.',
    'User already registered': '이미 가입된 이메일이에요. 로그인해주세요.',
    'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 해요.',
    'Email not confirmed': '이메일 인증을 먼저 완료해주세요.',
    'Unable to validate email address: invalid format': '이메일 형식이 올바르지 않아요.',
  }
  // Anything unmapped is a network/config-level failure (e.g. "Failed to
  // fetch" when the Supabase project is unreachable) — never surface raw
  // English error text to the user.
  return map[message] ?? '로그인에 실패했어요. 잠시 후 다시 시도해주세요.'
}

/** Narrows Supabase's full `User` down to the AuthUser shape every provider shares — see lib/auth/auth-context.ts. */
function toAuthUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null
  return { id: session.user.id, email: session.user.email ?? '' }
}

/**
 * Real, server-backed auth via Supabase — not currently mounted (see
 * lib/auth/auth-provider.tsx, which wires up LocalAuthProvider instead).
 * Swap it back in there once a Supabase project is configured
 * (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY — see .env.local.example); no other
 * file needs to change since AuthForm/MyPageScreen/SaveScreen only ever
 * import useAuth/AuthProvider from lib/auth/auth-provider.tsx.
 */
export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setUser(toAuthUser(data.session))
      setLoading(false)
      // Covers session-restore-on-reload (Case C) — retries a previously
      // incomplete/deferred migration too, since anything short of a full
      // success ('failed' or 'not_ready') leaves migrated_at untouched.
      if (data.session?.user) triggerBackgroundMigration(supabase)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      setUser(toAuthUser(session))
      // SIGNED_IN covers both a fresh signup (SaveScreen) and a real login
      // (LoginScreen/My Page) — Supabase fires the same event for either.
      // Deliberately NOT triggered on every event (TOKEN_REFRESHED etc. fire
      // periodically while already migrated_at and would just be wasted
      // reads).
      if (event === 'SIGNED_IN' && session?.user) triggerBackgroundMigration(supabase)
    })

    return () => listener.subscription.unsubscribe()
  }, [supabase])

  const value: AuthContextValue = {
    user,
    loading,
    isConfigured: Boolean(supabase),

    async signInWithGoogle() {
      if (!supabase) return { error: NOT_CONFIGURED_ERROR }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      return { error: error ? translateAuthError(error.message) : null }
    },

    async signInWithPassword(email, password) {
      if (!supabase) return { error: NOT_CONFIGURED_ERROR }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ? translateAuthError(error.message) : null }
    },

    async signUpWithPassword(email, password) {
      if (!supabase) return { error: NOT_CONFIGURED_ERROR }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) return { error: translateAuthError(error.message) }
      return { error: null, needsEmailConfirmation: !data.session }
    },

    async signOut() {
      if (!supabase) return
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
