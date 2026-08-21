import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getSyncReadyUserId } from '@/lib/sync/session-registry'
import {
  buildPetRow,
  buildDexEntryRows,
  buildAchievementRows,
  buildPlayerSkillRecordRows,
  buildXpTotalsRow,
  buildPetCareStateRow,
  buildRoomCareStateRow,
  buildPetMemoryRow,
  buildActivityCountersRow,
  buildDailyMissionRows,
  buildDialogueMemoryRow,
} from '@/lib/migration/build-local-snapshot'
import {
  writePetRow,
  writeDexEntries,
  writeAchievements,
  writePlayerSkillRecords,
  writeXpTotalsRow,
  writePetCareStateRow,
  writeRoomCareStateRow,
  writePetMemoryRow,
  writeActivityCountersRow,
  writeDailyMissions,
  writeDialogueMemoryRow,
} from '@/lib/migration/write-local-snapshot'

/**
 * Phase 2D-2 — the one place any orchestration choke point (mission-tracker.ts,
 * game-flow.tsx's pet-storage call sites, dex-storage call sites) asks for a
 * domain's CURRENT localStorage state to be pushed to Supabase in the
 * background. Phase 2D-3 added player_skill_records/xp_totals (game-flow.tsx's
 * recordSkillCompletion choke point). Phase 2D-4 added the six high-frequency
 * domains below (pet_care_state/room_care_state/pet_memory/activity_counters/
 * daily_missions/dialogue_memory) plus their debounce windows — see
 * DEBOUNCE_MS's own doc comment for why each domain's window is sized the way
 * it is, and scheduleSync's for how the debounce itself works. Every other
 * domain (Room/Deco/Inventory/Dex placement, user_notes, ...) is still
 * untouched — see the Phase 2D-1 roadmap for what remains.
 *
 * Deliberately reuses Phase 2B's own row-mapping (build-local-snapshot.ts)
 * and per-table write helpers (write-local-snapshot.ts) verbatim — no new
 * row shape, upsert conflict key, or RLS-write path is introduced here. Each
 * call rebuilds and pushes that domain's ENTIRE current local state (not a
 * delta), matching Phase 2B's own snapshot model — a failed or superseded
 * write is simply corrected by the next call for the same domain, so no
 * retry queue is needed (see the Phase 2D-1 report's offline/retry section).
 */

export type SyncDomain =
  | 'pets'
  | 'dex_entries'
  | 'achievements'
  | 'player_skill_records'
  | 'xp_totals'
  | 'pet_care_state'
  | 'room_care_state'
  | 'pet_memory'
  | 'activity_counters'
  | 'daily_missions'
  | 'dialogue_memory'

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

async function pushDomain(domain: SyncDomain, client: SupabaseClient, userId: string): Promise<void> {
  switch (domain) {
    case 'pets': {
      const row = buildPetRow(userId)
      const result = await writePetRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] pets sync failed (local state unaffected):', result.error)
      return
    }
    case 'dex_entries': {
      const rows = buildDexEntryRows(userId, new Date())
      const result = await writeDexEntries(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] dex_entries sync failed (local state unaffected):', result.error)
      return
    }
    case 'achievements': {
      const rows = buildAchievementRows(userId)
      const result = await writeAchievements(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] achievements sync failed (local state unaffected):', result.error)
      return
    }
    case 'player_skill_records': {
      const rows = buildPlayerSkillRecordRows(userId)
      const result = await writePlayerSkillRecords(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] player_skill_records sync failed (local state unaffected):', result.error)
      return
    }
    case 'xp_totals': {
      const row = buildXpTotalsRow(userId, new Date())
      const result = await writeXpTotalsRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] xp_totals sync failed (local state unaffected):', result.error)
      return
    }
    case 'pet_care_state': {
      const row = buildPetCareStateRow(userId)
      const result = await writePetCareStateRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] pet_care_state sync failed (local state unaffected):', result.error)
      return
    }
    case 'room_care_state': {
      const row = buildRoomCareStateRow(userId)
      const result = await writeRoomCareStateRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] room_care_state sync failed (local state unaffected):', result.error)
      return
    }
    case 'pet_memory': {
      const row = buildPetMemoryRow(userId, new Date())
      const result = await writePetMemoryRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] pet_memory sync failed (local state unaffected):', result.error)
      return
    }
    case 'activity_counters': {
      const row = buildActivityCountersRow(userId)
      const result = await writeActivityCountersRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] activity_counters sync failed (local state unaffected):', result.error)
      return
    }
    case 'daily_missions': {
      const rows = buildDailyMissionRows(userId, new Date())
      const result = await writeDailyMissions(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] daily_missions sync failed (local state unaffected):', result.error)
      return
    }
    case 'dialogue_memory': {
      const row = buildDialogueMemoryRow(userId)
      const result = await writeDialogueMemoryRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] dialogue_memory sync failed (local state unaffected):', result.error)
      return
    }
  }
}

