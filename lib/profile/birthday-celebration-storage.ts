const STORAGE_KEY_PREFIX = 'statling.birthdayCelebrationShown.v1:'

/**
 * Local calendar-date (YYYY-MM-DD, see visit-context.ts#toLocalDateKey) the
 * birthday popup was last shown, keyed by userId — NOT deviceId/global, since
 * two different accounts signing in on the same device must never share or
 * clobber each other's "already shown today" flag (the same
 * cross-account-leak class every other lib/pets/reset-foreign-account-state.ts
 * domain guards against, avoided here for free since userId is already known
 * at the one call site — RoomScreen only runs this check for a signed-in
 * user). Deliberately NOT part of lib/migration's snapshot domains or
 * reset-foreign-account-state.ts's clear list — this is disposable per-device
 * UI-shown-state, not game progress, and a stale entry for a userId that
 * never signs into this device again is simply inert.
 */
export function loadLastBirthdayCelebrationDate(userId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY_PREFIX + userId)
  } catch {
    return null
  }
}

export function saveLastBirthdayCelebrationDate(userId: string, todayKey: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + userId, todayKey)
  } catch {
    // best-effort only — worst case the popup can show again today, never data loss
  }
}
