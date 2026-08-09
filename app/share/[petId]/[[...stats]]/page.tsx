import type { Metadata } from 'next'
import { STATS } from '@/lib/brain-bet'
import { getPetProfileById } from '@/lib/pets/pet-profile'
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
 * the root layout's static metadata) for an unknown petId keeps a broken/
 * tampered link from shipping a misleading preview rather than throwing.
 */
export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { petId: rawPetId, stats } = await params
  const { petId, topStat, secondaryStat } = resolveShareParams(rawPetId, stats)
  const pet = getPetProfileById(petId)
  if (!pet) return {}

  const path =
    topStat && secondaryStat
      ? `/share/${encodeURIComponent(petId)}/${topStat}/${secondaryStat}`
      : `/share/${encodeURIComponent(petId)}`

  const title =
    topStat && secondaryStat
      ? `'${pet.name}' 탄생! TOP 스탯: ${STATS[topStat].name} · ${STATS[secondaryStat].name}`
      : `내가 키우는 Statling, '${pet.name}'`

  const description =
    topStat && secondaryStat
      ? `6개의 두뇌 능력을 분석해서 '${pet.name}'이(가) 태어났어요. ${pet.tagline}`
      : pet.tagline

  const ogImageParams = new URLSearchParams({ petId })
  if (topStat && secondaryStat) {
    ogImageParams.set('top', topStat)
    ogImageParams.set('second', secondaryStat)
  }
  const ogImageUrl = `/api/og/share?${ogImageParams.toString()}`

  return {
    title,
    description,
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

export default async function SharePage({ params }: SharePageProps) {
  const { petId: rawPetId, stats } = await params
  const { petId, topStat, secondaryStat } = resolveShareParams(rawPetId, stats)
  return <SharePageClient petId={petId} topStat={topStat} secondaryStat={secondaryStat} />
}
