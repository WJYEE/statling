/**
 * Care/intimacy leveling — deliberately separate from the unrelated 6-stat
 * cognitive "성장" (growth) system (GrowScreen/egg-growth.ts). Naming here
 * (`intimacyLevel`/`intimacyExp`) never reuses "성장"/"growth" wording so the
 * two systems stay unambiguous in UI copy and code.
 */

/** exp required to go from level N to N+1 — index 0 is Lv1→2. Uncapped levels beyond the table fall back to a formula. */
const EXP_TO_NEXT_LEVEL_TABLE = [20, 40, 70, 110, 160, 220, 290, 370, 460]

/**
 * Hard ceiling on `intimacyLevel` — a future evolve system may key off
 * specific levels, but nothing about evolution is implemented here; this
 * only stops the level number itself from climbing forever. XP is
 * deliberately NOT capped: `applyExpGain` keeps accumulating `intimacyExp`
 * past this point (see its loop guard below), it just stops converting that
 * XP into further levels once MAX_LEVEL is reached. Display code should use
 * `formatLevelLabel` rather than reading `intimacyLevel` directly, so
 * pre-existing saved data that (hypothetically) already exceeds this still
 * reads as "Lv.100 MAX" instead of an over-cap number.
 */
export const MAX_LEVEL = 100

/** `Lv.42`, or `Lv.100 MAX` once `level` reaches/exceeds MAX_LEVEL — the one place every "Lv.N" display should go through, so a stray pre-cap save value never renders past the cap. */
export function formatLevelLabel(level: number): string {
  return level >= MAX_LEVEL ? `Lv.${MAX_LEVEL} MAX` : `Lv.${level}`
}

export function expRequiredForLevel(level: number): number {
  const index = level - 1
  if (index < EXP_TO_NEXT_LEVEL_TABLE.length) return EXP_TO_NEXT_LEVEL_TABLE[index]
  // Beyond the hand-tuned table: keep the same upward curve going (+90 per level over the last table step).
  const last = EXP_TO_NEXT_LEVEL_TABLE[EXP_TO_NEXT_LEVEL_TABLE.length - 1]
  const stepsPastTable = index - (EXP_TO_NEXT_LEVEL_TABLE.length - 1)
  return last + stepsPastTable * 90
}

export interface ExpGainResult {
  level: number
  exp: number
  leveledUp: boolean
  /** Every level actually crossed this gain (usually 0 or 1 entries, but a huge gain could cross several). */
  levelsGained: number[]
}

export function applyExpGain(current: { intimacyLevel: number; intimacyExp: number }, gained: number): ExpGainResult {
  let level = current.intimacyLevel
  let exp = current.intimacyExp + Math.max(0, gained)
  const levelsGained: number[] = []

  let needed = expRequiredForLevel(level)
  while (level < MAX_LEVEL && exp >= needed) {
    exp -= needed
    level += 1
    levelsGained.push(level)
    needed = expRequiredForLevel(level)
  }

  return { level, exp, leveledUp: levelsGained.length > 0, levelsGained }
}

export type RewardType = 'dialogueTone' | 'idleMotion' | 'accessorySlot' | 'roomItem' | 'expression'

export interface RewardUnlock {
  level: number
  type: RewardType
  id: string
  title: string
  description: string
}

/**
 * Extensible unlock table. Lv2's tone shift is actually driven by
 * DialogueLine's own `minIntimacyLevel` filter (see dialogue.ts) and Lv3
 * swaps in a real idle motion variant, so those two toasts announce content
 * that truly exists. The accessory slot / room item / special expression
 * payloads for Lv5/7/10 are still future scope — `type` marks where that
 * content will plug in once built — so their copy must NOT claim something
 * was unlocked; it only celebrates the milestone and is upfront that the
 * feature itself is still coming. Do not swap these three back to "해금!"
 * wording until the actual payload ships, or the milestone becomes another
 * empty promise (see leveling.ts's usage in pet-care-storage.ts).
 */
export const REWARD_UNLOCKS: RewardUnlock[] = [
  { level: 2, type: 'dialogueTone', id: 'lv2-casual-tone', title: '더 친근한 말투 해금!', description: '이제 조금 더 편하게 이야기해줄 거예요.' },
  { level: 3, type: 'idleMotion', id: 'lv3-idle-variant', title: '새로운 몸짓 해금!', description: '가만히 있을 때도 표정이 더 다양해졌어요.' },
  { level: 5, type: 'accessorySlot', id: 'lv5-accessory-slot', title: '친밀도 Lv.5 달성!', description: '액세서리로 꾸미는 기능은 아직 준비 중이에요. 조금만 기다려주세요.' },
  { level: 7, type: 'roomItem', id: 'lv7-room-item', title: '친밀도 Lv.7 달성!', description: '방 꾸미기 전용 아이템은 아직 준비 중이에요. 조금만 기다려주세요.' },
  { level: 10, type: 'expression', id: 'lv10-expression', title: '친밀도 Lv.10 달성!', description: '특별한 표정은 아직 준비 중이에요. 조금만 기다려주세요.' },
]

/** Rewards newly crossed between fromLevel(exclusive) and toLevel(inclusive), minus ones already granted. */
export function getNewlyUnlockedRewards(fromLevel: number, toLevel: number, already: number[]): RewardUnlock[] {
  if (toLevel <= fromLevel) return []
  return REWARD_UNLOCKS.filter(
    (reward) => reward.level > fromLevel && reward.level <= toLevel && !already.includes(reward.level),
  )
}
