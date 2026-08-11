import { formatLevelLabel } from '@/lib/pet-care/leveling'
import type { ShareStatlingInput } from '@/lib/share/share-types'

/** Dev-only placeholder — only reached if NEXT_PUBLIC_APP_URL is unset AND window.location is unavailable (e.g. this ran during SSR), which real callers (always client-side, inside a click handler) should never hit. */
const DEV_URL_FALLBACK = 'http://localhost:3000'

/**
 * Resolves the link to put in a share. Priority:
 *  1. an explicit override (ShareStatlingInput.url)
 *  2. NEXT_PUBLIC_APP_URL (the deployed URL, set at build time)
 *  3. window.location.origin (works in any environment without the env var)
 *  4. a hardcoded dev fallback (last resort, never expected in practice)
 */
export function buildShareUrl(explicitUrl?: string): string {
  if (explicitUrl) return explicitUrl

  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return DEV_URL_FALLBACK
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

  const lines = [`🧠 나의 대표 스탯링은 '${petName}'예요!`, '']
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
