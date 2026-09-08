const STORAGE_KEY = 'statling.resultSeen.v1'

interface StoredSeen {
  /** Which Statling this applies to — see StoredPetProfile.confirmedAt (unique per confirm/hatch). Same pet-scoping shape as lib/onboarding-storage.ts, kept as a fully separate flag/key so the Result Popup and the Home Onboarding Guide can each be replayed from My Page independently without affecting the other's seen state. */
  petKey: string
}

function loadStored(): StoredSeen | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const petKey = (parsed as Record<string, unknown>).petKey
    return typeof petKey === 'string' && petKey ? { petKey } : null
  } catch {
    return null
  }
}

/** Whether `petKey`'s Home Result Popup (see home-result-popup.tsx) has already been shown once. */
export function loadResultSeen(petKey = 'legacy'): boolean {
  if (typeof window === 'undefined') return true
  try {
    return loadStored()?.petKey === petKey
  } catch {
    return true // fail open — never let a storage error force the popup to keep auto-reappearing every Home visit
  }
}

export function markResultSeen(petKey = 'legacy'): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ petKey }))
  } catch {
    // best-effort only
  }
}
