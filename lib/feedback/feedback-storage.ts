import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { generateSessionId } from '@/lib/game/id'
import { detectDevice } from '@/lib/game/device'
import { APP_VERSION } from '@/lib/config/app.config'
import { isLocalDataOwnedBy } from '@/lib/pets/local-data-owner'
import type {
  FavoritePartValue,
  FeedbackRecord,
  ImprovementAreaValue,
  ReturnIntentValue,
  SatisfactionValue,
} from '@/lib/feedback/feedback-types'

/**
 * Phase 3J-1 — localStorage repository for a GUEST's feedback only now (see
 * supabase/migrations/20260901010000_phase3j1_feedback_table.sql for the
 * signed-in path below). Exactly one record per device (see
 * upsertFeedbackRecord below) rather than a growing list — unchanged from
 * before this phase; a signed-in user's feedback now lives server-side
 * instead (loadFeedbackRecordRemote/upsertFeedbackRecordRemote), and these
 * two local functions are kept only for the guest fallback and as the
 * source a first-time migration reads from (migrateLocalFeedbackToRemote).
 */
function feedbackStorageKey(deviceId: string): string {
  return `statling:feedback:${deviceId}`
}

function isWellFormedRecord(value: Record<string, unknown>): value is Record<string, unknown> & FeedbackRecord {
  return (
    typeof value.id === 'string' &&
    typeof value.satisfaction === 'string' &&
    Array.isArray(value.favoritePart) &&
    Array.isArray(value.improvementArea) &&
    typeof value.returnIntent === 'string' &&
    typeof value.comment === 'string' &&
    typeof value.submittedAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

/** The current device's feedback, if it has ever submitted one — null otherwise (never yet submitted). */
export function loadFeedbackRecord(): FeedbackRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(feedbackStorageKey(getOrCreateDeviceId()))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || !isWellFormedRecord(parsed as Record<string, unknown>)) return null
    return parsed as FeedbackRecord
  } catch {
    return null
  }
}

function saveFeedbackRecord(record: FeedbackRecord): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(feedbackStorageKey(getOrCreateDeviceId()), JSON.stringify(record))
}

/**
 * Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts.
 * Without this, resetting lib/pets/local-data-owner.ts's marker back to
 * "unclaimed" for a newly detected foreign device would (correctly) unblock
 * the NEXT account's own game state, but would ALSO make
 * migrateLocalFeedbackToRemote's OWN isLocalDataOwnedBy check above pass for
 * whatever feedback record the PREVIOUS account left behind — the exact
 * device-scoped-key leak this file's module doc comment already warns about
 * for reads, now closed for the marker-reset path too. Only ever called
 * when this device's local data has just been confirmed to belong to a
 * DIFFERENT, now-signed-out account.
 */
export function clearFeedbackRecord(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(feedbackStorageKey(getOrCreateDeviceId()))
}

export interface FeedbackAnswers {
  satisfaction: SatisfactionValue
  favoritePart: FavoritePartValue[]
  favoritePartOtherText: string
  improvementArea: ImprovementAreaValue[]
  improvementAreaOtherText: string
  improvementAreaDetail: string
  returnIntent: ReturnIntentValue
  returnIntentDetail: string
  comment: string
  /** The representative pet's catalog id + display name, if one exists yet — see lib/pets/pet-profile.ts. Both null before a Statling is hatched. */
  statlingId: string | null
  statlingName: string | null
}

/**
 * UPSERT, not INSERT: if this device already has a feedback record, its
 * answers/appVersion/deviceType/statlingId/statlingName/updatedAt are
 * overwritten in place and `id`/`submittedAt` are kept from the original
 * submission ("내 의견 수정하기", not "다른 의견도 남기기"). Otherwise a brand
 * new record is created. Every required field on FeedbackAnswers must
 * already be non-null — the caller (feedback-section.tsx) is responsible
 * for that validation before calling this.
 */
