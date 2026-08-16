import {
  REASONING_LEVELS,
  REASONING_OPTION_COUNT,
  getReasoningQuestionsPerLevelForDifficulty,
} from '@/lib/config/reasoning.config'
import type { GameDifficulty } from '@/lib/game/difficulty'
import {
  buildTutorial1Instance,
  buildTutorial2Instance,
  symbolSignature,
  templatesForLevel,
  type ReasoningSymbolSpec,
  type ReasoningTemplate,
  type ReasoningTemplateInstance,
} from '@/lib/game/reasoning-templates'
import type { ReasoningDistractorType, ReasoningType } from '@/lib/game/types'

export interface GeneratedReasoningOption {
  symbol: ReasoningSymbolSpec
  isCorrect: boolean
  distractorType: ReasoningDistractorType | null
}

export interface GeneratedReasoningQuestion {
  questionId: string
  templateId: string
  reasoningType: ReasoningType
  difficultyLevel: number
  sequence: ReasoningSymbolSpec[]
  options: GeneratedReasoningOption[]
  correctOptionIndex: number
  /** One short, post-answer-only sentence explaining why the correct answer follows the sequence's rule. */
  ruleExplanation: string
}

let questionSeedCounter = 0

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Dev-time safety net (GAME_SPEC §83's exact concerns): asserts exactly one
 * correct option, exactly REASONING_OPTION_COUNT options, and that all
 * options render as pairwise-distinct symbols (no accidental duplicate,
 * and no distractor that happens to coincide with the correct answer).
 * Should never actually fire given each Template was hand-verified, but
 * throwing loudly here is cheap insurance against a future Template edit
 * silently breaking that guarantee.
 */
function validateQuestion(question: GeneratedReasoningQuestion): void {
  if (question.options.length !== REASONING_OPTION_COUNT) {
    throw new Error(`Reasoning question has ${question.options.length} options, expected ${REASONING_OPTION_COUNT}`)
  }
  const correctCount = question.options.filter((o) => o.isCorrect).length
  if (correctCount !== 1) {
    throw new Error(`Reasoning question has ${correctCount} correct options, expected exactly 1`)
  }
  const signatures = new Set(question.options.map((o) => symbolSignature(o.symbol)))
  if (signatures.size !== question.options.length) {
    throw new Error(`Reasoning question (template ${question.templateId}) has two options that render as the same symbol`)
  }
}

function buildQuestionFromTemplate(template: ReasoningTemplate, instance: ReasoningTemplateInstance): GeneratedReasoningQuestion {
  const rawOptions: GeneratedReasoningOption[] = [
    { symbol: instance.correctAnswer, isCorrect: true, distractorType: null },
    ...instance.distractors.map((d) => ({ symbol: d.symbol, isCorrect: false, distractorType: d.type })),
  ]

  const order = shuffled(rawOptions.map((_, i) => i))
  const options = order.map((i) => rawOptions[i])
  const correctOptionIndex = options.findIndex((o) => o.isCorrect)

  const question: GeneratedReasoningQuestion = {
    questionId: `${template.id}-${questionSeedCounter++}`,
    templateId: template.id,
    reasoningType: template.reasoningType,
    difficultyLevel: template.difficultyLevel,
    sequence: instance.sequence,
    options,
    correctOptionIndex,
    ruleExplanation: template.ruleExplanation,
  }

  validateQuestion(question)
  return question
}

/**
 * Builds the real session for `difficulty`'s own per-Level question counts
 * (see lib/config/reasoning.config.ts#REASONING_QUESTIONS_PER_LEVEL_BY_TIER),
 * sampled without replacement from each Level's 5 hand-authored Templates —
 * no Template is ever reused twice in one session.
 */
export function generateReasoningSession(difficulty: GameDifficulty): GeneratedReasoningQuestion[] {
  const questionsPerLevel = getReasoningQuestionsPerLevelForDifficulty(difficulty)
  const questions: GeneratedReasoningQuestion[] = []
  for (const level of REASONING_LEVELS) {
    const picked = shuffled(templatesForLevel(level)).slice(0, questionsPerLevel[level])
    for (const template of picked) {
      questions.push(buildQuestionFromTemplate(template, template.generate()))
    }
  }
  return questions
}

/** Tutorial 1 — fixed ABAB shape alternation. Discarded from scoring. */
export function buildTutorialQuestion1(): GeneratedReasoningQuestion {
  return buildQuestionFromTemplate(
    {
      id: 'tutorial-1',
      reasoningType: 'alternation',
      difficultyLevel: 0,
      ruleExplanation: '두 모양이 번갈아 나오는 규칙이에요.',
      generate: buildTutorial1Instance,
    },
    buildTutorial1Instance(),
  )
}

/** Tutorial 2 — fixed count-increase sequence. Discarded from scoring. */
export function buildTutorialQuestion2(): GeneratedReasoningQuestion {
  return buildQuestionFromTemplate(
    {
      id: 'tutorial-2',
      reasoningType: 'count',
      difficultyLevel: 0,
      ruleExplanation: '한 단계마다 개수가 1개씩 늘어나요.',
      generate: buildTutorial2Instance,
    },
    buildTutorial2Instance(),
  )
}
