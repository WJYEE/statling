import {
  FEED_SATIETY_MAX_THRESHOLD,
  PET_AFFECTION_MAX_THRESHOLD,
  PLAY_HAPPINESS_MAX_THRESHOLD,
} from '@/lib/config/pet-care.config'
import {
  EXCITED_HAPPINESS_THRESHOLD,
  HAPPY_ALL_STATS_THRESHOLD,
  LOVE_AFFECTION_THRESHOLD,
  SICK_CLEANLINESS_THRESHOLD,
  SICK_SATIETY_THRESHOLD,
  TIRED_ENERGY_THRESHOLD,
} from '@/lib/config/character-state.config'
import type { CareStatId, Mood, PetAnimation } from '@/lib/pet-care/types'

/**
 * The 24-state expression set a fully-illustrated character folder provides
 * (see public/assets/statling/characters/01_치즈털실냥이/ for the first
 * complete set). Distinct from `lib/character-assets.ts`'s older `pet_NNN`
 * catalog (idle-only, used for similarity matching) — this is the newer,
 * richer per-character art pass, still being rolled out folder by folder.
 */
export type CharacterStateKey =
  | 'idle'
  | 'blink'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'eat'
  | 'wash'
  | 'play'
  | 'pet'
  | 'talk'
  | 'sleep'
  | 'hungry'
  | 'dirty'
  | 'tired'
  | 'sick'
  | 'cry'
  | 'thinking'
  | 'love'
  | 'excited'
  | 'embarrassed'
  | 'gift'
  | 'levelUp'
  | 'evolve'

interface CharacterStateDef {
  /** The 01-24 position in the filename — see buildCharacterStateFolder. */
  number: number
  key: CharacterStateKey
  /** The exact token used in the source filename — kept separate from `key` only where the file itself has a typo (embarrased) or a dash (level-up), so `key` can stay clean in code. */
  fileToken: string
  /** Short Korean label for QA UI (tester preview caption). */
  label: string
}

/**
 * Fixed 01-24 order — every character folder that follows this convention
 * (see buildCharacterStateFolder) is expected to provide exactly these 24
 * files, in this order, numbered 01-24.
 */
export const CHARACTER_STATE_SEQUENCE: CharacterStateDef[] = [
  { number: 1, key: 'idle', fileToken: 'idle', label: '기본' },
  { number: 2, key: 'blink', fileToken: 'blink', label: '눈 깜빡임' },
  { number: 3, key: 'happy', fileToken: 'happy', label: '행복' },
  { number: 4, key: 'sad', fileToken: 'sad', label: '슬픔' },
  { number: 5, key: 'angry', fileToken: 'angry', label: '화남' },
  { number: 6, key: 'surprised', fileToken: 'surprised', label: '놀람' },
  { number: 7, key: 'eat', fileToken: 'eat', label: '먹기' },
  { number: 8, key: 'wash', fileToken: 'wash', label: '씻기' },
  { number: 9, key: 'play', fileToken: 'play', label: '놀기' },
  { number: 10, key: 'pet', fileToken: 'pet', label: '쓰다듬기' },
  { number: 11, key: 'talk', fileToken: 'talk', label: '대화' },
  { number: 12, key: 'sleep', fileToken: 'sleep', label: '잠' },
  { number: 13, key: 'hungry', fileToken: 'hungry', label: '배고픔' },
  { number: 14, key: 'dirty', fileToken: 'dirty', label: '더러움' },
  { number: 15, key: 'tired', fileToken: 'tired', label: '피곤' },
  { number: 16, key: 'sick', fileToken: 'sick', label: '아픔' },
  { number: 17, key: 'cry', fileToken: 'cry', label: '울음' },
  { number: 18, key: 'thinking', fileToken: 'thinking', label: '생각' },
  { number: 19, key: 'love', fileToken: 'love', label: '애정' },
  { number: 20, key: 'excited', fileToken: 'excited', label: '신남' },
  // Source filename is spelled "embarrased" (one s) — fileToken matches the
  // real file on disk; `key` keeps the correct spelling in code.
  { number: 21, key: 'embarrassed', fileToken: 'embarrased', label: '민망' },
  { number: 22, key: 'gift', fileToken: 'gift', label: '선물' },
  { number: 23, key: 'levelUp', fileToken: 'level-up', label: '레벨업' },
  { number: 24, key: 'evolve', fileToken: 'evolve', label: '진화' },
]

