import { getOrCreateDeviceId } from '@/lib/room/room-storage'
import { STAT_MAX, STAT_MIN } from '@/lib/config/pet-care.config'
import type { CareStatId, PetCareState } from '@/lib/pet-care/types'

function petCareStorageKey(deviceId: string): string {
  return `statling:petCare:${deviceId}`
}

export function createDefaultPetCareState(): PetCareState {
  return {
    stats: {
      satiety: 70,
      cleanliness: 80,
      affection: 65,
      energy: 80,
      happiness: 70,
    },
    intimacyLevel: 1,
    intimacyExp: 0,
    unlockedRewardLevels: [],
    giftReadyLevel: null,
    lastUpdatedAt: new Date().toISOString(),
    cooldowns: {},
  }
}

const STAT_KEYS: CareStatId[] = ['satiety', 'cleanliness', 'affection', 'energy', 'happiness']

/** Minimal structural check — anything short of this is treated as corrupt (fresh default state), never thrown from. */
function isWellFormed(value: Record<string, unknown>): boolean {
  if (typeof value.lastUpdatedAt !== 'string') return false
  if (typeof value.intimacyLevel !== 'number' || typeof value.intimacyExp !== 'number') return false
  if (!value.stats || typeof value.stats !== 'object') return false
  const stats = value.stats as Record<string, unknown>
  return STAT_KEYS.every((key) => typeof stats[key] === 'number')
}

/** Clamps every stat back into [0,100] on load — guards against hand-edited localStorage or a future config change to the range. */
function sanitize(state: PetCareState): PetCareState {
  const stats = { ...state.stats }
  for (const key of STAT_KEYS) {
    stats[key] = Math.min(STAT_MAX, Math.max(STAT_MIN, Math.round(stats[key])))
  }
  return {
    ...createDefaultPetCareState(),
    ...state,
    stats,
    unlockedRewardLevels: Array.isArray(state.unlockedRewardLevels) ? state.unlockedRewardLevels : [],
    cooldowns: state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {},
  }
}

export function loadPetCareState(): PetCareState {
  if (typeof window === 'undefined') return createDefaultPetCareState()
  try {
    const raw = window.localStorage.getItem(petCareStorageKey(getOrCreateDeviceId()))
    if (!raw) return createDefaultPetCareState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !isWellFormed(parsed)) return createDefaultPetCareState()
    return sanitize(parsed as unknown as PetCareState)
  } catch {
    return createDefaultPetCareState()
  }
}

export function savePetCareState(state: PetCareState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(petCareStorageKey(getOrCreateDeviceId()), JSON.stringify(state))
}

/** Wipes this device's care state (hunger/mood/intimacy) — see resetAllPetData in game-flow.tsx. */
export function clearPetCareState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(petCareStorageKey(getOrCreateDeviceId()))
}
