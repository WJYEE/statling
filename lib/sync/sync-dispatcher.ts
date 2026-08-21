import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getSyncReadyUserId } from '@/lib/sync/session-registry'
import {
  buildPetRow,
  buildDexEntryRows,
  buildAchievementRows,
  buildPlayerSkillRecordRows,
  buildXpTotalsRow,
} from '@/lib/migration/build-local-snapshot'
import {
  writePetRow,
  writeDexEntries,
  writeAchievements,
  writePlayerSkillRecords,
  writeXpTotalsRow,
} from '@/lib/migration/write-local-snapshot'

/**
 * Phase 2D-2 — the one place any orchestration choke point (mission-tracker.ts,
 * game-flow.tsx's pet-storage call sites, dex-storage call sites) asks for a
 * domain's CURRENT localStorage state to be pushed to Supabase in the
 * background. Phase 2D-3 added player_skill_records/xp_totals (game-flow.tsx's
 * recordSkillCompletion choke point) — every other domain is still 2D-4+ (see
 * the Phase 2D-1 roadmap).
 *
 * Deliberately reuses Phase 2B's own row-mapping (build-local-snapshot.ts)
 * and per-table write helpers (write-local-snapshot.ts) verbatim — no new
 * row shape, upsert conflict key, or RLS-write path is introduced here. Each
 * call rebuilds and pushes that domain's ENTIRE current local state (not a
 * delta), matching Phase 2B's own snapshot model — a failed or superseded
 * write is simply corrected by the next call for the same domain, so no
 * retry queue is needed (see the Phase 2D-1 report's offline/retry section).
 */

export type SyncDomain = 'pets' | 'dex_entries' | 'achievements' | 'player_skill_records' | 'xp_totals'

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
  }
}

interface DomainSyncState {
  /** Non-null while a write for this domain is in flight. */
  inFlight: Promise<void> | null
  /** True if scheduleSync(domain) was called again while inFlight was set — triggers exactly one trailing re-run (reading whatever is current AT that later point), so a burst of same-tick calls collapses to at most 2 network writes instead of N. Not a real debounce/queue — see Phase 2D-1 §9's "아주 가벼운 in-flight/coalescing" guidance. */
  dirty: boolean
}

const domainState = new Map<SyncDomain, DomainSyncState>()

function stateFor(domain: SyncDomain): DomainSyncState {
  let s = domainState.get(domain)
  if (!s) {
    s = { inFlight: null, dirty: false }
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
      if (s.dirty) runAndMaybeRepeat(domain, client, userId, s)
    })
}

/**
 * Requests a background push of `domain`'s current localStorage state to
 * Supabase. A pure fire-and-forget call — never awaited by callers, never
 * throws, never touches localStorage or the current session/auth state.
 *
 * A guaranteed no-op (zero network requests) for a guest, a not-yet-ready
 * session (Phase 2B/2C initial sync still in flight, or an unresolved Case C
 * conflict), or when Supabase isn't configured — see
 * lib/sync/session-registry.ts#getSyncReadyUserId.
 */
export function scheduleSync(domain: SyncDomain): void {
  const userId = getSyncReadyUserId()
  if (!userId) return

  const client = getSupabaseBrowserClient()
  if (!client) return

  const s = stateFor(domain)
  if (s.inFlight) {
    s.dirty = true
    return
  }
  runAndMaybeRepeat(domain, client, userId, s)
}
