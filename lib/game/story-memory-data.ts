import type { GameDifficulty } from '@/lib/game/difficulty'
import type { StoryQuestionCategory } from '@/lib/game/types'

/**
 * 2026-08 content rework — this file used to hold 15 hand-authored short
 * stories for a read-then-answer format. It's now "물건 기억" (Visual
 * Object Memory): show a set of objects, hide them, ask a 4-choice question
 * about what was/wasn't there. Kept the FILE NAME and the shape family
 * (`*Round { id, questions, ... }`, `*Question { question, choices,
 * answerIndex, category }`) as close as possible to the old
 * StoryRound/StoryQuestion so components/brain-bet/games/story-memory-game.tsx
 * only needed surgical changes, not a rewrite — see that file's own doc
 * comment. `id`/`gameId`/`variant` wire strings are untouched (see
 * lib/game/types.ts's StoryMemoryGameResult doc comment) so existing
 * PlayerSkillState records and Hard/Extreme unlock progress for this exact
 * slot keep working.
 */

export type MemoryObjectColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'
export type MemoryObjectCategory = 'accessory' | 'food' | 'nature' | 'object'

export interface MemoryObjectDef {
  id: string
  name: string
  /** Key into object-memory-icon-map.tsx's icon lookup — kept as a plain string here rather than a lucide component reference so this stays a React-free `lib/` data file, matching lib/game/game-registry.ts's convention. */
  iconKey: string
  category: MemoryObjectCategory
  color: MemoryObjectColor
}

export const MEMORY_COLOR_PALETTE: { id: MemoryObjectColor; label: string; hex: string }[] = [
  { id: 'red', label: '빨강', hex: '#ef4444' },
  { id: 'blue', label: '파랑', hex: '#3b82f6' },
  { id: 'green', label: '초록', hex: '#22c55e' },
  { id: 'yellow', label: '노랑', hex: '#eab308' },
  { id: 'purple', label: '보라', hex: '#a855f7' },
  { id: 'orange', label: '주황', hex: '#f97316' },
]

/** 24 objects across 4 categories x 6 colors — enough headroom for the largest tier (Extreme shows 11) to still leave a wide "not shown" pool to draw a correct "absent" answer from. */
export const MEMORY_OBJECT_CATALOG: MemoryObjectDef[] = [
  { id: 'umbrella', name: '우산', iconKey: 'umbrella', category: 'accessory', color: 'blue' },
  { id: 'shirt', name: '셔츠', iconKey: 'shirt', category: 'accessory', color: 'red' },
  { id: 'glasses', name: '안경', iconKey: 'glasses', category: 'accessory', color: 'purple' },
  { id: 'watch', name: '손목시계', iconKey: 'watch', category: 'accessory', color: 'green' },
  { id: 'backpack', name: '가방', iconKey: 'backpack', category: 'accessory', color: 'orange' },
  { id: 'gift', name: '선물상자', iconKey: 'gift', category: 'accessory', color: 'yellow' },
  { id: 'apple', name: '사과', iconKey: 'apple', category: 'food', color: 'red' },
  { id: 'cherry', name: '체리', iconKey: 'cherry', category: 'food', color: 'red' },
  { id: 'ice-cream', name: '아이스크림', iconKey: 'ice-cream', category: 'food', color: 'purple' },
  { id: 'coffee', name: '커피', iconKey: 'coffee', category: 'food', color: 'orange' },
  { id: 'pizza', name: '피자', iconKey: 'pizza', category: 'food', color: 'yellow' },
  { id: 'cookie', name: '쿠키', iconKey: 'cookie', category: 'food', color: 'orange' },
  { id: 'leaf', name: '나뭇잎', iconKey: 'leaf', category: 'nature', color: 'green' },
  { id: 'flower', name: '꽃', iconKey: 'flower', category: 'nature', color: 'purple' },
  { id: 'tree', name: '나무', iconKey: 'tree-pine', category: 'nature', color: 'green' },
  { id: 'sun', name: '해', iconKey: 'sun', category: 'nature', color: 'yellow' },
  { id: 'cloud', name: '구름', iconKey: 'cloud', category: 'nature', color: 'blue' },
  { id: 'snowflake', name: '눈송이', iconKey: 'snowflake', category: 'nature', color: 'blue' },
  { id: 'car', name: '자동차', iconKey: 'car', category: 'object', color: 'red' },
  { id: 'bike', name: '자전거', iconKey: 'bike', category: 'object', color: 'green' },
  { id: 'star', name: '별', iconKey: 'star', category: 'object', color: 'yellow' },
  { id: 'heart', name: '하트', iconKey: 'heart', category: 'object', color: 'red' },
  { id: 'music', name: '음표', iconKey: 'music', category: 'object', color: 'purple' },
  { id: 'camera', name: '카메라', iconKey: 'camera', category: 'object', color: 'blue' },
]

