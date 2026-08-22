import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3B-2 — account-level ranking nickname data layer. Deliberately
 * standalone: NOT part of lib/migration/write-local-snapshot.ts's 18-domain
 * snapshot machinery and NOT a lib/sync/sync-dispatcher.ts domain. Unlike
 * game-progress data (pet care, XP, missions, ...), a nickname has no
 * localStorage-first offline copy — it's read from / written straight to
 * profiles.nickname via the same RLS-scoped Supabase browser client every
 * other Supabase call in this app already uses (see lib/supabase/client.ts),
 * the same way lib/auth/*'s `email` is Supabase-only with no local mirror.
 * Only ever targets the CALLER'S OWN row — every function below takes the
 * caller's own userId explicitly and relies on profiles_select_own /
 * profiles_update_own (auth.uid() = id) as the real backstop, the same
 * client-side-check-plus-RLS-backstop shape lib/migration/write-local-snapshot.ts's
 * assertOwnRow already uses for every other table.
 */

export const NICKNAME_MIN_LENGTH = 2
export const NICKNAME_MAX_LENGTH = 12

/** 한글(완성형) / 영문 / 숫자만 — 이모지, 공백, 특수문자는 전부 거부. */
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/

export type NicknameValidationError = 'empty' | 'too_short' | 'too_long' | 'invalid_characters'

export type NicknameValidationResult = { ok: true; value: string } | { ok: false; reason: NicknameValidationError }

/**
 * Pure, UI-independent validation — trims first (so "  토리  " passes and
 * "   " is correctly treated as empty), then checks length, then character
 * set. Exported separately from the read/write helpers below so a future
 * nickname input component can call this directly for inline validation
 * without needing a Supabase client at all.
 */
export function validateNickname(raw: string): NicknameValidationResult {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (trimmed.length < NICKNAME_MIN_LENGTH) return { ok: false, reason: 'too_short' }
  if (trimmed.length > NICKNAME_MAX_LENGTH) return { ok: false, reason: 'too_long' }
  if (!NICKNAME_PATTERN.test(trimmed)) return { ok: false, reason: 'invalid_characters' }
  return { ok: true, value: trimmed }
}

export type NicknameReadResult = { ok: true; nickname: string | null } | { ok: false; error: string }

export type NicknameWriteResult = { ok: true } | { ok: false; error: string }

/** Supabase's PostgrestError is a plain object, not an Error instance — same message-extraction shape lib/migration/write-local-snapshot.ts's `failed()` already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

/**
 * Reads the CALLER'S OWN nickname only (`.eq('id', userId)` + RLS both scope
 * this to auth.uid() = userId — a mismatched userId simply reads nothing,
 * same maybeSingle()-returns-null shape as no row existing at all, never a
 * cross-user leak). Never logs/returns the nickname value in an error path.
 */
export async function getProfileNickname(client: SupabaseClient, userId: string): Promise<NicknameReadResult> {
  const { data, error } = await client
    .from('profiles')
    .select('nickname')
    .eq('id', userId)
    .maybeSingle<{ nickname: string | null }>()
  if (error) return { ok: false, error: errorMessage(error) }
  return { ok: true, nickname: data?.nickname ?? null }
}

/**
 * Validates, then writes ONLY profiles.nickname for the caller's own row —
 * a plain `.update()`, not the upsert-by-user_id pattern the 18 migration
 * tables use, since profiles is guaranteed to already exist (created by the
 * handle_new_user() trigger at signup) by the time any authenticated caller
 * could reach this. `.eq('id', userId)` + profiles_update_own's
 * `with check (auth.uid() = id)` both independently guarantee this can never
 * touch another user's row; a mismatched userId updates 0 rows rather than
 * erroring, so callers should treat that as a failure the same way an RLS
 * rejection would be. Never touches pets.statling_name, xp_totals, or
 * profiles.sync_updated_at — this is a single-column update by design.
 */
export async function updateProfileNickname(
  client: SupabaseClient,
  userId: string,
  rawNickname: string,
): Promise<NicknameWriteResult> {
  const validated = validateNickname(rawNickname)
  if (!validated.ok) return { ok: false, error: validated.reason }

  const { error, count } = await client
    .from('profiles')
    .update({ nickname: validated.value }, { count: 'exact' })
    .eq('id', userId)
  if (error) return { ok: false, error: errorMessage(error) }
  if (count === 0) return { ok: false, error: 'no_matching_row' }
  return { ok: true }
}
