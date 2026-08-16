import { PLAY_ORDER, type RawRecord, type StatId } from '@/lib/brain-bet'
import { GAME_DIFFICULTY_ORDER, type GameDifficulty } from '@/lib/game/difficulty'
import { CURRENT_RANKING_SEASON } from '@/lib/ranking/ranking-season'
import { clampScore, isBetterByGameScore } from '@/lib/scoring/shared'

/**
 * One mini-game's best-ever performance AT ONE DIFFICULTY TIER. REUSES the
 * game's own already-validated `gameScore` (0-100, see
 * lib/game/types.ts#BaseGameResult) as `normalizedScore` rather than
 * recomputing anything from raw accuracy/response-time fields. `gameId`
 * here is the *specific* registered game (a
 * lib/game/game-registry.ts#GamePoolEntry.key, e.g. 'memory-story-recall'),
 * not the stat category — game-flow.tsx's `activeGameKey` state already
 * tracks exactly this and is threaded straight through.
 */
export interface MiniGamePerformanceRecord {
  completionId: string
  gameId: string
  statCategory: StatId
  difficulty: GameDifficulty
  normalizedScore: number
  completedAt: string
  /**
   * The same per-game display record CompleteScreen shows (e.g. "평균
   * 205ms" / "정답률 92%") — optional because records saved before this
   * field existed have none. Lets lib/ranking/ranking-provider.ts's
   * per-game leaderboard show a real raw metric for "나" instead of just
   * the normalized 0-100 score.
   */
  raw?: RawRecord
  /**
   * Flat numeric metrics bag (e.g. `{ medianReactionMs: 214, consistency: 38 }`)
   * this exact completion produced — the raw material
   * lib/ranking/game-ranking-metrics.config.ts's per-game metric defs read
   * from to rank/tie-break a per-game leaderboard by that game's own real
   * metric instead of the normalized 0-100 score. Optional because records
   * saved before this field existed have none.
   */
  metrics?: Record<string, number>
  /**
   * The CURRENT_RANKING_SEASON value at the moment this record was written
   * (see lib/ranking/ranking-season.ts) — lets the leaderboard read path
   * tell "set under the current game rules" apart from "set before a
   * difficulty-structure rework," without touching the unlock check at all.
   * Optional/undefined for every record written before this field existed —
   * always treated as pre-current-season, never coerced to a real number.
   */
  recordVersion?: number
}

function recordKey(gameId: string, difficulty: GameDifficulty): string {
  return `${gameId}:${difficulty}`
}

/**
 * Cross-session ledger of "how well have I actually played," kept
 * deliberately separate from lib/game/stat-status.ts's StatStatusMap
 * (in-memory-only, resets every reload, and tracks one cross-game
 * best-per-*stat*) and from lib/pets/pet-storage.ts's StoredPetProfile
 * (initialFinals/latestFinals — the hatch-time snapshot, untouched by this
 * file). `currentStats` (a category's real-skill average) is deliberately
 * NOT stored here — it's always derived fresh via computeCurrentStats, so
 * there is exactly one source of truth and no risk of the two drifting
 * apart.
 *
 * v2: one best record PER (gameId, difficulty) pair, not one overall best
 * per game — needed so Hard/Extreme unlock checks (lib/game/
 * difficulty-unlock.ts) can read "what's my best at exactly this tier,"
 * and so the representative record (getRepresentativeRecord) can apply the
 * "highest difficulty *attempted*, not highest score" rule from spec §18.
 */
export interface PlayerSkillState {
  version: 2
  /** Keyed by `${gameId}:${difficulty}` — see recordKey. */
  gameDifficultyBestRecords: Record<string, MiniGamePerformanceRecord>
  /** Idempotency ledger (see recordMiniGameCompletion) — capped, not a full history. */
  processedCompletionIds: string[]
  updatedAt: string
}

const STORAGE_KEY = 'statling.playerSkill.v1' // key unchanged across v1->v2 — migrateToV2 below reshapes old data in place rather than abandoning it under a new key
/** processedCompletionIds is a dedupe window, not an audit log — this comfortably outlives any realistic burst of accidental duplicate calls (Strict Mode double-invoke, a few stray re-renders) without growing unbounded across a long play history. */
const MAX_PROCESSED_IDS = 200

