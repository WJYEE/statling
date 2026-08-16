import type { GameDifficulty } from '@/lib/game/difficulty'

/** Reaction ("Catch the Signal") tuning constants — GAME_SPEC §23-33. */
/**
 * v2: gameScore reworked to 유효시행비율 60% + 반응속도 40%, clamped 0-100
 * (was an unbounded ~1000-scale formula).
 * v3 (2026-08 difficulty rework): real trial count now a flat per-tier
 * table instead of DIFFICULTY_LOAD_MULTIPLIER applied to one base number —
 * see REACTION_REAL_TRIALS_BY_DIFFICULTY. Hard/Extreme also introduce decoy
 * flashes (see getReactionDecoyChanceForDifficulty) and False Start no
 * longer discards the attempt — see REACTION_FALSE_START_PENALTY_MS and
 * reaction-game.tsx's handleTap. The scoring FORMULA itself
 * (lib/scoring/reaction.ts) is untouched: the penalty flows in through each
 * trial's own `reactionMs` (already inflated by any false starts before it
 * succeeded), so speedScore reflects it automatically.
 */
export const REACTION_GAME_VERSION = 'reaction_v3'

export const REACTION_PRACTICE_TRIALS = 1

/** Real (scored) trial count per tier — a flat table, not a multiplier on one base number, so this reads directly as "how many trials at this tier" rather than needing the multiplier math re-derived every time. */
export const REACTION_REAL_TRIALS_BY_DIFFICULTY: Record<GameDifficulty, number> = {
  easy: 2,
  normal: 4,
  hard: 6,
  extreme: 8,
}

export function getReactionRealTrialsForDifficulty(difficulty: GameDifficulty): number {
  return REACTION_REAL_TRIALS_BY_DIFFICULTY[difficulty]
}

export const REACTION_DELAY_MS_MIN = 1500
export const REACTION_DELAY_MS_MAX = 4000

/**
 * Chance (0-1) that a given Real Trial shows a brief decoy flash partway
 * through the wait — a visually distinct stimulus the player must NOT tap.
 * Tapping it is treated exactly like a False Start (same penalty, same
 * retry) — a decoy is just another way to jump the gun, not a separate
 * judgment mechanic, so Reaction's core identity ("react to the real
 * signal, fast") stays intact even at Extreme. 0 at Easy/Normal — decoys
 * are a Hard+ feature only.
 */
export const REACTION_DECOY_CHANCE_BY_DIFFICULTY: Record<GameDifficulty, number> = {
  easy: 0,
  normal: 0,
  hard: 0.25,
  extreme: 0.45,
}

export function getReactionDecoyChanceForDifficulty(difficulty: GameDifficulty): number {
  return REACTION_DECOY_CHANCE_BY_DIFFICULTY[difficulty]
}

/** How long the decoy stimulus stays visible before disappearing (if the player doesn't tap it). */
export const REACTION_DECOY_FLASH_MS = 280
/** The decoy fires at a random point within this fraction-of-delay window (e.g. 0.35 = 35% of the way through the wait) — always well before the real signal, and never so close to it that "the decoy just disappeared" and "the real signal just appeared" could be confused. */
export const REACTION_DECOY_WINDOW = { minRatio: 0.3, maxRatio: 0.65 } as const

/** How long a Real Trial's Session-Best comparison feedback stays up before the next Trial begins automatically. */
export const REACTION_TRIAL_FEEDBACK_MS = 850

/** Anti-cheat: flag the session once this many (or more) valid trials come in at/under the threshold. */
export const REACTION_ABNORMAL_MS_THRESHOLD = 80
export const REACTION_ABNORMAL_REPEAT_COUNT = 2

/**
 * False Start policy (2026-08 rework): a false start (or a decoy tap, which
 * is treated identically) no longer discards the trial or excludes it from
 * scoring outright — the player simply retries the same trial slot, but
 * every false start before that slot's eventual real reaction adds this
 * many ms to the reactionMs that finally gets recorded for it. This lets
 * medianReactionMs/normalizedScore absorb the penalty automatically (no
 * separate scoring-formula change needed) while keeping the existing
 * false-start retry UX and `ReactionRawSummary.falseStarts` display intact.
 */
export const REACTION_FALSE_START_PENALTY_MS = 200