/**
 * States a Deco (hat/glasses/ribbon/...) is allowed to render in — see
 * components/brain-bet/deco-overlay.tsx. MVP policy: only the two states
 * that share the character's resting pose (idle, and the periodic blink
 * that reuses it) keep the current single global anchor set meaningful;
 * every action pose (eat/wash/play/...) moves the head/body enough that a
 * Deco anchored to idle's coordinates looks visibly wrong, so it's hidden
 * instead of mis-placed. Once per-state anchor overrides exist for a given
 * action (see lib/character-anchor.config.ts's CHARACTER_ANCHOR_OVERRIDES),
 * add that state's key here to start showing Deco in it again.
 */
const DECO_VISIBLE_STATE_KEYS: ReadonlySet<CharacterStateKey> = new Set(['idle', 'blink'])

export function isDecoVisibleForState(key: CharacterStateKey): boolean {
  return DECO_VISIBLE_STATE_KEYS.has(key)
}

const CHARACTERS_BASE = '/assets/statling/characters'

export interface CharacterStateFolder {
  /** Real directory name under public/assets/statling/characters, e.g. '01_치즈털실냥이'. */
  folderId: string
  /** Character name without the numeric prefix, e.g. '치즈털실냥이'. */
  displayName: string
  assets: Record<CharacterStateKey, string>
}

/**
 * Builds every state's asset path for a folder that follows the
 * `{folderId}/{folderId}_{NN}_{fileToken}.png` naming convention. This is
 * the one place that convention is encoded — wiring up a new character once
 * its 24 files land (e.g. 02_플로봇, 03_잎사귀양, ...) is just calling this with that
 * folder's name, never re-deriving the path pattern by hand.
 */
export function buildCharacterStateFolder(folderId: string, displayName: string): CharacterStateFolder {
  const assets = Object.fromEntries(
    CHARACTER_STATE_SEQUENCE.map(({ number, key, fileToken }) => [
      key,
      `${CHARACTERS_BASE}/${folderId}/${folderId}_${String(number).padStart(2, '0')}_${fileToken}.png`,
    ]),
  ) as Record<CharacterStateKey, string>
  return { folderId, displayName, assets }
}

/**
 * folderId/displayName pairs for the full 30-character roster (see
 * public/assets/statling/characters/00_match/00_match.md) — every folder
 * has a complete 24-file set. Single source of truth for
 * TESTER_CHARACTER_FOLDERS below; kept as plain data (not re-derived from
 * lib/pets/pet-profile.ts) so this module never needs to import the
 * stat/catalog system just to know which folders exist.
 */
const CHARACTER_ROSTER: Array<[folderId: string, displayName: string]> = [
  ['01_치즈털실냥이', '치즈털실냥이'],
  ['02_플로봇', '플로봇'],
  ['03_잎사귀양', '잎사귀양'],
  ['04_상처도치', '상처도치'],
  ['05_알삐약이', '알삐약이'],
  ['06_초록스카프수달', '초록스카프수달'],
  ['07_별사막여우', '별사막여우'],
  ['08_바다고래', '바다고래'],
  ['09_동글이유령', '동글이유령'],
  ['10_반짝벌', '반짝벌'],
  ['11_하트덕', '하트덕'],
  ['12_분홍학', '분홍학'],
  ['13_나뭇잎여우', '나뭇잎여우'],
  ['14_새싹코알라', '새싹코알라'],
  ['15_물끄럼개미핥기', '물끄럼개미핥기'],
  ['16_균형다람쥐', '균형다람쥐'],
  ['17_포동동곰', '포동동곰'],
  ['18_지식토끼', '지식토끼'],
  ['19_우주멍멍이', '우주멍멍이'],
  ['20_스카프강쥐', '스카프강쥐'],
  ['21_동글거북', '동글거북'],
  ['22_붕어빵아홀로틀', '붕어빵아홀로틀'],
  ['23_잎라쿤', '잎라쿤'],
  ['24_꽃사막여우', '꽃사막여우'],
  ['25_치즈생쥐', '치즈생쥐'],
  ['26_눈송이늑대', '눈송이늑대'],
  ['27_겨울펭귄', '겨울펭귄'],
  ['28_귤카피바라', '귤카피바라'],
  ['29_무지개유니콘', '무지개유니콘'],
  ['30_꽃다발공룡', '꽃다발공룡'],
]

/**
 * Every character folder with a complete 24-file set, ready for the QA
 * tester toggle (see qa-skip-menu.tsx). Add an entry to CHARACTER_ROSTER
 * above — nothing else — once a new folder's 24 PNGs are finished; the
 * tester menu lists whatever is registered here.
 */
