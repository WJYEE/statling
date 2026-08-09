/**
 * Data needed to share a user's representative Statling result. Kept as a
 * plain, serializable shape (not tied to PetProfile/StatId) so it can be
 * reused later by something like a dynamic Open Graph image/metadata route
 * without depending on React/DOM APIs — this module has none.
 */
export interface ShareStatlingInput {
  petName: string
  petImage: string
  tagline: string
  primaryStat: string
  secondaryStat: string
  /** Explicit override — if omitted, buildShareUrl() resolves it (NEXT_PUBLIC_APP_URL -> window.location.origin -> dev fallback). */
  url?: string
}

export type ShareOutcome =
  | { status: 'shared'; method: 'file' | 'web-share' }
  | { status: 'copied'; method: 'clipboard' }
  | { status: 'cancelled' }
  | { status: 'manual-copy'; title: string; text: string; url: string }
  | { status: 'error' }

/**
 * Pre-built share copy for shareStatlingResult — deliberately just the 3
 * strings the OS share sheet / clipboard / fallback modal actually need,
 * decoupled from any one card's data shape. Each share surface (Character
 * Reveal's result card, MyPage's friend-invite card, ...) builds its own
 * title/text via its own small builder in build-share-text.ts, so the
 * fallback-cascade logic in share-statling-result.ts stays shared instead of
 * being duplicated per surface.
 */
export interface ShareCardContent {
  title: string
  text: string
  url: string
}
