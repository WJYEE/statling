/**
 * Phase 3E-2 — Landing A/B experiment variant assignment.
 *
 * Deliberately independent of UTM (see lib/campaign/build-campaign-url.ts's
 * own doc comment for why the two axes must never be merged): this only
 * ever answers "which Landing UI did this browser see", never "where did
 * they come from" — never read/write a utm_* value from this module.
 *
 * Sticky by construction — the first assignment is persisted to localStorage
 * under the same statling.*.v1 dot-delimited, versioned naming convention
 * lib/room/room-storage.ts's DEVICE_ID_KEY already uses, so a reload/next-
 * day/next-visit always reads the same value back instead of re-rolling.
 * Deliberately NOT a PostHog feature flag / person property / group — see
 * the Phase 3E-2 report's §5 comparison for why: a plain localStorage flag
 * needs no network round-trip before Landing can render (no flicker risk),
 * survives `posthog.reset()` on logout (identify/reset only touch PostHog's
 * own person state, never localStorage), and needs no PostHog Experiments
 * setup for a project this early-stage — matching the spec's "과도한
 * infrastructure는 피합니다".
 */
export type LandingVariant = 'A' | 'B'

const LANDING_VARIANT_KEY = 'statling.landingVariant.v1'
const LANDING_VARIANT_QUERY_KEY = 'landing_variant'

function randomVariant(): LandingVariant {
  return Math.random() < 0.5 ? 'A' : 'B'
}

/**
 * Reads the persisted variant, assigning + persisting a fresh 50:50 pick
 * the first time this device is ever asked. Server-safe (returns 'A'
 * deterministically when `window` doesn't exist) — Landing itself never
 * renders server-side (see game-flow.tsx's `!bootReady` spinner gate, which
 * always resolves client-side before Landing's first real paint), so this
 * branch is defensive only, never actually reached for a real visitor.
 */
export function getOrAssignLandingVariant(): LandingVariant {
  if (typeof window === 'undefined') return 'A'
  try {
    const existing = window.localStorage.getItem(LANDING_VARIANT_KEY)
    if (existing === 'A' || existing === 'B') return existing
    const assigned = randomVariant()
    window.localStorage.setItem(LANDING_VARIANT_KEY, assigned)
    return assigned
  } catch {
    // localStorage unavailable (private browsing, quota, ...) — fall back
    // to a fresh per-render random pick rather than throwing; not sticky in
    // this rare case, same posture as room-storage.ts#getOrCreateDeviceId's
    // own try/catch fallback.
    return randomVariant()
  }
}

/**
 * Mirrors the already-resolved sticky `variant` onto the visible URL as
 * `?landing_variant=A|B`, purely so PostHog Heatmaps — which can only split
 * data by URL, never by event/person property (see this module's own doc
 * comment on why the assignment itself stays a plain localStorage flag) —
 * can separate Variant A's clicks from Variant B's even though both render
 * at the identical route. `variant` here is always whatever
 * `getOrAssignLandingVariant()` already decided; this function only ever
 * reflects that value onto the URL, never reads the URL to decide it — a
 * stale/tampered `?landing_variant=` from a shared/bookmarked link is
 * silently corrected to match the real sticky assignment, never trusted as
 * a second source of truth.
 *
 * Raw `history.replaceState()`, not `next/navigation`'s `router.replace()`
 * — this must stay an invisible, non-navigating URL-bar edit with no
 * Next.js route transition, re-render, or data refetch. (GA4's own
 * "Page changes based on browser history events" Enhanced Measurement
 * setting does listen to `replaceState()` and may record an extra
 * automatic page_view from this call — a known, accepted trade-off of this
 * approach, not something this function works around; see the Phase 3E-2
 * Landing Heatmap Separation report.)
 *
 * No-ops (no replaceState call at all) once the URL already carries the
 * correct value — the common case on every reload after the first
 * assignment — so this never repeatedly rewrites history on an unchanged
 * URL. Every other query parameter (utm_*, ref, ...) is preserved exactly
 * as-is: only the single `landing_variant` key is ever added/corrected.
 */
export function syncLandingVariantQueryParam(variant: LandingVariant): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get(LANDING_VARIANT_QUERY_KEY) === variant) return
  url.searchParams.set(LANDING_VARIANT_QUERY_KEY, variant)
  window.history.replaceState(window.history.state, '', url)
}