export function createDefaultPlayerSkillState(): PlayerSkillState {
  return { version: 2, gameDifficultyBestRecords: {}, processedCompletionIds: [], updatedAt: new Date(0).toISOString() }
}

/** Structural check for a parsed `RawRecord` — `raw`/`metrics` below are untrusted JSON, same defensive-parse posture as every other field in this function. */
function isValidRaw(value: unknown): value is RawRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.primary !== 'string') return false
  return v.secondary === undefined || typeof v.secondary === 'string'
}

function isValidMetrics(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object') return false
  return Object.values(value as Record<string, unknown>).every((n) => typeof n === 'number')
}

/**
 * v1 (pre-difficulty) records had no `difficulty` field and were keyed
 * directly by gameId. Every real v1 record came from what is now called
 * 'normal' (the only tier that existed), so migration re-keys each one to
 * `${gameId}:normal` and stamps difficulty:'normal' — a real player's
 * existing best score is preserved exactly, not reset to zero.
 *
 * Despite the name, this runs on EVERY load (see loadPlayerSkillState below
 * — there's no `parsed.version === 2` short-circuit), not just a real v1->v2
 * upgrade, so it doubles as this file's general load-time reconstruction/
 * validation pass. That's exactly why `raw`/`metrics`/`recordVersion` must
 * be carried through here rather than left off the rebuilt `record` object:
 * dropping them was a real bug — every record's own raw display
 * (grow-game-screen.tsx's "최고 기록: ...") silently went back to "아직 기록이
 * 없어요." the very next time this ran, and a record's `recordVersion` tag
 * (see lib/ranking/ranking-season.ts) would silently vanish on reload too,
 * incorrectly dropping an up-to-date record out of the current-season
 * leaderboard — even though `savePlayerSkillState`/`recordMiniGameCompletion`
 * had written all three correctly and they were sitting right there in the
 * parsed JSON. Unlock detection (isDifficultyUnlocked/getBestScoreAtDifficulty)
 * was never affected either way — it only ever reads `normalizedScore`,
 * which this function did already carry through.
 */
function migrateToV2(parsed: Record<string, unknown>): PlayerSkillState {
  const fallback = createDefaultPlayerSkillState()
  const rawBest = parsed.gameDifficultyBestRecords ?? parsed.gameBestRecords
  if (!rawBest || typeof rawBest !== 'object') return fallback

  const gameDifficultyBestRecords: Record<string, MiniGamePerformanceRecord> = {}
  for (const [key, value] of Object.entries(rawBest as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    if (typeof v.gameId !== 'string' || typeof v.statCategory !== 'string' || typeof v.normalizedScore !== 'number') continue
    const difficulty: GameDifficulty =
      typeof v.difficulty === 'string' && (GAME_DIFFICULTY_ORDER as string[]).includes(v.difficulty)
        ? (v.difficulty as GameDifficulty)
        : 'normal' // v1 records (or malformed data) default to 'normal', the only tier that existed pre-migration
    const record: MiniGamePerformanceRecord = {
      completionId: typeof v.completionId === 'string' ? v.completionId : `migrated_${key}`,
      gameId: v.gameId,
      statCategory: v.statCategory as StatId,
      difficulty,
      normalizedScore: clampScore(v.normalizedScore),
      completedAt: typeof v.completedAt === 'string' ? v.completedAt : fallback.updatedAt,
      // This function runs on every load (not just a true v1->v2 migration —
      // see loadPlayerSkillState below), so these three must be carried
      // forward explicitly or a normal reload would silently erase a
      // player's own raw record / leaderboard metrics / ranking-season tag.
      raw: isValidRaw(v.raw) ? v.raw : undefined,
      metrics: isValidMetrics(v.metrics) ? v.metrics : undefined,
      recordVersion: typeof v.recordVersion === 'number' ? v.recordVersion : undefined,
    }
    gameDifficultyBestRecords[recordKey(record.gameId, record.difficulty)] = record
  }

  const processedCompletionIds = Array.isArray(parsed.processedCompletionIds)
    ? (parsed.processedCompletionIds as unknown[]).filter((id): id is string => typeof id === 'string').slice(-MAX_PROCESSED_IDS)
    : []
  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt

  return { version: 2, gameDifficultyBestRecords, processedCompletionIds, updatedAt }
}

export function loadPlayerSkillState(): PlayerSkillState {
  if (typeof window === 'undefined') return createDefaultPlayerSkillState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultPlayerSkillState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return createDefaultPlayerSkillState()
    return migrateToV2(parsed)
  } catch {
    return createDefaultPlayerSkillState()
  }
}

