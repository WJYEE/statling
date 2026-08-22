import type { SupabaseClient } from '@supabase/supabase-js'
import type { RankedDifficulty } from '@/lib/ranking/ranking-provider'

/**
 * Phase 3B-7 — real Per-Game Ranking data layer, backed by the 2 SECURITY
 * DEFINER RPCs Phase 3B-7 shipped (get_game_leaderboard_top,
 * get_my_game_rank). Same shape as lib/ranking/xp-leaderboard.ts and
 * lib/ranking/overall-leaderboard.ts, for the same reason: two independent,
 * un-mergeable RPC calls, no user_id returned (duplicate nicknames are
 * allowed — Phase 3B-2), so this is deliberately NOT wedged into
 * lib/ranking/ranking-provider.ts's `RankingProvider` interface.
 *
 * Unlike XP/Overall, this ranks by each game's own real raw metric (never
 * normalizedScore) — see lib/ranking/game-ranking-metrics.config.ts, the
 * SAME config this data layer's callers should use to format
 * recordValue/tiebreakValue for display (this file only normalizes the RPC
 * row shape; it never formats or re-derives metric semantics itself).
 */

export interface GameLeaderboardEntry {
  rank: number
  nickname: string
  recordValue: number
  tiebreakValue: number | null
}

export interface MyGameRank {
  rank: number
  nickname: string
  recordValue: number
  tiebreakValue: number | null
}

interface GameRankRpcRow {
  rank: number
  nickname: string
  record_value: number
  tiebreak_value: number | null
}

function normalize(row: GameRankRpcRow): GameLeaderboardEntry {
  return { rank: row.rank, nickname: row.nickname, recordValue: row.record_value, tiebreakValue: row.tiebreak_value ?? null }
}

/** Supabase's PostgrestError is a plain object, not an Error instance — same shape lib/ranking/xp-leaderboard.ts's errorMessage() already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

export type GameLeaderboardResult =
  | { ok: true; entries: GameLeaderboardEntry[]; myRank: MyGameRank | null }
  | { ok: false; error: string }

/**
 * Fetches the Top 100 list and the caller's own exact rank for one
 * gameId + difficulty (Hard/Extreme only — Easy/Normal safely return zero
 * rows server-side, never called by this app's own UI) in parallel.
 * `myRank` is `null` whenever get_my_game_rank() returns zero rows (not
 * signed in, no nickname yet, or no current-season record at this exact
 * game+difficulty — see that RPC's own doc comment) — never treated as an
 * error by this function.
 */
export async function fetchGameLeaderboard(
  client: SupabaseClient,
  gameId: string,
  difficulty: RankedDifficulty,
  limit = 100,
): Promise<GameLeaderboardResult> {
  const [topResult, myRankResult] = await Promise.all([
    client.rpc('get_game_leaderboard_top', { p_game_id: gameId, p_difficulty: difficulty, p_limit: limit }),
    client.rpc('get_my_game_rank', { p_game_id: gameId, p_difficulty: difficulty }),
  ])

  if (topResult.error) return { ok: false, error: errorMessage(topResult.error) }
  if (myRankResult.error) return { ok: false, error: errorMessage(myRankResult.error) }

  const entries = ((topResult.data as GameRankRpcRow[] | null) ?? []).map(normalize)
  const myRankRow = (myRankResult.data as GameRankRpcRow[] | null)?.[0]

  return { ok: true, entries, myRank: myRankRow ? normalize(myRankRow) : null }
}
