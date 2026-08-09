import { STATS, type StatId } from '@/lib/brain-bet'

function isStatId(value: string): value is StatId {
  return value in STATS
}

export interface ResolvedShareParams {
  petId: string
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
export function resolveShareParams(rawPetId: string, stats: string[] | undefined): ResolvedShareParams {
  // Next hands the dynamic segment through un-decoded — every catalog id is
  // non-ASCII (see lib/pets/pet-profile.ts), so this decode is required.
  const petId = decodeURIComponent(rawPetId)

  if (stats?.length === 2 && isStatId(stats[0]) && isStatId(stats[1]) && stats[0] !== stats[1]) {
    return { petId, topStat: stats[0], secondaryStat: stats[1] }
  }
  return { petId, topStat: null, secondaryStat: null }
}
