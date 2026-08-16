import type { GameDifficulty } from '@/lib/game/difficulty'

/**
 * A game's own best `normalizedScore` at Normal must reach this before Hard
 * unlocks. Lowered from 70 to 60 alongside the 2026-08 difficulty-structure
 * rework (every game's Easy-Extreme now differs by real content, not just a
 * time/load multiplier, so a game's *own* Normal ceiling is a meaningfully
 * harder bar than before at the same raw number) — see lib/game/
 * difficulty-unlock.ts#unlockHintFor for the matching player-facing copy,
 * which reads this constant directly rather than repeating the number.
 */
export const NORMAL_TO_HARD_SCORE = 60
/**
 * A game's own best `normalizedScore` at Hard must reach this before
 * Extreme unlocks. Lowered from 80 to 70 — same rework note as
 * NORMAL_TO_HARD_SCORE above.
 */
export const HARD_TO_EXTREME_SCORE = 70

/**
 * The shared "how much time/budget do you get" multiplier — applied to any
 * per-game config constant that means "how long until X" (a time limit,
 * flash/exposure duration, change interval, ...). Bigger = more time =
 * easier. Every game that has a natural time-budget knob scales it by this
 * (see each lib/config/*.config.ts's own getXFor Difficulty helper) rather
 * than inventing a bespoke curve — this is the "공통 난이도 배율" approach.
 */
export const DIFFICULTY_TIME_MULTIPLIER: Record<GameDifficulty, number> = {
  easy: 1.35,
  normal: 1,
  hard: 0.8,
  extreme: 0.65,
}

/**
 * The shared "how much stuff/pressure" multiplier — applied to any per-game
 * config constant that means "how much load" (obstacle speed, round/trial
 * count, required precision, ...). Bigger = more load = harder. The inverse
 * axis of DIFFICULTY_TIME_MULTIPLIER — a game only ever uses whichever of
 * the two actually fits the constant it's scaling.
 */
export const DIFFICULTY_LOAD_MULTIPLIER: Record<GameDifficulty, number> = {
  easy: 0.7,
  normal: 1,
  hard: 1.25,
  extreme: 1.5,
}