export interface ObjectMemoryQuestion {
  question: string
  /** Always 4. For an 'absent' question these are object names; for 'color' these are color labels. */
  choices: string[]
  answerIndex: number
  category: StoryQuestionCategory
}

export interface ObjectMemoryRound {
  id: string
  objects: MemoryObjectDef[]
  questions: ObjectMemoryQuestion[]
  /** Replaces the old StoryRound.readingSeconds — how long the objects stay visible before hiding. */
  displaySeconds: number
}

interface ObjectMemoryTierConfig {
  shownCount: number
  questionTypes: StoryQuestionCategory[]
  displaySeconds: number
  /** How hard the 'absent' question's correct (not-shown) answer is to tell apart from what was actually shown — see pickAbsentQuestion. */
  distractorSimilarity: 'low' | 'medium' | 'high'
}

const OBJECT_MEMORY_TIER_CONFIG: Record<GameDifficulty, ObjectMemoryTierConfig> = {
  easy: { shownCount: 5, questionTypes: ['absent'], displaySeconds: 4, distractorSimilarity: 'low' },
  normal: { shownCount: 7, questionTypes: ['absent'], displaySeconds: 5, distractorSimilarity: 'low' },
  hard: { shownCount: 9, questionTypes: ['absent', 'color'], displaySeconds: 6, distractorSimilarity: 'medium' },
  extreme: { shownCount: 11, questionTypes: ['absent', 'color'], displaySeconds: 7, distractorSimilarity: 'high' },
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

function pickShownObjects(count: number): MemoryObjectDef[] {
  return shuffle(MEMORY_OBJECT_CATALOG).slice(0, count)
}

/**
 * "방금 보지 못했던 물건은?" — 3 choices are objects that WERE shown
 * (decoys, always wrong), 1 choice is an object that was NOT shown (the
 * correct answer). `similarity` controls how visually/categorically close
 * that correct "not shown" object is to what was actually shown — scored by
 * category+color match against the shown set, then filtered to the target
 * band (falling back to the closest available band if the catalog can't
 * fill the target exactly, so this never throws on a small catalog).
 */
function pickAbsentQuestion(shown: MemoryObjectDef[], similarity: ObjectMemoryTierConfig['distractorSimilarity']): ObjectMemoryQuestion {
  const shownIds = new Set(shown.map((o) => o.id))
  const notShown = MEMORY_OBJECT_CATALOG.filter((o) => !shownIds.has(o.id))
  const scored = notShown.map((candidate) => {
    const categoryMatch = shown.some((s) => s.category === candidate.category)
    const colorMatch = shown.some((s) => s.color === candidate.color)
    const score = categoryMatch && colorMatch ? 3 : categoryMatch ? 2 : colorMatch ? 1 : 0
    return { candidate, score }
  })
  const targetBand = similarity === 'high' ? [3, 2] : similarity === 'medium' ? [2, 1] : [0]
  const inBand = scored.filter((s) => targetBand.includes(s.score))
  const pool = inBand.length > 0 ? inBand : scored
  const correctObj = pool[Math.floor(Math.random() * pool.length)].candidate

  const decoys = shuffle(shown).slice(0, 3)
  const choiceObjs = shuffle([correctObj, ...decoys])

  return {
    question: '방금 보지 못했던 물건은 무엇일까요?',
    choices: choiceObjs.map((o) => o.name),
    answerIndex: choiceObjs.findIndex((o) => o.id === correctObj.id),
    category: 'absent',
  }
}

/** "그 물건은 무슨 색이었나요?" — asks about one randomly-picked shown object. */
function pickColorQuestion(shown: MemoryObjectDef[]): ObjectMemoryQuestion {
  const target = shown[Math.floor(Math.random() * shown.length)]
  const wrongColors = shuffle(MEMORY_COLOR_PALETTE.filter((c) => c.id !== target.color)).slice(0, 3)
  const choiceColors = shuffle([MEMORY_COLOR_PALETTE.find((c) => c.id === target.color)!, ...wrongColors])

  return {
    question: `방금 본 ${target.name}은(는) 무슨 색이었나요?`,
    choices: choiceColors.map((c) => c.label),
    answerIndex: choiceColors.findIndex((c) => c.id === target.color),
    category: 'color',
  }
}

/** Draws one full round (object set + its questions) for the given tier — the direct replacement for the old pickNextStoryRound(). */
export function pickObjectMemorySession(difficulty: GameDifficulty): ObjectMemoryRound {
  const config = OBJECT_MEMORY_TIER_CONFIG[difficulty]
  const objects = pickShownObjects(config.shownCount)
  const questions = shuffle(
    config.questionTypes.map((type) => (type === 'color' ? pickColorQuestion(objects) : pickAbsentQuestion(objects, config.distractorSimilarity))),
  )
  return { id: `object-memory_${Date.now()}`, objects, questions, displaySeconds: config.displaySeconds }
}
