/**
 * Phase 3D-2 — "관계 단계" (Stage 1-4), a pure presentation/context-layer
 * label over the EXISTING `intimacyLevel` number (lib/pet-care/leveling.ts)
 * — no new affection system, no new stored field, no change to how
 * intimacyLevel/intimacyExp themselves are calculated. This is purely a
 * `intimacyLevel (+ daysTogether) -> 1|2|3|4` mapping other code can use to
 * pick a slightly warmer dialogue variant or an optional UI label.
 *
 * Stage 4 additionally requires `daysTogether >= STAGE_4_MIN_DAYS_TOGETHER`
 * — per Phase 3D-1's own finding, intimacyLevel can currently be reached
 * purely by spamming care-action button presses in one sitting (it never
 * factors in visit frequency or elapsed time), so a level-only Stage 4 gate
 * could call a same-day pet a "오래 함께한 친구" the moment its exp crosses
 * 30. `daysTogether` (see lib/pet-care/visit-context.ts#daysSince, applied
 * to `firstMetAt`) is the one existing signal that's actually about time
 * having passed, not effort spent in a single session. Stages 1-3
 * deliberately stay single-condition (intimacyLevel only) — the spec's own
 * "과하게 복잡한 이중 조건 금지" — this dual check is Stage 4-only.
 */
export type RelationshipStage = 1 | 2 | 3 | 4

export const RELATIONSHIP_STAGE_LABEL: Record<RelationshipStage, string> = {
  1: '처음 만난 사이',
  2: '조금 친해진 사이',
  3: '익숙한 친구',
  4: '오래 함께한 친구',
}

/** Lower bound (inclusive) of intimacyLevel for Stage 2/3/4 — Stage 1 is simply "below STAGE_2_MIN_LEVEL", not a separate stored range. Matches the Phase 3D-1 proposal; the leveling curve (EXP_TO_NEXT_LEVEL_TABLE) reaches level 30 comfortably past the mid-game, so these read as a genuine slow climb rather than an instant unlock. */
const STAGE_2_MIN_LEVEL = 5
const STAGE_3_MIN_LEVEL = 15
const STAGE_4_MIN_LEVEL = 30

/** Stage 4 also requires this many local calendar days since firstMetAt — see this file's own top doc comment. */
export const STAGE_4_MIN_DAYS_TOGETHER = 14

/** Pure function — see this file's own top doc comment for why Stage 4 alone checks `daysTogether`. */
export function computeRelationshipStage(intimacyLevel: number, daysTogether: number): RelationshipStage {
  if (intimacyLevel >= STAGE_4_MIN_LEVEL && daysTogether >= STAGE_4_MIN_DAYS_TOGETHER) return 4
  if (intimacyLevel >= STAGE_3_MIN_LEVEL) return 3
  if (intimacyLevel >= STAGE_2_MIN_LEVEL) return 2
  return 1
}
