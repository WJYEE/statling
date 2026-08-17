import { formatLevelLabel } from '@/lib/pet-care/leveling'
import type { ShareStatlingInput } from '@/lib/share/share-types'
import type { ShareContext } from '@/lib/analytics/ga'

/** Dev-only placeholder — only reached if NEXT_PUBLIC_APP_URL is unset AND window.location is unavailable (e.g. this ran during SSR), which real callers (always client-side, inside a click handler) should never hit. */
const DEV_URL_FALLBACK = 'http://localhost:3000'

/** Fixed UTM triple for every link Statling's own share features generate — see lib/analytics/ga.ts's ShareContext for utm_content, the one part that varies per surface. */
const SHARE_UTM_SOURCE = 'statling_share'
const SHARE_UTM_MEDIUM = 'referral'
const SHARE_UTM_CAMPAIGN = 'user_share'

/**
 * Resolves the link to put in a share, then stamps it with Statling's
 * share-attribution UTM (utm_source=statling_share, utm_medium=referral,
 * utm_campaign=user_share, utm_content=`context`) so a visit that arrives
 * via this link is attributable in GA4 all the way through to
 * assessment_start. `context` reuses the exact same ShareContext value
 * already sent as share_click/share_success's own `share_context` param —
 * see lib/analytics/ga.ts — so the two never drift into different enums for
 * what's conceptually the same "where was this shared from" dimension.
 *
 * Base URL resolution priority (unchanged from before UTM was added):
 *  1. an explicit override (ShareStatlingInput.url)
 *  2. NEXT_PUBLIC_APP_URL (the deployed URL, set at build time)
 *  3. window.location.origin (works in any environment without the env var)
 *  4. a hardcoded dev fallback (last resort, never expected in practice)
 *
 * Uses the URL API (not string concatenation) to attach the UTM params, so
 * a base URL that already carries a query string is merged safely rather
 * than risking a double `?` or clobbering existing params — not a case any
 * current caller hits (every share URL today is path-only), but this stays
 * correct regardless.
 */
export function buildShareUrl(explicitUrl: string | undefined, context: ShareContext): string {
  const base =
    explicitUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' && window.location?.origin) ||
    DEV_URL_FALLBACK

  const url = new URL(base)
  url.searchParams.set('utm_source', SHARE_UTM_SOURCE)
  url.searchParams.set('utm_medium', SHARE_UTM_MEDIUM)
  url.searchParams.set('utm_campaign', SHARE_UTM_CAMPAIGN)
  url.searchParams.set('utm_content', context)
  return url.toString()
}

export function buildShareTitle(): string {
  return '나의 스탯링이 태어났어요!'
}

/**
 * The share body. Every field is optional-safe — missing pet/stat data never
 * throws, it just quietly drops that line (or substitutes a generic name)
 * rather than producing "undefined" in the shared text.
 */
export function buildShareText(input: Partial<ShareStatlingInput>): string {
  const petName = input.petName?.trim() || '알 수 없는 스탯링'
  const primaryStat = input.primaryStat?.trim()
  const secondaryStat = input.secondaryStat?.trim()

  const lines = [`나의 대표 스탯링은 '${petName}'예요!`, '']
  if (primaryStat) lines.push(`⚡ 주 스탯: ${primaryStat}`)
  if (secondaryStat) lines.push(`⚖ 보조 스탯: ${secondaryStat}`)
  lines.push('', '6개의 두뇌 능력을 분석해', '나만의 스탯링을 만나보세요.')

  return lines.join('\n')
}

/** Data for the MyPage "친구에게 공유" invite card's title/text — the currently-raised companion, never the initial diagnosis result (see build-friend-invite-text's sibling buildShareText above for that). */
export interface FriendInviteTextInput {
  statlingName: string
  characterName: string
  level: number
}

export function buildFriendInviteTitle(): string {
  return '같이 Statling 키우고 미니게임 하자!'
}

/** The share body for MyPage's friend-invite card — mirrors buildShareText's optional-safe style, but introduces the currently-raised pet (name/species/level) instead of a diagnosis result. */
export function buildFriendInviteText(input: Partial<FriendInviteTextInput>): string {
  const statlingName = input.statlingName?.trim() || '내 스탯링'
  const characterName = input.characterName?.trim()
  const level = input.level

  const lines = [
    characterName ? `🐣 내가 키우는 '${statlingName}'(${characterName})이에요!` : `🐣 내가 키우는 '${statlingName}'이에요!`,
    '',
  ]
  if (level != null) lines.push(`🌱 현재 ${formatLevelLabel(level)}`)
  lines.push('', '같이 Statling 키우고', '미니게임도 함께 해요!')

  return lines.join('\n')
}
