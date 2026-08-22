/**
 * Phase 2D-6 Follow-up — this device's own view of "when did sync-scoped
 * Statling data here last meaningfully change." A single flat key (not
 * device-scoped like statling:room:{deviceId}/statling:petCare:{deviceId} —
 * those exist only because they predate real auth and used a generated
 * deviceId as a stand-in for a userId; localStorage is already per-browser,
 * so this key needs no such prefix) used purely as the LOCAL half of the
 * Case B freshness comparison in restore-conflict.ts#compareSyncFreshness.
 *
 * Deliberately just an ISO string value, not a {version, ...} wrapper like
 * most other storage modules here — there's no structural shape to version.
 *
 * Client clock, not a server timestamp — see the Phase 2D-6 Follow-up
 * report's clock-skew analysis for why, and compareSyncFreshness's tolerance
 * window for how the resulting skew risk is bounded.
 */

const STORAGE_KEY = 'statling.syncUpdatedAt.v1'

/** Null means "never set" — a brand-new device, a guest who's never touched sync-scoped data, or any device that predates this feature. Never fabricated into a fake value here. */
export function loadLocalSyncUpdatedAt(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

/**
 * Sets the marker to an EXACT value — used only when aligning to a
 * known-authoritative moment (Phase 2B migration success, a Phase 2C/2D-6
 * restore copying the server's own marker down). Never call this for an
 * ordinary local mutation — see touchLocalSyncUpdatedAt for that.
 */
export function setLocalSyncUpdatedAt(iso: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, iso)
}

/**
 * Marks "a real, sync-scoped local mutation just happened, right now."
 * Called from lib/sync/sync-dispatcher.ts's scheduleSync/flushSync — the
 * same choke points every continuous-sync push already goes through — never
 * from a restore/read path (restoring must copy the SERVER's marker down,
 * never stamp "now"; see setLocalSyncUpdatedAt above and the Phase 2D-6
 * Follow-up report's migration/restore integration section).
 */
export function touchLocalSyncUpdatedAt(now: Date = new Date()): void {
  setLocalSyncUpdatedAt(now.toISOString())
}
