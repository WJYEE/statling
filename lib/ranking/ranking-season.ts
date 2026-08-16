/**
 * Bumped whenever a mini-game's difficulty structure/scoring changes enough
 * that an old score is no longer comparable to a new one at the "same"
 * difficulty tier (e.g. the 2026-08 rework: Easy-Extreme now differ by real
 * content, not just a time/load multiplier, and several games' scoring
 * formulas changed shape). Every record written by
 * lib/game/player-skill-storage.ts#recordMiniGameCompletion is stamped with
 * whatever this constant is at write time — see
 * MiniGamePerformanceRecord.recordVersion.
 *
 * This is deliberately NOT a difficulty-unlock reset: `isDifficultyUnlocked`
 * (lib/game/difficulty-unlock.ts) reads `gameDifficultyBestRecords` directly
 * and never checks `recordVersion`, so a player who already unlocked
 * Hard/Extreme keeps that unlock even though her *old* record can no longer
 * win a *new* Hard/Extreme leaderboard. Only the leaderboard read path
 * (lib/ranking/ranking-provider.ts#getGameRanking) filters by this — "나"
 * simply doesn't appear on the current-season leaderboard until she sets a
 * fresh record under the new rules. Old sub-current-season records are never
 * deleted (still readable via getRecordAtDifficulty for "내 최고 기록" on
 * the difficulty-select screen — a player's own past best is still her own
 * past best, whatever version it was set under), just excluded from ranking.
 */
export const CURRENT_RANKING_SEASON = 2