export function upsertFeedbackRecord(answers: FeedbackAnswers): FeedbackRecord {
  const existing = loadFeedbackRecord()
  const now = new Date().toISOString()
  const record: FeedbackRecord = {
    id: existing?.id ?? generateSessionId(),
    satisfaction: answers.satisfaction,
    favoritePart: answers.favoritePart,
    favoritePartOtherText: (answers.favoritePartOtherText ?? '').trim(),
    improvementArea: answers.improvementArea,
    improvementAreaOtherText: (answers.improvementAreaOtherText ?? '').trim(),
    improvementAreaDetail: (answers.improvementAreaDetail ?? '').trim(),
    returnIntent: answers.returnIntent,
    returnIntentDetail: (answers.returnIntentDetail ?? '').trim(),
    comment: (answers.comment ?? '').trim(),
    appVersion: APP_VERSION,
    deviceType: detectDevice().deviceType,
    statlingId: answers.statlingId,
    statlingName: answers.statlingName,
    submittedAt: existing?.submittedAt ?? now,
    updatedAt: now,
  }
  saveFeedbackRecord(record)
  return record
}

// -----------------------------------------------------------------------------
// Phase 3J-1 — signed-in path: public.feedback (see the migration's own doc
// comment). Every function below requires `userId` to be the CURRENT
// server-validated session's id (same convention as
// migration-orchestrator.ts) — never trust a caller-supplied id beyond that.
// -----------------------------------------------------------------------------

/** public.feedback's exact column shape — snake_case, DB-facing only. Never exported past this module. */
interface FeedbackRow {
  user_id: string
  client_id: string
  satisfaction: SatisfactionValue
  favorite_part: FavoritePartValue[]
  favorite_part_other_text: string
  improvement_area: ImprovementAreaValue[]
  improvement_area_other_text: string
  improvement_area_detail: string
  return_intent: ReturnIntentValue
  return_intent_detail: string
  comment: string
  app_version: string
  device_type: string
  statling_id: string | null
  statling_name: string | null
  submitted_at: string
  updated_at: string
}

function rowToRecord(row: FeedbackRow): FeedbackRecord {
  return {
    id: row.client_id,
    satisfaction: row.satisfaction,
    favoritePart: row.favorite_part,
    favoritePartOtherText: row.favorite_part_other_text,
    improvementArea: row.improvement_area,
    improvementAreaOtherText: row.improvement_area_other_text,
    improvementAreaDetail: row.improvement_area_detail,
    returnIntent: row.return_intent,
    returnIntentDetail: row.return_intent_detail,
    comment: row.comment,
    appVersion: row.app_version,
    deviceType: row.device_type,
    statlingId: row.statling_id,
    statlingName: row.statling_name,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  }
}

/** This account's server feedback, if it has ever submitted one — null otherwise. Never touches localStorage. */
export async function loadFeedbackRecordRemote(client: SupabaseClient, userId: string): Promise<FeedbackRecord | null> {
  const { data, error } = await client.from('feedback').select('*').eq('user_id', userId).maybeSingle()
  if (error || !data) return null
  return rowToRecord(data as FeedbackRow)
}

/**
 * UPSERT into public.feedback (onConflict: user_id — same Group A "single
 * row per user" pattern as write-local-snapshot.ts's writePetCareStateRow
 * etc.), keyed strictly to `userId` (the current server-validated session,
 * never a caller-supplied id trusted blindly — mirrors
 * migration-orchestrator.ts's own convention). `existing` supplies the
 * id/submittedAt to preserve across a re-submission — pass whatever
 * loadFeedbackRecordRemote returned (or null for a brand-new record); this
 * function never re-fetches it itself. Also mirrors the result into the
 * local record (saveFeedbackRecord isn't exported, so this reimplements
 * that one line) so a reload still has an instant, synchronous
 * loadFeedbackRecord() fallback before the remote fetch resolves.
 */
