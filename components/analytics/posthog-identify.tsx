'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth/auth-provider'
import { posthog, isPostHogEnabled } from '@/lib/analytics/posthog'

/**
 * Phase 3A-1 — syncs PostHog's identity to the Supabase auth state
 * lib/auth/auth-provider.tsx (currently SupabaseAuthProvider) already
 * tracks. Purely a side-effect bridge: renders nothing, never calls
 * anything in the Supabase/session-registry/continuous-sync/BGM logout path
 * — those are entirely unaffected by this component existing or not.
 *
 * distinct_id is Supabase's `user.id` — deliberately never `user.email`
 * (the task's own "이메일을 distinct_id로 사용하지 말 것"), and no other
 * property is sent at identify time (no email, no token, no session object)
 * — kept to the bare minimum for this phase; see the Phase 3A-1 report for
 * why account_created_at was left out too (useAuth()'s AuthUser type
 * doesn't currently expose it).
 *
 * `lastIdentifiedId` skips a redundant identify() call across re-renders
 * with the SAME user (e.g. an unrelated context re-render) — posthog-js's
 * own identify() is idempotent-safe to call repeatedly, but avoiding it
 * keeps this from ever looking like "repeated re-identification" in a
 * network trace during QA. On sign-out (`user` becomes null), reset() is
 * called exactly once — PostHog's own documented logout pattern, so the
 * next anonymous session (e.g. a different person on a shared device) never
 * inherits this person's identity or event history.
 */
export function PostHogIdentify() {
  const { user } = useAuth()
  const lastIdentifiedId = useRef<string | null>(null)

  useEffect(() => {
    if (!isPostHogEnabled) return

    if (user) {
      if (lastIdentifiedId.current !== user.id) {
        posthog.identify(user.id)
        lastIdentifiedId.current = user.id
      }
      return
    }

    if (lastIdentifiedId.current !== null) {
      posthog.reset()
      lastIdentifiedId.current = null
    }
  }, [user])

  return null
}
