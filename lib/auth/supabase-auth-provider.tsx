'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { AuthContext, type AuthContextValue, type AuthUser, type RestoreConflictInfo } from '@/lib/auth/auth-context'
import { runSessionSync } from '@/lib/migration/session-sync'
import { restoreLocalDataFromSnapshot } from '@/lib/migration/restore-local-snapshot'
import { setLocalDataOwner } from '@/lib/pets/local-data-owner'
import { registerSyncSession, markSyncReady, clearSyncSession } from '@/lib/sync/session-registry'
import { loadLocalSyncUpdatedAt } from '@/lib/sync/sync-freshness'
import { trackEvent } from '@/lib/analytics/ga'
import { trackProductEvent } from '@/lib/analytics/analytics'

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
 * Phase 3J-3 — a brand-new account's very first session has `created_at`
 * and `last_sign_in_at` set to (essentially) the same instant by GoTrue;
 * every later sign-in only advances `last_sign_in_at`, so the two values
 * diverge from the 2nd sign-in onward. This is the standard way to tell a
 * fresh signup from a returning login purely from the client-visible
 * session — no extra Supabase query, no admin API, no guessing. A 10s
 * tolerance absorbs normal request/redirect latency without ever risking
 * misclassifying a real returning user as new (that gap only shrinks this
 * small for an account created moments ago).
 */
function isFirstEverSession(user: User): boolean {
  if (!user.last_sign_in_at) return true
  const created = new Date(user.created_at).getTime()
  const lastSignIn = new Date(user.last_sign_in_at).getTime()
  return Math.abs(lastSignIn - created) < 10_000
}

/**
 * Phase 3J-3 — closes the Google OAuth gap ANALYTICS_GAP_AUDIT.md flagged as
 * P0: `sign_up`/`login` previously fired only from the email/password path
 * (auth-form.tsx's handlePasswordSubmit), never for Google. Payload is
 * method only — never email/name/provider user id/tokens (see this file's
 * own privacy conventions, matching every other auth event in this app).
 *
 * Deliberately NOT gated on the `onAuthStateChange` SIGNED_IN event — verified
 * empirically (temporary console instrumentation against this exact
 * supabase-js version, both an in-page email/password signup and a reload
 * of an already-authenticated session) that `SIGNED_IN` fires only for a
 * same-page auth action; a fresh page load that already has a valid session
 * (which is exactly what this app's Google flow produces: signInWithOAuth's
 * hard redirect -> app/auth/callback/route.ts exchanges the code
 * SERVER-SIDE -> NextResponse.redirect(origin), a full navigation back to a
 * bare URL) instead emits `INITIAL_SESSION`. Gating this on SIGNED_IN would
 * have been dead code — this always fires from the getSession() reload path
 * below instead, which is what actually runs on that landing page load.
 */
function trackGoogleAuthIfApplicable(user: User): void {
  if (user.app_metadata?.provider !== 'google') return
  const isNew = isFirstEverSession(user)
  trackEvent(isNew ? 'sign_up' : 'login', { method: 'google' })
  trackProductEvent(isNew ? 'signed_up' : 'logged_in', { method: 'google' })
}

/**
 * Phase 3J-3 — sessionStorage marker so trackGoogleAuthIfApplicable fires
 * exactly on the ONE page load that's the direct return from THIS tab's own
 * Google OAuth attempt, never on an unrelated later reload of the same
 * already-Google-linked account (which would otherwise re-fire `login` on
 * every refresh). Same sessionStorage-survives-a-hard-redirect technique
 * lib/friends/pending-friend-code.ts already uses for the identical
 * "signInWithOAuth navigates away and back" problem — tab-scoped by design
 * (a different tab/window never sees it), self-cleaning if the flow is
 * abandoned (sessionStorage dies with the tab), and consumed (removed) the
 * moment it's read so a later reload never sees it again.
 */
const PENDING_OAUTH_KEY = 'statling.pendingGoogleOAuth.v1'

function markPendingGoogleOAuth(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(PENDING_OAUTH_KEY, '1')
}

function consumePendingGoogleOAuth(): boolean {
  if (typeof window === 'undefined') return false
  const pending = window.sessionStorage.getItem(PENDING_OAUTH_KEY) === '1'
  if (pending) window.sessionStorage.removeItem(PENDING_OAUTH_KEY)
  return pending
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
  /** See auth-context.tsx's doc comment on AuthContextValue.restoreFailed. */
  const [restoreFailed, setRestoreFailed] = useState(false)
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
      // Reset here (not just on a specific failure branch below) so a
      // failure from a PREVIOUS login/session-sync attempt never lingers
      // into this new one — every fresh attempt starts presumed-ok.
      setRestoreFailed(false)
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
            // whatever local state already exists. restoreFailed lets a
            // consumer tell this apart from "nothing to restore" — see its
            // own doc comment.
            devWarn('[session-sync] server read failed (proceeding with local state as-is):', result.failures)
            setRestoreFailed(true)
            break
          case 'restored':
            if (!result.report.ok) {
              devWarn('[session-sync] restore failed/rolled back (local state preserved):', result.report.results)
              setRestoreFailed(true)
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
        // left stuck on an unexpected throw (see "무한 loading 금지"). An
        // unexpected throw is unambiguously "did not complete successfully,"
        // same category as read_failed/report.ok===false above.
        devWarn('[session-sync] runSessionSync threw unexpectedly (proceeding with local state as-is):', err)
        setRestoreFailed(true)
      } finally {
        setRestoreReady(true)
        if (!awaitingConflictResolution) markSyncReady(userId)
      }
    }

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setUser(toAuthUser(data.session))
      setLoading(false)
      if (data.session?.user) {
        // Phase 3J-3 — this is the page load that actually runs right after
        // a Google OAuth redirect returns (see trackGoogleAuthIfApplicable's
        // own doc comment) — consumePendingGoogleOAuth() only ever returns
        // true on that one load, never on an unrelated later reload.
        if (consumePendingGoogleOAuth()) trackGoogleAuthIfApplicable(data.session.user)
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
    restoreFailed,
    restoreConflict,

    useServerStatling() {
      if (!restoreConflict) return
      const report = restoreLocalDataFromSnapshot(restoreConflict.snapshot)
      if (!report.ok) {
        devWarn('[session-sync] Case C "use server" restore failed/rolled back (local state preserved):', report.results)
      } else {
        // Cross-account contamination guard — local now reflects THIS
        // account's server data. See local-data-owner.ts's own doc comment.
        setLocalDataOwner(restoreConflict.snapshot.userId)
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
      // Phase 3J-3 — set right before the hard redirect starts (see
      // trackGoogleAuthIfApplicable's doc comment for why this is the only
      // reliable way to know, once the app reloads back at /auth/callback's
      // redirect target, that THIS load is the direct return from an OAuth
      // attempt rather than an unrelated reload of an already-linked
      // account). Cleared again below if signInWithOAuth itself fails
      // before ever redirecting, so a stale marker never lingers into some
      // later, unrelated session on this tab.
      markPendingGoogleOAuth()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) consumePendingGoogleOAuth()
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
