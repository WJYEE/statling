import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3G-3 — Friend XP Ranking data layer, backed by the single SECURITY
 * DEFINER RPC get_friend_xp_ranking() (same migration). See
 * lib/ranking/friend-overall-leaderboard.ts's doc comment for why this is a
 * separate file from lib/ranking/xp-leaderboard.ts rather than a scope
 * parameter on it, and why `isMe` is safe here unlike the global RPC.
 */

export interface FriendXpRankingEntry {
  rank: number
  nickname: string
  friendCode: string
  totalXp: number
  isMe: boolean
}

interface FriendXpRankRpcRow {
  rank: number
  nickname: string
  friend_code: string
  total_xp: number
  is_me: boolean
}

function normalize(row: FriendXpRankRpcRow): FriendXpRankingEntry {
  return {
    rank: row.rank,
    nickname: row.nickname,
    friendCode: row.friend_code,
    totalXp: row.total_xp,
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

export type FriendXpRankingResult =
  | { ok: true; entries: FriendXpRankingEntry[] }
  | { ok: false; error: string }

/**
 * Fetches the caller + every confirmed friend, ranked by the identical
 * total_xp formula/eligibility/tie-break get_xp_leaderboard_top uses — one
 * RPC call, no separate "my rank" call needed.
 */
export async function fetchFriendXpRanking(client: SupabaseClient): Promise<FriendXpRankingResult> {
  const { data, error } = await client.rpc('get_friend_xp_ranking')
  if (error) return { ok: false, error: errorMessage(error) }

  const entries = ((data as FriendXpRankRpcRow[] | null) ?? []).map(normalize)
  return { ok: true, entries }
}
