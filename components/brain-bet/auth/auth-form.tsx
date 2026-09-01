'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Lock, Mail } from 'lucide-react'
import { Toast } from '@base-ui/react/toast'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useAuth } from '@/lib/auth/auth-provider'
import { trackEvent } from '@/lib/analytics/ga'
import { cn } from '@/lib/utils'

/**
 * Deliberately stricter than the browser's native `type="email"` validation,
 * which accepts a domain with no TLD at all (e.g. "aa@aaaa") — Supabase Auth
 * rejects those server-side with `email_address_invalid`, so without this,
 * the form looked like it accepted the address (no inline error, submit
 * enabled) right up until the request round-trips and fails. Requires a
 * local part, an "@", and a domain with at least one "." followed by a 2+
 * character TLD — not full RFC 5322, just enough to catch the shape Supabase
 * itself rejects. Doesn't (and can't) replicate every server-side rule
 * Supabase applies (e.g. blocking reserved domains like example.com) — those
 * still surface via the existing `error` state from the API response, same
 * as before this change.
 */
const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isValidEmailFormat(value: string): boolean {
  return EMAIL_FORMAT_PATTERN.test(value.trim())
}

interface AuthFormProps {
  /** Called after a successful sign-in, or a sign-up that didn't need email confirmation. */
  onAuthenticated?: () => void
  /**
   * Phase 3J-3 — fires the moment the user actually attempts to continue
   * (Google click, or a password submit that passed the client-side email-
   * format guard) — before the network round-trip resolves, so it measures
   * *intent* separately from success (already covered by sign_up/login).
   * Deliberately optional and never called by AuthForm's own analytics:
   * this component is shared by SaveScreen (the onboarding funnel this was
   * built for) and MyPageScreen's guest account-linking card (a different
   * context) — only SaveScreen passes this prop, so MyPage's usage stays
   * completely untouched rather than polluting a different funnel with the
   * same event name.
   */
  onContinueAttempt?: (method: 'google' | 'password') => void
  defaultMode?: 'signup' | 'signin'
  className?: string
}

/**
 * Google + email/password sign-in/sign-up UI, shared by SaveScreen (post-hatch
 * save prompt) and MyPageScreen (guest account card). See GAME_SPEC.MD §16.2 —
 * both auth methods are required so users who don't want Google OAuth still
 * have a path in.
 */
export function AuthForm({ onAuthenticated, onContinueAttempt, defaultMode = 'signup', className }: AuthFormProps) {
  const { signInWithGoogle, signInWithPassword, signUpWithPassword } = useAuth()
  const toastManager = Toast.useToastManager()

  const [mode, setMode] = useState<'signup' | 'signin'>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Deliberately two independent flags, not one shared `submitting` union —
  // Google's redirect-based flow and the email/password request have no
  // reason to gate each other's button, and a previous shared-state version
  // of this let a stuck Google loading state also block email/password
  // sign-up entirely (see the pageshow effect below for why Google's alone
  // can get stuck in the first place).
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // signInWithGoogle() below is a same-tab, full-page redirect to Google —
  // not a popup — so the only way this component sees the user "come back"
  // after cancelling/failing on Google's own consent screen without ever
  // reaching app/auth/callback/route.ts's redirect-back-to-origin (which
  // would remount this component fresh with googleSubmitting already false)
  // is the browser restoring THIS SAME pre-navigation page instance from
  // the back/forward cache (bfcache) — e.g. the user presses Back, or some
  // browsers restore bfcache automatically when Google's page itself
  // navigates back. A bfcache restore resumes the exact in-memory React
  // state from the instant navigation started, so googleSubmitting would
  // otherwise stay stuck at true forever with no further code ever running
  // to clear it. `pageshow` with `persisted: true` is the standard, lifecycle
  // -accurate signal for exactly this case (not a timeout — it only fires
  // on an actual bfcache restore). Harmless on a normal fresh mount too:
  // `persisted` is false there, and googleSubmitting already starts false.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setGoogleSubmitting(false)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  function switchMode(next: 'signup' | 'signin') {
    setMode(next)
    setError(null)
  }

  async function handleGoogle() {
    if (googleSubmitting) return
    onContinueAttempt?.('google')
    setGoogleSubmitting(true)
    setError(null)
    const result = await signInWithGoogle()
    if (result.error) {
      setError(result.error)
      setGoogleSubmitting(false)
    }
    // On success the browser navigates away to Google — there's no
    // same-page moment to confirm sign_up/login from here (that would need
    // instrumenting app/auth/callback/route.ts once Google OAuth actually
    // completes end-to-end, which the active auth backend doesn't yet).
    // googleSubmitting intentionally stays true here: either the redirect
    // actually happens (this component is about to unmount) or it doesn't
    // and the pageshow handler above is what's responsible for recovering.
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault()
    if (!email || !password || passwordSubmitting) return

    // Catches the "aa@aaaa"-shaped case before it ever reaches Supabase —
    // same copy translateAuthError (lib/auth/supabase-auth-provider.tsx)
    // already shows for Supabase's own `email_address_invalid`/format
    // errors, so the message is identical whether caught here or by the API.
    if (!isValidEmailFormat(email)) {
      setError('이메일 형식이 올바르지 않아요.')
      return
    }

    onContinueAttempt?.('password')
    setPasswordSubmitting(true)
    setError(null)
    const result = mode === 'signup' ? await signUpWithPassword(email, password) : await signInWithPassword(email, password)
    setPasswordSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }
    if (result.needsEmailConfirmation) {
      toastManager.add({ title: '가입 확인 메일을 보냈어요. 메일함을 확인해주세요.', type: 'success' })
      return
    }
    toastManager.add({ title: mode === 'signup' ? '가입되었어요!' : '로그인했어요!', type: 'success' })
    trackEvent(mode === 'signup' ? 'sign_up' : 'login', { method: 'password' })
    onAuthenticated?.()
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-4 flex justify-center gap-1 rounded-2xl bg-muted p-1">
        <button
          type="button"
          onClick={() => switchMode('signup')}
          className={tabClass(mode === 'signup')}
        >
          회원가입
        </button>
        <button
          type="button"
          onClick={() => switchMode('signin')}
          className={tabClass(mode === 'signin')}
        >
          로그인
        </button>
      </div>

      <ToyButton className="w-full" onClick={handleGoogle} disabled={googleSubmitting}>
        {googleSubmitting ? '이동하는 중...' : 'Google로 계속하기'}
      </ToyButton>

      <div className="flex items-center gap-3 py-3 text-xs font-semibold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        또는
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handlePasswordSubmit} className="space-y-3">
        <label className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 toy-border">
          <Mail size={18} strokeWidth={2.2} className="shrink-0 text-muted-foreground" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            autoComplete="email"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 toy-border">
          <Lock size={18} strokeWidth={2.2} className="shrink-0 text-muted-foreground" />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (6자 이상)"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

        <ToyButton type="submit" variant="secondary" className="w-full" disabled={passwordSubmitting}>
          {passwordSubmitting ? '처리 중...' : mode === 'signup' ? '이메일로 가입하기' : '이메일로 로그인하기'}
        </ToyButton>
      </form>
    </div>
  )
}

function tabClass(active: boolean) {
  return cn(
    'flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors',
    active ? 'bg-card text-foreground toy-shadow-sm' : 'text-muted-foreground',
  )
}
