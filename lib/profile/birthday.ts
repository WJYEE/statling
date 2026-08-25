import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 3I-1 — account-level birth_date/gender data layer, same standalone
 * shape as lib/profile/nickname.ts: NOT part of lib/migration/write-local-snapshot.ts's
 * domain machinery and NOT a lib/sync/sync-dispatcher.ts domain. Neither
 * field has a localStorage-first offline copy — both are read from / written
 * straight to profiles.birth_date/profiles.gender via the same RLS-scoped
 * Supabase browser client every other Supabase call in this app already
 * uses. Only ever targets the CALLER'S OWN row — every function below takes
 * the caller's own userId explicitly and relies on profiles_select_own /
 * profiles_update_own (auth.uid() = id) as the real backstop.
 *
 * Deliberately guest-inaccessible: since there is no local mirror, a
 * logged-out visitor has no row to write to. BirthdayScreen only ever calls
 * updateProfileBirthday when a real user is signed in — see that
 * component's own doc comment for why the fields aren't even shown to a
 * guest, rather than accepting input that would silently fail to save.
 */

export const GENDER_OPTIONS = ['female', 'male', 'other', 'prefer_not_to_say'] as const
export type Gender = (typeof GENDER_OPTIONS)[number]

export function isGender(value: string): value is Gender {
  return (GENDER_OPTIONS as readonly string[]).includes(value)
}

/** A birth_date this old is treated as an implausible/mistaken entry rather than a real one — a soft UX floor, not a DB-level invariant (see the migration's own doc comment on why). */
const MAX_AGE_YEARS = 120

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type BirthDateValidationError = 'invalid_format' | 'future_date' | 'too_old'
export type BirthDateValidationResult = { ok: true; value: string } | { ok: false; reason: BirthDateValidationError }

/**
 * Validates a `YYYY-MM-DD` date-only string (the native `<input type="date">`
 * value shape) against the same two rules the DB constraint enforces (never
 * future) plus one purely client-side heuristic (never implausibly old) —
 * see the migration's doc comment for why "too old" stays client-side only.
 * An empty string is NOT valid input here — callers must treat an empty
 * field as "skip this question" before ever calling this, the same way
 * NamingScreen's blank-input case never reaches isValidStatlingName.
 */
export function validateBirthDate(raw: string, now: Date = new Date()): BirthDateValidationResult {
  const trimmed = raw.trim()
  if (!DATE_ONLY_PATTERN.test(trimmed)) return { ok: false, reason: 'invalid_format' }

  const [year, month, day] = trimmed.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  // Rejects both malformed values (NaN) and Date's own overflow rollover
  // (e.g. 2024-02-30 silently becoming 2024-03-01) — a round-trip check, not
  // a calendar library.
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return { ok: false, reason: 'invalid_format' }
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (parsed.getTime() > today.getTime()) return { ok: false, reason: 'future_date' }

  const oldestPlausible = new Date(now.getFullYear() - MAX_AGE_YEARS, now.getMonth(), now.getDate())
  if (parsed.getTime() < oldestPlausible.getTime()) return { ok: false, reason: 'too_old' }

  return { ok: true, value: trimmed }
}

export type BirthdayWriteResult = { ok: true } | { ok: false; error: string }

/** Supabase's PostgrestError is a plain object, not an Error instance — same shape every other lib/ranking/*.ts and lib/friends/*.ts errorMessage() already uses. */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
}

/**
 * Writes profiles.birth_date/profiles.gender for the caller's own row in one
 * update — the BirthdayScreen form always submits both fields together (each
 * independently nullable). Takes already-validated/normalized values only:
 * callers must run validateBirthDate() themselves first and pass null for
 * any field the user left blank, exactly the optional/skippable contract
 * this whole feature is built around. `.eq('id', userId)` +
 * profiles_update_own's `with check (auth.uid() = id)` both independently
 * guarantee this can never touch another user's row.
 */
export async function updateProfileBirthday(
  client: SupabaseClient,
  userId: string,
  values: { birthDate: string | null; gender: Gender | null },
): Promise<BirthdayWriteResult> {
  const { error } = await client
    .from('profiles')
    .update({ birth_date: values.birthDate, gender: values.gender })
    .eq('id', userId)
  if (error) return { ok: false, error: errorMessage(error) }
  return { ok: true }
}
