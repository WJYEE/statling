'use client'

import { useEffect } from 'react'
import { Logo } from '@/components/brain-bet/logo'
import { AuthForm } from '@/components/brain-bet/auth/auth-form'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { useAuth } from '@/lib/auth/auth-provider'

interface SaveScreenProps {
  onContinue: () => void
  onSkip: () => void
}

/**
 * Post-hatch save/login prompt (GAME_SPEC.MD §16.1). Login is never forced —
 * "나중에 하기" always advances the flow the same way `onContinue` does.
 *
 * auth_choice_made only fires for the skip path below — `onContinue` here IS
 * AuthForm's onAuthenticated, which fires immediately after auth-form.tsx's
 * own GA4 `sign_up` call at the exact same moment, so a choice:'sign_up'
 * event here would just duplicate that signal rather than add new funnel
 * information (see lib/analytics/analytics.ts's auth_choice_made doc comment).
 *
 * Phase 3J-3 — save_screen_viewed/auth_continue_clicked close the
 * ANALYTICS_GAP_AUDIT.md P1 gap: this screen's exposure and its "continue"
 * intent (as opposed to skip) previously had no denominator at all, so the
 * signup conversion rate for this screen couldn't be calculated. Both are
 * PostHog-only (see lib/analytics/analytics.ts's own doc comments) — no GA4
 * counterpart, matching this task's PostHog-first scope.
 */
export function SaveScreen({ onContinue, onSkip }: SaveScreenProps) {
  const { isConfigured } = useAuth()

  // Empty-deps effect, same once-per-real-mount convention as
  // profile_setup_view/statling_reveal — this screen only ever mounts once
  // per Intro run (see game-flow.tsx's phase machine), so no extra re-fire
  // guard beyond the empty dependency array is needed.
  useEffect(() => {
    trackProductEvent('save_screen_viewed', {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount only
  }, [])

  function handleSkip() {
    trackProductEvent('auth_choice_made', { choice: 'skip' })
    onSkip()
  }

  function handleContinueAttempt(method: 'google' | 'password') {
    trackProductEvent('auth_continue_clicked', { method })
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <Logo size="sm" />
      <h1 className="mt-8 text-balance font-display text-2xl font-extrabold leading-snug text-foreground">
        이 친구를 잃어버리지 않도록
        <br />
        저장해둘까요?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        로그인하면 다음에도 Statling을 이어서 만날 수 있어요.
      </p>

      <div className="mt-8 w-full">
        {isConfigured ? (
          <AuthForm defaultMode="signup" onAuthenticated={onContinue} onContinueAttempt={handleContinueAttempt} />
        ) : (
          <p className="rounded-2xl bg-card px-4 py-3 text-xs font-semibold text-muted-foreground toy-border">
            로그인 기능이 아직 준비되지 않았어요. &quot;나중에 하기&quot;로 계속 진행할 수 있어요.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleSkip}
        className="mt-6 text-sm font-bold text-muted-foreground underline-offset-4 hover:underline"
      >
        나중에 하기
      </button>
    </div>
  )
}
