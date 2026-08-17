'use client'

import { useEffect, useRef, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { ConfirmDialog } from '@/components/brain-bet/confirm-dialog'
import { LandingScreen } from '@/components/brain-bet/screens/landing-screen'
import { LoginScreen } from '@/components/brain-bet/screens/login-screen'
import { ReactionGame } from '@/components/brain-bet/games/reaction-game'
import { MemoryGame } from '@/components/brain-bet/games/memory-game'
import { FocusGame } from '@/components/brain-bet/games/focus-game'
import { JudgmentGame } from '@/components/brain-bet/games/judgment-game'
import { SpatialGame } from '@/components/brain-bet/games/spatial-game'
import { ReasoningGame } from '@/components/brain-bet/games/reasoning-game'
import { StoryMemoryGame } from '@/components/brain-bet/games/story-memory-game'
import { ColorTargetGame } from '@/components/brain-bet/games/color-target-game'
import { DodgeObstacleGame } from '@/components/brain-bet/games/dodge-obstacle-game'
import { BestChoiceGame } from '@/components/brain-bet/games/best-choice-game'
import { FitPuzzleGame } from '@/components/brain-bet/games/fit-puzzle-game'
import { NumberPatternGame } from '@/components/brain-bet/games/number-pattern-game'
import { CompleteScreen } from '@/components/brain-bet/screens/complete-screen'
import { FreePlayResultScreen } from '@/components/brain-bet/screens/free-play-result-screen'
import { StatusScreen } from '@/components/brain-bet/screens/status-screen'
import { EggScreen } from '@/components/brain-bet/screens/egg-screen'
import { RevealScreen } from '@/components/brain-bet/screens/reveal-screen'
import { SaveScreen } from '@/components/brain-bet/screens/save-screen'
import { NamingScreen } from '@/components/brain-bet/screens/naming-screen'
import { RoomScreen } from '@/components/brain-bet/screens/room-screen'
import { MissionScreen } from '@/components/brain-bet/screens/mission-screen'
import { GrowScreen } from '@/components/brain-bet/screens/grow-screen'
import { GrowGameScreen } from '@/components/brain-bet/screens/grow-game-screen'
import { StatlingScreen } from '@/components/brain-bet/screens/statling-screen'
import { RankingScreen } from '@/components/brain-bet/screens/ranking-screen'
import { MyPageScreen } from '@/components/brain-bet/screens/my-page-screen'
import { OnboardingModal } from '@/components/brain-bet/onboarding-modal'
import { loadOnboardingSeen } from '@/lib/onboarding-storage'
import { audioManager } from '@/lib/audio/audio-manager'
import { NavRail, type NavTab } from '@/components/brain-bet/nav-rail'
import { QaSkipMenu } from '@/components/brain-bet/qa-skip-menu'
import { PLAY_ORDER, TOTAL_GAMES, getSecondStat, getTopStat, type RawRecord, type StatId } from '@/lib/brain-bet'
import { getRecommendedStat } from '@/lib/room'
import { recordGameCompletion } from '@/lib/pet-care/pet-memory'
import { loadPetMemory, savePetMemory, clearPetMemory } from '@/lib/pet-care/pet-memory-storage'
import { loadPetCareState, savePetCareState } from '@/lib/pet-care/pet-care-storage'
import { applyPetDecay } from '@/lib/pet-care/decay'
import { buildDirectEffect } from '@/lib/pet-care/actions'
import { FREE_PLAY_ENERGY_COST } from '@/lib/config/pet-care.config'
import { clearPetCareState } from '@/lib/pet-care/pet-care-storage'
import { beginPetAssignment, confirmPet, refreshGrowthData, resolveCurrentPetProfile } from '@/lib/pets/pet-flow'
import { addMetPet, markAllPetsMet } from '@/lib/pets/dex-storage'
import {
  clearStoredPetProfile,
  loadStoredPetProfile,
  saveStoredPetProfile,
  type StoredPetProfile,
} from '@/lib/pets/pet-storage'
import { TESTER_CHARACTER_FOLDERS } from '@/lib/character-state-assets'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { generateMockFinals, type MockStatPreset } from '@/lib/game/mock-finals'
import { REACTION_GAME_VERSION } from '@/lib/config/reaction.config'
import { MEMORY_GAME_VERSION } from '@/lib/config/memory.config'
import { FOCUS_GAME_VERSION } from '@/lib/config/focus.config'
import { JUDGMENT_GAME_VERSION } from '@/lib/config/judgment.config'
import { SPATIAL_GAME_VERSION } from '@/lib/config/spatial.config'
import { REASONING_GAME_VERSION } from '@/lib/config/reasoning.config'
import { STORY_MEMORY_GAME_VERSION } from '@/lib/config/story-memory.config'
import { COLOR_TARGET_GAME_VERSION } from '@/lib/config/color-target.config'
import { DODGE_OBSTACLE_GAME_VERSION, getDodgeObstacleTierConfig } from '@/lib/config/dodge-obstacle.config'
import { BEST_CHOICE_GAME_VERSION } from '@/lib/config/best-choice.config'
import { FIT_PUZZLE_GAME_VERSION } from '@/lib/config/fit-puzzle.config'
import { NUMBER_PATTERN_GAME_VERSION } from '@/lib/config/number-pattern.config'
import { detectDevice } from '@/lib/game/device'
import { generateSessionId } from '@/lib/game/id'
import type { GameDifficulty } from '@/lib/game/difficulty'
import {
  computeCurrentStats,
  getAllRepresentativeRecords,
  getRecordAtDifficulty,
  loadPlayerSkillState,
  recordMiniGameCompletion,
  savePlayerSkillState,
} from '@/lib/game/player-skill-storage'
import { addXp, loadXpState, saveXpState } from '@/lib/ranking/xp-ledger'
import { useAuth } from '@/lib/auth/auth-provider'
import { trackDailyVisit, trackFirstLogin, trackGamePlayed } from '@/lib/missions/mission-tracker'
import { subscribeToAchievementUnlocks } from '@/lib/missions/achievement-notifications'
import { loadActivityCounters } from '@/lib/missions/activity-counters'
import {
  clearIntroProgress,
  loadIntroProgress,
  recordIntroGameCompletion,
  replaceIntroGameCompletion,
  saveIntroProgress,
  startNewIntroProgress,
  type IntroProgressState,
} from '@/lib/game/intro-progress-storage'
import { applyGameResult, emptyStatStatusMap } from '@/lib/game/stat-status'
import { getClassicGameKey } from '@/lib/game/game-registry'
import type {
  BestChoiceAnswer,
  BestChoiceGameResult,
  BestChoiceRawSummary,
  ColorTargetClickEvent,
  ColorTargetGameResult,
  ColorTargetRawSummary,
  DodgeObstacleEvent,
  DodgeObstacleGameResult,
  DodgeObstacleRawSummary,
  FitPuzzleGameResult,
  FitPuzzleRawSummary,
  FitPuzzleRoundResult,
  FocusGameResult,
  FocusRawSummary,
  FocusRoundTrial,
  GameResult,
  JudgmentGameResult,
  JudgmentRawSummary,
  JudgmentTrial,
  MemoryGameResult,
  MemoryRawSummary,
  MemoryRoundTrial,
  NumberPatternAnswer,
  NumberPatternGameResult,
  NumberPatternRawSummary,
  ReactionGameResult,
  ReactionRawSummary,
  ReactionTrial,
  ReasoningGameResult,
  ReasoningRawSummary,
  ReasoningTrial,
  SpatialGameResult,
  SpatialRawSummary,
  SpatialTrial,
  StatStatusMap,
  StoryMemoryAnswer,
  StoryMemoryGameResult,
  StoryMemoryRawSummary,
} from '@/lib/game/types'
import { evaluateReactionValidity, formatReactionRawRecord } from '@/lib/scoring/reaction'
import { formatMemoryRawRecord } from '@/lib/scoring/memory'
import { formatFocusRawRecord } from '@/lib/scoring/focus'
import { formatJudgmentRawRecord } from '@/lib/scoring/judgment'
import { formatSpatialRawRecord } from '@/lib/scoring/spatial'
import { formatReasoningRawRecord } from '@/lib/scoring/reasoning'
import { isBetterByGameScore } from '@/lib/scoring/shared'
import { formatStoryMemoryRawRecord } from '@/lib/scoring/story-memory'
import { formatColorTargetRawRecord } from '@/lib/scoring/color-target'
import { formatDodgeObstacleRawRecord } from '@/lib/scoring/dodge-obstacle'
import { formatBestChoiceRawRecord } from '@/lib/scoring/best-choice'
import { formatFitPuzzleRawRecord } from '@/lib/scoring/fit-puzzle'
import { formatNumberPatternRawRecord } from '@/lib/scoring/number-pattern'

type Phase =
  | 'landing'
  | 'login'
  | 'game'
  | 'complete'
  | 'freeplay-complete'
  | 'egg'
  | 'reveal'
  | 'save'
  | 'naming'
  | 'room'
  | 'mystats'
  | 'ranking'
  | 'mypage'
  | 'statling'
  | 'grow'
  | 'grow-game'
  | 'mission'

/** Phases that show the post-hatch bottom navigation. */
const NAV_PHASES: Phase[] = ['room', 'mystats', 'ranking', 'statling', 'mypage']

/**
 * Dev/QA "skip the 6 mini-games" control — visible in local dev by default,
 * or in any build where NEXT_PUBLIC_ENABLE_TEST_SKIP is explicitly turned
 * on. Never shown in a normal production build. Reading an unset env var is
 * always just `undefined` here, so this never throws when the variable is
 * absent.
 */
const SHOW_QA_SKIP =
  process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_TEST_SKIP === 'true'

const emptyFinals = () =>
  Object.fromEntries(PLAY_ORDER.map((id) => [id, 0])) as Record<StatId, number>

export function GameFlow() {
  const { user, loading: authLoading } = useAuth()
  const toastManager = Toast.useToastManager()
  const [phase, setPhase] = useState<Phase>('landing')
  const [flowMode, setFlowMode] = useState<'first' | 'free'>('first')
  const [index, setIndex] = useState(0)
  const [activeStatId, setActiveStatId] = useState<StatId>(PLAY_ORDER[0])
  /** Which registered game (see lib/game/game-registry.ts) is currently showing for activeStatId — e.g. 'reaction-classic' vs 'reaction-dodge-run'. */
  const [activeGameKey, setActiveGameKey] = useState<string>(getClassicGameKey(PLAY_ORDER[0]))
  /** Which of the 4 tiers is currently active — always 'normal' for First Play (enterStatGame), player-chosen for Free Play (confirmFreePlayGame/GrowGameScreen). See lib/game/difficulty.ts. */
  const [activeDifficulty, setActiveDifficulty] = useState<GameDifficulty>('normal')
  /**
   * Set right before backing out of an in-progress Free Play round (see
   * exitFreePlayGame) so GrowGameScreen's next mount seeds its difficulty
   * view with the same game instead of resetting to its game-list step.
   * Cleared (null) the moment a fresh Free Play run starts from GrowScreen
   * (selectFreePlayGame) so a stale value never leaks into an unrelated
   * stat's game list. Never read/written by Intro at all.
   */
  const [freePlayResumeGameKey, setFreePlayResumeGameKey] = useState<string | null>(null)
  const [statStatus, setStatStatus] = useState<StatStatusMap>(emptyStatStatusMap())
  const [lastResult, setLastResult] = useState<GameResult | null>(null)
  /**
   * The 0-100 value per stat shown on the Radar / MY STATUS chart, used for
   * representative-pet matching (getTopStat/getSecondStat, beginPetAssignment)
   * and the share card. Set directly from each stat's personal-best gameScore
   * (see the on*Complete handlers below: `isPersonalBest ? gameScore :
   * prevBest.gameScore`) — never recomputed separately, never random. A
   * stat's two registered games (see lib/game/game-registry.ts) share one
   * gameScore scale, so replaying with either game updates the same value.
   */
  const [finals, setFinals] = useState<Record<StatId, number>>(emptyFinals())
  const [statlingName, setStatlingName] = useState('')
  /**
   * The user's representative-pet record — `petId`/`topStat`/`secondStat`
   * are decided the moment finals are known (see
   * lib/pets/pet-flow.ts#beginPetAssignment) and never change once
   * `confirmed` is true. Persisted to localStorage (see
   * lib/pets/pet-storage.ts) — replaying the tests only refreshes the stored
   * growth data.
   */
  const [petRecord, setPetRecord] = useState<StoredPetProfile | null>(null)
  /**
   * Whether the Statling tab's nested 방 꾸미기 (ThemeScreen) view currently
   * has unsaved room edits — lifted here (not kept purely local to
   * StatlingScreen/ThemeScreen) so the bottom NavRail, which lives outside
   * both, can intercept a tab switch away from Statling and warn before
   * discarding those edits (see handleNavSelect below).
   */
  const [themeDirty, setThemeDirty] = useState(false)
  const [pendingNavTab, setPendingNavTab] = useState<NavTab | null>(null)
  /** Dev/QA only — pins the Room character to one TESTER_CHARACTER_FOLDERS entry's 24-state art. See qa-skip-menu.tsx / pet-mood-view.tsx. */
  const [testerFolderId, setTesterFolderId] = useState<string | null>(null)
  /**
   * Idempotency key for "the mini-game currently in progress" — read by
   * recordSkillCompletion below as `completionId`. Deliberately NOT
   * `generateSessionId()` called fresh inside each on*Complete handler (that
   * value already exists per-result as `sessionId`, but a fresh id every
   * call can't detect a duplicate call). This ref instead only changes when
   * a *new* round actually starts (enterStatGame / confirmFreePlayGame), so
   * if the same on*Complete handler somehow fires twice for the same round
   * (Strict Mode double-invoke, a stray duplicate call, re-entering the
   * result screen, ...), both calls carry the identical completionId and
   * lib/game/player-skill-storage.ts#recordMiniGameCompletion no-ops the
   * second one. A page refresh wipes this ref along with all other in-memory
   * game-flow state (nothing survives a refresh mid-game today — see the
   * mount effect above), so there is nothing left to duplicate against in
   * that case either.
   */
  const currentAttemptIdRef = useRef<string>(generateSessionId())
  /**
   * Whether the stat currently staged for Initial Assessment (First Play)
   * still has its 1 single-game retry unused — drives CompleteScreen's
   * "다시 도전하기" CTA (see handleRetryCurrentGame below). Reset to `true`
   * every time a genuinely new stat's game is staged (enterStatGame) and
   * flipped to `false` the moment the player actually uses the retry, not
   * merely offered it — so it never comes back for the same stat. Deliberately
   * separate from onReplay's full 6-game restart and from MyPageScreen's
   * resetAllPetData (a full account wipe) — neither of those touches this.
   */
  const [retryAvailable, setRetryAvailable] = useState(true)
  /**
   * True for exactly the one game-phase render that replays a stat's
   * already-completed Initial Assessment game (set by startRetry, read+
   * cleared at the top of the matching on*Complete handler). Lets that one
   * handler invocation skip every ranking/XP/mission/Intro-checkpoint side
   * effect a normal completion triggers — see recordSkillCompletion's own
   * doc comment — without threading a new parameter through 6 game
   * components' onComplete payload shapes, which are fixed by the game
   * components themselves. Also what makes that one completion's gameScore
   * unconditionally replace the stat's record (see each handler's
   * isPersonalBest line) rather than only on improvement.
   */
  const isRetryAttemptRef = useRef(false)
  /**
   * Every shape id Spatial's first Initial Assessment attempt showed this
   * run (reference + every option, correct or distractor) — set from
   * onSpatialComplete's own `trials` payload whenever that completion is
   * NOT a retry, read back out as the `avoidShapeIds` prop for the one
   * retry render so its shape sampling can lean away from what the player
   * just saw (see spatial-problems.ts's generateSpatialSession). Null until
   * Spatial's first attempt actually finishes; irrelevant to every other
   * stat.
   */
  const spatialFirstAttemptShapeIdsRef = useRef<Set<string> | null>(null)
  /**
   * Whether the player has confirmed the "재도전 시 이번 결과가 최종 기록으로
   * 반영돼요" retry notice at least once during the CURRENT Initial
   * Assessment run (see handleRetryCurrentGame/confirmRetryNotice below).
   * Reset only by start() (a genuinely new run) — never by enterStatGame —
   * so once shown for one stat, it never shows again for any of the other 5
   * within the same run.
   */
  const [hasSeenRetryNotice, setHasSeenRetryNotice] = useState(false)
  /** Gates the retry notice popup — see hasSeenRetryNotice. */
  const [confirmingRetryNotice, setConfirmingRetryNotice] = useState(false)
  /** A resumable Intro checkpoint found on mount (see lib/game/intro-progress-storage.ts) — non-null only while Landing can still offer "이어서 하기". Cleared the moment the player resumes, restarts, or the run finishes. */
  const [introResume, setIntroResume] = useState<IntroProgressState | null>(null)
  const [confirmingRestartIntro, setConfirmingRestartIntro] = useState(false)
  /** Gates CompleteScreen's "다시 하기" (6/6 result screen) — same reset as confirmingRestartIntro (start()), just a separate trigger point with its own wording, so a stray tap can't silently discard the just-finished run either. */
  const [confirmingReplayIntro, setConfirmingReplayIntro] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  /** Guards the auto-show effect below so it only ever fires once per mount, even as `phase` keeps changing between nav tabs — reopening manually (MyPageScreen's "온보딩 다시 보기") goes through setShowOnboarding directly and doesn't touch this. */
  const autoOnboardingShownRef = useRef(false)

  /**
   * topStat/secondaryStat once a pet has been assigned come straight from
   * petRecord (frozen the moment beginPetAssignment ran — see
   * lib/brain-bet.ts#pickTopTwoStats) rather than being recomputed from
   * `finals` on every render: recomputing live would re-roll the random
   * tie-break on every render, which could silently swap which stat reads as
   * "top" while the assigned pet itself stays the same. Falls back to a live
   * computation only pre-assignment (no petRecord yet — topStat is never
   * actually rendered in that state today, but this keeps the value defined
   * rather than throwing).
   */
  const topStat = petRecord ? petRecord.topStat : getTopStat(finals)
  const secondaryStat = petRecord ? petRecord.secondStat : getSecondStat(finals)
  const recommendedStat = getRecommendedStat(finals)
  /**
   * Single source of truth for "which pet is currently shown" — every
   * post-hatch screen (Egg, Reveal, Naming, Room, ...) reads this same value
   * instead of recomputing anything from getTopStat/CharacterImage. Resolves
   * to the assigned pet, confirmed or not (see
   * lib/pets/pet-flow.ts#resolveCurrentPetProfile); null only when no pet
   * has been assigned yet at all.
   */
  const displayedPetProfile = petRecord ? resolveCurrentPetProfile(petRecord) : null

  /**
   * True only for a device that has logged in at least once before (see
   * lib/missions/activity-counters.ts#hasLoggedInEver, flipped by
   * trackFirstLogin() the moment a real login is first detected — see the
   * effect below) and is currently signed out. A first-time visitor who has
   * never logged in always has `hasLoggedInEver: false`, so Landing's
   * existing "게임 시작하기" flow is untouched for them — this only swaps in
   * the "다시 로그인" flow for someone specifically returning after a
   * logout. Recomputed on every render (a cheap synchronous localStorage
   * read) rather than cached in state, so it immediately reflects a logout
   * that just happened without needing a remount.
   */
  const isReturningLoggedOut = !authLoading && !user && loadActivityCounters().hasLoggedInEver

  /** Dev/QA only — the currently-active tester folder, if any (see qa-skip-menu.tsx). */
  const activeTesterFolder = TESTER_CHARACTER_FOLDERS.find((f) => f.folderId === testerFolderId) ?? null
  /**
   * Dev/QA only — swaps in a synthetic profile for `real` whenever a tester
   * folder is active, so Egg/Reveal/Naming show the tested character's own
   * name and art instead of whichever real catalog pet the mock finals
   * happened to match (wrong name, and sometimes a broken image for a
   * catalog pet whose real PNG isn't wired up yet). Room itself doesn't need
   * this: it already shows the tester's full 24-state art via PetMoodView's
   * own `testerFolder` prop, keyed off live mood/animation rather than one
   * static image.
   */
  const applyTesterOverride = (real: PetProfile): PetProfile =>
    activeTesterFolder
      ? {
          id: `tester-${activeTesterFolder.folderId}`,
          name: activeTesterFolder.displayName,
          imageSrc: activeTesterFolder.assets.idle,
          primaryStat: 'reaction',
          secondaryStat: 'memory',
          vector: Object.fromEntries(PLAY_ORDER.map((id) => [id, 0.5])) as Record<StatId, number>,
          tagline: '테스터용 캐릭터예요.',
        }
      : real

  // Restores whatever representative-pet state already exists on mount, so a
  // reload never re-offers the Landing/Intro flow to someone who's already
  // been through it:
  // - CONFIRMED: skip Landing/Intro entirely and land straight in Room — the
  //   pet is permanent, so there is nothing left for Intro to decide.
  //   Without this, `phase` defaults to 'landing' on every fresh mount
  //   regardless of stored state, and 'landing' is reachable no other way
  //   (see NAV_PHASES) — so a reload was the one loophole that let Intro run
  //   again against an already-locked pet, always surfacing the old
  //   `refreshGrowthData`-preserved pet no matter what the new finals were.
  // - Not yet confirmed: bounce to Reveal instead (e.g. after a refresh
  //   before ever confirming) — unchanged from before.
  useEffect(() => {
    const stored = loadStoredPetProfile()
    if (!stored) return
    if (stored.confirmed) {
      setFinals(stored.latestFinals)
      setPetRecord(stored)
      if (stored.statlingName) setStatlingName(stored.statlingName)
      setPhase('room')
      return
    }
    setFinals(stored.latestFinals)
    setPetRecord(stored)
    setPhase('reveal')
  }, [])

  // Offers "이어서 하기" on Landing only when a resumable, not-yet-stale
  // checkpoint exists (see lib/game/intro-progress-storage.ts#loadIntroProgress
  // for the staleness/already-finished rules).
  useEffect(() => {
    setIntroResume(loadIntroProgress())
  }, [])

  // 출석/업적 choke point — once per mount, regardless of hatch state, so
  // 첫 출석/연속 접속 achievements and the "오늘 출석하기" daily mission
  // start counting from the very first visit. See lib/missions/mission-tracker.ts.
  useEffect(() => {
    trackDailyVisit()
  }, [])

  // Achievement-unlock nudge — GameFlow is the one component guaranteed to
  // be mounted for the whole session regardless of which screen/hook
  // actually triggered the unlock (feed/wash/play/pet/talk in RoomScreen,
  // a mini-game completion right here, a room/Statling decor save, a share
  // — see mission-tracker.ts's track* functions), so this is the single
  // place that can reliably show the toast no matter where the achievement
  // fired from. Deliberately a small "you unlocked something" nudge, NOT a
  // reward notification — XP/Room reward only grant once the player opens
  // 업적 and presses "보상 받기" (see mission-screen.tsx's claim handler /
  // mission-tracker.ts#claimAchievementReward).
  useEffect(() => {
    return subscribeToAchievementUnlocks((tier) => {
      toastManager.add({ title: `업적 달성! ${tier.title}`, type: 'success' })
    })
  }, [toastManager])

  // "첫 로그인" — fires the moment useAuth() first resolves a real user,
  // idempotent so a later remount/session never re-fires it.
  useEffect(() => {
    if (user) trackFirstLogin()
  }, [user])

  /**
   * True once this session has actually observed a real signed-in `user` —
   * distinguishes "just logged out" from "was a guest the whole time" so the
   * effect below only fires on a genuine sign-out, never on ordinary mount
   * (where `user` also starts null before AuthProvider resolves).
   */
  const wasSignedInRef = useRef(false)

  // Sign-out immediately exits any post-hatch nav screen (Home/My
  // Page/등) back to Landing — no refresh needed, since this reacts to
  // useAuth()'s `user` going non-null -> null the instant MyPageScreen's
  // signOut() resolves. Local pet/room/stat/XP data is untouched here (see
  // resetAllPetData for the actual data wipe, a completely separate action);
  // Landing itself then shows the "Statling 만나러 가기" / hidden-autosave
  // returning-visitor state via isReturningLoggedOut below, since
  // hasLoggedInEver was already set to true by trackFirstLogin above.
  useEffect(() => {
    if (user) {
      wasSignedInRef.current = true
      return
    }
    if (wasSignedInRef.current && NAV_PHASES.includes(phase)) {
      wasSignedInRef.current = false
      setPhase('landing')
    }
  }, [user, phase])

  // Auto-shows the onboarding card exactly once, the first time a first-visit
  // (never dismissed with "다시 보지 않기") user reaches any of the main tabs —
  // i.e. right after hatching, not on Landing/game screens.
  useEffect(() => {
    if (autoOnboardingShownRef.current) return
    if (!NAV_PHASES.includes(phase)) return
    autoOnboardingShownRef.current = true
    if (!loadOnboardingSeen()) setShowOnboarding(true)
  }, [phase])

  /**
   * True for every screen that belongs to the Intro (First Play) onboarding
   * run — Landing through Naming — regardless of how it was reached (fresh
   * start, "이어서 하기" resume, "처음부터/다시 하기" restart, or the
   * refresh-to-Reveal bounce-back above). 'game'/'complete' are shared with
   * Free Play, which always runs as flowMode 'free' (see
   * selectFreePlayGame/confirmFreePlayGame), so checking flowMode is what
   * keeps a Free Play round from being mistaken for Intro.
   */
  const isIntroPhase =
    phase === 'landing' ||
    phase === 'login' ||
    phase === 'egg' ||
    phase === 'reveal' ||
    phase === 'save' ||
    phase === 'naming' ||
    (flowMode === 'first' && (phase === 'game' || phase === 'complete'))

  // Intro is always silent, no matter what the player previously chose in
  // MyPage — sound only turns on once Room is reached, and even then only if
  // the player has explicitly enabled it (default OFF, see
  // lib/audio/audio-settings-storage.ts). `introLocked` is a separate flag
  // from `muted` specifically so this can't race with AudioProvider's
  // mount-time application of the persisted setting (see AudioManager's doc
  // comment on the field).
  useEffect(() => {
    audioManager.setIntroLocked(isIntroPhase)
  }, [isIntroPhase])

  /** First Play only — always stages the stat's classic game at Normal difficulty (see getClassicGameKey; spec §17: "Normal ... 최초 플레이 가능", the only tier Intro ever uses). Free Play picks a specific game+difficulty explicitly instead (see selectFreePlayGame/confirmFreePlayGame below). */
  const enterStatGame = (statId: StatId) => {
    setActiveStatId(statId)
    setActiveGameKey(getClassicGameKey(statId))
    setActiveDifficulty('normal')
    currentAttemptIdRef.current = generateSessionId() // new round starting — see the ref's own doc comment
    // A brand-new stat always starts with its 1 Initial-Assessment retry
    // unused — see retryAvailable's own doc comment. isRetryAttemptRef is
    // reset here too, defensively (it's already consumed+reset inside the
    // matching on*Complete handler right after a retry completes).
    setRetryAvailable(true)
    isRetryAttemptRef.current = false
    if (statId === 'spatial') spatialFirstAttemptShapeIdsRef.current = null
  }

  /**
   * Single choke point every on*Complete handler calls for a *valid* attempt
   * (invalid/anti-cheat-flagged attempts never reach here, matching the
   * existing savePetMemory(recordGameCompletion(...)) gating pattern below).
   * `activeGameKey` is read live from closure state — by the time a handler
   * runs, it still names the game that was just played (the next
   * enterStatGame/confirmFreePlayGame call, which would change it, only
   * happens later from a user click on the Complete screen). See
   * lib/game/player-skill-storage.ts for the idempotency/averaging rules
   * this delegates to. Every call site gates this behind `!isRetry` (see
   * isRetryAttemptRef) — an Initial Assessment retry attempt never reaches
   * here at all, so it can never earn extra XP, mission credit, or a
   * player-skill best-record write on top of its original attempt's.
   */
  function recordSkillCompletion(
    statCategory: StatId,
    gameScore: number,
    raw: RawRecord,
    metrics: Record<string, number>,
    isPersonalBest: boolean,
  ) {
    const { state, applied } = recordMiniGameCompletion(loadPlayerSkillState(), {
      completionId: currentAttemptIdRef.current,
      gameId: activeGameKey,
      statCategory,
      difficulty: activeDifficulty,
      normalizedScore: gameScore,
      completedAt: new Date().toISOString(),
      raw,
      metrics,
    })
    if (applied) savePlayerSkillState(state)
    // Ranking XP — same choke point, so every valid completion (Intro or Free
    // Play, any of the 12 on*Complete handlers) earns XP exactly once, in
    // lockstep with the skill record it's paired with above. See
    // lib/ranking/xp-ledger.ts for why this is a separate ledger from both
    // gameDifficultyBestRecords above and pet-care's intimacyExp.
    if (applied) saveXpState(addXp(loadXpState(), gameScore))
    // Missions/achievements — same choke point, see lib/missions/mission-tracker.ts.
    if (applied) trackGamePlayed({ isFreePlay: flowMode === 'free', isPersonalBest })
    // Free Play energy cost — Initial Assessment (flowMode 'first') never
    // touches energy, only a genuinely completed Free Play round does (see
    // FREE_PLAY_ENERGY_COST's own doc comment). Written straight to storage
    // (not through usePetCare, which only exists while RoomScreen is
    // mounted) so the very next time Room mounts it reads the already-
    // updated state, same pattern XP/player-skill above already use.
    if (applied && flowMode === 'free') {
      const now = new Date()
      const decayedPetState = applyPetDecay(loadPetCareState(), now)
      const { petState } = buildDirectEffect(decayedPetState, { energy: -FREE_PLAY_ENERGY_COST }, 0, now)
      savePetCareState(petState)
    }
  }

  /**
   * Checkpoints one Intro (First Play) game's completion so a refresh/tab
   * close/back-then-forward mid-run can resume from the next stat instead of
   * replaying the whole sequence — see lib/game/intro-progress-storage.ts.
   * Call sites already guard with `flowMode === 'first'`, so a Free Play
   * replay never touches this; a duplicate call for the same stat (Strict
   * Mode double-invoke, ...) is already a no-op inside
   * recordIntroGameCompletion, same idempotency shape as recordSkillCompletion
   * above.
   *
   * `isRetry` routes through replaceIntroGameCompletion instead: a retry's
   * completion must always overwrite the checkpoint with its own score
   * (otherwise 이어서 하기 would resume from the *pre-retry* score even after
   * the retry replaced it — see each on*Complete handler's isPersonalBest
   * line, which `finals`/statStatus follow the same way), regardless of
   * whether it's higher or lower, and must never create a second entry for
   * the same stat.
   */
  function recordIntroCheckpoint(statId: StatId, gameKey: string, gameScore: number, isRetry: boolean) {
    const progress = loadIntroProgress()
    if (!progress) return // no active checkpoint (e.g. already resumed to completion) — nothing to update
    const entry = { statId, gameKey, gameScore, completedAt: new Date().toISOString() }
    saveIntroProgress(isRetry ? replaceIntroGameCompletion(progress, entry) : recordIntroGameCompletion(progress, entry))
  }

  /** Fresh Intro run — first-ever visit, "다시 하기" after a full completion, or "처음부터 다시 하기" from Landing. Always starts a brand-new checkpoint (see startNewIntroProgress). */
  const start = () => {
    setIndex(0)
    enterStatGame(PLAY_ORDER[0])
    setFlowMode('first')
    setFinals(emptyFinals())
    startNewIntroProgress()
    setIntroResume(null)
    setHasSeenRetryNotice(false) // a genuinely new run gets the retry notice again on its first retry
    setPhase('game')
  }

  /** "이어서 하기" — rebuilds `finals` from the checkpoint's completed stats (see IntroCompletedGame) and jumps straight to the next not-yet-played stat. The in-progress game itself is never restored — only fully completed games count, per spec. */
  const resumeIntro = () => {
    if (!introResume) return
    const restoredFinals = emptyFinals()
    for (const g of introResume.completedGames) restoredFinals[g.statId] = g.gameScore
    const nextIndex = introResume.completedGames.length
    setFinals(restoredFinals)
    setFlowMode('first')
    setIntroResume(null)
    if (nextIndex >= TOTAL_GAMES) {
      // Defensive only — loadIntroProgress already treats a fully-completed
      // checkpoint as "nothing to resume" (returns null), so introResume can
      // never actually reach here with all 6 games done. If it somehow did,
      // there's no just-played game left to show a result screen for, so
      // skip straight to the same place a real finish now leads to.
      handleMeetStatling(restoredFinals)
      return
    }
    setIndex(nextIndex)
    enterStatGame(PLAY_ORDER[nextIndex])
    setPhase('game')
  }

  /** "처음부터 다시 하기" — only wipes the Intro checkpoint (see start()); never touches pet/room/care data. Gated behind confirmingRestartIntro so a stray tap can't silently discard progress. */
  const restartIntro = () => {
    clearIntroProgress()
    start()
  }

  /** Landing's "Statling 만나러 가기" CTA (see isReturningLoggedOut) — routes to the login/signup screen instead of starting the game directly. */
  const goToLogin = () => setPhase('login')

  /**
   * LoginScreen's onAuthenticated — login never touches local pet data
   * (see lib/auth/local-auth-provider.tsx, entirely separate storage), so
   * this just re-reads whatever was already on this device and routes
   * accordingly: an existing confirmed Statling goes straight to Home,
   * otherwise a fresh Intro run starts, same as a first-time visitor's
   * "게임 시작하기" would. Mirrors the mount effect's own confirmed-branch
   * logic above.
   */
  const handleLoginAuthenticated = () => {
    const stored = loadStoredPetProfile()
    if (stored?.confirmed) {
      setFinals(stored.latestFinals)
      setPetRecord(stored)
      if (stored.statlingName) setStatlingName(stored.statlingName)
      setPhase('room')
      return
    }
    start()
  }

  /** "다음" from any of the first 5 result screens. The 6th (last) result screen never calls this — it shows its own onMeetStatling/onReplay CTAs instead (see CompleteScreen's isLast branch and the 'complete' render below). */
  const goNextFirst = () => {
    const nextIndex = index + 1
    setIndex(nextIndex)
    enterStatGame(PLAY_ORDER[nextIndex])
    setPhase('game')
  }

  /**
   * The actual replay mechanics, factored out of handleRetryCurrentGame so
   * both the "notice already seen" fast path and confirmRetryNotice's
   * onConfirm share it. Deliberately does NOT call enterStatGame:
   * activeStatId/activeGameKey/activeDifficulty/index must stay exactly as
   * they are (this is the same game, not a new one), only `phase` needs to
   * flip back to 'game' — the outer stepKey (see the render below) already
   * forces that render to fully remount the game component, so it starts
   * from its own intro screen same as any other fresh attempt. The matching
   * on*Complete handler reads isRetryAttemptRef to skip every ranking/XP/
   * Intro-checkpoint side effect a normal completion triggers, and
   * unconditionally replaces the stat's record with this attempt's own
   * gameScore (win or lose) — see that handler's isPersonalBest line.
   *
   * GA4 hook point: a future `mini_game_retry` event (stat: activeStatId,
   * gameId: activeGameKey) belongs right here — this is the one place a
   * retry actually begins, for all 6 stats.
   */
  const startRetry = () => {
    setRetryAvailable(false)
    isRetryAttemptRef.current = true
    currentAttemptIdRef.current = generateSessionId() // a genuinely new attempt, even though it replays the same game
    setPhase('game')
  }

  /** ConfirmDialog's onConfirm for the retry notice — marks it seen for the rest of this run (see hasSeenRetryNotice) and then actually starts the replay. */
  const confirmRetryNotice = () => {
    setHasSeenRetryNotice(true)
    startRetry()
  }

  /**
   * CompleteScreen's "다시 도전하기". No-ops if this stat's 1 retry is
   * already used (see retryAvailable). The very first time this is clicked
   * in the current Initial Assessment run, it shows a confirmation notice
   * ("재도전 시 이번 결과가 최종 기록으로 반영돼요") instead of retrying
   * immediately — see hasSeenRetryNotice/confirmRetryNotice. Every later
   * click, for any of the other 5 stats, skips straight to startRetry once
   * that notice has been acknowledged once.
   */
  const handleRetryCurrentGame = () => {
    if (!retryAvailable) return
    if (hasSeenRetryNotice) {
      startRetry()
    } else {
      setConfirmingRetryNotice(true)
    }
  }

  /** Completion path for the real Reaction game. */
  const onReactionComplete = ({
    trials,
    rawSummary,
    gameScore,
  }: {
    trials: ReactionTrial[]
    rawSummary: ReactionRawSummary
    gameScore: number
  }) => {
    // Captured once, immediately, before anything else can touch the ref —
    // see isRetryAttemptRef's own doc comment for why this one completion
    // skips the ranking/XP/Intro-checkpoint side effects below.
    const isRetry = isRetryAttemptRef.current
    isRetryAttemptRef.current = false
    const { isValidAttempt, invalidReason } = evaluateReactionValidity(trials)
    // Compared against THIS exact game+difficulty's own stored best — never
    // the sibling game's. 신호 반응 vs 장애물 피하기 share the 'reaction' stat
    // (and therefore statStatus.reaction), but a Personal Best must never
    // leak across variants — see player-skill-storage.ts's
    // getRecordAtDifficulty, keyed by gameId:difficulty (activeGameKey
    // already IS the specific variant, e.g. 'reaction-classic').
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    // A retry's score always becomes the record, win or lose (product
    // policy — see startRetry's doc comment) — isRetry short-circuits the
    // usual "only if better" comparison rather than replacing it, so a
    // Free Play/first-attempt completion (isRetry always false there) keeps
    // the exact original best-of comparison.
    const isPersonalBest = isValidAttempt && (isRetry || isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null))

    const result: ReactionGameResult = {
      sessionId: generateSessionId(),
      gameId: 'reaction',
      gameVersion: REACTION_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatReactionRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      isValidAttempt,
      invalidReason,
      attempt: isRetry ? 2 : 1,
      trials,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('reaction', map, result))
    setLastResult(result)
    if (result.isValidAttempt && !isRetry) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt && !isRetry) recordSkillCompletion('reaction', gameScore, result.raw, { medianReactionMs: rawSummary.medianReactionMs, consistency: rawSummary.consistency }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('reaction', activeGameKey, gameScore, isRetry)
    setFinals((f) => ({ ...f, reaction: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  /** Completion path for the real Memory game. */
  const onMemoryComplete = ({
    rounds,
    rawSummary,
    gameScore,
  }: {
    rounds: MemoryRoundTrial[]
    rawSummary: MemoryRawSummary
    gameScore: number
  }) => {
    const isRetry = isRetryAttemptRef.current
    isRetryAttemptRef.current = false
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's (패턴 기억 vs 물건 기억) — see onReactionComplete's
    // getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    // A retry's score always becomes the record, win or lose — see
    // onReactionComplete's isPersonalBest doc comment.
    const isPersonalBest = isRetry || isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: MemoryGameResult = {
      sessionId: generateSessionId(),
      gameId: 'memory',
      gameVersion: MEMORY_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatMemoryRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      // Memory-specific anti-cheat isn't defined yet (GAME_SPEC has no Memory
      // cheat criteria) — every completed attempt is valid for now.
      isValidAttempt: true,
      invalidReason: null,
      attempt: isRetry ? 2 : 1,
      rounds,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('memory', map, result))
    setLastResult(result)
    if (result.isValidAttempt && !isRetry) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt && !isRetry) recordSkillCompletion('memory', gameScore, result.raw, { weightedAccuracy: rawSummary.weightedAccuracy, averageAdjustedResponseTimeMs: rawSummary.averageAdjustedResponseTimeMs }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('memory', activeGameKey, gameScore, isRetry)
    setFinals((f) => ({ ...f, memory: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  /** Completion path for the real Focus game. */
  const onFocusComplete = ({
    rounds,
    rawSummary,
    gameScore,
  }: {
    rounds: FocusRoundTrial[]
    rawSummary: FocusRawSummary
    gameScore: number
  }) => {
    const isRetry = isRetryAttemptRef.current
    isRetryAttemptRef.current = false
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's (표적 찾기 vs 특정 색만 클릭) — see onReactionComplete's
    // getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    // A retry's score always becomes the record, win or lose — see
    // onReactionComplete's isPersonalBest doc comment.
    const isPersonalBest = isRetry || isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: FocusGameResult = {
      sessionId: generateSessionId(),
      gameId: 'focus',
      gameVersion: FOCUS_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatFocusRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      // Focus-specific anti-cheat isn't defined yet (GAME_SPEC has no Focus
      // cheat criteria) — every completed attempt is valid for now.
      isValidAttempt: true,
      invalidReason: null,
      attempt: isRetry ? 2 : 1,
      rounds,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('focus', map, result))
    setLastResult(result)
    if (result.isValidAttempt && !isRetry) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt && !isRetry) recordSkillCompletion('focus', gameScore, result.raw, { weightedAccuracy: rawSummary.weightedAccuracy, averageResponseTimeMs: rawSummary.averageResponseTimeMs }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('focus', activeGameKey, gameScore, isRetry)
    setFinals((f) => ({ ...f, focus: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  /** Completion path for the real Judgment game. */
  const onJudgmentComplete = ({
    trials,
    rawSummary,
    gameScore,
  }: {
    trials: JudgmentTrial[]
    rawSummary: JudgmentRawSummary
    gameScore: number
  }) => {
    const isRetry = isRetryAttemptRef.current
    isRetryAttemptRef.current = false
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's (규칙 전환 vs 무엇을 선택할까) — see onReactionComplete's
    // getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    // A retry's score always becomes the record, win or lose — see
    // onReactionComplete's isPersonalBest doc comment.
    const isPersonalBest = isRetry || isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: JudgmentGameResult = {
      sessionId: generateSessionId(),
      gameId: 'judgment',
      gameVersion: JUDGMENT_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatJudgmentRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      // Judgment-specific anti-cheat isn't defined yet (GAME_SPEC has no
      // Judgment cheat criteria) — every completed attempt is valid for now.
      isValidAttempt: true,
      invalidReason: null,
      attempt: isRetry ? 2 : 1,
      trials,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('judgment', map, result))
    setLastResult(result)
    if (result.isValidAttempt && !isRetry) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt && !isRetry)
      recordSkillCompletion(
        'judgment',
        gameScore,
        result.raw,
        { correctBlocks: rawSummary.correctBlocks, overallAccuracy: rawSummary.overallAccuracy, switchAccuracy: rawSummary.switchAccuracy },
        isPersonalBest,
      )
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('judgment', activeGameKey, gameScore, isRetry)
    setFinals((f) => ({ ...f, judgment: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  /** Completion path for the real Spatial game. */
  const onSpatialComplete = ({
    trials,
    rawSummary,
    gameScore,
  }: {
    trials: SpatialTrial[]
    rawSummary: SpatialRawSummary
    gameScore: number
  }) => {
    const isRetry = isRetryAttemptRef.current
    isRetryAttemptRef.current = false
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's (회전 도형 찾기 vs 퍼즐 끼우기) — see onReactionComplete's
    // getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    // A retry's score always becomes the record, win or lose — see
    // onReactionComplete's isPersonalBest doc comment.
    const isPersonalBest = isRetry || isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: SpatialGameResult = {
      sessionId: generateSessionId(),
      gameId: 'spatial',
      gameVersion: SPATIAL_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatSpatialRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      // Spatial-specific anti-cheat isn't defined yet (GAME_SPEC has no
      // Spatial cheat criteria) — every completed attempt is valid for now.
      isValidAttempt: true,
      invalidReason: null,
      attempt: isRetry ? 2 : 1,
      trials,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('spatial', map, result))
    setLastResult(result)
    if (result.isValidAttempt && !isRetry) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt && !isRetry) recordSkillCompletion('spatial', gameScore, result.raw, { difficultyWeightedAccuracy: rawSummary.difficultyWeightedAccuracy, averageResponseTimeMs: rawSummary.averageResponseTimeMs }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('spatial', activeGameKey, gameScore, isRetry)
    // Snapshot every shape this attempt showed (reference + all 4 options,
    // per question) ONLY from a genuine first attempt — see
    // spatialFirstAttemptShapeIdsRef's own doc comment. Never overwritten by
    // the retry's own completion, so it always reflects "what the 1st
    // attempt showed," exactly what avoidShapeIds is supposed to dodge.
    if (!isRetry) {
      const shownShapeIds = new Set<string>()
      for (const trial of trials) {
        shownShapeIds.add(trial.shapeId)
        for (const option of trial.options) shownShapeIds.add(option.shapeId)
      }
      spatialFirstAttemptShapeIdsRef.current = shownShapeIds
    }
    setFinals((f) => ({ ...f, spatial: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  /** Completion path for the real Reasoning game — the last stat to get a real implementation; every stat now has one. */
  const onReasoningComplete = ({
    trials,
    rawSummary,
    gameScore,
  }: {
    trials: ReasoningTrial[]
    rawSummary: ReasoningRawSummary
    gameScore: number
  }) => {
    const isRetry = isRetryAttemptRef.current
    isRetryAttemptRef.current = false
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's (규칙 찾기 vs 숫자 규칙) — see onReactionComplete's
    // getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    // A retry's score always becomes the record, win or lose — see
    // onReactionComplete's isPersonalBest doc comment.
    const isPersonalBest = isRetry || isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: ReasoningGameResult = {
      sessionId: generateSessionId(),
      gameId: 'reasoning',
      gameVersion: REASONING_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatReasoningRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      // Reasoning-specific anti-cheat isn't defined yet (GAME_SPEC has no
      // Reasoning cheat criteria) — every completed attempt is valid for now.
      isValidAttempt: true,
      invalidReason: null,
      attempt: isRetry ? 2 : 1,
      trials,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('reasoning', map, result))
    setLastResult(result)
    if (result.isValidAttempt && !isRetry) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt && !isRetry) recordSkillCompletion('reasoning', gameScore, result.raw, { difficultyWeightedAccuracy: rawSummary.difficultyWeightedAccuracy, averageResponseTimeMs: rawSummary.averageResponseTimeMs }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('reasoning', activeGameKey, gameScore, isRetry)
    setFinals((f) => ({ ...f, reasoning: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  // ---------------------------------------------------------------------
  // Completion paths for the 6 new games (one extra per stat, see
  // lib/game/game-registry.ts). Same shape as the 6 handlers above: build a
  // GameResult, hand it to the untouched applyGameResult/StatStatus
  // machinery, then set `finals` to this stat's personal-best gameScore —
  // the exact same rule every other stat uses, so a story-recall result and
  // a grid-recall result under the same stat feed the same `finals[stat]`.
  // isPersonalBest compares gameScore directly (see isBetterByGameScore)
  // rather than the classic game's own rawSummary-shaped comparator, since
  // a story-recall result and a grid-recall result aren't structurally
  // comparable field-by-field.
  // ---------------------------------------------------------------------

  const onStoryMemoryComplete = ({
    answers,
    rawSummary,
    gameScore,
  }: {
    answers: StoryMemoryAnswer[]
    rawSummary: StoryMemoryRawSummary
    gameScore: number
  }) => {
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's — see onReactionComplete's getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    const isPersonalBest = isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: StoryMemoryGameResult = {
      sessionId: generateSessionId(),
      gameId: 'memory',
      variant: 'story-recall',
      gameVersion: STORY_MEMORY_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatStoryMemoryRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      isValidAttempt: true,
      invalidReason: null,
      answers,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('memory', map, result))
    setLastResult(result)
    if (result.isValidAttempt) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt) recordSkillCompletion('memory', gameScore, result.raw, { accuracy: rawSummary.accuracy, averageResponseTimeMs: rawSummary.averageResponseTimeMs }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('memory', activeGameKey, gameScore, false)
    setFinals((f) => ({ ...f, memory: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  const onColorTargetComplete = ({
    events,
    rawSummary,
    gameScore,
  }: {
    events: ColorTargetClickEvent[]
    rawSummary: ColorTargetRawSummary
    gameScore: number
  }) => {
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's — see onReactionComplete's getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    const isPersonalBest = isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: ColorTargetGameResult = {
      sessionId: generateSessionId(),
      gameId: 'focus',
      variant: 'color-target',
      gameVersion: COLOR_TARGET_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatColorTargetRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      isValidAttempt: true,
      invalidReason: null,
      events,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('focus', map, result))
    setLastResult(result)
    if (result.isValidAttempt) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt) recordSkillCompletion('focus', gameScore, result.raw, { accuracy: rawSummary.accuracy, averageReactionTimeMs: rawSummary.averageReactionTimeMs, switchAccuracy: rawSummary.switchAccuracy }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('focus', activeGameKey, gameScore, false)
    setFinals((f) => ({ ...f, focus: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  const onDodgeObstacleComplete = ({
    events,
    rawSummary,
    gameScore,
  }: {
    events: DodgeObstacleEvent[]
    rawSummary: DodgeObstacleRawSummary
    gameScore: number
  }) => {
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's (신호 반응 vs 장애물 피하기) — see onReactionComplete's
    // getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    const isPersonalBest = isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const dodgeMode = getDodgeObstacleTierConfig(activeDifficulty).mode

    const result: DodgeObstacleGameResult = {
      sessionId: generateSessionId(),
      gameId: 'reaction',
      variant: 'dodge-run',
      gameVersion: DODGE_OBSTACLE_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatDodgeObstacleRawRecord(rawSummary, dodgeMode),
      final: undefined,
      isPersonalBest,
      isValidAttempt: true,
      invalidReason: null,
      events,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('reaction', map, result))
    setLastResult(result)
    if (result.isValidAttempt) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt)
      recordSkillCompletion(
        'reaction',
        gameScore,
        result.raw,
        {
          survivedMs: rawSummary.survivedMs,
          obstaclesDodged: rawSummary.obstaclesDodged,
          collisions: rawSummary.collisions,
          averageMoveReactionMs: rawSummary.averageMoveReactionMs,
        },
        isPersonalBest,
      )
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('reaction', activeGameKey, gameScore, false)
    setFinals((f) => ({ ...f, reaction: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  const onBestChoiceComplete = ({
    answers,
    rawSummary,
    gameScore,
  }: {
    answers: BestChoiceAnswer[]
    rawSummary: BestChoiceRawSummary
    gameScore: number
  }) => {
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's — see onReactionComplete's getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    const isPersonalBest = isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: BestChoiceGameResult = {
      sessionId: generateSessionId(),
      gameId: 'judgment',
      variant: 'best-choice',
      gameVersion: BEST_CHOICE_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatBestChoiceRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      isValidAttempt: true,
      invalidReason: null,
      answers,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('judgment', map, result))
    setLastResult(result)
    if (result.isValidAttempt) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt) recordSkillCompletion('judgment', gameScore, result.raw, { accuracy: rawSummary.accuracy, averageResponseTimeMs: rawSummary.averageResponseTimeMs }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('judgment', activeGameKey, gameScore, false)
    setFinals((f) => ({ ...f, judgment: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  const onFitPuzzleComplete = ({
    rounds,
    rawSummary,
    gameScore,
  }: {
    rounds: FitPuzzleRoundResult[]
    rawSummary: FitPuzzleRawSummary
    gameScore: number
  }) => {
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's — see onReactionComplete's getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    const isPersonalBest = isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: FitPuzzleGameResult = {
      sessionId: generateSessionId(),
      gameId: 'spatial',
      variant: 'fit-puzzle',
      gameVersion: FIT_PUZZLE_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatFitPuzzleRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      isValidAttempt: true,
      invalidReason: null,
      rounds,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('spatial', map, result))
    setLastResult(result)
    if (result.isValidAttempt) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt) recordSkillCompletion('spatial', gameScore, result.raw, { totalCompletionMs: rawSummary.totalCompletionMs, misplacements: rawSummary.misplacements }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('spatial', activeGameKey, gameScore, false)
    setFinals((f) => ({ ...f, spatial: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  const onNumberPatternComplete = ({
    answers,
    rawSummary,
    gameScore,
  }: {
    answers: NumberPatternAnswer[]
    rawSummary: NumberPatternRawSummary
    gameScore: number
  }) => {
    // Compared against THIS exact game+difficulty's own stored best, never
    // the sibling game's — see onReactionComplete's getRecordAtDifficulty doc comment.
    const prevBest = getRecordAtDifficulty(loadPlayerSkillState(), activeGameKey, activeDifficulty)
    const isPersonalBest = isBetterByGameScore(gameScore, prevBest?.normalizedScore ?? null)

    const result: NumberPatternGameResult = {
      sessionId: generateSessionId(),
      gameId: 'reasoning',
      variant: 'number-pattern',
      gameVersion: NUMBER_PATTERN_GAME_VERSION,
      difficulty: activeDifficulty,
      mode: flowMode,
      playedAt: new Date().toISOString(),
      device: detectDevice(),
      gameScore,
      raw: formatNumberPatternRawRecord(rawSummary),
      final: undefined,
      isPersonalBest,
      isValidAttempt: true,
      invalidReason: null,
      answers,
      rawSummary,
    }

    setStatStatus((map) => applyGameResult('reasoning', map, result))
    setLastResult(result)
    if (result.isValidAttempt) savePetMemory(recordGameCompletion(loadPetMemory(), result, new Date()))
    if (result.isValidAttempt) recordSkillCompletion('reasoning', gameScore, result.raw, { accuracy: rawSummary.accuracy, averageResponseTimeMs: rawSummary.averageResponseTimeMs }, isPersonalBest)
    if (result.isValidAttempt && flowMode === 'first') recordIntroCheckpoint('reasoning', activeGameKey, gameScore, false)
    setFinals((f) => ({ ...f, reasoning: isPersonalBest ? gameScore : (prevBest?.normalizedScore ?? 0) }))
    setPhase(flowMode === 'first' ? 'complete' : 'freeplay-complete')
  }

  /** Free Play step 1 — stat chosen in GrowScreen, now show that stat's game pool so the player can pick which one to play. */
  const selectFreePlayGame = (statId: StatId) => {
    setActiveStatId(statId)
    setFlowMode('free')
    setFreePlayResumeGameKey(null) // fresh entry — GrowGameScreen starts at its game-list step, not a leftover game
    setPhase('grow-game')
  }

  /** Free Play step 2 — a specific game + difficulty was chosen in GrowGameScreen, start it. */
  const confirmFreePlayGame = (gameKey: string, difficulty: GameDifficulty) => {
    setActiveGameKey(gameKey)
    setActiveDifficulty(difficulty)
    currentAttemptIdRef.current = generateSessionId() // new round starting — see the ref's own doc comment
    setPhase('game')
  }

  /**
   * Free Play only — backs out of an in-progress round to the difficulty
   * screen it was started from (see FreePlayBadge/GameHud's onBack, wired
   * to every mini-game's Free Play header). Deliberately does nothing else:
   * no on*Complete handler runs, so nothing is written to
   * player-skill-storage/xp-ledger/missions/pet-care energy for this
   * abandoned round — those only ever happen inside recordSkillCompletion,
   * which a game can only reach by finishing and calling its own
   * onComplete. Never reachable from Intro (mode 'first' never renders a
   * back button at all).
   */
  const exitFreePlayGame = () => {
    setFreePlayResumeGameKey(activeGameKey)
    setPhase('grow-game')
  }

  const returnToRoom = () => setPhase('room')

  /**
   * Guards NavRail tab switches: leaving the Statling tab while its nested
   * 방 꾸미기 view has unsaved room edits opens a confirm dialog instead of
   * switching immediately (see pendingNavTab render below). Any other
   * switch goes through untouched.
   */
  const handleNavSelect = (tab: NavTab) => {
    if (phase === 'statling' && themeDirty && tab !== 'statling') {
      setPendingNavTab(tab)
      return
    }
    setPhase(tab)
  }

  const handleDiscardThemeEdits = () => {
    if (pendingNavTab) setPhase(pendingNavTab)
    setPendingNavTab(null)
    setThemeDirty(false)
  }

  /**
   * Runs once the full 6-stat test is complete (status -> egg transition).
   * Already confirmed (replaying after locking in a pet): only refreshes
   * latestFinals, the pet itself never changes. Otherwise (first-ever run, or
   * a redo before ever confirming): picks the top two stats and looks up the
   * one matching character (see lib/pets/pet-flow.ts#beginPetAssignment) —
   * the pet is decided immediately, unconfirmed just means the user hasn't
   * clicked through Reveal yet.
   *
   * Also the QA Skip path's completion function (see handleSkipGames below)
   * — `overrideFinals` lets Skip hand in a freshly-generated mock result
   * without waiting a render cycle for `finals` state to update first, but
   * every other step (character lookup, storage, confirmed-pet growth
   * refresh) is the exact same code a real playthrough goes through.
   */
  const handleMeetStatling = (overrideFinals?: Record<StatId, number>) => {
    const effectiveFinals = overrideFinals ?? finals
    if (overrideFinals) setFinals(overrideFinals)

    const stored = loadStoredPetProfile()
    const next = stored?.confirmed ? refreshGrowthData(stored, effectiveFinals) : beginPetAssignment(effectiveFinals)

    saveStoredPetProfile(next)
    setPetRecord(next)
    setPhase('egg')
  }

  /**
   * Dev/QA only (see SHOW_QA_SKIP) — generates a full 6-stat result instead
   * of playing the mini-games, then hands it to the exact same
   * handleMeetStatling completion path a real playthrough uses. Does not
   * touch statStatus/lastResult/any per-game scoring — those stay whatever
   * they were, since Skip never runs the real games at all.
   *
   * Clears any leftover *unconfirmed* record first: handleMeetStatling
   * normally reuses an existing unconfirmed record's seed (correct for a
   * real user resuming a reveal after a refresh), but for repeated Skip
   * clicks during QA that meant every run kept the same seed — same
   * seed -> same sort key for whichever pet happens to always be in the
   * candidate pool -> the same pet ("천사폭신이") every time. A CONFIRMED
   * record is left untouched (Skip must never reassign an already-locked-in
   * pet, only refresh its growth data — same as real replays).
   */
  const handleSkipGames = (preset: MockStatPreset) => {
    const stored = loadStoredPetProfile()
    if (stored && !stored.confirmed) {
      clearStoredPetProfile()
      setPetRecord(null)
    }
    handleMeetStatling(generateMockFinals(preset))
  }

  /** Dev/QA only — "대표 펫 초기화": wipes the representative-pet record entirely (confirmed or not) so the next Skip/playthrough starts completely fresh. */
  const handleResetPetProfile = () => {
    clearStoredPetProfile()
    setPetRecord(null)
  }

  /** Dev/QA only — "도감 30종 잠금해제": unlocks every one of the 30 characters in the local dex at once, so the full DexScreen grid can be previewed without hatching/sharing 30 times. See lib/pets/dex-storage.ts#markAllPetsMet. */
  const handleUnlockDex = () => {
    markAllPetsMet()
  }

  /**
   * Real user-facing reset (MyPageScreen's "펫 초기화") — unlike the QA-only
   * handleResetPetProfile above, this also wipes care state (hunger/mood/
   * intimacy) and memory (visit/dialogue history) so a freshly-hatched pet
   * doesn't inherit the previous pet's stats. Room decor is left untouched:
   * it reads as "my room," not something owned by one specific pet.
   */
  const resetAllPetData = () => {
    clearStoredPetProfile()
    clearPetCareState()
    clearPetMemory()
    clearIntroProgress()
    setIntroResume(null)
    setPetRecord(null)
    setFinals(emptyFinals())
    setStatlingName('')
    setStatStatus(emptyStatStatusMap())
    setPhase('landing')
  }

  /**
   * Toggling the same folder again turns the tester override back off. If
   * we're not already on the Room screen (e.g. clicked from Landing or
   * mid-game), turning it on also runs the same Skip flow the preset
   * buttons use — otherwise the click would just flip a flag with nothing
   * visibly different, since Room (the only screen that reads
   * testerFolderId) isn't even on screen yet. That flow is exactly what
   * shows the Egg hatching motion en route to Room.
   */
  const handleToggleTesterFolder = (folderId: string) => {
    const turningOn = testerFolderId !== folderId
    setTesterFolderId(turningOn ? folderId : null)
    if (turningOn && phase !== 'room') {
      handleSkipGames('random')
    }
  }

  /** "이 Statling과 함께하기" — locks in whichever pet is currently on screen, then always continues forward. */
  const handleConfirmPet = () => {
    if (petRecord && !petRecord.confirmed) {
      const updated = confirmPet(petRecord)
      saveStoredPetProfile(updated)
      setPetRecord(updated)
      addMetPet(updated.petId) // becoming your representative pet always registers it in the dex — see lib/pets/dex-storage.ts
    }
    setPhase('save')
  }

  const currentBestRaw = statStatus[activeStatId].current?.raw ?? null
  const currentBestScore = statStatus[activeStatId].current?.gameScore ?? null

  // key forces a fresh mount per step so transitions/animations replay
  const stepKey = `${phase}-${activeStatId}-${flowMode}-${activeGameKey}`

  return (
    <main className="min-h-dvh bg-background">
      <div key={stepKey} className="animate-in fade-in slide-in-from-bottom-3 duration-300">
        {phase === 'landing' && (
          <LandingScreen
            onStart={start}
            resumeCount={introResume?.completedGames.length ?? 0}
            onResume={resumeIntro}
            onRestart={() => setConfirmingRestartIntro(true)}
            isReturningLoggedOut={isReturningLoggedOut}
            onGoToLogin={goToLogin}
          />
        )}

        {phase === 'login' && (
          <LoginScreen onAuthenticated={handleLoginAuthenticated} onBack={() => setPhase('landing')} />
        )}

        {SHOW_QA_SKIP && (phase === 'room' || (phase === 'game' && flowMode === 'first')) && (
          <QaSkipMenu
            onSkip={handleSkipGames}
            onReset={handleResetPetProfile}
            onUnlockDex={handleUnlockDex}
            testerFolderId={testerFolderId}
            onToggleTesterFolder={handleToggleTesterFolder}
          />
        )}

        {phase === 'game' &&
          (activeStatId === 'reaction' ? (
            activeGameKey === 'reaction-dodge-run' ? (
              <DodgeObstacleGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onDodgeObstacleComplete} onBack={exitFreePlayGame} />
            ) : (
              <ReactionGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onReactionComplete} onBack={exitFreePlayGame} />
            )
          ) : activeStatId === 'memory' ? (
            activeGameKey === 'memory-story-recall' ? (
              <StoryMemoryGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onStoryMemoryComplete} onBack={exitFreePlayGame} />
            ) : (
              <MemoryGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onMemoryComplete} onBack={exitFreePlayGame} />
            )
          ) : activeStatId === 'focus' ? (
            activeGameKey === 'focus-color-target' ? (
              <ColorTargetGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onColorTargetComplete} onBack={exitFreePlayGame} />
            ) : (
              <FocusGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onFocusComplete} onBack={exitFreePlayGame} />
            )
          ) : activeStatId === 'judgment' ? (
            activeGameKey === 'decision-best-choice' ? (
              <BestChoiceGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onBestChoiceComplete} onBack={exitFreePlayGame} />
            ) : (
              <JudgmentGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onJudgmentComplete} onBack={exitFreePlayGame} />
            )
          ) : activeStatId === 'spatial' ? (
            activeGameKey === 'spatial-fit-puzzle' ? (
              <FitPuzzleGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onFitPuzzleComplete} onBack={exitFreePlayGame} />
            ) : (
              <SpatialGame
                index={index}
                mode={flowMode}
                difficulty={activeDifficulty}
                onComplete={onSpatialComplete}
                onBack={exitFreePlayGame}
                avoidShapeIds={spatialFirstAttemptShapeIdsRef.current ?? undefined}
              />
            )
          ) : activeGameKey === 'reasoning-number-pattern' ? (
            <NumberPatternGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onNumberPatternComplete} onBack={exitFreePlayGame} />
          ) : (
            <ReasoningGame index={index} mode={flowMode} difficulty={activeDifficulty} onComplete={onReasoningComplete} onBack={exitFreePlayGame} />
          ))}

        {phase === 'complete' && lastResult && (
          <CompleteScreen
            statId={activeStatId}
            index={index}
            gameScore={lastResult.gameScore}
            raw={lastResult.raw}
            finals={finals}
            personalBestScore={currentBestScore}
            isNewRecord={lastResult.isPersonalBest}
            canRetry={retryAvailable}
            onRetry={handleRetryCurrentGame}
            onNext={goNextFirst}
            onMeetStatling={() => {
              // The run is fully done — nothing left to resume. Only reached
              // from the last (6th) result screen (see CompleteScreen's
              // isLast branch), which is this flow's final result page now
              // that MY STATUS no longer appears in it.
              clearIntroProgress()
              handleMeetStatling()
            }}
            onReplay={() => setConfirmingReplayIntro(true)}
          />
        )}

        {phase === 'freeplay-complete' && lastResult && (
          <FreePlayResultScreen
            statId={activeStatId}
            raw={lastResult.raw}
            personalBestRaw={currentBestRaw}
            isNewRecord={lastResult.isPersonalBest}
            isRecommended={activeStatId === recommendedStat}
            xpEarned={Math.max(0, Math.round(lastResult.gameScore))}
            onReturnToRoom={returnToRoom}
          />
        )}

        {phase === 'egg' && (
          <EggScreen
            petProfile={displayedPetProfile ? applyTesterOverride(displayedPetProfile) : null}
            onHatched={() => setPhase('reveal')}
          />
        )}

        {phase === 'reveal' && petRecord && displayedPetProfile && (
          <RevealScreen
            petProfile={applyTesterOverride(displayedPetProfile)}
            topStat={topStat}
            secondaryStat={secondaryStat}
            finals={finals}
            isConfirmed={petRecord.confirmed}
            onConfirm={handleConfirmPet}
          />
        )}

        {phase === 'save' && (
          <SaveScreen onContinue={() => setPhase('naming')} onSkip={() => setPhase('naming')} />
        )}

        {phase === 'naming' && displayedPetProfile && (
          <NamingScreen
            petProfile={applyTesterOverride(displayedPetProfile)}
            onConfirm={(name) => {
              setStatlingName(name)
              if (petRecord) saveStoredPetProfile({ ...petRecord, statlingName: name })
              setPhase('room')
            }}
          />
        )}

        {phase === 'room' && (
          <RoomScreen
            statlingName={statlingName}
            topStat={topStat}
            secondaryStat={secondaryStat}
            petProfile={displayedPetProfile}
            onGrow={() => setPhase('grow')}
            onOpenMission={() => setPhase('mission')}
            testerFolder={activeTesterFolder}
          />
        )}

        {phase === 'mission' && <MissionScreen onBack={returnToRoom} statlingName={statlingName} userId={user?.id ?? null} />}

        {phase === 'mystats' &&
          (() => {
            // Computed inline (not memoized) — this only runs while the
            // mystats tab is actually mounted, and reading+averaging a
            // ~30-record object is cheap. Always re-reads localStorage on
            // remount (stepKey includes `phase`), so revisiting the tab
            // after playing more games shows the latest data without a
            // full page reload.
            const skill = loadPlayerSkillState()
            const initialStats = petRecord?.initialFinals ?? finals
            const currentStats = computeCurrentStats(skill, initialStats)
            return (
              <StatusScreen
                context="my-stats"
                values={currentStats}
                initialStats={initialStats}
                gameBestRecords={getAllRepresentativeRecords(skill)}
              />
            )
          })()}

        {phase === 'ranking' && <RankingScreen statlingName={statlingName} />}

        {phase === 'mypage' && (
          <MyPageScreen
            statlingName={statlingName}
            topStat={topStat}
            petProfile={displayedPetProfile}
            onResetPet={resetAllPetData}
            onShowOnboarding={() => setShowOnboarding(true)}
          />
        )}

        {phase === 'statling' && (
          <StatlingScreen
            statlingName={statlingName}
            topStat={topStat}
            petProfile={displayedPetProfile}
            onDirtyChange={setThemeDirty}
          />
        )}

        {phase === 'grow' && (
          <GrowScreen
            statStatus={statStatus}
            recommendedStat={recommendedStat}
            onSelect={selectFreePlayGame}
            onBack={returnToRoom}
          />
        )}

        {phase === 'grow-game' && (
          <GrowGameScreen
            statId={activeStatId}
            onSelect={confirmFreePlayGame}
            onBack={() => setPhase('grow')}
            initialGameKey={freePlayResumeGameKey ?? undefined}
          />
        )}
      </div>

      {NAV_PHASES.includes(phase) && <NavRail active={phase as NavTab} onSelect={handleNavSelect} />}

      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      <ConfirmDialog
        open={pendingNavTab !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavTab(null)
        }}
        title="저장하지 않은 변경사항이 있어요."
        description={'지금 나가면 방 편집 내용이 사라져요.\n계속 편집할까요, 변경사항을 버릴까요?'}
        confirmLabel="변경사항 버리기"
        cancelLabel="계속 편집"
        onConfirm={handleDiscardThemeEdits}
      />

      <ConfirmDialog
        open={confirmingRestartIntro}
        onOpenChange={setConfirmingRestartIntro}
        title="처음부터 다시 시작할까요?"
        description={'지금까지 완료한 진단 기록이 초기화돼요.\n펫 정보 등 다른 데이터는 유지돼요.'}
        confirmLabel="처음부터 다시 하기"
        cancelLabel="계속 이어하기"
        onConfirm={restartIntro}
      />

      <ConfirmDialog
        open={confirmingReplayIntro}
        onOpenChange={setConfirmingReplayIntro}
        title="다시 하시겠어요?"
        description="현재 진행 상황이 초기화됩니다."
        confirmLabel="다시 하기"
        cancelLabel="취소"
        onConfirm={start}
      />

      {/* Shown once per Initial Assessment run, the first time any stat's
          "다시 도전하기" is clicked — see hasSeenRetryNotice/
          confirmRetryNotice. Canceling here leaves retryAvailable untouched,
          so the player can click "다시 도전하기" again with no penalty. */}
      <ConfirmDialog
        open={confirmingRetryNotice}
        onOpenChange={setConfirmingRetryNotice}
        title="재도전 안내"
        description="재도전 시 이번 결과가 최종 기록으로 반영돼요."
        confirmLabel="재도전하기"
        cancelLabel="취소"
        onConfirm={confirmRetryNotice}
      />
    </main>
  )
}
