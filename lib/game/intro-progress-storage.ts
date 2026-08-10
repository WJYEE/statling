import { PLAY_ORDER, TOTAL_GAMES, type StatId } from '@/lib/brain-bet'
import { INTRO_PROGRESS_STALE_MS } from '@/lib/config/intro-progress.config'
import { generateSessionId } from '@/lib/game/id'

/**
 * One First-Play game finished during the current Intro run — enough to
 * rebuild `finals` for that stat on resume (see game-flow.tsx's `enterStatGame`
 * for what a fresh play of this stat would otherwise reset). `gameKey` is
 * recorded for completeness (which of the stat's pool entries was played —
 * always the classic one during Intro, see getClassicGameKey) but resume
 * itself only ever needs `statId`/`gameScore`.
 */
export interface IntroCompletedGame {
  statId: StatId
  gameKey: string
  gameScore: number
  completedAt: string
}

/**
 * Checkpoint for the sequential 6-game Intro/First-Play run — separate from
 * lib/game/player-skill-storage.ts's PlayerSkillState (cross-session
 * best-per-game ledger, never cleared) and from lib/pets/pet-storage.ts's
 * StoredPetProfile (only written once the full run finishes). This is
 * intentionally temporary: cleared the moment all 6 games are done (see
 * clearIntroProgress, called from game-flow.tsx's goNextFirst) or once it
 * goes stale (see INTRO_PROGRESS_STALE_MS) — it only exists to answer "can I
 * offer 이어서 하기 right now," never as a permanent record.
 *
 * completedGames is always in PLAY_ORDER sequence (Intro plays stats strictly
 * in order, one at a time) — so `completedGames.length` alone is both "how
 * many stats are done" and "the index of the next stat to play," with no
 * separate index field to ever drift out of sync.
 */
export interface IntroProgressState {
  sessionId: string
  completedGames: IntroCompletedGame[]
  startedAt: string
  updatedAt: string
}

const STORAGE_KEY = 'statling.introProgress.v1'

function isWellFormed(value: Record<string, unknown>): boolean {
  return typeof value.sessionId === 'string' && Array.isArray(value.completedGames)
}

function sanitizeCompletedGames(raw: unknown): IntroCompletedGame[] {
  if (!Array.isArray(raw)) return []
  const validStatIds = new Set<string>(PLAY_ORDER)
  const result: IntroCompletedGame[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.statId !== 'string' || !validStatIds.has(e.statId)) continue
    if (typeof e.gameKey !== 'string') continue
    if (typeof e.gameScore !== 'number') continue
    if (typeof e.completedAt !== 'string') continue
    result.push({ statId: e.statId as StatId, gameKey: e.gameKey, gameScore: e.gameScore, completedAt: e.completedAt })
  }
  // Never trust a corrupted/out-of-order/duplicated list beyond TOTAL_GAMES —
  // a well-formed run can never have more entries than there are stats.
  return result.slice(0, TOTAL_GAMES)
}

/** Starts (and persists) a brand-new checkpoint — called from game-flow.tsx's `start()`, both for a genuinely first run and for "처음부터 다시 하기". */
export function startNewIntroProgress(): IntroProgressState {
  const now = new Date().toISOString()
  const state: IntroProgressState = { sessionId: generateSessionId(), completedGames: [], startedAt: now, updatedAt: now }
  saveIntroProgress(state)
  return state
}

/**
 * Returns the resumable checkpoint, or null when there's nothing to resume —
 * either no checkpoint was ever started, it already finished (cleared by
 * clearIntroProgress), or it's older than INTRO_PROGRESS_STALE_MS (silently
 * discarded rather than offered).
 */
export function loadIntroProgress(): IntroProgressState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !isWellFormed(parsed)) return null

    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    if (!updatedAt || Date.now() - new Date(updatedAt).getTime() > INTRO_PROGRESS_STALE_MS) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }

    const completedGames = sanitizeCompletedGames(parsed.completedGames)
    if (completedGames.length >= TOTAL_GAMES) return null // already finished — nothing left to resume

    return {
      sessionId: parsed.sessionId as string,
      completedGames,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : updatedAt,
      updatedAt,
    }
  } catch {
    return null
  }
}

export function saveIntroProgress(state: IntroProgressState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/**
 * Idempotent per-stat append: if `statId` is already recorded for this
 * checkpoint (Strict Mode double-invoke, a stray duplicate on*Complete call,
 * ...) the call is a no-op — every checkpoint has at most one entry per stat.
 */
export function recordIntroGameCompletion(
  state: IntroProgressState,
  entry: IntroCompletedGame,
): IntroProgressState {
  if (state.completedGames.some((g) => g.statId === entry.statId)) return state
  return { ...state, completedGames: [...state.completedGames, entry], updatedAt: entry.completedAt }
}

/**
 * Retry-aware counterpart to recordIntroGameCompletion — used only for a
 * stat's 1 Initial-Assessment retry (see game-flow.tsx's
 * handleRetryCurrentGame/recordIntroCheckpoint). A plain
 * recordIntroGameCompletion call would silently no-op here (the stat's entry
 * already exists from its first attempt), which would leave 이어서 하기
 * resuming from the *pre-retry* score even after a retry improved it — this
 * instead replaces the existing entry, but only when the retry's gameScore
 * is actually higher, so a worse or missing-checkpoint retry never
 * regresses (or fabricates) a checkpoint. Never creates a second entry for
 * the same stat — still exactly one entry per stat, same invariant as
 * recordIntroGameCompletion.
 */
export function upgradeIntroGameCompletion(
  state: IntroProgressState,
  entry: IntroCompletedGame,
): IntroProgressState {
  const index = state.completedGames.findIndex((g) => g.statId === entry.statId)
  if (index === -1) return recordIntroGameCompletion(state, entry) // defensive — no prior entry to upgrade, behaves like a normal first record
  if (entry.gameScore <= state.completedGames[index].gameScore) return state
  const completedGames = [...state.completedGames]
  completedGames[index] = entry
  return { ...state, completedGames, updatedAt: entry.completedAt }
}

/** Wipes the checkpoint — called once the full 6-game run finishes (goNextFirst) and from the real user-facing "펫 초기화" reset, so a stale partial run never lingers past either. */
export function clearIntroProgress(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
