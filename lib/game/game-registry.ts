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
  /** One short line describing what this game itself is — shown on GrowGameScreen's tier-select step once a game is picked (primary/orange, same slot every game). Not a difficulty-state description. */
  description: string
}

/**
 * Every stat's game pool — the original game first (unchanged, still the
 * default/first-seen game), the new game appended second. Adding a game to
 * a stat only ever means appending another entry here; nothing else needs
 * to know the pool size.
 */
export const GAME_POOL: Record<StatId, GamePoolEntry[]> = {
  reaction: [
    {
      key: 'reaction-classic',
      stat: 'reaction',
      name: '신호 반응',
      estimatedSeconds: 25,
      description: '신호가 나타나면 최대한 빠르게 탭하세요.',
    },
    {
      key: 'reaction-dodge-run',
      stat: 'reaction',
      name: '장애물 피하기',
      estimatedSeconds: 40,
      description: '좌우로 이동하며 떨어지는 장애물을 피하세요.',
    },
  ],
  memory: [
    {
      key: 'memory-classic',
      stat: 'memory',
      name: '패턴 기억',
      estimatedSeconds: 30,
      description: '분홍색으로 깜빡이는 타일의 위치를 기억하세요.',
    },
    {
      key: 'memory-story-recall',
      stat: 'memory',
      name: '물건 기억',
      estimatedSeconds: 50,
      description: '여러 물건을 잘 보고 기억한 뒤, 질문에 답하세요.',
    },
  ],
  focus: [
    {
      key: 'focus-classic',
      stat: 'focus',
      name: '표적 찾기',
      estimatedSeconds: 28,
      description: '정해진 모양만 찾아 눌러보세요.',
    },
    {
      key: 'focus-color-target',
      stat: 'focus',
      name: '특정 색만 클릭',
      estimatedSeconds: 40,
      description: '화면에 뜨는 색깔 단어를 보고, 지금 규칙에 맞는 색을 클릭하세요.',
    },
  ],
  judgment: [
    {
      key: 'judgment-classic',
      stat: 'judgment',
      name: '규칙 전환',
      estimatedSeconds: 28,
      description: '규칙에 맞게 Block을 빠르고 정확하게 처리하세요.',
    },
    {
      key: 'decision-best-choice',
      stat: 'judgment',
      name: '무엇을 선택할까',
      estimatedSeconds: 45,
      description: '두 가지 중 사실에 맞는 답을 빠르고 정확하게 고르세요.',
    },
  ],
  spatial: [
    {
      key: 'spatial-classic',
      stat: 'spatial',
      name: '회전 도형 찾기',
      estimatedSeconds: 28,
      description: '기준 조각을 머릿속으로 돌렸을 때 같은 모양이 되는 조각을 찾으세요.',
    },
    {
      key: 'spatial-fit-puzzle',
      stat: 'spatial',
      name: '퍼즐 끼우기',
      estimatedSeconds: 50,
      description: '퍼즐 조각을 드래그해서 빈 공간에 알맞게 끼우세요.',
    },
  ],
  reasoning: [
    {
      key: 'reasoning-classic',
      stat: 'reasoning',
      name: '규칙 찾기',
      estimatedSeconds: 30,
      description: '앞의 패턴에서 숨은 규칙을 찾아 다음에 올 것을 고르세요.',
    },
    {
      key: 'reasoning-number-pattern',
      stat: 'reasoning',
      name: '숫자 규칙',
      estimatedSeconds: 45,
      description: '숫자들이 나열된 규칙을 찾아 빈칸에 들어갈 값을 고르세요.',
    },
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
