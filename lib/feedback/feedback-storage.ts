import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { generateSessionId } from '@/lib/game/id'
import { detectDevice } from '@/lib/game/device'
import { APP_VERSION } from '@/lib/config/app.config'
import type {
  FavoritePartValue,
  FeedbackRecord,
  ImprovementAreaValue,
  ReturnIntentValue,
  SatisfactionValue,
} from '@/lib/feedback/feedback-types'

/**
 * Local-only repository for feedback — no Supabase table exists yet, so
 * this reads/writes localStorage today. Exactly one record per device (see
 * upsertFeedbackRecord below) rather than a growing list, mirroring what an
 * eventual Supabase table would enforce with a unique constraint on the
 * owning user id + `INSERT ... ON CONFLICT DO UPDATE`. Swapping
 * loadFeedbackRecord/upsertFeedbackRecord's bodies for real Supabase
 * select/upsert calls later is the entire migration surface — every call
 * site only ever goes through these two functions, same convention as
 * lib/deco-placement-storage.ts and lib/pets/dex-storage.ts.
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
