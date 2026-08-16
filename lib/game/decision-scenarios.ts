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
 *
 * 2026-08 QA 2차 보정: Hard/Extreme's static pool used to lean on
 * specialist trivia (raptor dive speeds, planet radii, ancient monument
 * dates, gold vs lead density...) — QA found this measured "who happens to
 * know this fact" rather than "빠른 판단/두뇌 회전". Hard/Extreme now draw
 * from 5 PROCEDURALLY GENERATED mental-operation types instead (number
 * comparison, simple arithmetic, alphabet order, letter-count, closer-to-target)
 * — see MENTAL_OP_TYPES below — so every question is solvable on the spot
 * with no outside knowledge, with genuinely fresh numbers/letters/words each
 * session instead of a fixed 8-question bank. Easy/Normal keep their
 * original static, everyday-knowledge pool unchanged (still fine per spec:
 * "아주 쉬운 상식형 문제는 일부 유지 가능").
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
 * Easy/Normal only now (Hard/Extreme are procedurally generated — see
 * below). Easy = obviously large gaps. Normal = ordinary general knowledge,
 * still never ambiguous/culture-dependent.
 */
export const COMPARISON_QUESTIONS: Record<'easy' | 'normal', ComparisonQuestion[]> = {
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

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Draws `count` questions from `difficulty`'s pool (capped at pool size), each with A/B option order randomized so the correct answer isn't always in the same slot. */
export function pickComparisonQuestions(difficulty: GameDifficulty, count: number): ComparisonRound[] {
  if (difficulty === 'hard' || difficulty === 'extreme') {
    return generateMentalOpRounds(difficulty, count)
  }
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

// ---------------------------------------------------------------------------
// Hard/Extreme: procedurally generated "그 자리에서 계산/비교" rounds.
// No outside knowledge required — only reading numbers/letters/words that
// are shown directly in the question and comparing them.
// ---------------------------------------------------------------------------

type MentalOpType = 'number' | 'arithmetic' | 'alphabet' | 'letterCount' | 'closerTo'

const MENTAL_OP_TYPES: MentalOpType[] = ['number', 'arithmetic', 'alphabet', 'letterCount', 'closerTo']

/** Common, unambiguous Korean nouns — precomposed Hangul syllables are one JS string index each, so `.length` IS the real 글자 수, no manual counting needed. */
const LETTER_COUNT_WORD_POOL: string[] = [
  '물',
  '눈',
  '산',
  '별',
  '꽃',
  '집',
  '밥',
  '강',
  '나무',
  '하늘',
  '바다',
  '구름',
  '사람',
  '토끼',
  '여름',
  '겨울',
  '고양이',
  '호랑이',
  '코끼리',
  '자동차',
  '컴퓨터',
  '무지개',
  '오렌지',
  '강아지',
  '스마트폰',
  '텔레비전',
  '초등학교',
  '놀이공원',
  '아이스크림',
]

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** "더 큰 수는?" — two distinct integers within `range`, separated by a gap in `gapRange`. */
function genNumberCompare(id: string, range: [number, number], gapRange: [number, number]): ComparisonRound {
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = randomInt(range[0], range[1])
    const gap = randomInt(gapRange[0], gapRange[1]) * (Math.random() < 0.5 ? 1 : -1)
    const b = a + gap
    if (b >= range[0] && b <= range[1] && b !== a) {
      return { id, prompt: '더 큰 수는?', optionA: String(a), optionB: String(b), correctOption: a > b ? 'A' : 'B' }
    }
  }
  return { id, prompt: '더 큰 수는?', optionA: String(range[0]), optionB: String(range[1]), correctOption: 'B' }
}

/** Hard's "한 단계 계산" version: ONE side is a plain number, the other a single simple expression — one computation, then compare. */
function genArithmeticVsNumber(id: string, multRange: [number, number], addRange: [number, number]): ComparisonRound {
  for (let attempt = 0; attempt < 30; attempt++) {
    const useMult = Math.random() < 0.5
    const x = randomInt(useMult ? multRange[0] : addRange[0], useMult ? multRange[1] : addRange[1])
    const y = randomInt(useMult ? multRange[0] : addRange[0], useMult ? multRange[1] : addRange[1])
    const exprResult = useMult ? x * y : x + y
    const exprLabel = useMult ? `${x} × ${y}` : `${x} + ${y}`
    const plainNumber = exprResult + randomInt(1, 10) * (Math.random() < 0.5 ? 1 : -1)
    if (plainNumber === exprResult || plainNumber < 0) continue
    const flip = Math.random() < 0.5
    return {
      id,
      prompt: '계산 결과가 더 큰 것은?',
      optionA: flip ? String(plainNumber) : exprLabel,
      optionB: flip ? exprLabel : String(plainNumber),
      correctOption: (flip ? plainNumber > exprResult : exprResult > plainNumber) ? 'A' : 'B',
    }
  }
  return { id, prompt: '계산 결과가 더 큰 것은?', optionA: '7 × 4', optionB: '20', correctOption: 'A' }
}

/** Extreme's "조금 더 많은 mental operation" version: BOTH sides are expressions — two computations, then compare. */
function genArithmeticVsArithmetic(id: string, multRange: [number, number], addRange: [number, number]): ComparisonRound {
  for (let attempt = 0; attempt < 30; attempt++) {
    const m1 = randomInt(multRange[0], multRange[1])
    const m2 = randomInt(multRange[0], multRange[1])
    const a1 = randomInt(addRange[0], addRange[1])
    const a2 = randomInt(addRange[0], addRange[1])
    const productResult = m1 * m2
    const sumResult = a1 + a2
    if (productResult === sumResult) continue
    return {
      id,
      prompt: '계산 결과가 더 큰 것은?',
      optionA: `${m1} × ${m2}`,
      optionB: `${a1} + ${a2}`,
      correctOption: productResult > sumResult ? 'A' : 'B',
    }
  }
  return { id, prompt: '계산 결과가 더 큰 것은?', optionA: '7 × 4', optionB: '18 + 8', correctOption: 'A' }
}

/** "알파벳에서 더 앞에 오는 것은?" — two distinct letters. */
function genAlphabetOrder(id: string): ComparisonRound {
  const idxA = randomInt(0, 25)
  let idxB = randomInt(0, 25)
  while (idxB === idxA) idxB = randomInt(0, 25)
  return {
    id,
    prompt: '알파벳에서 더 앞에 오는 것은?',
    optionA: ALPHABET[idxA],
    optionB: ALPHABET[idxB],
    correctOption: idxA < idxB ? 'A' : 'B',
  }
}

/** "글자 수가 더 많은 것은?" — two Korean words whose syllable-count gap falls inside `gapRange` (Hard: a clear gap; Extreme: the closest possible gap, 1). */
function genLetterCount(id: string, gapRange: [number, number]): ComparisonRound {
  for (let attempt = 0; attempt < 40; attempt++) {
    const wordA = pick(LETTER_COUNT_WORD_POOL)
    const wordB = pick(LETTER_COUNT_WORD_POOL)
    if (wordA === wordB) continue
    const gap = Math.abs(wordA.length - wordB.length)
    if (gap < gapRange[0] || gap > gapRange[1]) continue
    return { id, prompt: '글자 수가 더 많은 것은?', optionA: wordA, optionB: wordB, correctOption: wordA.length > wordB.length ? 'A' : 'B' }
  }
  return { id, prompt: '글자 수가 더 많은 것은?', optionA: '아이스크림', optionB: '물', correctOption: 'A' }
}

/** "{N}에 더 가까운 수는?" — two candidates whose distance-to-target gap falls inside `distanceGapRange` (Hard: clearly different distances; Extreme: only 1-2 apart, needs real subtraction). */
function genCloserTo(id: string, targetRange: [number, number], distanceGapRange: [number, number]): ComparisonRound {
  for (let attempt = 0; attempt < 40; attempt++) {
    const target = randomInt(targetRange[0], targetRange[1])
    const d1 = randomInt(1, 20)
    const d2 = d1 + randomInt(distanceGapRange[0], distanceGapRange[1]) * (Math.random() < 0.5 ? 1 : -1)
    if (d2 <= 0) continue
    const c1 = target + (Math.random() < 0.5 ? 1 : -1) * d1
    const c2 = target + (Math.random() < 0.5 ? 1 : -1) * d2
    if (c1 === c2 || c1 === target || c2 === target || c1 < 0 || c2 < 0) continue
    const actualD1 = Math.abs(c1 - target)
    const actualD2 = Math.abs(c2 - target)
    if (actualD1 === actualD2) continue
    return {
      id,
      prompt: `${target}에 더 가까운 수는?`,
      optionA: String(c1),
      optionB: String(c2),
      correctOption: actualD1 < actualD2 ? 'A' : 'B',
    }
  }
  return { id, prompt: '10에 더 가까운 수는?', optionA: '7', optionB: '14', correctOption: 'A' }
}

function generateMentalOpRound(type: MentalOpType, difficulty: 'hard' | 'extreme', id: string): ComparisonRound {
  const isExtreme = difficulty === 'extreme'
  switch (type) {
    case 'number':
      return genNumberCompare(id, isExtreme ? [100, 999] : [10, 99], isExtreme ? [3, 10] : [5, 25])
    case 'arithmetic':
      return isExtreme ? genArithmeticVsArithmetic(id, [3, 12], [10, 60]) : genArithmeticVsNumber(id, [2, 9], [5, 40])
    case 'alphabet':
      return genAlphabetOrder(id)
    case 'letterCount':
      return genLetterCount(id, isExtreme ? [1, 1] : [2, 6])
    case 'closerTo':
      return genCloserTo(id, [10, 80], isExtreme ? [1, 2] : [4, 15])
  }
}

/**
 * Cycles through a freshly-shuffled lap of all 5 MENTAL_OP_TYPES, repeating
 * (re-shuffled) laps as needed — guarantees even type coverage for any
 * session length (Hard=7, Extreme=8 rounds) instead of leaving it to chance.
 */
function generateMentalOpRounds(difficulty: 'hard' | 'extreme', count: number): ComparisonRound[] {
  const order: MentalOpType[] = []
  while (order.length < count) order.push(...shuffle(MENTAL_OP_TYPES))
  return order.slice(0, count).map((type, i) => generateMentalOpRound(type, difficulty, `${difficulty}-${type}-${i}`))
}
