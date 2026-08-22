'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { AuthContext, type AuthContextValue, type AuthUser, type RestoreConflictInfo } from '@/lib/auth/auth-context'
import { runSessionSync } from '@/lib/migration/session-sync'
import { restoreLocalDataFromSnapshot } from '@/lib/migration/restore-local-snapshot'
import { registerSyncSession, markSyncReady, clearSyncSession } from '@/lib/sync/session-registry'
import { loadLocalSyncUpdatedAt } from '@/lib/sync/sync-freshness'

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

    // Phase 2D-6 Follow-up Safety Fix — captured HERE, synchronously, as the
    // very first thing this effect does, before getSession() below has even
    // started. `loading` is still true at this exact point, which is what
    // keeps the whole game UI (and therefore use-pet-care.ts's own mount
    // effect, which touches this SAME marker unconditionally on every
    // mount) from rendering at all yet — so this read is guaranteed to
    // reflect the marker exactly as the LAST session left it, immune to a
    // race against that mount effect. A live read taken later (inside
    // session-sync's own async chain, after a real network round-trip) can
    // lose that race: a live QA run during this Follow-up's real rollout
    // caught it happening — the mount effect touched the marker to "now"
    // before session-sync's Case B comparison ran, making genuinely STALE
    // local data look artificially freshest and triggering a wrong
    // "local is newer" catch-up that silently regressed a server value a
    // second device had already pushed (see the Follow-up report for the
    // full trace). Passed through to syncSession only for the reload path
    // below — the SIGNED_IN path intentionally omits it (see that call
    // site's own comment for why a live read is correct there instead).
    const localMarkerAtReload = loadLocalSyncUpdatedAt()

    /**
     * The one place migration-vs-restore is decided for a real session (see
     * lib/migration/session-sync.ts's own doc comment for the full ordering
     * analysis). Called from both session-restore-on-reload and every
     * SIGNED_IN — covers every real login/signup path in the app
     * (LoginScreen/SaveScreen/My Page all share the same AuthForm ->
     * useAuth() -> this provider).
     */
    /**
     * Phase 2D-2 — also the one place lib/sync/session-registry.ts's state
     * transitions: registered (known but not ready) the instant a session is
     * confirmed, marked ready only once THIS call's session-sync work has
     * fully settled — with one exception (Case C conflict): registerSyncSession
     * runs at the top, but markSyncReady is deliberately withheld here and
     * fires later from useServerStatling()/keepLocalStatling() instead, so
     * continuous sync never starts while a Statling identity conflict is
     * still unresolved (same "don't touch state before the user chooses"
     * rule Phase 2C-2 already applies to the conflict itself).
     */
    async function syncSession(client: SupabaseClient, userId: string, localMarkerOverride?: string | null) {
      setRestoreConflict(null)
      setRestoreReady(false)
      registerSyncSession(userId)
      let awaitingConflictResolution = false
      try {
        const result = await runSessionSync(client, localMarkerOverride)
        switch (result.status) {
          case 'not_authenticated':
            clearSyncSession()
            break
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
            awaitingConflictResolution = true
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
        if (!awaitingConflictResolution) markSyncReady(userId)
      }
    }

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setUser(toAuthUser(data.session))
      setLoading(false)
      if (data.session?.user) {
        // Reload path — pass the pre-captured marker (see localMarkerAtReload's own comment above).
        syncSession(supabase, data.session.user.id, localMarkerAtReload)
      } else {
        setRestoreReady(true) // no session — nothing to check, never adds latency for a guest
        clearSyncSession()
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      setUser(toAuthUser(session))
      // SIGNED_IN covers both a fresh signup (SaveScreen) and a real login
      // (LoginScreen/My Page) — Supabase fires the same event for either.
      // Deliberately NOT triggered on every event (TOKEN_REFRESHED etc. fire
      // periodically and would just be wasted reads). Deliberately does NOT
      // pass a captured marker override here (unlike the reload path above)
      // — by the time SIGNED_IN fires, the app has already been mounted and
      // interactive for a while (this is a user clicking "로그인"/"가입하기"
      // mid-session, e.g. a guest attaching an account), so any mount-effect
      // race is long over and a genuinely later local change (real guest
      // play since page load) should count — a live read inside
      // session-sync is correct here, not stale.
      if (event === 'SIGNED_IN' && session?.user) syncSession(supabase, session.user.id)
      // Covers SIGNED_OUT and any other transition to no-session — belt and
      // braces alongside signOut()'s own immediate clearSyncSession() call
      // below (this event fires asynchronously, so signOut() clearing first
      // is what actually guarantees "즉시 clear").
      if (!session) clearSyncSession()
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
      // Phase 2D-2 — the conflict is now resolved one way or another, so
      // continuous sync may safely start (see syncSession's doc comment for
      // why it was withheld while a conflict was pending).
      if (user) markSyncReady(user.id)
    },

    keepLocalStatling() {
      // Local state is already untouched — this only dismisses the
      // conflict. The server keeps its own (still-conflicting) data; see
      // the Phase 2C-2 report for why re-uploading this device's choice
      // isn't done here.
      setRestoreConflict(null)
      if (user) markSyncReady(user.id)
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
      // Cleared synchronously here (not just via the onAuthStateChange
      // SIGNED_OUT listener above, which fires asynchronously) so continuous
      // sync stops immediately — see the Phase 2D-2 task's "logout 시 즉시
      // clear" requirement.
      clearSyncSession()
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
