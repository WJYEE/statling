export type SatisfactionValue = 'very-satisfied' | 'satisfied' | 'neutral' | 'unsatisfied' | 'very-unsatisfied'

export type FavoritePartValue =
  | 'minigames'
  | 'ranking'
  | 'pet-care'
  | 'room-decor'
  | 'statling-decor'
  | 'share'
  | 'cute-statling'
  | 'other'

export type ImprovementAreaValue =
  | 'intro-length'
  | 'minigame-difficulty'
  | 'ui-readability'
  | 'pet-interaction'
  | 'room-decor'
  | 'statling-decor'
  | 'loading-errors'
  | 'explanation-lacking'
  | 'other'

export type ReturnIntentValue = 'definitely' | 'sometimes' | 'unsure' | 'unlikely'

export const SATISFACTION_OPTIONS: { value: SatisfactionValue; label: string }[] = [
  { value: 'very-satisfied', label: '매우 만족' },
  { value: 'satisfied', label: '만족' },
  { value: 'neutral', label: '보통' },
  { value: 'unsatisfied', label: '아쉬움' },
  { value: 'very-unsatisfied', label: '매우 아쉬움' },
]

export const FAVORITE_PART_OPTIONS: { value: FavoritePartValue; label: string }[] = [
  { value: 'minigames', label: '미니게임' },
  { value: 'ranking', label: '랭킹' },
  { value: 'pet-care', label: '펫 돌보기' },
  { value: 'room-decor', label: '방 꾸미기' },
  { value: 'statling-decor', label: 'Statling 꾸미기' },
  { value: 'share', label: '친구와 공유하기' },
  { value: 'cute-statling', label: '귀여운 Statling' },
  { value: 'other', label: '기타' },
]

export const IMPROVEMENT_AREA_OPTIONS: { value: ImprovementAreaValue; label: string }[] = [
  { value: 'intro-length', label: 'Intro 길이' },
  { value: 'minigame-difficulty', label: '미니게임 난이도' },
  { value: 'ui-readability', label: 'UI 가독성' },
  { value: 'pet-interaction', label: '펫 상호작용' },
  { value: 'room-decor', label: '방 꾸미기' },
  { value: 'statling-decor', label: 'Statling 꾸미기' },
  { value: 'loading-errors', label: '로딩·오류' },
  { value: 'explanation-lacking', label: '설명 부족' },
  { value: 'other', label: '기타' },
]

export const RETURN_INTENT_OPTIONS: { value: ReturnIntentValue; label: string }[] = [
  { value: 'definitely', label: '계속 사용하고 싶어요' },
  { value: 'sometimes', label: '가끔 사용하고 싶어요' },
  { value: 'unsure', label: '아직 잘 모르겠어요' },
  { value: 'unlikely', label: '다시 사용할 생각은 없어요' },
]

/** Q4 answers that unlock the optional "어떤 점이 개선되면 다시 사용할 것 같나요?" follow-up — see feedback-section.tsx. */
export const RETURN_INTENT_FOLLOW_UP_VALUES: ReturnIntentValue[] = ['unsure', 'unlikely']

/**
 * One user's feedback — always exactly one per device (see
 * lib/feedback/feedback-storage.ts#upsertFeedbackRecord: a new submission
 * UPDATEs this record rather than adding another one). `satisfaction`/
 * `returnIntent` are single-select (a satisfaction level / return intent is
 * one value, not several); `favoritePart`/`improvementArea` are multi-select
 * (a user can like or dislike more than one aspect) — all four are required
 * (at least one choice for the multi-select pair). `comment` and every
 * `*Text`/`*Detail` follow-up below are optional — conditional free-text
 * that only ever appears once its trigger option/selection is made (see
 * feedback-section.tsx), never required to submit. No name/contact field
 * exists on purpose — the form itself warns against writing personal info
 * into `comment` (see feedback-section.tsx).
 *
 * `appVersion`/`deviceType`/`statlingId`/`statlingName` are captured
 * automatically (not asked of the user) — lightweight context for reading
 * feedback later, same idea as GameResult's own `device` field.
 * `submittedAt` is set once, at first submission, and never changes;
 * `updatedAt` moves on every re-submission — same initial/current split
 * convention as lib/pets/pet-storage.ts's initialFinals/latestFinals.
 */
export interface FeedbackRecord {
  id: string
  satisfaction: SatisfactionValue
  favoritePart: FavoritePartValue[]
  /** Free text for Q2's "기타" option — only meaningful when favoritePart includes 'other'. */
  favoritePartOtherText: string
  improvementArea: ImprovementAreaValue[]
  /** Free text for Q3's "기타" option — only meaningful when improvementArea includes 'other'. */
  improvementAreaOtherText: string
  /** Optional elaboration on Q3 ("조금만 더 자세히 알려주시면..."), shown once any Q3 option is picked. */
  improvementAreaDetail: string
  returnIntent: ReturnIntentValue
  /** Optional elaboration on Q4 ("어떤 점이 개선되면 다시 사용할 것 같나요?"), shown only for 'unsure'/'unlikely'. */
  returnIntentDetail: string
  comment: string
  appVersion: string
  deviceType: string
  /** The representative pet's catalog id at the time of this submission, if one exists yet — see lib/pets/pet-profile.ts. */
  statlingId: string | null
  statlingName: string | null
  submittedAt: string
  updatedAt: string
}

export type FeedbackDraft = {
  satisfaction: SatisfactionValue | null
  favoritePart: FavoritePartValue[]
  favoritePartOtherText: string
  improvementArea: ImprovementAreaValue[]
  improvementAreaOtherText: string
  improvementAreaDetail: string
  returnIntent: ReturnIntentValue | null
  returnIntentDetail: string
  comment: string
}

export function emptyFeedbackDraft(): FeedbackDraft {
  return {
    satisfaction: null,
    favoritePart: [],
    favoritePartOtherText: '',
    improvementArea: [],
    improvementAreaOtherText: '',
    improvementAreaDetail: '',
    returnIntent: null,
    returnIntentDetail: '',
    comment: '',
  }
}
