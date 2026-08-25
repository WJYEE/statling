import { STATS, type StatId } from '@/lib/brain-bet'

function isStatId(value: string): value is StatId {
  return value in STATS
}

export interface ResolvedShareParams {
  /**
   * Phase 3H-1 — the raw route segment, decoded but NOT yet resolved to a
   * catalog pet: it may be a public slug (`ocean-whale`), a legacy internal
   * id (`08_바다고래`), or invalid. Callers must resolve this through
   * lib/pets/pet-profile.ts's getPetProfileByPublicUrlId before treating it
   * as an internal petId — this file only parses the URL's shape, it has no
   * catalog knowledge of its own.
   */
  rawPetId: string
  /**
   * Present only when the URL carries exactly 2 distinct, valid StatIds as
   * extra path segments (`/share/{petId}/{topStat}/{secondaryStat}`) — the
   * Character Reveal share variant (see reveal-screen.tsx's handleShare).
   * Null for the plain `/share/{petId}` URL — the My Page / friend-invite
   * variant (see my-page-screen.tsx), which shows the pet on its own with no
   * stat highlight. Malformed/invalid extra segments degrade to this same
   * null case rather than 404ing, since the base pet page is still valid.
   */
  topStat: StatId | null
  secondaryStat: StatId | null
}

/**
 * Single source of truth for interpreting this route's params, shared by
 * page.tsx's generateMetadata, the page component itself, and
 * opengraph-image.tsx — all three receive the same raw `{ petId, stats }`
 * shape from Next and must agree on what counts as a valid Character Reveal
 * link.
 */
export function resolveShareParams(routeSegment: string, stats: string[] | undefined): ResolvedShareParams {
  // Next hands the dynamic segment through un-decoded — legacy catalog ids
  // are non-ASCII (see lib/pets/pet-profile.ts), so this decode is required;
  // a public slug is plain ASCII and passes through decodeURIComponent unchanged.
  const rawPetId = decodeURIComponent(routeSegment)

  if (stats?.length === 2 && isStatId(stats[0]) && isStatId(stats[1]) && stats[0] !== stats[1]) {
    return { rawPetId, topStat: stats[0], secondaryStat: stats[1] }
  }
  return { rawPetId, topStat: null, secondaryStat: null }
}
