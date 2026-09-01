import { CHARACTER_CATALOG } from '@/lib/pets/pet-profile'

const STORAGE_KEY = 'statling.dex.v1'

/**
 * "만나본 Statling" — the local-only collection record (see
 * public/assets/statling/characters/00_match/00_match.md for the roster).
 * Phase 1: no server, no cross-account sync. A character is added when
 * either (a) it becomes your own confirmed representative pet (see
 * lib/pets/pet-flow.ts#confirmPet, wired in game-flow.tsx), or (b) a friend's
 * share link is opened and "내 도감에 기록하기" is clicked (see
 * app/share/[petId]/page.tsx) — both write through addMetPet below. Real
 * account-to-account sync (so a share registers on *both* sides, or a dex
 * survives clearing browser storage) is deferred until there's an actual
 * backend — see the 00_match discussion for why.
 */
export interface DexRecord {
  metPetIds: string[]
}

function emptyDex(): DexRecord {
  return { metPetIds: [] }
}

export function loadDex(): DexRecord {
  if (typeof window === 'undefined') return emptyDex()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDex()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || !Array.isArray(parsed.metPetIds)) return emptyDex()
    return { metPetIds: parsed.metPetIds.filter((id): id is string => typeof id === 'string') }
  } catch {
    return emptyDex()
  }
}

export function saveDex(dex: DexRecord): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dex))
}

/** Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts. Wipes this device's "만나본 Statling" collection; only ever called when it's just been confirmed to belong to a DIFFERENT, now-signed-out account. */
export function clearDex(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

/** Adds one character id if not already present. No-op (returns the same list) if already met. */
export function addMetPet(petId: string): DexRecord {
  const current = loadDex()
  if (current.metPetIds.includes(petId)) return current
  const next: DexRecord = { metPetIds: [...current.metPetIds, petId] }
  saveDex(next)
  return next
}

export function hasMetPet(petId: string): boolean {
  return loadDex().metPetIds.includes(petId)
}

/** Dev/QA only (see qa-skip-menu.tsx) — unlocks every one of the 30 characters locally, to preview the full dex without hatching/sharing 30 times. */
export function markAllPetsMet(): DexRecord {
  const next: DexRecord = { metPetIds: CHARACTER_CATALOG.map((pet) => pet.id) }
  saveDex(next)
  return next
}
