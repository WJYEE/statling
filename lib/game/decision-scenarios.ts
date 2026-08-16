import type { GameDifficulty } from '@/lib/game/difficulty'

/**
 * 2026-08 content rework — this file used to hold 24 subjective "which
 * choice is most efficient" scenarios (0-100 partial-credit choices). It's
 * now "무엇을 선택할까": a binary (A/B) fact-comparison quiz with exactly one
 * objectively correct, verifiable answer per question — explicitly NOT
 * trivia/trend-dependent facts (no "which is more popular" style content),
 * and explicitly NOT comparisons where the real-world answer is ambiguous
 * or individual-dependent (e.g. "lion vs tiger weight" — real ranges
 * overlap; excluded on purpose). Every entry below is a well-established,
 * non-controversial fact. Kept the FILE NAME for minimal import churn (same
 * strategy as lib/game/story-memory-data.ts's rework).
 */

export interface ComparisonQuestion {
  id: string
  prompt: string
  itemA: string
  itemB: string
  /** Which of itemA/itemB is factually correct. */
  correct: 'A' | 'B'
}

/**
 * 8 questions per tier (32 total, spec-convention "최소 24개, 난이도별 최소
 * 8개" — matches number-pattern-data.ts's own "정적 문제 은행" precedent).
 * Easy = obviously large gaps. Normal = ordinary general knowledge. Hard =
 * closer comparisons or counter-intuitive-but-well-established facts.
 * Extreme = very close/surprising comparisons meant to be answered fast.
 */
export const COMPARISON_QUESTIONS: Record<GameDifficulty, ComparisonQuestion[]> = {
  easy: [
    { id: 'easy-1', prompt: '둘 중 더 큰 동물은?', itemA: '코끼리', itemB: '개미', correct: 'A' },
    { id: 'easy-2', prompt: '둘 중 더 빠른 동물은?', itemA: '치타', itemB: '거북이', correct: 'A' },
    { id: 'easy-3', prompt: '둘 중 더 무거운 것은?', itemA: '자동차', itemB: '자전거', correct: 'A' },
    { id: 'easy-4', prompt: '둘 중 더 높은 것은?', itemA: '에베레스트산', itemB: '책상', correct: 'A' },
    { id: 'easy-5', prompt: '둘 중 더 큰 것은?', itemA: '태양', itemB: '지구', correct: 'A' },
    { id: 'easy-6', prompt: '둘 중 더 많은 것은?', itemA: '사과 100개', itemB: '사과 10개', correct: 'A' },
    { id: 'easy-7', prompt: '둘 중 더 긴 것은?', itemA: '기차', itemB: '연필', correct: 'A' },
    { id: 'easy-8', prompt: '둘 중 더 오래 사는 동물은?', itemA: '거북이', itemB: '하루살이', correct: 'A' },
  ],
  normal: [
    { id: 'normal-1', prompt: '둘 중 더 빠른 동물은?', itemA: '말', itemB: '소', correct: 'A' },
    { id: 'normal-2', prompt: '둘 중 더 무거운 동물은?', itemA: '코뿔소', itemB: '늑대', correct: 'A' },
    { id: 'normal-3', prompt: '둘 중 몸집이 더 큰 새는?', itemA: '독수리', itemB: '참새', correct: 'A' },
    { id: 'normal-4', prompt: '둘 중 면적이 더 넓은 나라는?', itemA: '러시아', itemB: '대한민국', correct: 'A' },
    { id: 'normal-5', prompt: '둘 중 더 빠른 교통수단은?', itemA: '비행기', itemB: '자전거', correct: 'A' },
    { id: 'normal-6', prompt: '둘 중 더 뜨거운 것은?', itemA: '태양', itemB: '촛불', correct: 'A' },
    { id: 'normal-7', prompt: '둘 중 더 깊은 것은?', itemA: '태평양', itemB: '수영장', correct: 'A' },
    { id: 'normal-8', prompt: '둘 중 더 무거운 동물은?', itemA: '고래', itemB: '사람', correct: 'A' },
  ],
  hard: [
    { id: 'hard-1', prompt: '둘 중 순간 속도가 더 빠른 동물은?', itemA: '매(급강하 시)', itemB: '치타', correct: 'A' },
    { id: 'hard-2', prompt: '둘 중 평균적으로 더 무거운 동물은?', itemA: '하마', itemB: '기린', correct: 'A' },
    { id: 'hard-3', prompt: '둘 중 더 높은 산은?', itemA: '백두산', itemB: '한라산', correct: 'A' },
    { id: 'hard-4', prompt: '둘 중 더 오래된 건축물은?', itemA: '이집트 피라미드', itemB: '로마 콜로세움', correct: 'A' },
    { id: 'hard-5', prompt: '둘 중 반지름이 더 큰 행성은?', itemA: '천왕성', itemB: '해왕성', correct: 'A' },
    { id: 'hard-6', prompt: '같은 부피라면 둘 중 더 무거운 것은?', itemA: '금', itemB: '납', correct: 'A' },
    { id: 'hard-7', prompt: '둘 중 속도가 더 빠른 것은?', itemA: '소리', itemB: '일반 여객기', correct: 'A' },
    { id: 'hard-8', prompt: '둘 중 더 무거운 것은?', itemA: '사람의 뇌', itemB: '사람의 심장', correct: 'A' },
  ],
  extreme: [
    { id: 'extreme-1', prompt: '둘 중 반지름이 더 큰 행성은?', itemA: '목성', itemB: '토성', correct: 'A' },
    { id: 'extreme-2', prompt: '둘 중 더 높은 산은?', itemA: 'K2', itemB: '칸첸중가', correct: 'A' },
    { id: 'extreme-3', prompt: '둘 중 순간 속도가 더 빠른 동물은?', itemA: '치타', itemB: '프롱혼영양', correct: 'A' },
    { id: 'extreme-4', prompt: '둘 중 공전 주기가 더 긴 것은?', itemA: '지구(태양 공전)', itemB: '달(지구 공전)', correct: 'A' },
    { id: 'extreme-5', prompt: '같은 부피라면 둘 중 더 무거운 것은?', itemA: '물', itemB: '얼음', correct: 'A' },
    { id: 'extreme-6', prompt: '둘 중 더 빠른 것은?', itemA: '빛', itemB: '소리', correct: 'A' },
    { id: 'extreme-7', prompt: '둘 중 규모가 더 큰 것은?', itemA: '우리은하(은하수)', itemB: '태양계', correct: 'A' },
    { id: 'extreme-8', prompt: '둘 중 더 무거운 동물은?', itemA: '대왕고래', itemB: '아프리카코끼리', correct: 'A' },
  ],
}

export interface ComparisonRound {
  id: string
  prompt: string
  optionA: string
  optionB: string
  correctOption: 'A' | 'B'
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

/** Draws `count` questions from `difficulty`'s pool (capped at pool size), each with A/B option order randomized so the correct answer isn't always in the same slot. */
export function pickComparisonQuestions(difficulty: GameDifficulty, count: number): ComparisonRound[] {
  const pool = COMPARISON_QUESTIONS[difficulty]
  const picked = shuffle(pool).slice(0, Math.min(count, pool.length))
  return picked.map((q) => {
    const flip = Math.random() < 0.5
    return {
      id: q.id,
      prompt: q.prompt,
      optionA: flip ? q.itemB : q.itemA,
      optionB: flip ? q.itemA : q.itemB,
      correctOption: flip ? (q.correct === 'A' ? 'B' : 'A') : q.correct,
    }
  })
}
