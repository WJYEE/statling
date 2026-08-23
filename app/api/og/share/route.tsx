import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { STATLING_TYPES, STATS, type StatId } from '@/lib/brain-bet'
import { allGamePools } from '@/lib/game/game-registry'
import { getPetProfileById } from '@/lib/pets/pet-profile'
import { getSiteUrl } from '@/lib/env/site-url'

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
// Phase 3E-3 — see lib/env/site-url.ts's getSiteUrl() doc comment: tries
// NEXT_PUBLIC_APP_URL then Vercel's own deployment env vars before ever
// falling back to localhost, and logs loudly in production if it has to —
// this route self-fetches absolute image URLs below (Satori/ImageResponse
// can't resolve relative paths), so a stray localhost here would mean the
// OG image silently fails to render in production link previews.
const SITE_URL = getSiteUrl()

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

function isStatId(value: string | null): value is StatId {
  return value != null && value in STATS
}

// Phase 3C-1: the real official logo (public/assets/statling/logo/ChatGPT_tight.png
// — same asset the on-screen `Logo` component and the html-to-image share
// cards use, see components/brain-bet/logo.tsx / components/share/share-card-common.tsx),
// loaded the same way `pet.imageSrc` already is below (an absolute SITE_URL
// fetch — Satori/ImageResponse can't resolve a bare local path or a Next.js
// static-import object, only a real fetchable URL). Previously a hand-drawn
// placeholder shape (colored square + white blob), never the real mark.
function BrandMark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori (ImageResponse) requires a plain <img>, not next/image */}
      <img src={`${SITE_URL}/assets/statling/logo/ChatGPT_tight.png`} width={56} height={56} style={{ objectFit: 'contain' }} alt="" />
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
  const isReveal = topStat != null && secondaryStat != null

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
        {/* Phase 3C-2 (Follow-up: slightly bigger Hero, per the spec's
            "Hero는 Share Card와 마찬가지로 조금 더 크게 조정할 수 있습니다")
            — same information hierarchy as the PNG Result Card (see
            StatlingShareCard's own doc comment) but simpler, per the spec's
            "OG는 Share PNG보다 더 단순해야" — Hero (character, right), name,
            one-line Type (STATLING_TYPES[topStat].typeName — real existing
            copy, never a new label), TOP2 stat tags, brand. No strength/
            weakness/compatibility/feature-cards here; those stay PNG-only.
            The `!isReveal` branch (MyPage's plain `/share/{petId}` URL, no
            stat query params reaching this route at all) can't show a type
            line or TOP2 tags — it keeps the generic headline + mini-game-
            count tag. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 560 }}>
          <BrandMark />

          <div style={{ display: 'flex', marginTop: 36, fontSize: 52, fontWeight: 800, color: INK }}>
            {isReveal ? pet.name : '나의 Statling을 소개할게요!'}
          </div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 24, color: MUTED }}>
            {isReveal ? STATLING_TYPES[topStat].typeName : '미니게임으로 발견한 나의 능력에서 태어나 함께 자라고 있어요.'}
          </div>

          <div style={{ display: 'flex', marginTop: 32, gap: 12 }}>
            {isReveal ? (
              [topStat, secondaryStat].map((id) => (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    borderRadius: 999,
                    background: CARD,
                    border: `2px solid ${STAT_HEX[id]}`,
                    fontSize: 20,
                    fontWeight: 800,
                    color: INK,
                  }}
                >
                  {STATS[id].name}
                </div>
              ))
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 999,
                  background: CARD,
                  border: `2px solid ${INK}22`,
                  fontSize: 20,
                  fontWeight: 800,
                  color: INK,
                }}
              >
                {allGamePools().length}가지 미니게임
              </div>
            )}
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- Satori (ImageResponse) requires a plain <img>, not next/image */}
        <img src={imageUrl} width={480} height={480} style={{ objectFit: 'contain' }} alt="" />
      </div>
    ),
    { ...size },
  )
}
