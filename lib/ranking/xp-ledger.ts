/**
 * Ranking XP ledger — deliberately separate from lib/pet-care/leveling.ts's
 * intimacyExp (pet-bonding progress) and from lib/game/player-skill-storage.ts's
 * per-game normalizedScore (skill history). This is the one running number
 * Ranking (lib/ranking/ranking-provider.ts) sorts by: 1 gameScore point (0-100,
 * already clamped upstream by each game's scoring function) earned on every
 * *valid* mini-game completion = 1 XP, no separate multiplier/curve — see
 * addXp's call site (game-flow.tsx#recordSkillCompletion), the same choke
 * point every on*Complete handler already funnels through.
 */
export interface XpState {
  version: 1
  /** All-time sum — what "전체 랭킹" sorts by. */
  totalXp: number
  /** Sum since this state's `weekKey` — what "주간 랭킹" sorts by. Reset (not decremented from totalXp) the moment a read/write crosses into a new week. */
  weeklyXp: number
  /** Monday (UTC) of the week weeklyXp is currently accumulating for, as 'YYYY-MM-DD'. */
  weekKey: string
  updatedAt: string
}

const STORAGE_KEY = 'statling.xp.v1'

/** Monday-anchored week key, computed in UTC so it's stable regardless of the player's local timezone offset. */
function mondayKeyOf(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() // 0 (Sun) - 6 (Sat)
  const diffToMonday = (day === 0 ? -6 : 1) - day
  d.setUTCDate(d.getUTCDate() + diffToMonday)
  return d.toISOString().slice(0, 10)
}

export function createDefaultXpState(now: Date = new Date()): XpState {
  return { version: 1, totalXp: 0, weeklyXp: 0, weekKey: mondayKeyOf(now), updatedAt: new Date(0).toISOString() }
}

/** Resets weeklyXp to 0 exactly when `now` has crossed into a new Monday-anchored week since the state's weekKey — totalXp is never touched here. */
function rollOverIfNewWeek(state: XpState, now: Date): XpState {
  const currentWeekKey = mondayKeyOf(now)
  if (currentWeekKey === state.weekKey) return state
  return { ...state, weeklyXp: 0, weekKey: currentWeekKey }
}

function isWellFormed(value: Record<string, unknown>): value is Record<string, unknown> & {
  totalXp: number
  weeklyXp: number
  weekKey: string
} {
  return typeof value.totalXp === 'number' && typeof value.weeklyXp === 'number' && typeof value.weekKey === 'string'
}

/** Always returns a state whose weekKey matches `now` — a stale week is rolled over (and the rollover persisted) before this returns, so every caller sees an already-current weeklyXp without repeating the rollover check itself. */
export function loadXpState(now: Date = new Date()): XpState {
  if (typeof window === 'undefined') return createDefaultXpState(now)
  let base: XpState
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    base =
      parsed && isWellFormed(parsed)
        ? {
            version: 1,
            totalXp: Math.max(0, parsed.totalXp),
            weeklyXp: Math.max(0, parsed.weeklyXp),
            weekKey: parsed.weekKey,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
          }
        : createDefaultXpState(now)
  } catch {
    base = createDefaultXpState(now)
  }
  const rolled = rollOverIfNewWeek(base, now)
  if (rolled !== base) saveXpState(rolled)
  return rolled
}

export function saveXpState(state: XpState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** Cross-account contamination fix — see lib/pets/reset-foreign-account-state.ts. Wipes this device's XP ledger; only ever called when it's just been confirmed to belong to a DIFFERENT, now-signed-out account. */
export function clearXpState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

/** Pure reducer: applies the weekly rollover first (so a completion right after a week boundary starts the new week's tally from 0, not a stale carry-over), then adds `amount` to both totals. */
export function addXp(state: XpState, amount: number, now: Date = new Date()): XpState {
  const rolled = rollOverIfNewWeek(state, now)
  const gained = Math.max(0, Math.round(amount))
  return { ...rolled, totalXp: rolled.totalXp + gained, weeklyXp: rolled.weeklyXp + gained, updatedAt: now.toISOString() }
}
