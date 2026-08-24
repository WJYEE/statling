import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3G-2 — typed data layer over the 3 SECURITY DEFINER RPCs from
 * supabase/migrations/20260828000000_phase3g2_friend_connection.sql
 * (get_or_create_my_friend_code / create_friendship / remove_friendship).
 * Mirrors lib/ranking/xp-leaderboard.ts's own shape ({ok, ...}/errorMessage)
 * so this reads like the rest of this project's Supabase data layer, not a
 * new convention. No UI calls into this module yet — it exists purely as
 * backend foundation for Phase 3G-3 (Friend Ranking) / 3G-4 (Share/Dex
 * integration) to build on.
 */

/** Supabase's PostgrestError is a plain object, not an Error instance — same shape every other lib/ranking/*.ts errorMessage() already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

export type FriendCodeResult = { ok: true; friendCode: string } | { ok: false; error: string }

/** Returns the caller's existing friend_code, or lazily generates one on first call. */
export async function getOrCreateMyFriendCode(client: SupabaseClient): Promise<FriendCodeResult> {
  const { data, error } = await client.rpc('get_or_create_my_friend_code')
  if (error) return { ok: false, error: errorMessage(error) }
  return { ok: true, friendCode: data as string }
}

interface CreateFriendshipRpcRow {
  connected: boolean
  nickname: string | null
}

export type CreateFriendshipResult = { ok: true; nickname: string | null } | { ok: false; error: string }

/**
 * B's explicit consent step — calls create_friendship(p_friend_code) with
 * the code from A's invite link. Idempotent server-side (already-friends is
 * a no-op success, not an error). `nickname` is the other party's display
 * name for a confirmation toast ("OO님과 친구가 되었어요!") — never a
 * user_id, which this RPC never returns.
 */
export async function createFriendship(client: SupabaseClient, friendCode: string): Promise<CreateFriendshipResult> {
  const { data, error } = await client.rpc('create_friendship', { p_friend_code: friendCode })
  if (error) return { ok: false, error: errorMessage(error) }
  const row = (data as CreateFriendshipRpcRow[] | null)?.[0]
  return { ok: true, nickname: row?.nickname ?? null }
}

interface RemoveFriendshipRpcRow {
  removed: boolean
}

export type RemoveFriendshipResult = { ok: true; removed: boolean } | { ok: false; error: string }

/** Ends a friendship, identified by the other party's friend_code. Idempotent — removing an already-removed relationship still reports removed: true. */
export async function removeFriendship(client: SupabaseClient, friendCode: string): Promise<RemoveFriendshipResult> {
  const { data, error } = await client.rpc('remove_friendship', { p_friend_code: friendCode })
  if (error) return { ok: false, error: errorMessage(error) }
  const row = (data as RemoveFriendshipRpcRow[] | null)?.[0]
  return { ok: true, removed: row?.removed ?? false }
}