/**
 * Phase 2D-4 — per-domain debounce window. 0 (every Phase 2D-2/2D-3 domain,
 * unchanged) means "no artificial delay": each keeps firing immediately with
 * only the inFlight/dirty coalescing below, exactly as before this phase.
 *
 * The six new domains write far more often than those five — a 60s decay
 * tick, a 10s auto-sleep tick, or a handful of cooldown-limited care-button
 * presses can all call scheduleSync() for the SAME domain within seconds of
 * each other — so each gets a window sized to its OWN actual trigger
 * cadence (see the Phase 2D-4 report) rather than one number for all six:
 *   - pet_care_state: the tightest recurring driver is the 10s auto-sleep
 *     tick (AUTO_SLEEP_TICK_MS, lib/config/pet-care.config.ts) — 8s keeps
 *     roughly one write per tick during sustained auto-sleep instead of
 *     firing on nearly every tick.
 *   - room_care_state: only the 60s decay tick + the 'clean' action drive
 *     it (no 10s-tick equivalent), so a shorter window is already safe.
 *   - pet_memory / activity_counters / daily_missions: all driven by
 *     discrete, cooldown-gated user actions (care presses, game
 *     completions) rather than a sub-15s tick — a mid window absorbs a
 *     quick multi-press burst without meaningfully delaying convergence.
 *   - dialogue_memory: the least frequent of the six (a deliberate
 *     question-open or memory-tagged answer, never a tick) — the shortest
 *     window.
 */
const DEBOUNCE_MS: Record<SyncDomain, number> = {
  pets: 0,
  dex_entries: 0,
  achievements: 0,
  player_skill_records: 0,
  xp_totals: 0,
  pet_care_state: 8_000,
  room_care_state: 5_000,
  pet_memory: 5_000,
  activity_counters: 5_000,
  daily_missions: 5_000,
  dialogue_memory: 4_000,
}

interface DomainSyncState {
  /** Non-null while a write for this domain is in flight. */
  inFlight: Promise<void> | null
  /** True if a run was requested again while inFlight (or, for a debounced domain, its debounce window) was already open — triggers exactly one trailing re-run reading whatever is current AT that later point, so a burst of calls collapses to a bounded handful of network writes instead of N. */
  dirty: boolean
  /** Non-null while a debounced domain's trailing-edge window is open (DEBOUNCE_MS[domain] > 0 only — always null for the five 0-debounce domains). */
  debounceTimer: number | null
}

const domainState = new Map<SyncDomain, DomainSyncState>()

function stateFor(domain: SyncDomain): DomainSyncState {
  let s = domainState.get(domain)
  if (!s) {
    s = { inFlight: null, dirty: false, debounceTimer: null }
    domainState.set(domain, s)
  }
  return s
}

function runAndMaybeRepeat(domain: SyncDomain, client: SupabaseClient, userId: string, s: DomainSyncState): void {
  s.dirty = false
  s.inFlight = pushDomain(domain, client, userId)
    .catch((err) => devWarn(`[sync-dispatcher] ${domain} sync threw unexpectedly (local state unaffected):`, err))
    .finally(() => {
      s.inFlight = null
      // Re-enters through scheduleSync (not requestRun with this closure's
      // now-possibly-stale userId/client) so a rerun re-validates
      // getSyncReadyUserId() fresh at the moment it actually fires — a push
      // can resolve well after logout/a session change, and reusing the
      // ORIGINAL caller's userId would silently attempt a write for a user
      // who is no longer the current session (Phase 2D-4 §13's "실행
      // 시점에도 registry/user readiness를 다시 확인" requirement — a real
      // gap the Case K QA run caught, see the Phase 2D-4 report).
      if (s.dirty) scheduleSync(domain)
    })
}

