import type { Metadata } from 'next'
import { STATS } from '@/lib/brain-bet'
import { getPetProfileByPublicUrlId } from '@/lib/pets/pet-profile'
import { resolveShareParams } from './resolve-share-params'
import { SharePageClient } from './share-page-client'

interface SharePageProps {
  params: Promise<{ petId: string; stats?: string[] }>
}

/**
 * Real per-pet link preview (Open Graph/Twitter Card) — see resolve-share-
 * params.ts for how the optional TOP1/TOP2 path segments switch this between
 * the two share surfaces this route serves:
 *   - `/share/{petId}` (My Page's "공유 링크"): introduces the pet on its own.
 *   - `/share/{petId}/{topStat}/{secondaryStat}` (Character Reveal's
 *     "공유하기"): leads with the freshly-diagnosed TOP 2 stats.
 * og:image points at app/api/og/share/route.tsx — a plain Route Handler
 * rather than the `opengraph-image.tsx` file convention, because Turbopack
 * rejects that convention file when colocated inside an optional catch-all
 * segment (see that route's own doc comment). Falling back to `{}` (inherit
 * the root layout's static metadata) for an unknown route segment keeps a
 * broken/tampered link from shipping a misleading preview rather than
 * throwing.
 *
 * Phase 3H-1 — the raw route segment (resolve-share-params.ts's `rawPetId`)
 * is resolved through getPetProfileByPublicUrlId, which accepts either the
 * new public `slug` or a legacy internal `id` (see lib/pets/pet-profile.ts).
 * `pet.id` (never the raw segment) is what feeds the OG image query param
 * and everything else that expects the internal id; `pet.slug` is what
 * feeds the canonical path below, so a legacy link's preview/canonical tag
 * always advertises the new slug URL while the legacy link itself keeps
 * resolving (no redirect — see SharePageClient's own doc comment on why a
 * forced redirect was judged unnecessary here).
 */
export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { petId: routeSegment, stats } = await params
  const { rawPetId, topStat, secondaryStat } = resolveShareParams(routeSegment, stats)
  const pet = getPetProfileByPublicUrlId(rawPetId)
  if (!pet) return {}

  const path =
    topStat && secondaryStat ? `/share/${pet.slug}/${topStat}/${secondaryStat}` : `/share/${pet.slug}`

  const title =
    topStat && secondaryStat
      ? `'${pet.name}' 탄생! TOP 스탯: ${STATS[topStat].name} · ${STATS[secondaryStat].name}`
      : `내가 키우는 Statling, '${pet.name}'`

  const description =
    topStat && secondaryStat
      ? `6개의 두뇌 능력을 분석해서 '${pet.name}'이(가) 태어났어요. ${pet.tagline}`
      : pet.tagline

  const ogImageParams = new URLSearchParams({ petId: pet.id })
  if (topStat && secondaryStat) {
    ogImageParams.set('top', topStat)
    ogImageParams.set('second', secondaryStat)
  }
  const ogImageUrl = `/api/og/share?${ogImageParams.toString()}`

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
      siteName: 'Statling',
      locale: 'ko_KR',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

/**
 * Phase 3H-1 — resolves the route segment (slug or legacy id) to the
 * catalog's internal `pet.id` and passes ONLY that down to SharePageClient,
 * so every downstream consumer (Dex, FriendInviteCta's `pet_id` analytics,
 * the client's own getPetProfileById lookup) keeps operating on the
 * internal id exactly as before this Phase — none of that code changed. An
 * unresolvable segment passes the raw string through unchanged, so
 * SharePageClient's existing getPetProfileById(petId) lookup still misses
 * and renders the same "존재하지 않는 Statling 링크예요." state it always has.
 */
export default async function SharePage({ params }: SharePageProps) {
  const { petId: routeSegment, stats } = await params
  const { rawPetId, topStat, secondaryStat } = resolveShareParams(routeSegment, stats)
  const pet = getPetProfileByPublicUrlId(rawPetId)
  return <SharePageClient petId={pet ? pet.id : rawPetId} topStat={topStat} secondaryStat={secondaryStat} />
}
