const STORAGE_KEY = 'statling.onboardingSeen.v2'

interface StoredSeen {
  /** Which Statling this "seen" applies to — see StoredPetProfile.confirmedAt (unique per confirm/hatch, stable across reloads). */
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

/**
 * Whether `petKey`'s Home onboarding guide (see home-onboarding-guide.tsx)
 * has already been shown/dismissed once. Scoped PER PET (`petKey` — pass
 * the confirmed pet's `confirmedAt`, unique per confirm/hatch), not a
 * single global "seen anything ever" flag — a brand-new Statling (a fresh
 * confirm, e.g. after "처음부터 다시 하기") must be treated as never-seen
 * even though a PREVIOUS Statling's guide was already dismissed on this
 * same device. `petKey` defaults for legacy callers with no per-pet
 * identity (see onboarding-modal.tsx, no longer wired up but still
 * compiling against this same module). Storage version bumped to `.v2` so
 * a stale flag from before this per-pet scoping existed can never be
 * misread as "this specific pet was already seen".
 */
export function loadOnboardingSeen(petKey = 'legacy'): boolean {
  if (typeof window === 'undefined') return true
  try {
    return loadStored()?.petKey === petKey
  } catch {
    return true // fail open — never let a storage error force the guide to keep reappearing every visit
  }
}

export function markOnboardingSeen(petKey = 'legacy'): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ petKey }))
  } catch {
    // best-effort only — a failed write just means the guide may auto-show again next time, not a functional break
  }
}
