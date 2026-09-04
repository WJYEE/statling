import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getSyncReadyUserId } from '@/lib/sync/session-registry'
import { touchLocalSyncUpdatedAt, loadLocalSyncUpdatedAt } from '@/lib/sync/sync-freshness'
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
  buildRoomStateRow,
  buildRoomItemRows,
  buildDecoPlacementItemRows,
  buildRoomInventoryRows,
  buildDecoInventoryRows,
  buildAttendanceRow,
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
  writeRoomStateRow,
  writeRoomItemsRpc,
  writeDecoPlacementItemsRpc,
  writeRoomInventory,
  writeDecoInventory,
  writeAttendanceRow,
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
 * Phase 2D-5 added the five Room/Deco/Inventory domains below
 * (room_state/room_items/deco_placement_items/room_inventory/deco_inventory)
 * — all immediate (DEBOUNCE_MS 0), same as the original five, since each is
 * driven by an explicit, low-frequency user action (a "저장" button press or
 * an inventory unlock), never a tick. `dex_entries` was already connected in
 * Phase 2D-2 and is untouched here.
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
  | 'room_state'
  | 'room_items'
  | 'deco_placement_items'
  | 'room_inventory'
  | 'deco_inventory'
  | 'attendance'

/**
 * Phase 2D-6 Follow-up — `_account_marker` is NOT one of the 18 migration
 * tables and never appears in the exported `SyncDomain` union other files
 * switch over; it's an internal-only pseudo-domain reusing this same
 * debounce/coalescing machinery to push profiles.sync_updated_at. Never call
 * scheduleSync('_account_marker' as SyncDomain) from outside this file —
 * scheduleSync/flushSync trigger it automatically after every real domain
 * (see their own bodies below). Kept out of SyncDomain itself specifically
 * so no other call site can even type-check a direct call.
 */
type InternalSyncTarget = SyncDomain | '_account_marker'

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

/**
 * Phase 2D-6 Follow-up Safety Fix — domains whose most recent push attempt
 * failed and hasn't yet been retried successfully. `_account_marker`'s own
 * push (below) checks this and SKIPS — leaving profiles.sync_updated_at
 * exactly where it was — rather than advancing it while some domain's data
 * might still be missing from the server. The 15s debounce alone (added in
 * the original Follow-up) only made a premature marker LESS likely by
 * giving real domain pushes a head start; it never actually verified they
 * landed, so a genuinely failed domain (not just a slow one) could still
 * let the marker race ahead — this set closes that gap.
 *
 * A domain is added here the instant its OWN push fails, and removed the
 * instant a LATER push for that SAME domain succeeds — so a lingering
 * failure for domain X keeps blocking the marker even after some UNRELATED
 * domain Y succeeds in between, and stops blocking the moment X itself (or
 * a full catch-up / migration batch that necessarily included X) succeeds.
 * Still just a Set, not a real queue: the one bounded retry a failure gets
 * (see scheduleFailureRetry below) reuses this exact same push path rather
 * than adding a second write mechanism, and a domain that keeps failing
 * past that one retry is left here — genuinely re-attempted, not just
 * flagged — the next time a real local change touches it, or the next
 * session's catch-up sync (session-catchup.ts), whichever comes first.
 */
const domainsWithOutstandingFailure = new Set<SyncDomain>()

/**
 * Domains with exactly one delayed retry already pending after a failed
 * push — caps a persistently-failing domain (a real server-side rejection,
 * not a transient blip) to one automatic follow-up rather than retrying
 * forever. Cleared the moment that retry actually fires (scheduleInternal
 * re-validates readiness itself at that point, same as every other
 * re-entry in this file), so a LATER, genuinely new failure is free to
 * schedule its own retry again.
 */
const domainRetryScheduled = new Set<SyncDomain>()

/**
 * How long to wait before automatically retrying a domain whose push just
 * failed. xp_totals is the motivating case (Statling QA report, Phase
 * 2D-3+): unlike the ticked/frequently-touched domains, XP is only earned
 * on discrete events (a game completion, a reward claim), so a session with
 * no further XP for a while had no other "next call" to naturally correct a
 * single failed push — this closes exactly that gap, for every 0-debounce
 * domain alike (not special-cased to xp_totals; every domain here already
 * shares one push mechanism). 20s is long enough that a genuinely offline
 * device doesn't retry into a second failure within the same short window,
 * short enough that a real play session (minutes, not seconds) gets a real
 * second chance before falling back to the much coarser "next login's
 * session-catchup" safety net.
 */