export const TESTER_CHARACTER_FOLDERS: CharacterStateFolder[] = CHARACTER_ROSTER.map(([folderId, displayName]) =>
  buildCharacterStateFolder(folderId, displayName),
)

/**
 * Maps the app's real Mood/PetAnimation/stat state (lib/pet-care/types.ts)
 * onto the closest of the 24 character states, so both the live Room and the
 * QA tester view show the actual matching art for actual interactions
 * (feed/wash/play/pet/talk, mood shifts, milestones) rather than a
 * manual-only preview.
 *
 * Every one of the 24 states now has a real trigger EXCEPT `evolve` (no
 * evolution feature exists yet) — still reachable via the tester's manual
 * click-through preview. `embarrassed` (and happy/thinking/love/tired) can
 * also come from a 대화 answer's own expression now — see `forcedStateKey`
 * below and lib/pet-care/talk-questions.ts.
 *
 * Priority, top to bottom (see each section's own comment for why):
 * 0. `forcedStateKey` — a 대화 answer's expression, when one is set. Wins
 *    unconditionally, before even over-use.
 * 1. Over-petting/over-talking — wins regardless of the underlying action's
 *    tier, so even an already-satisfied press still reads as annoyed once
 *    the streak crosses its threshold.
 * 2. The action currently playing (eat/wash/play/pet/talk/...) — each one
 *    individually re-checked against the matching stat's "already
 *    satisfied" ceiling, since that's a mapping decision (art), never an
 *    effect decision (numbers), which stays in lib/pet-care/actions.ts.
 * 3. A brief reconnect flash after a long absence.
 * 4. `sick` — satiety AND cleanliness both critically low, checked
 *    independent of Mood entirely (Mood's own hungry-before-dirty priority
 *    means it can never represent "both are bad at once").
 * 5. Mood's own urgent physical needs (hungry/dirty/lonely) — unchanged.
 * 6. An unclaimed level-milestone gift — persists until the Statling is tapped.
 * 7. `love` — affection maxed, or a consistently-played history.
 * 8. `excited` — happiness maxed.
 * 9. Mood sleepy -> `sleep`.
 * 10. `tired` — energy low but not sleepy-low, across any non-urgent Mood.
 * 11. Mood's remaining bands: sad / happy (gated on all 4 stats) / calm.
 */
export interface InteractionStateContext {
  mood: Mood
  animation: PetAnimation
  /** Raw 0-100 care stats — several states below (sick/tired/love/excited/happy, and each action's "already satisfied" check) need more than the single representative Mood to resolve correctly. */
  stats: Record<CareStatId, number>
  /** True for a few seconds right after a petting streak crosses OVERPET_COUNT_THRESHOLD (see hooks/use-pet-care.ts). */
  isOverPetted?: boolean
  /** True for a few seconds right after a talking streak crosses OVERTALK_COUNT_THRESHOLD (see hooks/use-pet-care.ts) — mirrors isOverPetted. */
  isOverTalked?: boolean
  /** True for a brief window right after entering the Room following a long absence (lib/pet-care/visit-context.ts's isLongAbsence). */
  isReconnectGreeting?: boolean
  /** True while a GIFT_LEVEL_INTERVAL milestone is crossed and unclaimed (PetCareState.giftReadyLevel != null) — see lib/config/character-state.config.ts. */
  isGiftReady?: boolean
  /** "미니게임을 일정 수준 이상 꾸준히 플레이했을 때" — see lib/pet-care/pet-memory.ts#isConsistentPlayer. */
  isConsistentPlayer?: boolean
  /**
   * True for a few seconds right after a 씻기 press whose cleanliness was
   * ALREADY at/above SHOWER_CLEANLINESS_MAX_THRESHOLD *before* that press —
   * see hooks/use-pet-care.ts's `isShowerAlreadySatisfied`. Deliberately a
   * flag computed from the pre-action stat, not `stats.cleanliness` itself:
   * by the time this renders, `stats` already reflects the shower's own
   * +cleanliness delta (state update happens before the 'wash' animation
   * plays), so comparing the post-delta value against the same ceiling used
   * to grant the delta was always true for an ordinary shower too — the bug
   * this flag fixes (see the 'wash' case below).
   */
  isShowerAlreadySatisfied?: boolean
  /**
   * Wins over everything else below, unconditionally — a 대화 answer's own
   * expression (happy/thinking/embarrassed/love/tired/...), held for a few
   * seconds by room-screen.tsx regardless of what mood/animation/stats would
   * otherwise resolve to. See lib/pet-care/talk-questions.ts's
   * `TalkChoice.expression` and hooks/use-pet-talk.ts.
   */
  forcedStateKey?: CharacterStateKey
}

