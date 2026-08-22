import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3B-4 — real XP leaderboard data layer, backed by the 2 SECURITY
 * DEFINER RPCs Phase 3B-3 already shipped (get_xp_leaderboard_top,
 * get_my_xp_rank). Deliberately NOT wedged into lib/ranking/ranking-provider.ts's
 * `RankingProvider` interface: that interface's `XpRankingEntry` bakes in an
 * `isMe` flag computed by finding "my" id inside one merged array — the real
 * RPCs are two independent, un-mergeable calls (Top N never includes rows
 * beyond the limit; "my rank" can be outside it entirely) and never return a
 * user_id to match "me" by (see get_xp_leaderboard_top's own doc comment —
 * duplicate nicknames make "isMe" by nickname unsafe). Forcing that shape
 * here would just reintroduce the exact per-row highlight problem the Phase
 * 3B-3 RPCs were deliberately designed to avoid. rankingProvider itself is
 * untouched — 종합/게임별 랭킹 keep using it exactly as before.
 */

export interface XpLeaderboardEntry {
  rank: number
  nickname: string
  totalXp: number
}

export interface MyXpRank {
  rank: number
  nickname: string
  totalXp: number
}

interface XpRankRpcRow {
  rank: number
  nickname: string
  total_xp: number
}

function normalize(row: XpRankRpcRow): XpLeaderboardEntry {
  return { rank: row.rank, nickname: row.nickname, totalXp: row.total_xp }
}

/** Supabase's PostgrestError is a plain object, not an Error instance — same shape lib/profile/nickname.ts's errorMessage() already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

export type XpLeaderboardResult =
  | { ok: true; entries: XpLeaderboardEntry[]; myRank: MyXpRank | null }
  | { ok: false; error: string }

/**
 * Fetches the Top 100 list and the caller's own exact rank in parallel — the
 * two RPCs are fully independent of each other, so there's no reason to
 * serialize them. `myRank` is `null` whenever get_my_xp_rank() returns zero
 * rows (not signed in, no nickname yet, or no xp_totals row yet — see that
 * RPC's own doc comment) — never treated as an error by this function.
 */
export async function fetchXpLeaderboard(client: SupabaseClient, limit = 100): Promise<XpLeaderboardResult> {
  const [topResult, myRankResult] = await Promise.all([
    client.rpc('get_xp_leaderboard_top', { p_limit: limit }),
    client.rpc('get_my_xp_rank'),
  ])

  if (topResult.error) return { ok: false, error: errorMessage(topResult.error) }
  if (myRankResult.error) return { ok: false, error: errorMessage(myRankResult.error) }

  const entries = ((topResult.data as XpRankRpcRow[] | null) ?? []).map(normalize)
  const myRankRow = (myRankResult.data as XpRankRpcRow[] | null)?.[0]

  return { ok: true, entries, myRank: myRankRow ? normalize(myRankRow) : null }
}