const FAILED_PUSH_RETRY_MS = 20_000

/**
 * A failed push's one automatic follow-up — reuses scheduleInternal (not a
 * second write path), so the retry re-validates sync-readiness/session
 * ownership at fire time exactly like every other re-entry in this file
 * (see runAndMaybeRepeat's .finally() for the same reasoning). Skipped when
 * `s.dirty` is already true: a newer local change is already queued behind
 * this push and gets its own immediate re-run from .finally() below, so a
 * delayed retry on top of that would just be a redundant second push.
 */
function scheduleFailureRetry(domain: SyncDomain, s: DomainSyncState): void {
  if (s.dirty || domainRetryScheduled.has(domain)) return
  domainRetryScheduled.add(domain)
  window.setTimeout(() => {
    domainRetryScheduled.delete(domain)
    scheduleInternal(domain)
  }, FAILED_PUSH_RETRY_MS)
}

/** Called after any batch write Phase 2B/2D-6's own "all tables, all at once" paths (migration, catch-up) confirm fully succeeded — see migration-orchestrator.ts / session-catchup.ts. */
export function clearOutstandingDomainFailures(): void {
  domainsWithOutstandingFailure.clear()
}

async function pushDomain(domain: InternalSyncTarget, client: SupabaseClient, userId: string): Promise<boolean> {
  switch (domain) {
    case '_account_marker': {
      // Reads the CURRENT local marker fresh at push time (same "always
      // push current state, never a captured snapshot" rule every other
      // domain here follows) — null means nothing has actually touched
      // sync-scoped local data yet this device, so there's nothing
      // meaningful to advance the server marker to.
      const current = loadLocalSyncUpdatedAt()
      if (!current) return true
      if (domainsWithOutstandingFailure.size > 0) {
        devWarn(
          '[sync-dispatcher] _account_marker push skipped — domain(s) with an outstanding failure, marker stays at its last known-safe value:',
          [...domainsWithOutstandingFailure],
        )
        return true
      }
      const { error } = await client.from('profiles').update({ sync_updated_at: current }).eq('id', userId)
      if (error) {
        devWarn('[sync-dispatcher] _account_marker sync failed (local state unaffected):', error.message)
        return false
      }
      return true
    }
    case 'pets': {
      const row = buildPetRow(userId)
      const result = await writePetRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] pets sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'dex_entries': {
      const rows = buildDexEntryRows(userId, new Date())
      const result = await writeDexEntries(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] dex_entries sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'achievements': {
      const rows = buildAchievementRows(userId)
      const result = await writeAchievements(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] achievements sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'player_skill_records': {
      const rows = buildPlayerSkillRecordRows(userId)
      const result = await writePlayerSkillRecords(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] player_skill_records sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'xp_totals': {
      const row = buildXpTotalsRow(userId, new Date())
      const result = await writeXpTotalsRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] xp_totals sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'pet_care_state': {
      const row = buildPetCareStateRow(userId)
      const result = await writePetCareStateRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] pet_care_state sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'room_care_state': {
      const row = buildRoomCareStateRow(userId)
      const result = await writeRoomCareStateRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] room_care_state sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'pet_memory': {
      const row = buildPetMemoryRow(userId, new Date())
      const result = await writePetMemoryRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] pet_memory sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'activity_counters': {
      const row = buildActivityCountersRow(userId)
      const result = await writeActivityCountersRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] activity_counters sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'daily_missions': {
      const rows = buildDailyMissionRows(userId, new Date())
      const result = await writeDailyMissions(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] daily_missions sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'dialogue_memory': {
      const row = buildDialogueMemoryRow(userId)
      const result = await writeDialogueMemoryRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] dialogue_memory sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'room_state': {
      const row = buildRoomStateRow(userId)
      const result = await writeRoomStateRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] room_state sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'room_items': {
      // Group D — replace_room_items RPC (transactional delete+insert), same
      // as the one-time migration path. No new cross-table transaction here:
      // room_state and room_items are pushed as two independent calls (see
      // their call sites in theme-screen.tsx's handleSave) — a failure in
      // one never rolls back or blocks the other.
      const rows = buildRoomItemRows(userId)
      const result = await writeRoomItemsRpc(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] room_items sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'deco_placement_items': {
      const rows = buildDecoPlacementItemRows(userId)
      const result = await writeDecoPlacementItemsRpc(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] deco_placement_items sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'room_inventory': {
      const rows = buildRoomInventoryRows(userId)
      const result = await writeRoomInventory(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] room_inventory sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'deco_inventory': {
      const rows = buildDecoInventoryRows(userId)
      const result = await writeDecoInventory(client, rows, userId)
      if (!result.ok) devWarn('[sync-dispatcher] deco_inventory sync failed (local state unaffected):', result.error)
      return result.ok
    }
    case 'attendance': {
      // Phase 3J-3 — closes the ANALYTICS_GAP_AUDIT.md P0 gap: attendance
      // was only ever written once, by the initial migration batch, and
      // never touched again by continuous sync (see mission-tracker.ts's
      // trackDailyVisit, the only local writer, for where this is now
      // scheduled). Reuses the exact same row-mapping/write path the
      // one-time migration batch already uses — no new upsert shape.
      const row = buildAttendanceRow(userId)
      const result = await writeAttendanceRow(client, row, userId)
      if (!result.ok) devWarn('[sync-dispatcher] attendance sync failed (local state unaffected):', result.error)
      return result.ok
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
const DEBOUNCE_MS: Record<InternalSyncTarget, number> = {
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
  // Phase 2D-5 — all five immediate (0), like the original Phase 2D-2/2D-3
  // domains: each is driven by an explicit, deliberate user action (a
  // "저장" button, an inventory unlock), never a tick or a rapid button
  // burst, so there is no recurring driver to coalesce against.
  room_state: 0,
  room_items: 0,
  deco_placement_items: 0,
  room_inventory: 0,
  deco_inventory: 0,
  // Phase 3J-3 — recordDailyVisit (attendance-storage.ts) is already a pure
  // no-op reducer for a same-day repeat visit (returns the identical
  // reference, checked at the one call site before scheduleSync ever runs),
  // so this can only ever fire at most once per local calendar day per
  // device — no debounce needed, same reasoning as the five Phase 2D-5
  // domains above.
  attendance: 0,
  // Phase 2D-6 Follow-up — longer than every real domain's own window
  // (pet_care_state's 8s is the longest) so that, in the common case, the
  // individual domain pushes a burst of local activity triggers have already
  // had time to land before this coalesced account-level marker follows —
  // see restore-conflict.ts#compareSyncFreshness's doc comment for why that
  // ordering matters (a marker that races ahead of the domain data it's
  // implicitly vouching for is exactly the "4 succeeded, 1 failed, but we
  // already said 'fresh'" risk the Phase 2D-6 Follow-up task warned about).
  _account_marker: 15_000,
}

interface DomainSyncState {
  /** Non-null while a write for this domain is in flight. */
  inFlight: Promise<void> | null
  /** True if a run was requested again while inFlight (or, for a debounced domain, its debounce window) was already open — triggers exactly one trailing re-run reading whatever is current AT that later point, so a burst of calls collapses to a bounded handful of network writes instead of N. */
  dirty: boolean
  /** Non-null while a debounced domain's trailing-edge window is open (DEBOUNCE_MS[domain] > 0 only — always null for the five 0-debounce domains). */
  debounceTimer: number | null
}

const domainState = new Map<InternalSyncTarget, DomainSyncState>()

function stateFor(domain: InternalSyncTarget): DomainSyncState {
  let s = domainState.get(domain)
  if (!s) {
    s = { inFlight: null, dirty: false, debounceTimer: null }
    domainState.set(domain, s)
  }
  return s
}

function runAndMaybeRepeat(domain: InternalSyncTarget, client: SupabaseClient, userId: string, s: DomainSyncState): void {
  s.dirty = false
  s.inFlight = pushDomain(domain, client, userId)
    .then((ok) => {
      // _account_marker never "vouches" for other domains and is never
      // itself vouched for — only real domains feed the outstanding-failure
      // set that gates it (see the set's own doc comment above pushDomain).
      if (domain === '_account_marker') return
      if (ok) {
        domainsWithOutstandingFailure.delete(domain)
      } else {
        domainsWithOutstandingFailure.add(domain)
        scheduleFailureRetry(domain, s)
      }
    })
    .catch((err) => {
      devWarn(`[sync-dispatcher] ${domain} sync threw unexpectedly (local state unaffected):`, err)
      if (domain !== '_account_marker') {
        domainsWithOutstandingFailure.add(domain)
        scheduleFailureRetry(domain, s)
      }
    })
    .finally(() => {
      s.inFlight = null
      // Re-enters through scheduleInternal (not requestRun with this
      // closure's now-possibly-stale userId/client) so a rerun re-validates
      // getSyncReadyUserId() fresh at the moment it actually fires — a push
      // can resolve well after logout/a session change, and reusing the
      // ORIGINAL caller's userId would silently attempt a write for a user
      // who is no longer the current session (Phase 2D-4 §13's "실행
      // 시점에도 registry/user readiness를 다시 확인" requirement — a real
      // gap the Case K QA run caught, see the Phase 2D-4 report).
      if (s.dirty) scheduleInternal(domain)
    })
}

function requestRun(domain: InternalSyncTarget, client: SupabaseClient, userId: string, s: DomainSyncState): void {
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
    // Re-enters through scheduleInternal, not requestRun with this closure's
    // stale userId/client — same "re-validate at fire time" reasoning as
    // runAndMaybeRepeat's .finally() above. Guarded by !s.inFlight so this
    // never races an in-flight push's own .finally() re-entry (that path
    // already handles s.dirty once it settles).
    if (s.dirty && !s.inFlight) scheduleInternal(domain)
  }, debounceMs)
}

/**
 * Shared gate + dispatch for both a real domain and the internal
 * `_account_marker` pseudo-domain — never touches the local freshness
 * marker itself (see scheduleSync/flushSync, the only two public entry
 * points, for that) and never cascades into `_account_marker` on its own,
 * so a debounce/inFlight re-entry just re-runs the SAME target it was
 * already running, nothing more.
 */
function scheduleInternal(domain: InternalSyncTarget): void {
  const userId = getSyncReadyUserId()
  if (!userId) return

  const client = getSupabaseBrowserClient()
  if (!client) return

  requestRun(domain, client, userId, stateFor(domain))
}

/**
 * Requests a background push of `domain`'s current localStorage state to
 * Supabase. A pure fire-and-forget call — never awaited by callers, never
 * throws.
 *
 * Phase 2D-6 Follow-up — the ONE place that touches the local
 * sync_updated_at freshness marker (lib/sync/sync-freshness.ts), and it does
 * so UNCONDITIONALLY, before the guest/ready gate below — every real call
 * site already only calls scheduleSync right after its own local save
 * succeeds (the established local-first ordering), so this correctly fires
 * for a guest too (the task's own "Guest에서도 local timestamp는 갱신 가능"
 * requirement), even though the background push itself stays gated. Also
 * kicks the internal `_account_marker` pseudo-domain so the server side of
 * this marker eventually catches up too — see its own DEBOUNCE_MS entry for
 * why that's a separate, longer-debounced push rather than an inline write
 * here.
 *
 * The background push itself is a guaranteed no-op (zero network requests)
 * for a guest, a not-yet-ready session (Phase 2B/2C initial sync still in
 * flight, or an unresolved Case C conflict), or when Supabase isn't
 * configured — see lib/sync/session-registry.ts#getSyncReadyUserId.
 * Re-checked on every call (not just once), so a timer that fires after
 * logout is already a no-op by the time it runs — see
 * requestRun/scheduleInternal's shared gate and the Phase 2D-4 report's
 * "logout 중 debounce" analysis.
 */
export function scheduleSync(domain: SyncDomain): void {
  touchLocalSyncUpdatedAt()
  scheduleInternal(domain)
  scheduleInternal('_account_marker')
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
 * Also touches the local freshness marker and kicks `_account_marker`, same
 * as scheduleSync — a claim urgent enough to flush is urgent enough to mark.
 */
export function flushSync(domain: SyncDomain): void {
  touchLocalSyncUpdatedAt()
  const userId = getSyncReadyUserId()
  if (userId) {
    const client = getSupabaseBrowserClient()
    if (client) {
      const s = stateFor(domain)
      if (s.debounceTimer !== null) {
        window.clearTimeout(s.debounceTimer)
        s.debounceTimer = null
      }
      requestRun(domain, client, userId, s)
    }
  }
  scheduleInternal('_account_marker')
}
