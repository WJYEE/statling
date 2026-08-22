'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { posthog, initPostHog, isPostHogEnabled } from '@/lib/analytics/posthog'

// Module scope, not inside a component/effect — see initPostHog's own doc
// comment in lib/analytics/posthog.ts for why this ordering matters.
initPostHog()

/**
 * Manual $pageview capture for the App Router — this SDK's own
 * capture_pageview is off (see posthog.ts), so this is the only pageview
 * source, never a duplicate of an automatic one. usePathname/useSearchParams
 * only change on a REAL route change (a /share/[petId] visit, /auth/callback
 * — GameFlow's own screen transitions are internal state, not URL changes),
 * so this fires exactly once per real navigation, including the first load.
 *
 * useSearchParams() opts this component out of static rendering unless
 * wrapped in Suspense (Next's own documented requirement) — see
 * PostHogAnalytics below for that boundary; kept to this one small child so
 * the Suspense fallback (null either way) never affects anything visible.
 */
function PostHogPageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!isPostHogEnabled || !pathname) return
    const query = searchParams?.toString()
    const url = query ? `${window.location.origin}${pathname}?${query}` : `${window.location.origin}${pathname}`
    posthog.capture('$pageview', { $current_url: url })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams is already read via .toString() above; re-running only on pathname/query content change (not object identity) is the intent
  }, [pathname, searchParams])

  return null
}

/**
 * Phase 3A-1 — mounted as a sibling in app/layout.tsx, the same structural
 * pattern components/analytics/google-analytics.tsx already uses (renders
 * no wrapping element, never sits between a provider and `children`, so it
 * cannot change hydration order or block rendering of anything). Renders
 * nothing itself if PostHog isn't configured.
 */
export function PostHogAnalytics() {
  if (!isPostHogEnabled) return null
  return (
    <Suspense fallback={null}>
      <PostHogPageview />
    </Suspense>
  )
}
