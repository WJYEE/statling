import { RECENT_QUESTION_HISTORY_SIZE } from '@/lib/config/talk.config'
import { pushRecentId } from '@/lib/pet-care/dialogue'
import type { CharacterStateKey } from '@/lib/character-state-assets'

export interface TalkChoice {
  id: string
  /** Button label — what the player says. */
  label: string
  /** What the Statling says back, shown in its speech bubble. */
  response: string
  /**
   * Which of the 24 character-art states this answer's reaction reads as —
   * held for TALK_EXPRESSION_HOLD_MS (see lib/config/talk.config.ts) before
   * falling back to whatever the current mood/animation would normally show.
   * Omitted entirely just keeps the default 'talk' pose.
   */
  expression?: CharacterStateKey
}

export interface TalkQuestion {
  id: string
  text: string
  /** Up to 3 — see hooks/use-pet-talk.ts. Empty for the one isFreeText question. */
  choices: TalkChoice[]
  /** True only for the single special "자유 입력" question — a text field instead of choice buttons (see talk-question-card.tsx). */
  isFreeText?: boolean
}

/**
 * The full question pool. Content-only — no logic belongs in this file
 * beyond pickRandomQuestion below, so adding/editing a question or answer
 * never means touching hooks/use-pet-talk.ts or any component.
 */
export const TALK_QUESTIONS: TalkQuestion[] = [
  {
    id: 'today-how-was-it',
    text: '오늘 하루 어땠어?',
    choices: [
      { id: 'hard', label: '힘들었어', response: '내가 안아줄게!', expression: 'love' },
      { id: 'good', label: '좋았어', response: '정말 다행이다!', expression: 'happy' },
      { id: 'you', label: '너는?', response: '난 너를 봐서 행복해.', expression: 'love' },
    ],
  },
  {
    id: 'what-are-you-doing',
    text: '지금 뭐 하고 있었어?',
    choices: [
      { id: 'resting', label: '그냥 쉬고 있었어', response: '그럼 나랑 같이 쉬자!', expression: 'happy' },
      { id: 'thinking-of-you', label: '너 생각하고 있었어', response: '어... 진짜? 부끄럽잖아.', expression: 'embarrassed' },
      { id: 'worrying', label: '고민 중이었어', response: '무슨 고민이야? 같이 생각해볼까?', expression: 'thinking' },
    ],
  },
  {
    id: 'do-you-like-me',
    text: '나 좋아해?',
    choices: [
      { id: 'of-course', label: '당연하지', response: '헤헤, 나도 정말 좋아해!', expression: 'love' },
      { id: 'well', label: '음... 글쎄', response: '치, 그래도 안 삐질 거야. 조금은.', expression: 'embarrassed' },
      { id: 'thinking-about-it', label: '생각 중이야', response: '천천히 생각해도 괜찮아.', expression: 'thinking' },
    ],
  },
  {
    id: 'bored',
    text: '심심하지 않아?',
    choices: [
      { id: 'bored', label: '심심해', response: '그럼 나랑 놀자!', expression: 'happy' },
      { id: 'not-with-you', label: '너랑 있어서 안 심심해', response: '우와, 그 말 진짜 고마워.', expression: 'embarrassed' },
      { id: 'sleepy', label: '졸려', response: '그럼 우리 같이 눈 좀 붙일까...', expression: 'tired' },
    ],
  },
  {
    id: 'any-worries',
    text: '요즘 고민 있어?',
    choices: [
      { id: 'yes', label: '있어', response: '말해봐, 내가 들어줄게.', expression: 'thinking' },
      { id: 'none', label: '딱히 없어', response: '다행이다, 평화로운 게 최고야.', expression: 'happy' },
      { id: 'ask-back', label: '너는 고민 없어?', response: '음... 네가 행복한지가 내 유일한 고민이야.', expression: 'love' },
    ],
  },
  {
    id: 'remember-meeting',
    text: '우리 처음 만났을 때 기억나?',
    choices: [
      { id: 'yes', label: '당연히 기억나지', response: '그날 진짜 떨렸었어.', expression: 'embarrassed' },
      { id: 'fuzzy', label: '가물가물해', response: '괜찮아, 지금부터 다시 쌓아가면 되지!', expression: 'happy' },
      { id: 'tell-me', label: '그때 얘기 해줘', response: '음... 어디서부터 얘기해야 할까, 잠깐 생각 좀 해볼게.', expression: 'thinking' },
    ],
  },
  {
    id: 'tell-me-something',
    text: '나에게 하고 싶은 말 해줘!',
    choices: [],
    isFreeText: true,
  },
]

/** Shown once, right after a free-text answer is saved — see hooks/use-pet-talk.ts. Not part of TALK_QUESTIONS since it's never itself a question to pick. */
export const FREE_TEXT_ACK_RESPONSE = '고마워! 오래오래 기억할게.'
export const FREE_TEXT_ACK_EXPRESSION: CharacterStateKey = 'love'

/**
 * "같은 질문이 너무 연속으로 나오지 않도록" — reuses the exact same
 * pool/dedup shape as pickFromPool (lib/pet-care/dialogue.ts), just without
 * the intimacy-level gate (talk questions aren't intimacy-gated).
 */
export function pickRandomQuestion(recentIds: string[]): TalkQuestion {
  const fresh = TALK_QUESTIONS.filter((q) => !recentIds.includes(q.id))
  const candidates = fresh.length > 0 ? fresh : TALK_QUESTIONS
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export function pushRecentQuestionId(recentIds: string[], newId: string): string[] {
  return pushRecentId(recentIds, newId, RECENT_QUESTION_HISTORY_SIZE)
}
