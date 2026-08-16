import type { GameDifficulty } from '@/lib/game/difficulty'

export type NumberPatternRuleType =
  | 'arithmetic'
  | 'geometric'
  | 'alternating'
  | 'increasing-diff'
  | 'figurate'
  | 'fibonacci-like'
  | 'compound'

export interface NumberPatternQuestion {
  id: string
  /** The blank is always the last entry (null). */
  sequence: Array<number | null>
  choices: number[]
  answer: number
  explanation: string
  /**
   * Content difficulty tag — since the 2026-08 rework this is the actual
   * pool a player's chosen GameDifficulty draws from 1:1 (see
   * pickNumberPatternSession), not just a label. Every tier has >=12
   * questions.
   */
  difficulty: GameDifficulty
  ruleType: NumberPatternRuleType
}

/**
 * 49 hand-verified static questions (spec: "정적 문제 은행을 사용" — never
 * runtime-random-generated; 13 easy / 12 normal / 12 hard / 12 extreme, all
 * at/above the "난이도별 최소 12개" floor). Every entry's `explanation` was
 * checked against its `sequence`/`answer` by hand before being frozen here,
 * `choices` always contains `answer` exactly once with no duplicate values,
 * and the blank is always the sequence's last (and only) `null`.
 *
 * v3 (2026-08 difficulty rework, GAME_SPEC §14): previously every tier's
 * session mixed easy/normal/hard questions by fixed INDEX POSITION inside
 * the session regardless of the player's chosen GameDifficulty — Extreme
 * players got the exact same question mix as Easy players. The bank is now
 * split into 4 real tier-exclusive pools and pickNumberPatternSession reads
 * only the pool matching the player's tier. The 3 old `fibonacci-like` and
 * 2 old `figurate` "hard" questions (genuinely multi-step recurrences) were
 * re-tagged `extreme`; 5 new `hard` and 7 new `extreme` questions were
 * added to keep both pools >=12.
 */
