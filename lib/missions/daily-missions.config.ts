/**
 * 일일 미션 definitions — the only place mission copy/targets/rewards live,
 * so tuning a target or adding a new daily mission never touches
 * lib/missions/daily-mission-storage.ts or lib/missions/mission-tracker.ts.
 * `trigger` identifies which tracked event increments a mission's progress
 * — see mission-tracker.ts's track* functions for where each fires.
 */
export type DailyMissionTrigger =
  | 'attendance'
  | 'anyGamePlayed'
  | 'anyInteraction'
  | 'careAction'
  | 'talk'
  | 'freePlayRecord'

export interface DailyMissionDef {
  id: string
  title: string
  description: string
  target: number
  rewardXp: number
  trigger: DailyMissionTrigger
}

/** All possible daily missions — only DAILY_MISSIONS_SHOWN_COUNT of these are exposed on any given day, see pickTodayMissions. */
export const DAILY_MISSIONS: DailyMissionDef[] = [
  {
    id: 'daily-attendance',
    title: '오늘 출석하기',
    description: 'Statling을 만나러 와주세요.',
    target: 1,
    rewardXp: 10,
    trigger: 'attendance',
  },
  {
    id: 'daily-play-game',
    title: '미니게임 1판 플레이',
    description: '아무 미니게임이나 1판 플레이해보세요.',
    target: 1,
    rewardXp: 15,
    trigger: 'anyGamePlayed',
  },
  {
    id: 'daily-interact-3',
    title: 'Statling과 3회 상호작용',
    description: '먹이주기·씻기기·놀기·쓰다듬기·대화 중 아무거나 3번 해주세요.',
    target: 3,
    rewardXp: 10,
    trigger: 'anyInteraction',
  },
  {
    id: 'daily-care-action',
    title: '먹이/씻기/놀기 중 1회 수행',
    description: '먹이주기, 씻기기, 놀기 중 하나를 해주세요.',
    target: 1,
    rewardXp: 10,
    trigger: 'careAction',
  },
  {
    id: 'daily-talk',
    title: '대화 1회',
    description: 'Statling과 대화를 나눠보세요.',
    target: 1,
    rewardXp: 10,
    trigger: 'talk',
  },
  {
    id: 'daily-free-play',
    title: '자유 플레이 기록 1회 남기기',
    description: '자유 플레이에서 게임을 1판 완료해보세요.',
    target: 1,
    rewardXp: 15,
    trigger: 'freePlayRecord',
  },
]

/** How many of DAILY_MISSIONS are exposed on a given day — spec asks for "3~5개 정도". */
export const DAILY_MISSIONS_SHOWN_COUNT = 4

/** Tiny FNV-1a-ish hash — local to this file (no cross-import from lib/ranking's identical helper, these are unrelated features that happen to need the same trick). */
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministically picks DAILY_MISSIONS_SHOWN_COUNT missions for `dateKey`
 * (see lib/missions/attendance-storage.ts#localDateKey) — a circular slice
 * starting at a date-seeded offset, so the shown set rotates day to day but
 * is stable for any given date (no reshuffling on remount/reload).
 */
export function pickTodayMissions(dateKey: string): DailyMissionDef[] {
  const offset = hashSeed(dateKey) % DAILY_MISSIONS.length
  const rotated = [...DAILY_MISSIONS.slice(offset), ...DAILY_MISSIONS.slice(0, offset)]
  return rotated.slice(0, DAILY_MISSIONS_SHOWN_COUNT)
}
