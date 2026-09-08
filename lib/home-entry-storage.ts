const STORAGE_KEY = 'statling.homeEntered.v1'

interface StoredEntered {
  /** Which Statling this applies to — see StoredPetProfile.confirmedAt (unique per confirm/hatch). Same pet-scoping shape as lib/onboarding-storage.ts. */
  petKey: string
}

function loadStored(): StoredEntered | null {
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

/**
 * Whether `petKey`'s Statling has actually pressed "같이 놀러 가기" and
 * reached Home at least once. Distinct from `pets.confirmed`/`statlingName`
 * (which only mean "hatched and named") — a refresh while sitting on
 * NamingScreen's own post-name "{petName}과 함께 놀아볼까요?" sub-state
 * must NOT be mistaken for a genuine returning visit (see game-flow.tsx's
 * boot-restore effect, which uses this to tell the two apart and route
 * accordingly).
 */
export function loadHomeEntered(petKey: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return loadStored()?.petKey === petKey
  } catch {
    return true // fail open — never let a storage error re-trap a real returning user on the naming transition
  }
}

export function markHomeEntered(petKey: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ petKey }))
  } catch {
    // best-effort only
  }
}