export function characterStateForInteraction({
  mood,
  animation,
  stats,
  isOverPetted = false,
  isOverTalked = false,
  isReconnectGreeting = false,
  isGiftReady = false,
  isConsistentPlayer = false,
  isShowerAlreadySatisfied = false,
  forcedStateKey,
}: InteractionStateContext): CharacterStateKey {
  if (forcedStateKey) return forcedStateKey

  // Over-use wins outright — checked ahead of the action switch so it
  // applies whether or not that action's own tier would otherwise suppress
  // its art (see the 'pet'/'talk' cases below).
  if (animation === 'pet' && isOverPetted) return 'angry'
  if (animation === 'talk' && isOverTalked) return 'angry'

  switch (animation) {
    case 'eat':
      // Already full: no fresh 'eat' happened, so fall through to the
      // idle-family tier below instead of claiming one.
      if (stats.satiety < FEED_SATIETY_MAX_THRESHOLD) return 'eat'
      break
    case 'wash':
      // Already clean (per isShowerAlreadySatisfied, computed from the
      // PRE-shower cleanliness — see this prop's doc comment above): reads
      // as "어, 씻길 게 없는데?" surprise, not a fallback to idle — mirrors
      // performClean's alreadyClean case (always 'shake').
      return isShowerAlreadySatisfied ? 'surprised' : 'wash'
    case 'play':
    case 'playAlone':
      if (stats.happiness < PLAY_HAPPINESS_MAX_THRESHOLD) return 'play'
      break
    case 'pet':
      if (stats.affection < PET_AFFECTION_MAX_THRESHOLD) return 'pet'
      break
    case 'talk':
      return 'talk'
    case 'sleep':
      return 'sleep'
    case 'sad':
      return 'sad'
    // 'jump' is only ever set on a real level-up (see use-pet-care.ts) — never
    // reused for anything else, so it maps 1:1 to the levelUp art.
    case 'jump':
      return 'levelUp'
    // Also the target of a personal-best minigame reaction — see
    // lib/pet-care/game-reactions.ts#resolveGameReaction.
    case 'celebrate':
      return 'excited'
    // 청소하기(room clean) — reads as "어, 방이 반짝여졌네?" surprise rather than a generic smile.
    case 'shake':
      return 'surprised'
    case 'askFood':
      return 'hungry'
    case 'askPlay':
      return 'thinking'
    case 'askAttention':
      return 'surprised'
    // The 'thinking' art's "가끔 랜덤으로" trigger (see autonomous-action-selector.ts).
    case 'ponder':
      return 'thinking'
    case 'lookLeft':
    case 'lookRight':
    case 'hop':
    case 'walk':
    case 'idle':
      break
  }

  // Idle-family fallback tier — see the priority list in this function's doc comment.
  if (isReconnectGreeting) return 'angry'
  if (stats.satiety <= SICK_SATIETY_THRESHOLD && stats.cleanliness <= SICK_CLEANLINESS_THRESHOLD) return 'sick'
  if (mood === 'hungry') return 'hungry'
  if (mood === 'dirty') return 'dirty'
  if (mood === 'lonely') return 'cry'
  if (isGiftReady) return 'gift'
  if (stats.affection >= LOVE_AFFECTION_THRESHOLD || isConsistentPlayer) return 'love'
  if (stats.happiness >= EXCITED_HAPPINESS_THRESHOLD) return 'excited'
  if (mood === 'sleepy') return 'sleep'
  if (stats.energy < TIRED_ENERGY_THRESHOLD) return 'tired'
  if (mood === 'sad') return 'sad'
  if (mood === 'joyful' || mood === 'happy') {
    const allFourSatisfied =
      stats.satiety >= HAPPY_ALL_STATS_THRESHOLD &&
      stats.cleanliness >= HAPPY_ALL_STATS_THRESHOLD &&
      stats.affection >= HAPPY_ALL_STATS_THRESHOLD &&
      stats.happiness >= HAPPY_ALL_STATS_THRESHOLD
    return allFourSatisfied ? 'happy' : 'idle'
  }
  return 'idle' // calm
}
