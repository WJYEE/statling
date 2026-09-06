import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

/**
 * Common/static Open Graph image for the whole service (see spec: no
 * per-user dynamic result page/URL exists yet, so every share/link-preview
 * uses this same brand card rather than assuming a user's pet image will
 * show up automatically). Uses Next.js's built-in opengraph-image file
 * convention — Next detects this file and wires the og:image tag itself,
 * so app/layout.tsx's metadata doesn't need to reference it manually.
 * Kept to plain hex colors and system fonts (no oklch(), no custom
 * webfonts) since the Satori renderer behind ImageResponse has narrower
 * CSS support than a real browser.
 *
 * Real logo, not a placeholder shape — public/icon.svg is itself just a
 * thin `<svg><image href="data:image/png;base64,...">` wrapper around a
 * real 256x256 RGBA PNG (confirmed by inspecting its bytes directly), not a
 * true vector graphic. Satori (the renderer behind ImageResponse) has
 * narrow, inconsistent support for rendering arbitrary SVG passed to
 * `<img src>` — this codebase's own sibling route
 * (app/api/og/share/route.tsx's BrandMark) already had to fetch a plain PNG
 * by absolute URL for the exact same reason, never an SVG. Rather than fetch
 * over the network (which would also make this static route depend on
 * SITE_URL resolving correctly), the PNG bytes already embedded inside
 * icon.svg are extracted once at module load and reused as a data URI —
 * same real Statling mark, zero SVG parsing, zero network dependency.
 */
const ICON_SVG_SOURCE = readFileSync(join(process.cwd(), 'public', 'icon.svg'), 'utf8')
const ICON_PNG_BASE64 = ICON_SVG_SOURCE.match(/data:image\/png;base64,([^"']+)/)?.[1]
const ICON_DATA_URL = ICON_PNG_BASE64 ? `data:image/png;base64,${ICON_PNG_BASE64}` : undefined

// Explicit Node.js runtime — readFileSync above needs real filesystem
// access, which the default/edge runtime for this file convention doesn't
// guarantee.
export const runtime = 'nodejs'

export const alt = 'Statling — 나의 숨겨진 스탯을 발견해보세요'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
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
          background: '#f7f0e0',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          {ICON_DATA_URL && (
            // eslint-disable-next-line @next/next/no-img-element -- Satori (ImageResponse) requires a plain <img>, not next/image
            <img src={ICON_DATA_URL} width={120} height={120} style={{ objectFit: 'contain' }} alt="" />
          )}
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, color: '#4a3a28' }}>
            Statling
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 40, fontSize: 40, color: '#6b5a45' }}>
          나의 숨겨진 스탯을 발견해보세요
        </div>
      </div>
    ),
    { ...size },
  )
}
