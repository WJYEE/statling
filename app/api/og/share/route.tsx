import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { STATS, type StatId } from '@/lib/brain-bet'
import { getPetProfileById } from '@/lib/pets/pet-profile'

/**
 * Dynamic per-pet Open Graph image for app/share/[petId]/[[...stats]]/ —
 * NOT the `opengraph-image.tsx` file convention, deliberately: Turbopack
 * rejects that convention file when it's colocated inside an optional
 * catch-all segment ("catch all segment must be the last segment" — the
 * convention file gets treated as an implicit extra path segment after the
 * catch-all, which App Router's routing rules forbid). A plain Route Handler
 * sidesteps this entirely and is referenced explicitly from that route's
 * generateMetadata via `openGraph.images`/`twitter.images`. Query params
 * (not path segments) here are just this handler's own choice — nothing
 * about it requires matching the page route's path shape.
 */
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const alt = 'Statling 공유 카드'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Satori (behind ImageResponse) can't resolve the app's real oklch() stat
// colors from globals.css — no stylesheet or CSS-var context exists in this
// server-side renderer, only inline styles (see app/opengraph-image.tsx's
// own doc comment for the same constraint). These are hand-picked hex
// approximations of each --stat-* hue, used only for this preview thumbnail.
const STAT_HEX: Record<StatId, string> = {
  reaction: '#d9a441',
  memory: '#c2694a',
  focus: '#4a7fc2',
  judgment: '#4fa77c',
  spatial: '#d97a3f',
  reasoning: '#7a63c2',
}

const BG = '#f7f0e0'
const INK = '#4a3a28'
const MUTED = '#6b5a45'
const CARD = '#fdf6ea'
const BRAND = '#e07a3f'

function isStatId(value: string | null): value is StatId {
  return value != null && value in STATS
}

function BrandMark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          width: 56,
          height: 56,
          borderRadius: 16,
          background: BRAND,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 26,
            height: 32,
            borderRadius: '50% 50% 46% 46% / 55% 55% 45% 45%',
            background: CARD,
          }}
        />
      </div>
      <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, color: INK }}>Statling</div>
    </div>
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const petId = searchParams.get('petId')
  const topRaw = searchParams.get('top')
  const secondRaw = searchParams.get('second')
  const topStat = isStatId(topRaw) && isStatId(secondRaw) && topRaw !== secondRaw ? topRaw : null
  const secondaryStat = isStatId(topRaw) && isStatId(secondRaw) && topRaw !== secondRaw ? secondRaw : null

  const pet = petId ? getPetProfileById(petId) : undefined

  if (!pet) {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: BG,
            fontFamily: 'sans-serif',
            gap: 24,
          }}
        >
          <BrandMark />
          <div style={{ display: 'flex', fontSize: 32, color: MUTED }}>존재하지 않는 Statling 링크예요</div>
        </div>
      ),
      { ...size },
    )
  }

  const imageUrl = `${SITE_URL}${pet.imageSrc}`

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: BG,
          fontFamily: 'sans-serif',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 72px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 620 }}>
          <BrandMark />

          <div style={{ display: 'flex', marginTop: 32, fontSize: 56, fontWeight: 800, color: INK }}>{pet.name}</div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 26, color: MUTED }}>
            {topStat && secondaryStat ? '나의 숨겨진 스탯으로 태어났어요' : pet.tagline}
          </div>

          {topStat && secondaryStat && (
            <div style={{ display: 'flex', marginTop: 32, gap: 16 }}>
              {[topStat, secondaryStat].map((id, i) => (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: '16px 22px',
                    borderRadius: 20,
                    background: CARD,
                    border: `3px solid ${STAT_HEX[id]}`,
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 18, fontWeight: 800, color: STAT_HEX[id] }}>
                    {i === 0 ? 'TOP 1' : 'TOP 2'}
                  </div>
                  <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: INK }}>{STATS[id].name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- Satori (ImageResponse) requires a plain <img>, not next/image */}
        <img src={imageUrl} width={380} height={380} style={{ objectFit: 'contain' }} alt="" />
      </div>
    ),
    { ...size },
  )
}
