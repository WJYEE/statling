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
  /** All-time sum — what "전체 랭킹" (the only XP ranking currently live — see ranking-screen.tsx's own "no daily/weekly view exists yet" note) sorts by. */
  totalXp: number
  /**
   * Sum since this state's `weekKey`, intended for a future "주간 랭킹" — no
   * current UI/RPC reads this yet (see xp_totals.weekly_xp/week_key's own
   * migration comment). Kept accurate anyway so that whenever that feature
   * ships, its history isn't backdated by whatever this column happened to
   * hold before anyone read it. Reset (not decremented from totalXp) the
   * moment a read/write crosses into a new week.
   */
  weeklyXp: number
  /** Monday 00:00 KST (Asia/Seoul) of the week weeklyXp is currently accumulating for, as 'YYYY-MM-DD' — see mondayKeyOf below. */
  weekKey: string
  updatedAt: string
}

const STORAGE_KEY = 'statling.xp.v1'

/**
 * `date`'s calendar date in Asia/Seoul, as `{year, month (0-based), day}` —
 * unlike `date.getFullYear()`/`getMonth()`/`getDate()` (which read whatever
 * timezone the CALLING device/runtime happens to be set to), this always
 * projects the same real instant onto the same fixed Asia/Seoul calendar
 * date no matter what timezone the browser/OS is configured for. That
 * device-dependence was the actual bug in the previous implementation here
 * (despite its own doc comment claiming UTC-stability) — see the Statling
 * "주간 랭킹 KST 기준" QA report.
 */
function seoulDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month') - 1, day: get('day') }
}

/**
 * Monday-anchored week key for the Asia/Seoul calendar week containing
 * `date`'s real instant — i.e. the boundary is KST Monday 00:00, matching
 * "주간 랭킹은 한국시간 월요일 00:00~일요일 23:59" (Statling's primary user base is
 * Korean). Stable regardless of the CALLER's own timezone (server render, a
 * device set to a non-KST zone, ...) since the calendar date itself comes
 * from seoulDateParts's fixed Asia/Seoul projection — only the Monday-offset
 * arithmetic below still uses UTC internally, and that's safe precisely
 * because by this point the y/m/d already ARE the correct Seoul calendar
 * date, so there's nothing further to shift.
 */
function mondayKeyOf(date: Date): string {
  const { year, month, day } = seoulDateParts(date)
  const d = new Date(Date.UTC(year, month, day))
  const dow = d.getUTCDay() // 0 (Sun) - 6 (Sat)
  const diffToMonday = (dow === 0 ? -6 : 1) - dow
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
