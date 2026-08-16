import { PLAY_ORDER, type StatId } from '@/lib/brain-bet'

/**
 * Metadata only — no component references here (this file is imported by
 * game-flow.tsx, which does the actual component switch, keeping lib/ free
 * of React/component imports like the rest of lib/game).
 */
export interface GamePoolEntry {
  /** Stable key identifying one specific game, e.g. 'reaction-classic' | 'reaction-dodge-run'. */
  key: string
  stat: StatId
  name: string
  estimatedSeconds: number
}

/**
 * Every stat's game pool — the original game first (unchanged, still the
 * default/first-seen game), the new game appended second. Adding a game to
 * a stat only ever means appending another entry here; nothing else needs
 * to know the pool size.
 */
export const GAME_POOL: Record<StatId, GamePoolEntry[]> = {
  reaction: [
    { key: 'reaction-classic', stat: 'reaction', name: '신호 반응', estimatedSeconds: 25 },
    { key: 'reaction-dodge-run', stat: 'reaction', name: '장애물 피하기', estimatedSeconds: 40 },
  ],
  memory: [
    { key: 'memory-classic', stat: 'memory', name: '패턴 기억', estimatedSeconds: 30 },
    { key: 'memory-story-recall', stat: 'memory', name: '물건 기억', estimatedSeconds: 50 },
  ],
  focus: [
    { key: 'focus-classic', stat: 'focus', name: '표적 찾기', estimatedSeconds: 28 },
    { key: 'focus-color-target', stat: 'focus', name: '특정 색만 클릭', estimatedSeconds: 40 },
  ],
  judgment: [
    { key: 'judgment-classic', stat: 'judgment', name: '규칙 전환', estimatedSeconds: 28 },
    { key: 'decision-best-choice', stat: 'judgment', name: '무엇을 선택할까', estimatedSeconds: 45 },
  ],
  spatial: [
    { key: 'spatial-classic', stat: 'spatial', name: '회전 도형 찾기', estimatedSeconds: 28 },
    { key: 'spatial-fit-puzzle', stat: 'spatial', name: '퍼즐 끼우기', estimatedSeconds: 50 },
  ],
  reasoning: [
    { key: 'reasoning-classic', stat: 'reasoning', name: '규칙 찾기', estimatedSeconds: 30 },
    { key: 'reasoning-number-pattern', stat: 'reasoning', name: '숫자 규칙', estimatedSeconds: 45 },
  ],
}

/**
 * The original ("classic") game in each pool — always used for First Play
 * (the 6-game onboarding sequence). Free Play instead lets the player pick
 * any pool entry explicitly (see GrowGameScreen) rather than auto-selecting
 * one, so this is the only place a game gets picked without the player
 * choosing it.
 */
export function getClassicGameKey(stat: StatId): string {
  return GAME_POOL[stat][0].key
}

/** All 6 stats' pools, in play order — used by anything that needs to enumerate every registered game. */
export function allGamePools(): GamePoolEntry[] {
  return PLAY_ORDER.flatMap((stat) => GAME_POOL[stat])
}

/** Display name for a registered game key (e.g. 'memory-story-recall' -> '물건 기억') — used by StatusScreen's per-game stat breakdown. Falls back to the raw key so an unregistered/stale id never crashes the UI. */
export function getGameDisplayName(gameKey: string): string {
  return allGamePools().find((entry) => entry.key === gameKey)?.name ?? gameKey
}

/** How many games are registered under one stat's pool (currently 2 for every stat) — the denominator for StatusScreen's "n/전체개 게임 반영" badge. */
export function getGamePoolSize(stat: StatId): number {
  return GAME_POOL[stat].length
}