export function savePlayerSkillState(state: PlayerSkillState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export interface RecordCompletionInput {
  completionId: string
  gameId: string
  statCategory: StatId
  difficulty: GameDifficulty
  normalizedScore: number
  completedAt: string
  raw?: RawRecord
  metrics?: Record<string, number>
}

export interface RecordCompletionResult {
  state: PlayerSkillState
  /** False when completionId was already processed (see the idempotency doc below) — every other field is unchanged from the input state in that case. */
  applied: boolean
}

/**
 * Idempotent entry point for "one mini-game finished." Safe to call more
 * than once with the *same* completionId (React Strict Mode double-invoke,
 * a duplicate click before UI disables, re-entering a result screen, ...) —
 * only the first call for a given completionId has any effect; every repeat
 * is a no-op (`applied: false`). The caller (game-flow.tsx) is responsible
 * for generating a completionId that stays stable across accidental
 * repeats of the *same* logical completion but changes for a genuinely new
 * one — see game-flow.tsx's `currentAttemptIdRef`.
 *
 * Within a single completionId, gameDifficultyBestRecords[gameId:difficulty]
 * only ever improves: a new normalizedScore replaces the stored one exactly
 * when isBetterByGameScore says so (lib/scoring/shared.ts — the same
 * "higher gameScore wins" rule the rest of the app's Personal Best logic
 * already uses), so replaying a tier with a lower score never lowers that
 * tier's best.
 */
export function recordMiniGameCompletion(
  state: PlayerSkillState,
  input: RecordCompletionInput,
): RecordCompletionResult {
  if (state.processedCompletionIds.includes(input.completionId)) {
    return { state, applied: false }
  }

  const key = recordKey(input.gameId, input.difficulty)
  const existing = state.gameDifficultyBestRecords[key]
  const shouldReplace = !existing || isBetterByGameScore(input.normalizedScore, existing.normalizedScore)

  const gameDifficultyBestRecords = shouldReplace
    ? {
        ...state.gameDifficultyBestRecords,
        [key]: {
          completionId: input.completionId,
          gameId: input.gameId,
          statCategory: input.statCategory,
          difficulty: input.difficulty,
          normalizedScore: clampScore(input.normalizedScore),
          completedAt: input.completedAt,
          raw: input.raw,
          metrics: input.metrics,
          recordVersion: CURRENT_RANKING_SEASON,
        },
      }
    : state.gameDifficultyBestRecords

  const processedCompletionIds = [...state.processedCompletionIds, input.completionId].slice(-MAX_PROCESSED_IDS)

  return {
    applied: true,
    state: { ...state, gameDifficultyBestRecords, processedCompletionIds, updatedAt: input.completedAt },
  }
}

/** This game's best score at exactly one difficulty tier, or null if never played at that tier. Used by lib/game/difficulty-unlock.ts. */
export function getBestScoreAtDifficulty(
  state: PlayerSkillState,
  gameId: string,
  difficulty: GameDifficulty,
): number | null {
  return state.gameDifficultyBestRecords[recordKey(gameId, difficulty)]?.normalizedScore ?? null
}

/**
 * One game's stored record at EXACTLY one difficulty tier — unlike
 * getRepresentativeRecord below, this never falls back to a different tier.
 * Used by ranking (lib/ranking/ranking-provider.ts) to keep Hard and
 * Extreme leaderboards fully separate rather than collapsing them into one
 * "whichever tier was attempted" record.
 */
export function getRecordAtDifficulty(
  state: PlayerSkillState,
  gameId: string,
  difficulty: GameDifficulty,
): MiniGamePerformanceRecord | null {
  return state.gameDifficultyBestRecords[recordKey(gameId, difficulty)] ?? null
}

/** Every registered game's stored record at EXACTLY one difficulty tier (see getRecordAtDifficulty), keyed by gameId — games never played at that tier are simply absent, not backfilled from another tier. */
export function getAllRecordsAtDifficulty(
  state: PlayerSkillState,
  difficulty: GameDifficulty,
): Record<string, MiniGamePerformanceRecord> {
  const byGameId: Record<string, MiniGamePerformanceRecord> = {}
  for (const record of Object.values(state.gameDifficultyBestRecords)) {
    if (record.difficulty === difficulty) byGameId[record.gameId] = record
  }
  return byGameId
}

/**
 * One game's representative record (spec §18): the best record from the
 * HIGHEST difficulty tier the player has ever attempted at this game,
 * EXCLUDING Easy (practice-only, never a representative record) — not
 * simply "the highest score across all tiers." E.g. Normal 84 / Hard 70 ->
 * representative is the Hard record (70), because Hard is the higher tier
 * actually reached, even though its score is lower. Null if the game has
 * never been played at Normal or above.
 */
export function getRepresentativeRecord(state: PlayerSkillState, gameId: string): MiniGamePerformanceRecord | null {
  for (let i = GAME_DIFFICULTY_ORDER.length - 1; i >= 0; i--) {
    const difficulty = GAME_DIFFICULTY_ORDER[i]
    if (difficulty === 'easy') continue
    const record = state.gameDifficultyBestRecords[recordKey(gameId, difficulty)]
    if (record) return record
  }
  return null
}

/** Every registered game's representative record (see getRepresentativeRecord), keyed by gameId — the shape StatusScreen's per-stat breakdown reads. */
export function getAllRepresentativeRecords(state: PlayerSkillState): Record<string, MiniGamePerformanceRecord> {
  const byGameId = new Map<string, MiniGamePerformanceRecord>()
  for (const record of Object.values(state.gameDifficultyBestRecords)) {
    if (record.difficulty === 'easy') continue
    const current = byGameId.get(record.gameId)
    if (!current || GAME_DIFFICULTY_ORDER.indexOf(record.difficulty) >= GAME_DIFFICULTY_ORDER.indexOf(current.difficulty)) {
      // ">=": when two records tie on tier rank this can't actually happen (one gameId+difficulty is one key), so this only ever fires when record's tier is strictly higher than current's — kept as >= defensively rather than assuming key uniqueness here too.
      byGameId.set(record.gameId, record)
    }
  }
  return Object.fromEntries(byGameId)
}

/**
 * currentStats["카테고리 평균"]: the average of that category's registered
 * games' REPRESENTATIVE record (spec §18's highest-difficulty-attempted
 * rule, Easy excluded), one score per gameId (a game played 50 times still
 * contributes exactly once) — so no category can be inflated just by
 * grinding one game or one easy tier, and a category with more registered
 * games isn't automatically favored over one with fewer, since each game
 * contributes one score regardless of how many siblings it has. No
 * weighting by difficulty tier — spec §18 explicitly rules that out.
 *
 * A stat with zero recorded (Normal+) games yet falls back to
 * `initialStats[stat]` (the Intro diagnostic) rather than showing 0 or a
 * fake value — real data, just not from repeated play — see StatusScreen's
 * "최초 진단값" display for why this reads better than either alternative.
 */
export function computeCurrentStats(
  state: PlayerSkillState,
  initialStats: Record<StatId, number>,
): Record<StatId, number> {
  const representatives = getAllRepresentativeRecords(state)
  const scoresByStat: Record<StatId, number[]> = Object.fromEntries(
    PLAY_ORDER.map((stat) => [stat, [] as number[]]),
  ) as Record<StatId, number[]>

  for (const record of Object.values(representatives)) {
    scoresByStat[record.statCategory].push(record.normalizedScore)
  }

  return Object.fromEntries(
    PLAY_ORDER.map((stat) => {
      const scores = scoresByStat[stat]
      if (scores.length === 0) return [stat, clampScore(initialStats[stat] ?? 0)]
      const average = scores.reduce((sum, v) => sum + v, 0) / scores.length
      return [stat, clampScore(average)]
    }),
  ) as Record<StatId, number>
}

/** How many distinct registered games actually contributed a representative record to a stat's current average. */
export function countContributingGames(state: PlayerSkillState, stat: StatId): number {
  return Object.values(getAllRepresentativeRecords(state)).filter((record) => record.statCategory === stat).length
}
