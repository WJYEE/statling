import { STATS, type StatId } from '@/lib/brain-bet'
import { PET_REACTION_THRESHOLDS } from '@/lib/config/pet-care.config'
import { pickFromPool, type PickableLine } from '@/lib/pet-care/dialogue'
import type { DialogueMemory, DialogueMemoryKey } from '@/lib/pet-care/dialogue-memory-storage'
import type { CareStatId, SecondaryTag } from '@/lib/pet-care/types'
import type { EntryEventType } from '@/lib/pet-care/visit-context'

export type InitiatedDialogueCategory =
  | 'welcome'
  | 'longAbsence'
  | 'dailyGreeting'
  | 'regularRevisit'
  | 'hungryRequest'
  | 'playRequest'
  | 'attentionRequest'
  | 'sleepyComment'
  | 'roomMessyComment'
  | 'idleThought'
  | 'memoryComment'
  | 'selfMusing'

export interface InitiatedDialogueLine extends PickableLine {
  text: string
}

/**
 * 11 categories, 5+ lines each. `longAbsence` in particular is held to the
 * spec's "never guilt-trip" rule — no "왜 이제 왔어" / "나를 버렸어" phrasing,
 * ever, even implicitly via a sad tone. Low-stat "request" categories stay
 * warm regardless of how low the stat actually is.
 */
export const INITIATED_DIALOGUE_BANK: Record<InitiatedDialogueCategory, InitiatedDialogueLine[]> = {
  welcome: [
    { id: 'welcome-1', text: '우리 이제 같이 지내는 거야?' },
    { id: 'welcome-2', text: '처음 만나서 조금 긴장돼.' },
    { id: 'welcome-3', text: '잘 부탁해!' },
    { id: 'welcome-4', text: '앞으로 잘 지내보자.' },
    { id: 'welcome-5', text: '네가 와줘서 기뻐.' },
  ],
  longAbsence: [
    { id: 'long-absence-1', text: '오랜만이야! 다시 와서 반가워.' },
    { id: 'long-absence-2', text: '조금 기다렸지만 괜찮아.' },
    { id: 'long-absence-3', text: '보고 싶었어!' },
    { id: 'long-absence-4', text: '다시 만나니까 좋다.' },
    { id: 'long-absence-5', text: '오늘은 뭐 하고 놀까?' },
  ],
  dailyGreeting: [
    { id: 'daily-1', text: '오늘도 와줬네!' },
    { id: 'daily-2', text: '좋은 하루 보내고 있어?' },
    { id: 'daily-3', text: '오늘은 어떤 하루일까?' },
    { id: 'daily-4', text: '만나서 반가워, 오늘도!' },
    { id: 'daily-5', text: '오늘 기분이 좋아 보여.' },
  ],
  regularRevisit: [
    { id: 'revisit-1', text: '또 왔구나!' },
    { id: 'revisit-2', text: '옆에 있어줘서 좋아.' },
    { id: 'revisit-3', text: '오늘도 함께라서 좋다.' },
    { id: 'revisit-4', text: '심심하던 참이었어.' },
    { id: 'revisit-5', text: '벌써 며칠째 함께하고 있네.', minIntimacyLevel: 3 },
  ],
  hungryRequest: [
    { id: 'hungry-req-1', text: '조금 출출한 것 같아.' },
    { id: 'hungry-req-2', text: '간식 생각이 나.' },
    { id: 'hungry-req-3', text: '배에서 꼬르륵 소리가 나려고 해.' },
    { id: 'hungry-req-4', text: '뭔가 먹고 싶은 기분이야.' },
    { id: 'hungry-req-5', text: '밥 시간인가?' },
  ],
  playRequest: [
    { id: 'play-req-1', text: '잠깐 같이 놀까?' },
    { id: 'play-req-2', text: '뭔가 재미있는 걸 하고 싶어.' },
    { id: 'play-req-3', text: '심심한 것 같아.' },
    { id: 'play-req-4', text: '같이 놀면 재밌을 것 같은데.' },
    { id: 'play-req-5', text: '오늘은 뭐 하고 놀까?' },
  ],
  attentionRequest: [
    { id: 'attention-req-1', text: '조금 가까이 있어도 돼?' },
    { id: 'attention-req-2', text: '쓰다듬어주면 기분이 좋을 것 같아.' },
    { id: 'attention-req-3', text: '옆에 있어줄래?' },
    { id: 'attention-req-4', text: '너랑 좀 더 가까워지고 싶어.' },
    { id: 'attention-req-5', text: '오늘따라 네가 더 좋아.' },
  ],
  sleepyComment: [
    { id: 'sleepy-req-1', text: '조금 쉬고 싶어.' },
    { id: 'sleepy-req-2', text: '눈이 살짝 감기네.' },
    { id: 'sleepy-req-3', text: '하아암... 졸려.' },
    { id: 'sleepy-req-4', text: '잠깐 눈 좀 붙일까 봐.' },
    { id: 'sleepy-req-5', text: '오늘은 힘이 좀 없어.' },
  ],
  roomMessyComment: [
    { id: 'messy-1', text: '방이 조금 어질러진 것 같아.' },
    { id: 'messy-2', text: '방을 좀 정리하면 좋을 것 같아.' },
    { id: 'messy-3', text: '먼지가 살짝 쌓인 느낌이야.' },
    { id: 'messy-4', text: '방을 반짝반짝하게 만들어볼까?' },
    { id: 'messy-5', text: '청소하면 기분이 좋아질 것 같아.' },
  ],
  idleThought: [
    { id: 'idle-thought-1', text: '오늘은 날씨가 어떨까?' },
    { id: 'idle-thought-2', text: '가만히 있으니 이런저런 생각이 나.' },
    { id: 'idle-thought-3', text: '너랑 있으면 시간이 빨리 가.' },
    { id: 'idle-thought-4', text: '다음엔 뭘 해볼까 생각 중이야.' },
    { id: 'idle-thought-5', text: '오늘 하루도 평화롭다.' },
  ],
  memoryComment: [
    { id: 'memory-comment-1', text: '요즘 {stat} 게임을 자주 하고 있네.' },
    { id: 'memory-comment-2', text: '최근에는 {stat} 훈련을 많이 했어.' },
    { id: 'memory-comment-3', text: '{stat} 게임에서 좋은 결과가 자주 나왔어.' },
    { id: 'memory-comment-4', text: '요즘 {stat} 쪽을 열심히 하는 것 같아.' },
    { id: 'memory-comment-5', text: '{stat} 게임, 꽤 자주 하네!' },
  ],
  /**
   * Statling initiates a short story/musing of its own, unprompted — so the
   * 대화 flow isn't purely "player asks, Statling answers" (spec §7). Picked
   * as an occasional alternative to `idleThought` in the ambient loop (see
   * hooks/use-pet-initiated-dialogue.ts), never its own separate cooldown.
   */
  selfMusing: [
    { id: 'self-musing-1', text: '아까 창밖을 보고 있었는데 구름이 물고기처럼 생겼어.' },
    { id: 'self-musing-2', text: '가끔 내가 알 속에 있었을 때가 생각나. 그때는 밖이 이렇게 넓은 줄 몰랐어.' },
    { id: 'self-musing-3', text: '오늘은 이상하게 모험을 떠나고 싶은 날이야.' },
    { id: 'self-musing-4', text: '방에 작은 비밀 공간 하나 있었으면 좋겠다.' },
    { id: 'self-musing-5', text: '너 없을 때 나 뭐 하고 있는지 궁금하지 않아?' },
    { id: 'self-musing-6', text: '가만히 있다 보면 별의별 생각이 다 들어.' },
    { id: 'self-musing-7', text: '오늘따라 하늘이 예뻐서 한참 봤어.' },
    { id: 'self-musing-8', text: '언젠가 저 멀리까지 가보고 싶다는 생각을 해.' },
    { id: 'self-musing-9', text: '가끔은 시간이 이렇게 빨리 가는 게 신기해.' },
    { id: 'self-musing-10', text: '오늘은 왠지 몸이 근질근질해서 자꾸 움직이게 돼.' },
    { id: 'self-musing-11', text: '너랑 처음 만났을 때가 아직도 가끔 생각나.' },
    { id: 'self-musing-12', text: '내일은 또 어떤 하루일지 은근 기대돼.' },
  ],
}

