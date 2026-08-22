import type { StoredPetProfile } from '@/lib/pets/pet-storage'
import type { ServerDataSnapshot } from '@/lib/migration/snapshot-types'

/**
 * Phase 2C-1 — decides whether a server->local restore is safe to run
 * automatically, and why. Deliberately a standalone, pure function:
 * read-server-snapshot.ts only reads, restore-local-snapshot.ts only writes,
 * neither one makes this call on its own — a caller (today: the QA harness;
 * Phase 2C-2+: a real login flow) must call this FIRST and only invoke
 * restoreLocalDataFromSnapshot() when the result says `action: 'restore'`.
 *
 * The five cases below are exactly the ones the Phase 2C-1 task spec named
 * (A-E). A local pet that exists but is still unconfirmed (mid-assessment,
 * no identity locked in yet) is folded into case C's conflict bucket rather
 * than inventing a 6th case — see foldsIntoConflict below for why.
 */
export type RestoreCase = 'A' | 'B' | 'C' | 'D' | 'E'

export type RestoreSituation =
  | { case: 'A'; action: 'restore'; reason: string }
  | { case: 'B'; action: 'restore'; reason: string }
  | { case: 'C'; action: 'conflict'; reason: string }
  | { case: 'D'; action: 'skip'; reason: string }
  | { case: 'E'; action: 'skip'; reason: string }

/**
 * Phase 2D-2 Follow-up — confirmedAt is compared by INSTANT, not by raw
 * string, because the two sides are never byte-identical even when they
 * name the exact same moment: the local value is a JS `.toISOString()`
 * string ("...695Z"), the server value is Postgres's timestamptz text
 * representation as returned by PostgREST ("...695+00:00"). A strict `===`
 * (the original bug) treated every real same-device remount as a false
 * Case C conflict. `null`/`undefined` on both sides is still treated as
 * equal (an unconfirmed-but-otherwise-matching pair never reaches here in
 * practice, since both `confirmed` flags are already checked above — this
 * just preserves the original function's behavior for that edge). Anything
 * that fails to parse as a valid date is deliberately treated as NOT equal
 * rather than falling back to a permissive default — an unparseable
 * timestamp must never be able to make two different pets look identical.
 */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a ?? null
  const right = b ?? null
  if (left === null && right === null) return true
  if (left === null || right === null) return false
  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return false
  return leftMs === rightMs
}

/**
 * Identity fingerprint that never changes once a pet is confirmed (enforced
 * server-side by guard_pet_identity_immutable() — see
 * supabase/migrations/20260819000000_phase1_schema_and_rls.sql) and is
 * therefore stable no matter how much play has happened locally since a
 * restore. Four fields, not just character_id, so a coincidental same-
 * character match (two different real hatches of the same one of 30
 * characters) is not mistaken for "this is the same pet" — confirmedAt in
 * particular is effectively unique to one real confirm moment.
 */
function isSameConfirmedPet(local: StoredPetProfile, server: NonNullable<ServerDataSnapshot['pet']>): boolean {
  return (
    local.confirmed === true &&
    server.confirmed === true &&
    local.petId === server.character_id &&
    local.topStat === server.top_stat &&
    local.secondStat === server.second_stat &&
    sameInstant(local.confirmedAt, server.confirmed_at)
  )
}

export type SyncFreshnessComparison = 'server_newer' | 'local_newer' | 'in_sync'