function requestRun(domain: SyncDomain, client: SupabaseClient, userId: string, s: DomainSyncState): void {
  const debounceMs = DEBOUNCE_MS[domain]

  if (debounceMs === 0) {
    if (s.inFlight) {
      s.dirty = true
      return
    }
    runAndMaybeRepeat(domain, client, userId, s)
    return
  }

  // Debounced domain: a call landing while a debounce window (or an
  // in-flight push) is already open just marks dirty — the window's own
  // timer below (or the in-flight push's own .finally() above) picks up
  // the LATEST state when it's ready, so a burst always collapses to a
  // leading push plus at most one trailing push per window, never one push
  // per call.
  if (s.inFlight || s.debounceTimer !== null) {
    s.dirty = true
    return
  }

  // Leading edge: the first call in a quiet period fires right away, the
  // same immediate feel the non-debounced domains already have for a
  // lone/rare change.
  runAndMaybeRepeat(domain, client, userId, s)
  s.debounceTimer = window.setTimeout(() => {
    s.debounceTimer = null
    // Re-enters through scheduleSync, not requestRun with this closure's
    // stale userId/client — same "re-validate at fire time" reasoning as
    // runAndMaybeRepeat's .finally() above. Guarded by !s.inFlight so this
    // never races an in-flight push's own .finally() re-entry (that path
    // already handles s.dirty once it settles).
    if (s.dirty && !s.inFlight) scheduleSync(domain)
  }, debounceMs)
}

/**
 * Requests a background push of `domain`'s current localStorage state to
 * Supabase. A pure fire-and-forget call — never awaited by callers, never
 * throws, never touches localStorage or the current session/auth state.
 *
 * A guaranteed no-op (zero network requests) for a guest, a not-yet-ready
 * session (Phase 2B/2C initial sync still in flight, or an unresolved Case C
 * conflict), or when Supabase isn't configured — see
 * lib/sync/session-registry.ts#getSyncReadyUserId. Re-checked on every call
 * (not just once), so a timer that fires after logout is already a no-op by
 * the time it runs — see requestRun/scheduleSync's shared gate and the
 * Phase 2D-4 report's "logout 중 debounce" analysis.
 */
export function scheduleSync(domain: SyncDomain): void {
  const userId = getSyncReadyUserId()
  if (!userId) return

  const client = getSupabaseBrowserClient()
  if (!client) return

  requestRun(domain, client, userId, stateFor(domain))
}

/**
 * Like scheduleSync, but for a domain currently mid-debounce, forces the
 * pending window to resolve NOW instead of waiting out its remaining delay —
 * for a moment where the change itself is important enough that "eventually,
 * debounced" isn't a good enough guarantee (Phase 2D-4 task: daily mission
 * reward claims). Cancels any open debounce timer and immediately requests a
 * run capturing whatever is CURRENT at the call site (so the flushed push
 * always includes the claim, not a stale pre-claim snapshot) — reuses the
 * exact same inFlight/dirty machinery as scheduleSync, not a second code
 * path, so it's just as safe against an in-flight write already running.
 * A harmless no-op for a domain with no debounce configured (DEBOUNCE_MS[domain]
 * === 0) or nothing pending — behaves exactly like scheduleSync there.
 */
export function flushSync(domain: SyncDomain): void {
  const userId = getSyncReadyUserId()
  if (!userId) return

  const client = getSupabaseBrowserClient()
  if (!client) return

  const s = stateFor(domain)
  if (s.debounceTimer !== null) {
    window.clearTimeout(s.debounceTimer)
    s.debounceTimer = null
  }
  requestRun(domain, client, userId, s)
}
