import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3G-4 — typed data layer over the single SECURITY DEFINER RPC from
 * supabase/migrations/20260830000000_phase3g4_friend_invite_preview.sql
 * (get_friend_invite_preview). Callable by a logged-out guest (the RPC is
 * granted to anon too — see that migration's header for why this is the one
 * deliberate exception in this project) so the share page can show
 * "OO님과 친구가 되어 기록을 비교할까요?" before any login/consent step.
 */

/** Supabase's PostgrestError is a plain object, not an Error instance — same shape every other lib/ranking/*.ts and lib/friends/*.ts errorMessage() already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

interface FriendInvitePreviewRpcRow {
  nickname: string
}

export type FriendInvitePreviewResult = { ok: true; nickname: string | null } | { ok: false; error: string }

/** `nickname: null` covers both "no ref present" callers should already skip and an unknown/invalid code — either way, the caller's only correct response is to not show an invite preview, never surface a technical error for a bad/tampered `ref`. */
export async function fetchFriendInvitePreview(client: SupabaseClient, friendCode: string): Promise<FriendInvitePreviewResult> {
  const { data, error } = await client.rpc('get_friend_invite_preview', { p_friend_code: friendCode })
  if (error) return { ok: false, error: errorMessage(error) }
  const row = (data as FriendInvitePreviewRpcRow[] | null)?.[0]
  return { ok: true, nickname: row?.nickname ?? null }
}