/**
 * "이전에 저장된 취향을 가끔 자연스럽게 언급" (spec §5) — the ambient/
 * initiated-dialogue counterpart of talk-questions.ts's structured
 * DialogueMemory answers (never the free-text UserNote, which has its own
 * separate echo path in hooks/use-pet-initiated-dialogue.ts). Every value is
 * a small fixed set defined at the TalkChoice that writes it, so each line
 * can be hand-written for correct Korean grammar instead of composed from a
 * generic template.
 */
const MEMORY_REFERENCE_LINES: Record<DialogueMemoryKey, Record<string, string>> = {
  favoriteSeason: {
    '여름': '전에 여름을 좋아한다고 했었지? 시원한 거 챙겨 먹었어?',
    '겨울': '전에 겨울을 좋아한다고 했었지? 오늘도 따뜻하게 지내!',
  },
  favoritePlaceType: {
    '바다': '전에 바다가 좋다고 했었지? 파도 소리 그립지 않아?',
    '산': '전에 산이 좋다고 했었지? 오늘도 상쾌한 기분이었으면 좋겠다.',
  },
  preferredTime: {
    '아침': '전에 아침이 좋다고 했었지? 오늘 상쾌하게 시작했어?',
    '밤': '전에 밤이 좋다고 했었지? 오늘도 밤까지 같이 있을 거야?',
  },
  likesRain: {
    '좋아함': '전에 비 오는 날 좋아한다고 했었지? 그런 날엔 특히 더 반가워.',
    '안좋아함': '전에 비 오는 날은 별로라고 했었지? 그래도 나랑 있으면 좀 낫지 않아?',
  },
  preferredFoodType: {
    '단맛': '전에 달콤한 거 좋아한다고 했었지? 오늘 하나 챙겨 먹어!',
    '짠맛': '전에 짭짤한 거 좋아한다고 했었지? 오늘 그런 거 먹었어?',
  },
  restStyle: {
    '혼자': '전에 힘들 때는 혼자 있는 게 편하다고 했었지? 필요하면 조용히 옆에 있어줄게.',
    '같이': '전에 힘들 때 옆에 누가 있어주면 좋다고 했었지? 오늘은 내가 옆에 있을게!',
  },
  travelPreference: {
    '바다 여행': '전에 바다 여행 가고 싶다고 했었지? 언젠가 꼭 같이 가자.',
    '산 여행': '전에 산 여행 가고 싶다고 했었지? 언젠가 꼭 같이 가자.',
    '이곳저곳 다니는 여행': '전에 이곳저곳 다니는 여행이 좋다고 했었지? 다음엔 어디부터 갈까?',
  },
  studyType: {
    '학교/전공': '전에 학교 공부 하고 있다고 했었지? 오늘도 화이팅!',
    '취업 준비': '전에 취업 준비 하고 있다고 했었지? 좋은 소식 있으면 꼭 알려줘!',
    '외국어': '전에 외국어 공부한다고 했었지? 오늘도 조금 했어?',
    '그냥 이것저것': '전에 이것저것 공부한다고 했었지? 재밌는 거 찾았어?',
  },
}