export const NUMBER_PATTERN_QUESTIONS: NumberPatternQuestion[] = [
  {
    id: 'arithmetic-1-1',
    sequence: [1, 3, 5, 7, null],
    choices: [8, 11, 7, 9],
    answer: 9,
    explanation: '2씩 커지는 규칙이에요. 7 + 2 = 9',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-2-2',
    sequence: [2, 5, 8, 11, null],
    choices: [12, 17, 14, 16],
    answer: 14,
    explanation: '3씩 커지는 규칙이에요. 11 + 3 = 14',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-3-3',
    sequence: [3, 7, 11, 15, null],
    choices: [16, 19, 17, 22],
    answer: 19,
    explanation: '4씩 커지는 규칙이에요. 15 + 4 = 19',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-4-4',
    sequence: [5, 7, 9, 11, null],
    choices: [13, 16, 10, 15],
    answer: 13,
    explanation: '2씩 커지는 규칙이에요. 11 + 2 = 13',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-5-5',
    sequence: [10, 14, 18, 22, null],
    choices: [23, 30, 22, 26],
    answer: 26,
    explanation: '4씩 커지는 규칙이에요. 22 + 4 = 26',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-6-6',
    sequence: [30, 27, 24, 21, null],
    choices: [15, 19, 18, 21],
    answer: 18,
    explanation: '3씩 작아지는 규칙이에요. 21 - 3 = 18',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-7-7',
    sequence: [40, 35, 30, 25, null],
    choices: [19, 20, 15, 21],
    answer: 20,
    explanation: '5씩 작아지는 규칙이에요. 25 - 5 = 20',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-8-8',
    sequence: [25, 23, 21, 19, null],
    choices: [17, 18, 16, 19],
    answer: 17,
    explanation: '2씩 작아지는 규칙이에요. 19 - 2 = 17',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'geometric-9-9',
    sequence: [1, 2, 4, 8, null],
    choices: [15, 18, 14, 16],
    answer: 16,
    explanation: '2배씩 커지는 규칙이에요. 8 × 2 = 16',
    difficulty: 'easy',
    ruleType: 'geometric',
  },
  {
    id: 'geometric-10-10',
    sequence: [2, 4, 8, 16, null],
    choices: [30, 35, 32, 34],
    answer: 32,
    explanation: '2배씩 커지는 규칙이에요. 16 × 2 = 32',
    difficulty: 'easy',
    ruleType: 'geometric',
  },
  {
    id: 'geometric-11-11',
    sequence: [1, 3, 9, 27, null],
    choices: [78, 81, 79, 84],
    answer: 81,
    explanation: '3배씩 커지는 규칙이에요. 27 × 3 = 81',
    difficulty: 'easy',
    ruleType: 'geometric',
  },
  {
    id: 'arithmetic-12-12',
    sequence: [2, 4, 6, 8, null],
    choices: [10, 13, 7, 12],
    answer: 10,
    explanation: '짝수가 2씩 커지는 규칙이에요. 8 + 2 = 10',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-13-13',
    sequence: [1, 3, 5, 7, null],
    choices: [6, 11, 7, 9],
    answer: 9,
    explanation: '홀수가 2씩 커지는 규칙이에요. 7 + 2 = 9',
    difficulty: 'easy',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-20-14',
    sequence: [4, 10, 16, 22, null],
    choices: [22, 29, 28, 34],
    answer: 28,
    explanation: '6씩 커지는 규칙이에요. 22 + 6 = 28',
    difficulty: 'normal',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-21-15',
    sequence: [7, 12, 17, 22, null],
    choices: [26, 27, 22, 28],
    answer: 27,
    explanation: '5씩 커지는 규칙이에요. 22 + 5 = 27',
    difficulty: 'normal',
    ruleType: 'arithmetic',
  },
  {
    id: 'arithmetic-60-16',
    sequence: [5, 9, 13, 17, null],
    choices: [21, 22, 20, 23],
    answer: 21,
    explanation: '4씩 커지는 규칙이에요. 17 + 4 = 21',
    difficulty: 'normal',
    ruleType: 'arithmetic',
  },
  {
    id: 'geometric-22-17',
    sequence: [3, 6, 12, 24, null],
    choices: [47, 50, 46, 48],
    answer: 48,
    explanation: '2배씩 커지는 규칙이에요. 24 × 2 = 48',
    difficulty: 'normal',
    ruleType: 'geometric',
  },
  {
    id: 'geometric-23-18',
    sequence: [2, 4, 8, 16, null],
    choices: [30, 35, 32, 34],
    answer: 32,
    explanation: '2배씩 커지는 규칙이에요. 16 × 2 = 32',
    difficulty: 'normal',
    ruleType: 'geometric',
  },
  {
    id: 'geometric-61-19',
    sequence: [4, 12, 36, 108, null],
    choices: [321, 324, 322, 327],
    answer: 324,
    explanation: '3배씩 커지는 규칙이에요. 108 × 3 = 324',
    difficulty: 'normal',
    ruleType: 'geometric',
  },
  {
    id: 'alternating-30-20',
    sequence: [1, 2, 3, 5, null],
    choices: [5, 8, 2, 6],
    answer: 5,
    explanation: '한 칸씩 건너뛴 두 수열이 번갈아 나와요. 3 + 2 = 5',
    difficulty: 'normal',
    ruleType: 'alternating',
  },
  {
    id: 'alternating-31-21',
    sequence: [2, 1, 5, 5, null],
    choices: [5, 12, 4, 8],
    answer: 8,
    explanation: '한 칸씩 건너뛴 두 수열이 번갈아 나와요. 5 + 3 = 8',
    difficulty: 'normal',
    ruleType: 'alternating',
  },
  {
    id: 'figurate-40-22',
    sequence: [2, 5, 11, 23, null],
    choices: [44, 48, 47, 50],
    answer: 47,
    explanation: '이전 수를 2배 하고 1만큼 더하는 규칙이에요. 23 × 2 + 1 = 47',
    difficulty: 'normal',
    ruleType: 'figurate',
  },
  {
    id: 'figurate-41-23',
    sequence: [1, 5, 17, 53, null],
    choices: [160, 161, 156, 162],
    answer: 161,
    explanation: '이전 수를 3배 하고 2만큼 더하는 규칙이에요. 53 × 3 + 2 = 161',
    difficulty: 'normal',
    ruleType: 'figurate',
  },
  {
    id: 'alternating-50-24',
    sequence: [1, 2, 5, 1, null],
    choices: [2, 3, 1, 4],
    answer: 2,
    explanation: '1, 2, 5 세 수가 순서대로 반복되는 규칙이에요.',
    difficulty: 'normal',
    ruleType: 'alternating',
  },
  {
    id: 'alternating-51-25',
    sequence: [2, 4, 6, 2, null],
    choices: [3, 6, 2, 4],
    answer: 4,
    explanation: '2, 4, 6 세 수가 순서대로 반복되는 규칙이에요.',
    difficulty: 'normal',
    ruleType: 'alternating',
  },
  {
    id: 'increasing-diff-70-26',
    sequence: [1, 2, 4, 7, null],
    choices: [9, 14, 11, 13],
    answer: 11,
    explanation: '더해지는 값이 1씩 늘어나요. 7 + 4 = 11',
    difficulty: 'hard',
    ruleType: 'increasing-diff',
  },
  {
    id: 'increasing-diff-71-27',
    sequence: [2, 3, 6, 11, null],
    choices: [15, 18, 16, 21],
    answer: 18,
    explanation: '더해지는 값이 2씩 늘어나요. 11 + 7 = 18',
    difficulty: 'hard',
    ruleType: 'increasing-diff',
  },
  {
    id: 'increasing-diff-72-28',
    sequence: [1, 3, 6, 10, null],
    choices: [15, 18, 12, 20],
    answer: 15,
    explanation: '더해지는 값이 1씩 늘어나요. 10 + 5 = 15',
    difficulty: 'hard',
    ruleType: 'increasing-diff',
  },
  {
    id: 'increasing-diff-120-29',
    sequence: [3, 5, 8, 12, null],
    choices: [14, 22, 12, 17],
    answer: 17,
    explanation: '더해지는 값이 1씩 늘어나요. 12 + 5 = 17',
    difficulty: 'hard',
    ruleType: 'increasing-diff',
  },
  {
    id: 'fibonacci-like-80-30',
    sequence: [1, 1, 2, 3, null],
    choices: [2, 6, 5, 8],
    answer: 5,
    explanation: '바로 앞 두 수를 더한 값이에요. 3 + 2 = 5',
    difficulty: 'extreme',
    ruleType: 'fibonacci-like',
  },
  {
    id: 'fibonacci-like-81-31',
    sequence: [1, 2, 3, 5, null],
    choices: [7, 8, 3, 9],
    answer: 8,
    explanation: '바로 앞 두 수를 더한 값이에요. 5 + 3 = 8',
    difficulty: 'extreme',
    ruleType: 'fibonacci-like',
  },
  {
    id: 'fibonacci-like-82-32',
    sequence: [2, 3, 5, 8, null],
    choices: [13, 14, 12, 15],
    answer: 13,
    explanation: '바로 앞 두 수를 더한 값이에요. 8 + 5 = 13',
    difficulty: 'extreme',
    ruleType: 'fibonacci-like',
  },
  {
    id: 'alternating-90-33',
    sequence: [3, 1, 7, 6, null],
    choices: [10, 13, 9, 11],
    answer: 11,
    explanation: '한 칸씩 건너뛴 두 수열이 번갈아 나와요. 7 + 4 = 11',
    difficulty: 'hard',
    ruleType: 'alternating',
  },
  {
    id: 'alternating-91-34',
    sequence: [1, 4, 6, 7, null],
    choices: [9, 14, 11, 13],
    answer: 11,
    explanation: '한 칸씩 건너뛴 두 수열이 번갈아 나와요. 6 + 5 = 11',
    difficulty: 'hard',
    ruleType: 'alternating',
  },
  {
    id: 'alternating-110-35',
    sequence: [2, 5, 5, 7, null],
    choices: [5, 8, 6, 11],
    answer: 8,
    explanation: '한 칸씩 건너뛴 두 수열이 번갈아 나와요. 5 + 3 = 8',
    difficulty: 'hard',
    ruleType: 'alternating',
  },
  {
    id: 'figurate-100-36',
    sequence: [3, 5, 9, 17, null],
    choices: [33, 36, 30, 34],
    answer: 33,
    explanation: '이전 수를 2배 하고 1만큼 빼는 규칙이에요. 17 × 2 - 1 = 33',
    difficulty: 'extreme',
    ruleType: 'figurate',
  },
  {
    id: 'figurate-101-37',
    sequence: [5, 8, 14, 26, null],
    choices: [47, 54, 46, 50],
    answer: 50,
    explanation: '이전 수를 2배 하고 2만큼 빼는 규칙이에요. 26 × 2 - 2 = 50',
    difficulty: 'extreme',
    ruleType: 'figurate',
  },

  // --- New 'hard' questions (2026-08 tier rework) — increasing-diff / alternating, larger ranges. ---
  {
    id: 'increasing-diff-140-38',
    sequence: [3, 5, 9, 15, null],
    choices: [20, 23, 25, 21],
    answer: 23,
    explanation: '더해지는 값이 2씩 늘어나요. 15 + 8 = 23',
    difficulty: 'hard',
    ruleType: 'increasing-diff',
  },
  {
    id: 'increasing-diff-141-39',
    sequence: [4, 7, 12, 19, null],
    choices: [26, 28, 30, 25],
    answer: 28,
    explanation: '더해지는 값이 2씩 늘어나요. 19 + 9 = 28',
    difficulty: 'hard',
    ruleType: 'increasing-diff',
  },
  {
    id: 'increasing-diff-142-40',
    sequence: [50, 45, 38, 29, null],
    choices: [16, 18, 20, 15],
    answer: 18,
    explanation: '빼는 값이 5, 7, 9로 2씩 늘어나요. 29 - 11 = 18',
    difficulty: 'hard',
    ruleType: 'increasing-diff',
  },
  {
    id: 'alternating-150-41',
    sequence: [5, 2, 9, 6, null],
    choices: [10, 13, 11, 15],
    answer: 13,
    explanation: '한 칸씩 건너뛴 두 수열이 번갈아 나와요. 9 + 4 = 13',
    difficulty: 'hard',
    ruleType: 'alternating',
  },
  {
    id: 'alternating-151-42',
    sequence: [3, 6, 9, 3, null],
    choices: [9, 3, 6, 12],
    answer: 6,
    explanation: '3, 6, 9 세 수가 순서대로 반복되는 규칙이에요.',
    difficulty: 'hard',
    ruleType: 'alternating',
  },

  // --- New 'extreme' questions (2026-08 tier rework) — compound/multi-step rules requiring identifying more than one operation or more than one sub-sequence. ---
  {
    id: 'compound-200-43',
    sequence: [1, 2, 4, 7, 12, null],
    choices: [18, 20, 22, 19],
    answer: 20,
    explanation: '바로 앞 두 수를 더하고 1을 더하는 규칙이에요. 12 + 7 + 1 = 20',
    difficulty: 'extreme',
    ruleType: 'compound',
  },
  {
    id: 'compound-201-44',
    sequence: [1, 3, 8, 19, 42, null],
    choices: [87, 89, 91, 85],
    answer: 89,
    explanation: '이전 수를 2배 하고, 더하는 값이 1씩 늘어나는 규칙이에요. 42 × 2 + 5 = 89',
    difficulty: 'extreme',
    ruleType: 'compound',
  },
  {
    id: 'compound-202-45',
    sequence: [4, 8, 5, 10, 7, null],
    choices: [11, 14, 17, 12],
    answer: 14,
    explanation: '2배와 -3이 번갈아 적용되는 규칙이에요. 7 × 2 = 14',
    difficulty: 'extreme',
    ruleType: 'compound',
  },
  {
    id: 'compound-203-46',
    sequence: [1, 1, 2, 4, 7, null],
    choices: [11, 13, 14, 12],
    answer: 13,
    explanation: '바로 앞 세 수를 더하는 규칙이에요. 2 + 4 + 7 = 13',
    difficulty: 'extreme',
    ruleType: 'compound',
  },
  {
    id: 'compound-204-47',
    sequence: [1, 2, 4, 7, 8, null],
    choices: [9, 10, 11, 12],
    answer: 10,
    explanation: '+1, +2, +3이 반복해서 더해지는 규칙이에요. 8 + 2 = 10',
    difficulty: 'extreme',
    ruleType: 'compound',
  },
  {
    id: 'compound-205-48',
    sequence: [1, 3, 2, 6, 4, null],
    choices: [8, 9, 10, 7],
    answer: 9,
    explanation: '홀수 번째 수는 2배씩, 짝수 번째 수는 3씩 커지는 서로 다른 규칙이 번갈아 나와요. 6 + 3 = 9',
    difficulty: 'extreme',
    ruleType: 'compound',
  },
  {
    id: 'compound-206-49',
    sequence: [2, 3, 6, 15, 42, null],
    choices: [119, 123, 127, 115],
    answer: 123,
    explanation: '더해지는 값이 3배씩 커지는 규칙이에요. 42 + 81 = 123',
    difficulty: 'extreme',
    ruleType: 'compound',
  },
]

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Draws one session's worth of questions from the static bank (spec:
 * "총 6~10문제", "문제 순서 랜덤, 선택지 순서 랜덤, 같은 답이 중복되지
 * 않게"), sampled ONLY from the pool tagged with the player's chosen
 * `difficulty` (v3: previously ramped easy -> normal -> hard by index
 * position inside the session regardless of the player's actual tier — see
 * the module doc comment). Choice order is reshuffled per pick even though
 * the underlying bank entry is frozen, so the correct choice's position
 * varies session to session.
 */
export function pickNumberPatternSession(difficulty: GameDifficulty, questionCount = 8): NumberPatternQuestion[] {
  const tierPool = NUMBER_PATTERN_QUESTIONS.filter((q) => q.difficulty === difficulty)

  const usedIds = new Set<string>()
  const usedAnswers = new Set<number>()
  const picked: NumberPatternQuestion[] = []

  for (let i = 0; i < questionCount; i++) {
    const unused = tierPool.filter((q) => !usedIds.has(q.id))
    const noAnswerClash = unused.filter((q) => !usedAnswers.has(q.answer))
    const pool = noAnswerClash.length > 0 ? noAnswerClash : unused
    if (pool.length === 0) break
    const chosen = pool[Math.floor(Math.random() * pool.length)]
    usedIds.add(chosen.id)
    usedAnswers.add(chosen.answer)
    picked.push({ ...chosen, choices: shuffle(chosen.choices) })
  }

  return picked
}
