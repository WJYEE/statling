import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3B-6 — real Overall Ranking data layer, backed by the 2 SECURITY
 * DEFINER RPCs Phase 3B-5 shipped (get_overall_leaderboard_top,
 * get_my_overall_rank). Mirrors lib/ranking/xp-leaderboard.ts's shape
 * exactly, for the same reason: the real RPCs are two independent,
 * un-mergeable calls (Top N never includes rows beyond the limit; "my rank"
 * can be outside it entirely) and never return a user_id to match "me" by
 * (duplicate nicknames are allowed — Phase 3B-2), so this is deliberately
 * NOT wedged into lib/ranking/ranking-provider.ts's `RankingProvider`
 * interface (that interface's `OverallRankingEntry.isMe` bakes in exactly
 * the per-row identification this RPC pair can't safely support). 게임별
 * 랭킹 keeps using rankingProvider exactly as before — untouched here.
 */

export interface OverallLeaderboardEntry {
  rank: number
  nickname: string
  overallScore: number
}

export interface MyOverallRank {
  rank: number
  nickname: string
  overallScore: number
}

interface OverallRankRpcRow {
  rank: number
  nickname: string
  overall_score: number
}

function normalize(row: OverallRankRpcRow): OverallLeaderboardEntry {
  return { rank: row.rank, nickname: row.nickname, overallScore: row.overall_score }
}

/** Supabase's PostgrestError is a plain object, not an Error instance — same shape lib/ranking/xp-leaderboard.ts's errorMessage() already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

export type OverallLeaderboardResult =
  | { ok: true; entries: OverallLeaderboardEntry[]; myRank: MyOverallRank | null }
  | { ok: false; error: string }

/**
 * Fetches the Top 100 list and the caller's own exact rank in parallel — the
 * two RPCs are fully independent of each other, so there's no reason to
 * serialize them. `myRank` is `null` whenever get_my_overall_rank() returns
 * zero rows (not signed in, no nickname yet, or no confirmed pet yet — see
 * that RPC's own doc comment) — never treated as an error by this function.
 */
export async function fetchOverallLeaderboard(client: SupabaseClient, limit = 100): Promise<OverallLeaderboardResult> {
  const [topResult, myRankResult] = await Promise.all([
    client.rpc('get_overall_leaderboard_top', { p_limit: limit }),
    client.rpc('get_my_overall_rank'),
  ])

  if (topResult.error) return { ok: false, error: errorMessage(topResult.error) }
  if (myRankResult.error) return { ok: false, error: errorMessage(myRankResult.error) }

  const entries = ((topResult.data as OverallRankRpcRow[] | null) ?? []).map(normalize)
  const myRankRow = (myRankResult.data as OverallRankRpcRow[] | null)?.[0]

  return { ok: true, entries, myRank: myRankRow ? normalize(myRankRow) : null }
}