/**
 * Picks one saved DialogueMemory answer at random and returns its reference
 * line, or null when nothing's saved yet — the caller (usePetInitiatedDialogue)
 * gates how OFTEN this is even attempted (DIALOGUE_MEMORY_REFERENCE_CHANCE),
 * this function only ever decides WHICH saved fact to bring up.
 */
export function pickMemoryReferenceLine(memory: DialogueMemory): { id: string; text: string } | null {
  const keys = (Object.keys(memory.answers) as DialogueMemoryKey[]).filter((key) => memory.answers[key])
  if (keys.length === 0) return null
  const key = keys[Math.floor(Math.random() * keys.length)]
  const value = memory.answers[key]
  const text = value ? MEMORY_REFERENCE_LINES[key]?.[value] : undefined
  if (!text) return null
  return { id: `memory-ref-${key}`, text }
}

export function pickInitiatedDialogue(
  category: InitiatedDialogueCategory,
  intimacyLevel: number,
  recentIds: string[],
): InitiatedDialogueLine {
  return pickFromPool(INITIATED_DIALOGUE_BANK[category], intimacyLevel, recentIds)
}

/** memoryComment lines carry a `{stat}` placeholder — filled in with the actual stat's display name (e.g. "기억력") rather than a hardcoded string. */
export function pickMemoryCommentText(stat: StatId, intimacyLevel: number, recentIds: string[]): { id: string; text: string } {
  const line = pickInitiatedDialogue('memoryComment', intimacyLevel, recentIds)
  return { id: line.id, text: line.text.replace('{stat}', STATS[stat].name) }
}

/**
 * Which "상태 요청" line the pet should offer right now, if any — same
 * priority feel as mood.ts's computeMood (hunger first, room messiness
 * last), evaluated against `PET_REACTION_THRESHOLDS`. Returns null when
 * nothing is currently below/above its threshold, so the caller falls back
 * to a general/ambient line instead.
 */
export function pickStateRequestCategory(
  stats: Record<CareStatId, number>,
  secondaryTags: SecondaryTag[],
): InitiatedDialogueCategory | null {
  if (stats.satiety < PET_REACTION_THRESHOLDS.lowHunger) return 'hungryRequest'
  if (stats.energy < PET_REACTION_THRESHOLDS.lowEnergy) return 'sleepyComment'
  if (stats.affection < PET_REACTION_THRESHOLDS.lowAffection) return 'attentionRequest'
  if (stats.happiness < PET_REACTION_THRESHOLDS.lowHappiness) return 'playRequest'
  if (secondaryTags.includes('roomMessy')) return 'roomMessyComment'
  return null
}

/**
 * Entry-greeting priority (spec §5): firstMeeting > longAbsenceReturn >
 * todayFirstVisit > pendingGameReaction > regularRevisit. `pendingGameReaction`
 * maps to no category here — that flow is owned by usePetMemory's own
 * gameReaction speech channel instead, so the two never speak at once.
 */
export function entryEventToDialogueCategory(event: EntryEventType): InitiatedDialogueCategory | null {
  switch (event) {
    case 'firstMeeting':
      return 'welcome'
    case 'longAbsenceReturn':
      return 'longAbsence'
    case 'todayFirstVisit':
      return 'dailyGreeting'
    case 'regularRevisit':
      return 'regularRevisit'
    case 'pendingGameReaction':
      return null
  }
}
