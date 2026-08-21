'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { AuthContext, type AuthContextValue, type AuthUser, type RestoreConflictInfo } from '@/lib/auth/auth-context'
import { runSessionSync } from '@/lib/migration/session-sync'
import { restoreLocalDataFromSnapshot } from '@/lib/migration/restore-local-snapshot'

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

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

/**
 * Real, server-backed auth via Supabase (see lib/auth/auth-provider.tsx,
 * the single swap point — currently active). No other file needs to change
 * since AuthForm/MyPageScreen/SaveScreen/game-flow.tsx only ever import
 * useAuth/AuthProvider from lib/auth/auth-provider.tsx.
 */
export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  /**
   * Phase 2C-2 — see auth-context.tsx's doc comment on AuthContextValue.
   * Starts `true` (no supabase client / not yet checked = nothing to wait
   * on) and only ever flips to `false` for the specific window where a real
   * session's restore-from-server check is actually in flight.
   */
  const [restoreReady, setRestoreReady] = useState(true)
  const [restoreConflict, setRestoreConflict] = useState<RestoreConflictInfo | null>(null)

  useEffect(() => {
    if (!supabase) return

    /**
     * The one place migration-vs-restore is decided for a real session (see
     * lib/migration/session-sync.ts's own doc comment for the full ordering
     * analysis). Called from both session-restore-on-reload and every
     * SIGNED_IN — covers every real login/signup path in the app
     * (LoginScreen/SaveScreen/My Page all share the same AuthForm ->
     * useAuth() -> this provider).
     */
    async function syncSession(client: SupabaseClient) {
      setRestoreConflict(null)
      setRestoreReady(false)
      try {
        const result = await runSessionSync(client)
        switch (result.status) {
          case 'not_authenticated':
          case 'migration_delegated':
          case 'in_sync':
            break
          case 'read_failed':
            // Failure policy: never clear the session, never touch
            // localStorage — just stop blocking so the app proceeds with
            // whatever local state already exists.
            devWarn('[session-sync] server read failed (proceeding with local state as-is):', result.failures)
            break
          case 'restored':
            if (!result.report.ok) {
              devWarn('[session-sync] restore failed/rolled back (local state preserved):', result.report.results)
            }
            break
          case 'conflict':
            setRestoreConflict({ snapshot: result.snapshot, localPet: result.localPet })
            break
        }
      } catch (err) {
        // Defensive only — runSessionSync's own internals already catch
        // everything they can; this just guarantees restoreReady is never
        // left stuck on an unexpected throw (see "무한 loading 금지").
        devWarn('[session-sync] runSessionSync threw unexpectedly (proceeding with local state as-is):', err)
      } finally {
        setRestoreReady(true)
      }
    }

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setUser(toAuthUser(data.session))
      setLoading(false)
      if (data.session?.user) {
        syncSession(supabase)
      } else {
        setRestoreReady(true) // no session — nothing to check, never adds latency for a guest
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      setUser(toAuthUser(session))
      // SIGNED_IN covers both a fresh signup (SaveScreen) and a real login
      // (LoginScreen/My Page) — Supabase fires the same event for either.
      // Deliberately NOT triggered on every event (TOKEN_REFRESHED etc. fire
      // periodically and would just be wasted reads).
      if (event === 'SIGNED_IN' && session?.user) syncSession(supabase)
    })

    return () => listener.subscription.unsubscribe()
  }, [supabase])

  const value: AuthContextValue = {
    user,
    loading,
    isConfigured: Boolean(supabase),
    restoreReady,
    restoreConflict,

    useServerStatling() {
      if (!restoreConflict) return
      const report = restoreLocalDataFromSnapshot(restoreConflict.snapshot)
      if (!report.ok) {
        devWarn('[session-sync] Case C "use server" restore failed/rolled back (local state preserved):', report.results)
      }
      setRestoreConflict(null)
    },

    keepLocalStatling() {
      // Local state is already untouched — this only dismisses the
      // conflict. The server keeps its own (still-conflicting) data; see
      // the Phase 2C-2 report for why re-uploading this device's choice
      // isn't done here.
      setRestoreConflict(null)
    },

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