/**
 * Phase 2D-6 Follow-up — Case B's own freshness refinement (session-sync.ts
 * calls this ONLY inside its Case B branch; determineRestoreSituation's own
 * identity-fingerprint classification above is untouched). Deliberately a
 * single flat timestamp comparison, not a per-domain revision system — see
 * the Phase 2D-6 Follow-up report for why per-domain revisions were rejected
 * as over-engineering for what's meant to be a conservative freshness
 * marker, not a distributed transaction.
 *
 * `toleranceMs` absorbs both domains this needs to worry about at once: (a)
 * clock skew between two real devices, and (b) the ordinary latency between
 * "local changed" and "the coalesced account-marker push actually reaches
 * the server" (see sync-dispatcher.ts's `_account_marker` pseudo-domain,
 * debounced 15s). Both timestamps are CLIENT clocks (see
 * lib/sync/sync-freshness.ts's own doc comment) — there is no single
 * authoritative clock in this design, so a badly-skewed device clock (well
 * beyond the tolerance window) could still produce a wrong verdict. Complex
 * logical/vector clocks are explicitly out of scope for this beta; a wrong
 * verdict here can only ever route to 'in_sync' or trigger an extra
 * restore/catch-up, never delete data outright.
 *
 * Missing timestamp on EITHER side (a legacy account from before this
 * column/key existed, or a device that has never touched sync-scoped data)
 * always resolves to 'in_sync' — the same trust-local no-op this whole
 * system already defaults to today. Never treated as "unknown = server
 * wins" or "unknown = local wins": a missing marker must never be read as
 * permission to overwrite anything.
 */
export function compareSyncFreshness(
  localSyncUpdatedAt: string | null,
  serverSyncUpdatedAt: string | null,
  toleranceMs: number = 5000,
): SyncFreshnessComparison {
  if (!localSyncUpdatedAt || !serverSyncUpdatedAt) return 'in_sync'
  const localMs = Date.parse(localSyncUpdatedAt)
  const serverMs = Date.parse(serverSyncUpdatedAt)
  if (Number.isNaN(localMs) || Number.isNaN(serverMs)) return 'in_sync'
  if (serverMs - localMs > toleranceMs) return 'server_newer'
  if (localMs - serverMs > toleranceMs) return 'local_newer'
  return 'in_sync'
}

/**
 * `localPet` is whatever lib/pets/pet-storage.ts#loadStoredPetProfile()
 * currently returns on this device — null if this device has never hatched
 * anything. Never reads localStorage itself (keeps this file pure/testable);
 * the caller passes the already-loaded value.
 */
export function determineRestoreSituation(
  serverSnapshot: ServerDataSnapshot,
  localPet: StoredPetProfile | null,
): RestoreSituation {
  const serverHasPet = serverSnapshot.pet !== null

  if (!serverHasPet && localPet === null) {
    return { case: 'E', action: 'skip', reason: '서버·로컬 모두 Statling 데이터가 없음 — 복원할 것이 없습니다.' }
  }

  if (!serverHasPet) {
    // localPet !== null here (the E branch above already covered "both empty").
    return {
      case: 'D',
      action: 'skip',
      reason: '서버에는 이 계정으로 마이그레이션된 Statling이 없고, 이 기기에는 로컬 Statling이 있습니다. 복원할 서버 데이터가 없으므로 로컬 데이터를 그대로 둡니다 (이 로컬 데이터를 서버로 올리는 것은 Phase 2B의 몫이며, 이 함수의 책임이 아닙니다).',
    }
  }

  // serverHasPet is true from here on — serverSnapshot.pet is non-null.
  const server = serverSnapshot.pet as NonNullable<ServerDataSnapshot['pet']>

  if (localPet === null) {
    return {
      case: 'A',
      action: 'restore',
      reason: '서버에는 Statling 데이터가 있고 이 기기는 비어 있습니다 — 안전하게 전체 복원 가능합니다.',
    }
  }

  if (isSameConfirmedPet(localPet, server)) {
    return {
      case: 'B',
      action: 'restore',
      reason: '이 기기의 로컬 Statling 정체성(petId/topStat/secondStat/confirmedAt)이 서버 pet과 정확히 일치합니다 — 같은 Statling의 재동기화로 판단해 복원을 허용합니다.',
    }
  }

  return {
    case: 'C',
    action: 'conflict',
    reason: localPet.confirmed
      ? '이 기기에 서버와 다른, 이미 확정된 로컬 Statling이 있습니다. 어느 쪽을 유지할지는 사용자 판단이 필요하며, 이 함수는 절대 임의로 덮어쓰지 않습니다.'
      : '이 기기에 아직 확정되지 않은(진행 중인) 로컬 Statling이 있습니다. 확정 전 데이터라도 사용자가 진행 중이던 것을 말없이 지우지 않도록 보수적으로 conflict 처리합니다.',
  }
}
