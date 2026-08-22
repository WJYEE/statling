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

/**
 * Phase 3B-7 — the floor used ONLY by the "Statling 이름 그대로 사용할래요"
 * shortcut (see validateStatlingNameForReuse below), matching lib/naming.ts's
 * own STATLING_NAME_MIN_LENGTH (a Statling's name may legitimately be 1
 * character — a completely separate naming flow with its own rules).
 * Deliberately NOT used by direct nickname input, which must keep requiring
 * NICKNAME_MIN_LENGTH — changing the general floor to 1 would let a
 * manually-typed 1-character nickname through too, which is a different
 * product decision this fix does not make.
 */
const STATLING_NAME_REUSE_MIN_LENGTH = 1

/** 한글(완성형) / 영문 / 숫자만 — 이모지, 공백, 특수문자는 전부 거부. */
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/

export type NicknameValidationError = 'empty' | 'too_short' | 'too_long' | 'invalid_characters'

export type NicknameValidationResult = { ok: true; value: string } | { ok: false; reason: NicknameValidationError }

/** Shared core: trims first (so "  토리  " passes and "   " is correctly treated as empty), then checks length against a caller-chosen floor, then the same character-set rule either caller needs. */
function validateNicknameWithMinLength(raw: string, minLength: number): NicknameValidationResult {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (trimmed.length < minLength) return { ok: false, reason: 'too_short' }
  if (trimmed.length > NICKNAME_MAX_LENGTH) return { ok: false, reason: 'too_long' }
  if (!NICKNAME_PATTERN.test(trimmed)) return { ok: false, reason: 'invalid_characters' }
  return { ok: true, value: trimmed }
}

/**
 * Pure, UI-independent validation for DIRECT nickname input — 2-12자,
 * 한글/영문/숫자만. Exported separately from the read/write helpers below so
 * a nickname input component can call this directly for inline validation
 * without needing a Supabase client at all.
 */
export function validateNickname(raw: string): NicknameValidationResult {
  return validateNicknameWithMinLength(raw, NICKNAME_MIN_LENGTH)
}

/**
 * Same rules as validateNickname(), except the length floor is 1 instead of
 * `NICKNAME_MIN_LENGTH` — for the "Statling 이름 그대로 사용할래요" shortcut
 * ONLY (a Statling's own name is validated by lib/naming.ts's separate,
 * more permissive rule and can legitimately be 1 character, e.g. "몽").
 * Direct nickname input must never call this — always validateNickname()
 * above.
 */
export function validateStatlingNameForReuse(raw: string): NicknameValidationResult {
  return validateNicknameWithMinLength(raw, STATLING_NAME_REUSE_MIN_LENGTH)
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
 * Writes ONLY profiles.nickname for the caller's own row — a plain
 * `.update()`, not the upsert-by-user_id pattern the 18 migration tables
 * use, since profiles is guaranteed to already exist (created by the
 * handle_new_user() trigger at signup) by the time any authenticated caller
 * could reach this. `.eq('id', userId)` + profiles_update_own's
 * `with check (auth.uid() = id)` both independently guarantee this can never
 * touch another user's row; a mismatched userId updates 0 rows rather than
 * erroring, so callers should treat that as a failure the same way an RLS
 * rejection would be. Never touches pets.statling_name, xp_totals, or
 * profiles.sync_updated_at — this is a single-column update by design.
 * Takes an already-validated value — shared by both public write functions
 * below so the actual Supabase call exists in exactly one place regardless
 * of which validation floor a caller used.
 */
async function writeValidatedNickname(client: SupabaseClient, userId: string, value: string): Promise<NicknameWriteResult> {
  const { error, count } = await client
    .from('profiles')
    .update({ nickname: value }, { count: 'exact' })
    .eq('id', userId)
  if (error) return { ok: false, error: errorMessage(error) }
  if (count === 0) return { ok: false, error: 'no_matching_row' }
  return { ok: true }
}

/** Validates via validateNickname() (2-12자), then writes — the normal, direct-input path. */
export async function updateProfileNickname(
  client: SupabaseClient,
  userId: string,
  rawNickname: string,
): Promise<NicknameWriteResult> {
  const validated = validateNickname(rawNickname)
  if (!validated.ok) return { ok: false, error: validated.reason }
  return writeValidatedNickname(client, userId, validated.value)
}

/**
 * Phase 3B-7 — validates via validateStatlingNameForReuse() (1-12자) instead,
 * then writes. Used ONLY by NicknameSetupCard's "Statling 이름 그대로 사용할래요"
 * shortcut — never by direct nickname input.
 */
export async function updateProfileNicknameFromStatlingName(
  client: SupabaseClient,
  userId: string,
  rawStatlingName: string,
): Promise<NicknameWriteResult> {
  const validated = validateStatlingNameForReuse(rawStatlingName)
  if (!validated.ok) return { ok: false, error: validated.reason }
  return writeValidatedNickname(client, userId, validated.value)
}
