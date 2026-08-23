/**
 * Phase 3E-2 — generic promotional-link UTM builder, for future outbound
 * posts/campaigns (Instagram, Threads, Naver Blog, portfolio, community,
 * ...). Deliberately separate from lib/share/build-share-text.ts's
 * `buildShareUrl`: that one is a fixed, in-app "친구에게 공유" mechanism with
 * hardcoded utm_source=statling_share/utm_medium=referral/utm_campaign=
 * user_share values and a 2-value utm_content enum — reusing it here would
 * either fight those hardcoded values or require weakening its types for an
 * unrelated use case. This is a plain, arbitrary-value UTM URL constructor
 * instead.
 *
 * Never carries `landing_variant`/experiment info — UTM answers "where did
 * this visitor come from", never "which Landing UI will they see". See
 * lib/experiments/landing-variant.ts's own doc comment for the other half
 * of that separation.
 */
export interface BuildCampaignUrlInput {
  source: string
  medium: string
  campaign: string
  content?: string
  /** Overrides NEXT_PUBLIC_APP_URL — mainly for tests/scripts run outside the app's own env. */
  baseUrl?: string
}

/**
 * Throws rather than silently falling back to `localhost` (spec §20's own
 * flagged risk: "환경변수가 빠졌을 때 localhost URL이 외부 공유/홍보 링크에
 * 생성될 위험") — a promotional link is meant to be pasted somewhere public,
 * so a broken localhost URL here is worse than a loud failure while writing
 * the campaign in the first place.
 */
export function buildCampaignUrl({ source, medium, campaign, content, baseUrl }: BuildCampaignUrlInput): string {
  const resolvedBase = baseUrl || process.env.NEXT_PUBLIC_APP_URL
  if (!resolvedBase) {
    throw new Error(
      'buildCampaignUrl: no base URL available — set NEXT_PUBLIC_APP_URL (production domain) or pass baseUrl explicitly.',
    )
  }

  const url = new URL(resolvedBase)
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', medium)
  url.searchParams.set('utm_campaign', campaign)
  if (content) url.searchParams.set('utm_content', content)
  return url.toString()
}
