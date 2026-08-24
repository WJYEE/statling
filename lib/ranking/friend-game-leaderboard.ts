import type { SupabaseClient } from '@supabase/supabase-js'
import type { RankedDifficulty } from '@/lib/ranking/ranking-provider'

/**
 * Phase 3G-3 — Friend Per-Game Ranking data layer, backed by the single
 * SECURITY DEFINER RPC get_friend_game_ranking(p_game_id, p_difficulty)
 * (same migration). See lib/ranking/friend-overall-leaderboard.ts's doc
 * comment for why this is a separate file from lib/ranking/game-leaderboard.ts
 * rather than a scope parameter on it, and why `isMe` is safe here unlike the
 * global RPC. Ranks by each game's own real raw metric (never
 * normalizedScore) — same lib/ranking/game-ranking-metrics.config.ts a
 * caller should use to format recordValue/tiebreakValue, this file only
 * normalizes the RPC row shape.
 */

export interface FriendGameRankingEntry {
  rank: number
  nickname: string
  friendCode: string
  recordValue: number
  tiebreakValue: number | null
  isMe: boolean
}

interface FriendGameRankRpcRow {
  rank: number
  nickname: string
  friend_code: string
  record_value: number
  tiebreak_value: number | null
  is_me: boolean
}

function normalize(row: FriendGameRankRpcRow): FriendGameRankingEntry {
  return {
    rank: row.rank,
    nickname: row.nickname,
    friendCode: row.friend_code,
    recordValue: row.record_value,
    tiebreakValue: row.tiebreak_value ?? null,
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

export type FriendGameRankingResult =
  | { ok: true; entries: FriendGameRankingEntry[] }
  | { ok: false; error: string }

/**
 * Fetches the caller + every confirmed friend who has a current-season
 * record at this exact gameId+difficulty (Hard/Extreme only — Easy/Normal
 * safely return zero rows server-side, never called by this app's own UI),
 * ranked by that game's own real raw metric in its correct direction — one
 * RPC call, no separate "my rank" call needed.
 */
export async function fetchFriendGameRanking(
  client: SupabaseClient,
  gameId: string,
  difficulty: RankedDifficulty,
): Promise<FriendGameRankingResult> {
  const { data, error } = await client.rpc('get_friend_game_ranking', { p_game_id: gameId, p_difficulty: difficulty })
  if (error) return { ok: false, error: errorMessage(error) }

  const entries = ((data as FriendGameRankRpcRow[] | null) ?? []).map(normalize)
  return { ok: true, entries }
}