export async function upsertFeedbackRecordRemote(
  client: SupabaseClient,
  userId: string,
  answers: FeedbackAnswers,
  existing: FeedbackRecord | null,
): Promise<FeedbackRecord> {
  const now = new Date().toISOString()
  const row: FeedbackRow = {
    user_id: userId,
    client_id: existing?.id ?? generateSessionId(),
    satisfaction: answers.satisfaction,
    favorite_part: answers.favoritePart,
    favorite_part_other_text: (answers.favoritePartOtherText ?? '').trim(),
    improvement_area: answers.improvementArea,
    improvement_area_other_text: (answers.improvementAreaOtherText ?? '').trim(),
    improvement_area_detail: (answers.improvementAreaDetail ?? '').trim(),
    return_intent: answers.returnIntent,
    return_intent_detail: (answers.returnIntentDetail ?? '').trim(),
    comment: (answers.comment ?? '').trim(),
    app_version: APP_VERSION,
    device_type: detectDevice().deviceType,
    statling_id: answers.statlingId,
    statling_name: answers.statlingName,
    submitted_at: existing?.submittedAt ?? now,
    updated_at: now,
  }
  const { data, error } = await client.from('feedback').upsert(row, { onConflict: 'user_id' }).select().single()
  if (error) throw error
  const record = rowToRecord(data as FeedbackRow)
  saveFeedbackRecord(record)
  return record
}

export type FeedbackMigrationStatus = 'migrated' | 'no_local' | 'already_on_server' | 'foreign_local_data' | 'failed'

export interface FeedbackMigrationResult {
  status: FeedbackMigrationStatus
  /** The now-authoritative server record — set only when status is 'migrated' (the caller can use it directly instead of re-fetching). */
  record: FeedbackRecord | null
}

/**
 * One-time localStorage -> public.feedback migration for a just-authenticated
 * user, mirroring migration-orchestrator.ts's own cross-account guard rather
 * than inventing a new one: `statling:feedback:<deviceId>` was never
 * account-scoped (any signed-out account's leftover feedback is still
 * sitting there, keyed only by device — see feedback-storage.ts's own
 * module doc comment), so this refuses to touch it unless
 * isLocalDataOwnedBy(userId) says this device's local data is either
 * unclaimed or already this exact account's — the SAME marker
 * lib/pets/local-data-owner.ts already uses for the pet/game-state snapshot,
 * reused here rather than adding a second, feedback-only ownership concept.
 * A server record that already exists is NEVER overwritten by an older local
 * one — this only ever fills in a genuinely empty server slot. Callers are
 * expected to have already tried loadFeedbackRecordRemote first (see
 * feedback-section.tsx's reconcile effect) — this does not re-check "does a
 * server record already exist" for its own sake beyond that, it just reports
 * 'already_on_server' if one turns up anyway (e.g. a concurrent tab).
 */
export async function migrateLocalFeedbackToRemote(client: SupabaseClient, userId: string): Promise<FeedbackMigrationResult> {
  if (!isLocalDataOwnedBy(userId)) return { status: 'foreign_local_data', record: null }

  const local = loadFeedbackRecord()
  if (!local) return { status: 'no_local', record: null }

  const existingRemote = await loadFeedbackRecordRemote(client, userId)
  if (existingRemote) return { status: 'already_on_server', record: existingRemote }

  try {
    const migrated = await upsertFeedbackRecordRemote(
      client,
      userId,
      {
        satisfaction: local.satisfaction,
        favoritePart: local.favoritePart,
        favoritePartOtherText: local.favoritePartOtherText,
        improvementArea: local.improvementArea,
        improvementAreaOtherText: local.improvementAreaOtherText,
        improvementAreaDetail: local.improvementAreaDetail,
        returnIntent: local.returnIntent,
        returnIntentDetail: local.returnIntentDetail,
        comment: local.comment,
        statlingId: local.statlingId,
        statlingName: local.statlingName,
      },
      local,
    )
    return { status: 'migrated', record: migrated }
  } catch {
    return { status: 'failed', record: null }
  }
}
