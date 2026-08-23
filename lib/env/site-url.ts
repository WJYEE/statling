/**
 * Phase 3E-3 — single source of truth for Statling's own absolute site URL,
 * used anywhere a server-rendered/crawler-facing absolute URL is required
 * (app/layout.tsx's metadataBase/openGraph.url, the OG image route's own
 * asset self-fetch, and lib/share/build-share-text.ts's buildShareUrl /
 * lib/campaign/build-campaign-url.ts's buildCampaignUrl as their last-resort
 * fallback below explicitUrl/window.location.origin).
 *
 * `resolveConfiguredSiteUrl()` only ever returns a value someone actually
 * configured — it never guesses:
 *  1. NEXT_PUBLIC_APP_URL — the explicit, deploy-configured domain. Works
 *     identically in Development/Preview/Production; whoever sets this wins.
 *  2. VERCEL_PROJECT_PRODUCTION_URL, but ONLY when VERCEL_ENV === 'production'
 *     — Vercel's own stable production-domain env var (no leading protocol,
 *     hence the `https://` prefix below), so a Production deploy that forgot
 *     to set NEXT_PUBLIC_APP_URL still resolves to the REAL production
 *     domain instead of localhost, with zero manual step. Gated on
 *     VERCEL_ENV so a Preview deploy never accidentally borrows the
 *     Production domain here (Preview should point at its own URL — see the
 *     next tier).
 *  3. VERCEL_URL — the CURRENT deployment's own unique domain (set in every
 *     Vercel environment, including Preview and Production). Correct for
 *     Preview specifically: each preview build's OG/share metadata should
 *     point at THAT preview's own domain, not the production one, so a
 *     reviewer's link-preview crawler sees the right content.
 *  4. Returns `null` — nothing is configured. Every consumer decides its own
 *     safe behavior for this case (see getSiteUrl below, or
 *     buildCampaignUrl's own throw) — this function itself never guesses
 *     `http://localhost:3000`.
 *
 * All three real env vars above are plain server-side vars (no NEXT_PUBLIC_
 * prefix on the Vercel-provided two), so tiers 2-3 only ever resolve
 * server-side (Server Components, Route Handlers, metadata generation) —
 * exactly where this module's consumers actually need them. Called from the
 * browser, only tier 1 can ever resolve (NEXT_PUBLIC_APP_URL is inlined at
 * build time); that's fine, since client code already has a strictly better
 * source available first (window.location.origin — see buildShareUrl).
 */
function resolveConfiguredSiteUrl(): string | null {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return null
}

/**
 * For call sites that CANNOT throw (metadata generation / an OG image route
 * run on every request — an unhandled throw there would 500 the whole page,
 * not just degrade one link preview). Falls back to `http://localhost:3000`
 * only when `resolveConfiguredSiteUrl()` found nothing at all — on an actual
 * Vercel deployment (Preview or Production) this can only happen if
 * NEXT_PUBLIC_APP_URL is unset AND Vercel's own env vars are somehow also
 * missing, which doesn't happen in normal operation. When it IS reached in a
 * production runtime, this logs a loud, unmissable error (visible in
 * Vercel's function/build logs) instead of failing silently — see the
 * Phase 3E-3 report's "Fail Loudly" section for why a hard throw isn't safe
 * here specifically.
 */
export function getSiteUrl(): string {
  const configured = resolveConfiguredSiteUrl()
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[getSiteUrl] NEXT_PUBLIC_APP_URL is not set and no Vercel deployment URL was found in a production runtime — ' +
        'falling back to http://localhost:3000, which WILL leak into OG/share metadata. Set NEXT_PUBLIC_APP_URL in the ' +
        'Vercel project\'s Production/Preview environment variables.',
    )
  }
  return 'http://localhost:3000'
}

export { resolveConfiguredSiteUrl }
