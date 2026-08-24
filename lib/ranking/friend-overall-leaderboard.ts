import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3G-3 — Friend Overall Ranking data layer, backed by the single
 * SECURITY DEFINER RPC get_friend_overall_ranking() (same migration).
 * Deliberately a separate file from lib/ranking/overall-leaderboard.ts
 * rather than a `scope` parameter bolted onto it: the friend RPC returns
 * one already-fully-ranked list (caller + friends), not the global RPC's
 * separate Top-100/my-rank pair, so the two response shapes genuinely
 * differ — keeping them as separate small files avoids threading an
 * `if (scope === 'friends')` branch through overall-leaderboard.ts's own
 * normalize/fetch logic, which is exactly the kind of change most likely to
 * regress the existing global Overall Ranking this project explicitly wants
 * preserved untouched.
 *
 * Unlike the global RPC (which never returns isMe — duplicate nicknames make
 * client-side "is this me" matching unsafe there), this one safely can:
 * every row here is either the caller or a confirmed friend, so `isMe` is a
 * plain `user_id = auth.uid()` computed entirely server-side, never a raw id
 * exposed to the client.
 */

export interface FriendOverallRankingEntry {
  rank: number
  nickname: string
  friendCode: string
  overallScore: number
  isMe: boolean
}

interface FriendOverallRankRpcRow {
  rank: number
  nickname: string
  friend_code: string
  overall_score: number
  is_me: boolean
}

function normalize(row: FriendOverallRankRpcRow): FriendOverallRankingEntry {
  return {
    rank: row.rank,
    nickname: row.nickname,
    friendCode: row.friend_code,
    overallScore: row.overall_score,
    isMe: row.is_me,
  }
}

/** Supabase's PostgrestError is a plain object, not an Error instance — same shape every other lib/ranking/*.ts errorMessage() already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

export type FriendOverallRankingResult =
  | { ok: true; entries: FriendOverallRankingEntry[] }
  | { ok: false; error: string }

/**
 * Fetches the caller + every confirmed friend, ranked by the identical
 * overall_score formula/eligibility/tie-break get_overall_leaderboard_top
 * uses — just one RPC call (no separate "my rank" call needed; the caller's
 * own row, if eligible, is already in `entries` with `isMe: true`). An empty
 * array (or an array containing only the caller) means "no friends yet" —
 * see RankingScreen's empty-state handling, not treated as an error here.
 */
export async function fetchFriendOverallRanking(client: SupabaseClient): Promise<FriendOverallRankingResult> {
  const { data, error } = await client.rpc('get_friend_overall_ranking')
  if (error) return { ok: false, error: errorMessage(error) }

  const entries = ((data as FriendOverallRankRpcRow[] | null) ?? []).map(normalize)
  return { ok: true, entries }
}
