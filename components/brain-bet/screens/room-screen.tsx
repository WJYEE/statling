'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Crosshair, Sparkles } from 'lucide-react'
import { Toast } from '@base-ui/react/toast'
import { trackEvent } from '@/lib/analytics/ga'
import { trackProductEvent } from '@/lib/analytics/analytics'
import { CareActionButton } from '@/components/brain-bet/care-action-button'
import { GiftQaMenu } from '@/components/brain-bet/gift-qa-menu'
import { GiftRewardPopup } from '@/components/brain-bet/gift-reward-popup'
import { PetCareHud } from '@/components/brain-bet/pet-care-hud'
import { PetMoodView } from '@/components/brain-bet/pet-mood-view'
import { RoomCanvas } from '@/components/brain-bet/room-canvas'
import { RoomCleanOverlay } from '@/components/brain-bet/room-clean-overlay'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { TalkQuestionCard } from '@/components/brain-bet/talk-question-card'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { usePetCare } from '@/hooks/use-pet-care'
import { usePetMemory } from '@/hooks/use-pet-memory'
import { usePetInitiatedDialogue } from '@/hooks/use-pet-initiated-dialogue'
import { usePetAutonomy } from '@/hooks/use-pet-autonomy'
import { usePetTalk } from '@/hooks/use-pet-talk'
import { useSound } from '@/hooks/use-sound'
import { STATS, type StatId } from '@/lib/brain-bet'
import type { CharacterStateFolder, CharacterStateKey } from '@/lib/character-state-assets'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { CARE_ACTIONS } from '@/lib/room'
import { ROOM_ASSETS } from '@/lib/room-assets'
import { loadSavedRoomState } from '@/lib/room/room-storage'
import { MOOD_LABEL, SECONDARY_TAG_LABEL } from '@/lib/pet-care/mood'
import { isConsistentPlayer, shouldShowCareMemory, shouldShowGameNameMemory } from '@/lib/pet-care/pet-memory'
import { computeInteractionMode } from '@/lib/pet-care/interaction-mode'
import { pickCareMemoryText, pickGameNameMemoryText, pickMemoryReferenceLine } from '@/lib/pet-care/initiated-dialogue'
import { loadDialogueMemory } from '@/lib/pet-care/dialogue-memory-storage'
import { computeRelationshipStage } from '@/lib/pet-care/relationship-stage'
import { daysSince } from '@/lib/pet-care/visit-context'
import type { PetAnimation } from '@/lib/pet-care/types'
import { RECONNECT_ANGRY_HOLD_MS } from '@/lib/config/character-state.config'
import { PET_AUTONOMY_CONFIG } from '@/lib/config/pet-autonomy.config'
import { TALK_EXPRESSION_HOLD_MS, TALK_OPENING_MEMORY_CHANCE } from '@/lib/config/talk.config'
import { formatLevelLabel } from '@/lib/pet-care/leveling'
import { LEVEL_GIFT_LEVELS, type SupportedDecoAsset } from '@/lib/deco-supported-assets'

/**
 * Dev/QA "force a level gift open" control (GiftQaMenu) — same gating
 * convention as game-flow.tsx's SHOW_QA_SKIP (reused here as its own local
 * const, matching how statling-screen.tsx/theme-screen.tsx each keep their
 * own beta-notice flag independent rather than sharing one import). Visible
 * in local dev by default, or in any build where NEXT_PUBLIC_ENABLE_TEST_SKIP
 * is explicitly turned on; never shown in a normal production build.
 */
const SHOW_GIFT_QA = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_TEST_SKIP === 'true'

/** The gift-pending speech bubble's fixed text — shown for as long as `isGiftReady` stays true (see `speech` below), distinct from the bottom "Statling을 눌러 선물을 받아보세요!" banner (that one explains WHAT to do; this one is just the Statling "talking"). */
const GIFT_READY_SPEECH = '선물이야!'

/**
 * The Room canvas is `aspect-square w-full` (see the wrapper below) — its
 * size is driven purely by available WIDTH, with no ceiling tied to
 * viewport HEIGHT. On any viewport at/above the `sm` breakpoint the canvas
 * is only capped by this page's own `max-w-3xl` container (effectively
 * ~728px square), completely independent of how tall the viewport actually
 * is. On a short-but-wide viewport (a laptop window sized to ~1280x720, for
 * example) that 728px-tall square — and the Statling positioned within it
 * at STATLING_Z_INDEX (lib/room/room-layout.ts), which outranks NavRail's
 * z-20 — ends up geometrically overlapping the fixed bottom NavRail,
 * visually covering its tabs and intercepting their clicks.
 *
 * This reserves room BELOW the canvas for NavRail's own rendered height
 * (~86.5px empirically, kept generous here for cross-locale/font-metric
 * safety) plus a safe gap, and the canvas's own top offset within this
 * screen (header + mood line + margins, ~108px empirically stable across
 * every width at/above `sm`) — so this budget, applied as BOTH `max-width`
 * AND `max-height` on the canvas below, keeps its bottom edge above
 * NavRail on every viewport, not just the ones spot-checked in QA.
 *
 * Both properties matter, not just max-height: the canvas's width comes
 * from an explicit `w-full` (100% of its container), and `aspect-ratio`
 * only derives a size from an AUTO dimension — with width already
 * definite, a max-height alone just squashes the box into a short
 * rectangle (confirmed empirically: 728x580, no longer square) rather than
 * shrinking width to match, which would let its `object-cover` background
 * crop exactly the "잘리거나 왜곡되지 않는 정사각형" the aspect-square choice
 * further down was meant to guarantee. Capping width to the same budget
 * keeps both dimensions tied to whichever is smaller — the container's own
 * width cap (`max-w-70` on mobile, `max-w-none` from `sm` up, unchanged)
 * or this viewport-height-derived one — so the canvas only ever shrinks as
 * a true square, on viewports short enough to actually need it.
 */
const ROOM_CANVAS_MAX_DIMENSION = 'calc(100dvh - 220px)'

interface RoomScreenProps {
  statlingName: string
  /** Initial Assessment's TOP 1 stat (see game-flow.tsx's `topStat` — frozen at pet assignment via petRecord.topStat, never recomputed from live/Free-Play-shifted `finals`). */
  topStat: StatId
  /** Initial Assessment's TOP 2 stat (game-flow.tsx's `secondaryStat` — same frozen-at-assignment source, petRecord.secondStat). Shown alongside topStat, TOP1 → TOP2 order, never recomputed either. */
  secondaryStat: StatId
  /**
   * The confirmed representative pet — same resolver (and same value) as
   * every other post-hatch screen (see lib/pets/pet-flow.ts
   * #resolveCurrentPetProfile), passed down from GameFlow's single
   * petRecord source of truth rather than read from storage here. Null only
   * when there's genuinely no saved pet data (e.g. legacy/no-data games
   * flow) — falls back to the original stat-type CharacterImage in that
   * case only, never for a confirmed pet.
   */
  petProfile: PetProfile | null
  onGrow: () => void
  onOpenMission: () => void
  /** Dev/QA only — see qa-skip-menu.tsx and pet-mood-view.tsx. */
  testerFolder?: CharacterStateFolder | null
}

/**
 * Statling Room (Home) — pet care stats, mood/motion, the 6 care actions,
 * and the "living companion" layer on top: autonomous idle behavior,
 * pet-initiated greetings/requests, visit memory, and minigame reactions.
 *
 * The hooks below are called in a deliberate priority order — care ->
 * memory -> talk -> initiatedDialogue -> autonomy — so each only ever needs
 * the *already-computed* output of a higher-priority hook to decide whether
 * it may start something new (`suppressed`). `talk` sits ahead of
 * initiatedDialogue/autonomy specifically so `talk.isActive` (and
 * `isGiftReady`, computed right alongside it) can suppress both of them for
 * as long as a question or a pending Level Gift is open (see
 * suppressForDialogue below) — otherwise an autonomous line/motion could
 * fire mid-question or mid-gift and make that bubble appear to change or
 * vanish. This avoids any circular "mode feeds back into the hooks that
 * produced it" dependency; `mode` itself (computed last, from everyone's
 * output) is a pure display-only value.
 *
 * Two more mechanisms sit on top of that ordering, both added to close a
 * "random dialogue flashes back on screen and immediately disappears" bug:
 * (1) a `useEffect` right after `autonomy` is declared actively dismisses
 * (state AND pending timer both) any lower-priority speech hook that's
 * currently masked by a higher-priority one, so a masked hook's own
 * auto-hide timer can never resurface it once whatever was covering it
 * clears; (2) `inEventTail` extends `suppressForDialogue`/
 * `suppressForAutonomy` for a short beat (PET_AUTONOMY_CONFIG.
 * postActionDialoguePauseMs/significantEventTailMs) after a care-action
 * reply / minigame reaction / level-up / gift-claim actually finishes, so
 * autonomous motion and random dialogue never pick up again the instant
 * something else stops rather than a moment later.
 */
export function RoomScreen({ statlingName, topStat, secondaryStat, petProfile, onGrow, onOpenMission, testerFolder }: RoomScreenProps) {
  const care = usePetCare()
  const toastManager = Toast.useToastManager()
  const { play, playCharacterVoice } = useSound()

  const memory = usePetMemory(care.applyEffect)

  // Computed here (ahead of talk/initiatedDialogue/autonomy below) for the
  // same reason talk.isActive is — see suppressForDialogue's comment — a
  // pending gift needs to suppress autonomous motion/dialogue too, so the
  // gift PNG/bubble stay put until the Statling is actually tapped.
  const isGiftReady = care.petState.giftReadyLevel !== null

  // The reward just granted by tapping the Statling (see handleClaimGift),
  // waiting on the popup's 확인 button — see GiftRewardPopup's doc comment
  // for why granting (care.claimGift) and ending the gift state
  // (care.dismissGiftClaim) are two separate steps instead of one.
  const [rewardPopup, setRewardPopup] = useState<SupportedDecoAsset | null>(null)

  // A picked 대화 answer's own expression (happy/thinking/embarrassed/love/
  // tired/...), held for TALK_EXPRESSION_HOLD_MS regardless of what mood/
  // animation would otherwise show — see character-state-assets.ts's
  // `forcedStateKey`. A plain useRef (not the `schedule` pattern usePetCare
  // uses internally) since this is the only timeout room-screen.tsx itself owns.
  // Declared here (ahead of initiatedDialogue/autonomy below) only because
  // handleTalkAnswered/usePetTalk need it and usePetTalk itself must be
  // declared early enough for `talk.isActive` to gate those two hooks'
  // `suppressed` props — see suppressForDialogue's comment below.
  const [talkExpressionKey, setTalkExpressionKey] = useState<CharacterStateKey | null>(null)
  const talkExpressionTimeoutRef = useRef<number | null>(null)

  function handleTalkAnswered(responseText: string, expression?: CharacterStateKey) {
    care.answerTalk(responseText)
    // Deferred past this tick's paint — recordCareAction's savePetMemory
    // write has no bearing on what the Statling shows right now (care.answerTalk
    // above already triggered that synchronously), see handleCareAction's
    // identical deferral below for the same reasoning.
    window.setTimeout(() => memory.recordCareAction('talk'), 0)
    if (talkExpressionTimeoutRef.current !== null) window.clearTimeout(talkExpressionTimeoutRef.current)
    if (expression) {
      setTalkExpressionKey(expression)
      talkExpressionTimeoutRef.current = window.setTimeout(() => setTalkExpressionKey(null), TALK_EXPRESSION_HOLD_MS)
    } else {
      setTalkExpressionKey(null)
    }
  }

  /**
   * A mid-chain follow-up step's reaction (see hooks/use-pet-talk.ts's
   * `next`) — same speech-bubble/expression handling as handleTalkAnswered,
   * but via care.sayText (no cooldown/exp effect) since the conversation
   * isn't actually over yet, and no care/memory action is recorded either.
   */
  function handleTalkIntermediate(responseText: string, expression?: CharacterStateKey) {
    care.sayText(responseText, TALK_EXPRESSION_HOLD_MS)
    if (talkExpressionTimeoutRef.current !== null) window.clearTimeout(talkExpressionTimeoutRef.current)
    if (expression) {
      setTalkExpressionKey(expression)
      talkExpressionTimeoutRef.current = window.setTimeout(() => setTalkExpressionKey(null), TALK_EXPRESSION_HOLD_MS)
    } else {
      setTalkExpressionKey(null)
    }
  }

  useEffect(
    () => () => {
      if (talkExpressionTimeoutRef.current !== null) window.clearTimeout(talkExpressionTimeoutRef.current)
    },
    [],
  )

  /**
   * Only registers the over-talk streak now — no longer also speaks the
   * question text via care.sayText (that used showSpeech's default 2.4s
   * auto-hide timer, so a player who hadn't answered yet within that window
   * saw the question vanish, sometimes replaced by an unrelated autonomous
   * line once care.speech cleared). The question's text is now read
   * directly from `talk.activeQuestion` at render time instead (see
   * `speech` below), so it has no timer and can't be preempted — it only
   * ever goes away via chooseAnswer/submitFreeText/cancelQuestion.
   */
  const talk = usePetTalk({
    onOpen: () => care.registerTalkOpen(),
    onAnswered: handleTalkAnswered,
    onIntermediateReaction: handleTalkIntermediate,
    topStat,
  })

  /**
   * A brief hush after something that just spoke/reacted actually finishes —
   * layered on top of the instant `suppressed` flags below (levelUp/
   * reactionActive/gameReaction.active/talk.isActive/isGiftReady), which
   * only cover the moment itself. Two durations: a short one
   * (postActionDialoguePauseMs) right after an ordinary care-action reply
   * (feed/wash/play/pet/talk-answer) clears, and a longer one
   * (significantEventTailMs) after a minigame reaction, a level-up, or
   * claiming a Level Gift ends — see PET_AUTONOMY_CONFIG's doc comments.
   * `startEventTail` is called from the effects below (on each source's own
   * active->inactive transition) and from handleRewardPopupConfirm further
   * down; whichever fires last simply re-arms the single shared timer with
   * its own duration.
   */
  const [inEventTail, setInEventTail] = useState(false)
  const eventTailTimeoutRef = useRef<number | null>(null)
  const prevCareSpeechRef = useRef(care.speech)
  const prevGameReactionActiveRef = useRef(memory.gameReaction.active)
  const prevLevelUpActiveRef = useRef(!!care.levelUpEvent)

  function startEventTail(ms: number) {
    if (eventTailTimeoutRef.current !== null) window.clearTimeout(eventTailTimeoutRef.current)
    setInEventTail(true)
    eventTailTimeoutRef.current = window.setTimeout(() => setInEventTail(false), ms)
  }

  useEffect(() => {
    const had = prevCareSpeechRef.current
    prevCareSpeechRef.current = care.speech
    if (had && !care.speech) startEventTail(PET_AUTONOMY_CONFIG.postActionDialoguePauseMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacting to care.speech's own null transition
  }, [care.speech])

  useEffect(() => {
    const wasActive = prevGameReactionActiveRef.current
    prevGameReactionActiveRef.current = memory.gameReaction.active
    if (wasActive && !memory.gameReaction.active) startEventTail(PET_AUTONOMY_CONFIG.significantEventTailMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacting to the active flag's own transition
  }, [memory.gameReaction.active])

  useEffect(() => {
    const wasActive = prevLevelUpActiveRef.current
    const isActive = !!care.levelUpEvent
    prevLevelUpActiveRef.current = isActive
    if (wasActive && !isActive) startEventTail(PET_AUTONOMY_CONFIG.significantEventTailMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacting to levelUpEvent's own transition
  }, [care.levelUpEvent])

  useEffect(
    () => () => {
      if (eventTailTimeoutRef.current !== null) window.clearTimeout(eventTailTimeoutRef.current)
    },
    [],
  )

  /**
   * `talk.isActive` and `isGiftReady` are both included here (and,
   * transitively, in suppressForAutonomy below) so an open question or a
   * pending gift can never be preempted by an autonomous "말 걸기" line or
   * motion — those used to be able to fire while either waited on the
   * player, which is exactly what let their bubble appear to "change to
   * something else" underneath them. `inEventTail` adds the settle beat
   * described above on top of that.
   */
  const suppressForDialogue =
    !!care.levelUpEvent || care.reactionActive || memory.gameReaction.active || talk.isActive || isGiftReady || inEventTail
  const initiatedDialogue = usePetInitiatedDialogue({
    memory: memory.memory,
    visitContext: memory.visitContext,
    hasPendingGameReaction: memory.hasPendingGameReaction,
    intimacyLevel: care.petState.intimacyLevel,
    stats: care.petState.stats,
    secondaryTags: care.secondaryTags,
    suppressed: suppressForDialogue,
    onDialogueShown: memory.onInitiatedDialogueShown,
    onMemoryCommentShown: memory.onMemoryCommentShown,
  })

  // Sleepy also suppresses autonomy — without this, a lookLeft/hop/walk/ask*
  // tick could briefly interrupt the sleep pose with its own gesture (and,
  // via the tester's mood-fallback art, show 'tired' instead of 'sleep' mid-
  // nap). A real care action still works normally regardless (it's driven by
  // `care.reactionActive`, a separate higher-priority branch in `animation`
  // below) — only *autonomous* fidgeting is paused while sleepy.
  const suppressForAutonomy = suppressForDialogue || initiatedDialogue.active || care.mood === 'sleepy'
  const autonomy = usePetAutonomy({
    stats: care.petState.stats,
    lastUserActionAt: care.lastUserActionAt,
    suppressed: suppressForAutonomy,
    onRequestDialogue: initiatedDialogue.trigger,
    onBonus: memory.onAutonomyBonus,
  })

  /**
   * The moment a higher-priority speech source starts (talk question /
   * gift-ready / minigame reaction / care-action reply), immediately clear
   * any lower-priority speech merely hidden behind it — not just its
   * displayed text but that hook's own pending auto-hide timer too (via
   * each hook's dismiss/dismissSpeech/dismissGameReaction). Without this, a
   * masked bubble's timer keeps running out of sight and can pop back into
   * view for a sliver of its remaining hold the instant whatever was
   * covering it clears, then vanish again a moment later — this is what
   * made a random line occasionally look like it "appeared and immediately
   * disappeared".
   */
  useEffect(() => {
    if (talk.activeQuestion || isGiftReady) {
      if (memory.gameReaction.speech) memory.dismissGameReaction()
      if (care.speech) care.dismissSpeech()
      if (initiatedDialogue.speech) initiatedDialogue.dismiss()
      return
    }
    if (memory.gameReaction.speech) {
      if (care.speech) care.dismissSpeech()
      if (initiatedDialogue.speech) initiatedDialogue.dismiss()
      return
    }
    if (care.speech && initiatedDialogue.speech) initiatedDialogue.dismiss()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss fns close over each hook's own stable setState; only the signal values below should retrigger this
  }, [talk.activeQuestion, isGiftReady, memory.gameReaction.speech, care.speech, initiatedDialogue.speech])

  // Loaded once per mount — GameFlow remounts this screen (via stepKey) on
  // every phase switch, so returning from 테마 after a save always reflects
  // the latest persisted room without needing a separate refresh signal.
  const [roomState] = useState(() => loadSavedRoomState())
  const backgroundAsset = ROOM_ASSETS[roomState.backgroundId] ?? ROOM_ASSETS['wood-background']

  // Brief "화났어요" flash right after entering following a long absence
  // (memory.visitContext.isLongAbsence, frozen at mount) — a momentary
  // flourish, not a lingering mood; the normal longAbsence welcome dialogue
  // (usePetInitiatedDialogue) plays independently of this.
  const [isReconnectGreeting, setIsReconnectGreeting] = useState(memory.visitContext.isLongAbsence)
  useEffect(() => {
    if (!isReconnectGreeting) return
    const id = window.setTimeout(() => setIsReconnectGreeting(false), RECONNECT_ANGRY_HOLD_MS)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once for this mount's initial value only
  }, [])

  const isConsistentPlayerNow = isConsistentPlayer(memory.memory)

  // "들어왔을 때" — one occasional chirp on entering the Room, not on every
  // care-action press (see hooks/use-pet-care.ts's showSpeech doc comment
  // for why those stopped playing a sound on every message).
  useEffect(() => {
    playCharacterVoice(petProfile?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount only
  }, [])

  useEffect(() => {
    if (!care.levelUpEvent) return
    toastManager.add({ title: `${formatLevelLabel(care.levelUpEvent.level)} 달성!`, type: 'success' })
    care.levelUpEvent.unlocks.forEach((reward) => {
      toastManager.add({ title: reward.title, description: reward.description, type: 'success' })
    })
    playCharacterVoice(petProfile?.id)
    trackEvent('level_up', { previous_level: care.levelUpEvent.previousLevel, new_level: care.levelUpEvent.level })
    trackProductEvent('level_up', { level: care.levelUpEvent.level })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when a new levelUpEvent object appears
  }, [care.levelUpEvent])

  const mode = computeInteractionMode({
    hasLevelUp: !!care.levelUpEvent,
    hasGameReaction: memory.gameReaction.active,
    hasUserAction: care.reactionActive,
    hasSpeaking: initiatedDialogue.active || talk.isActive || isGiftReady,
    hasAutonomousMotion: autonomy.active,
  })

  /**
   * An open talk question wins unconditionally first, then a pending gift's
   * fixed GIFT_READY_SPEECH — neither has an auto-hide timer of its own (see
   * usePetTalk's onOpen above and hooks/use-pet-care.ts#claimGift), so once
   * either is showing it can only ever be replaced by the player actually
   * resolving it: choosing an answer / backing out of the question, or
   * tapping the Statling to claim the gift (which grants the reward but
   * deliberately leaves giftReadyLevel — and therefore isGiftReady/this
   * bubble — set until the reward popup's 확인 button fires
   * dismissGiftClaim). Everything below that (gameReaction/care/autonomous
   * speech) is free to come and go normally the rest of the time.
   */
  const speech = talk.activeQuestion?.text ?? (isGiftReady ? GIFT_READY_SPEECH : null) ?? memory.gameReaction.speech ?? care.speech ?? initiatedDialogue.speech ?? null
  const dismissSpeech =
    talk.activeQuestion || isGiftReady
      ? undefined // neither is dismissible by tapping the bubble itself — a question closes only via TalkQuestionCard's own close button, a gift only via actually claiming it
      : memory.gameReaction.active
        ? memory.dismissGameReaction
        : care.speech
          ? care.dismissSpeech
          : initiatedDialogue.speech
            ? initiatedDialogue.dismiss
            : undefined

  /**
   * A React key for the speech bubble that changes on every new *instance*
   * of a message, even across different sources that happen to render
   * identical text (see hooks/use-pet-care.ts's/use-pet-initiated-dialogue.ts's
   * `speechId` and use-pet-memory.ts's `gameReactionId`) — `key={speech}`
   * used to key off the displayed string itself, which meant two different
   * lines with the same text never remounted/replayed the pop-in animation
   * into each other.
   */
  const speechKey = talk.activeQuestion
    ? `talk-${talk.activeQuestion.id}`
    : isGiftReady
      ? 'gift'
      : memory.gameReaction.active
        ? `game-${memory.gameReactionId}`
        : care.speech
          ? `care-${care.speechId}`
          : initiatedDialogue.speech
            ? `dialogue-${initiatedDialogue.speechId}`
            : 'none'

  const animation: PetAnimation =
    memory.gameReaction.active && memory.gameReaction.animation
      ? memory.gameReaction.animation
      : care.reactionActive
        ? care.animation
        : autonomy.active && autonomy.animation
          ? autonomy.animation
          : care.animation

  const secondaryLabel = care.secondaryTags[0] ? SECONDARY_TAG_LABEL[care.secondaryTags[0]] : null

  /**
   * Phase 3D-3 (spec §15) — occasionally opens 대화 with a short memory
   * callback instead of jumping straight to the selectable question, so a
   * Talk session itself can feel like it remembers something too, not just
   * the ambient/entry-greeting channel. Tries answer memory first (the
   * "remembers what we talked about" flavor fits a conversation opener best),
   * then falls back to care/game behavioral memory — sharing the exact same
   * eligibility gates (shouldShowCareMemory/shouldShowGameNameMemory) and
   * `lastMemoryCommentDate` daily budget the ambient loop uses, so a memory
   * spent here is one the ambient loop won't also spend later that day (spec
   * §12). Returns null (the common case) whenever nothing is actually
   * eligible — openQuestion() then behaves exactly as it always has.
   */
  function pickTalkOpeningMemoryLine(): { id: string; text: string; isBehavioral: boolean } | null {
    const referenceLine = pickMemoryReferenceLine(loadDialogueMemory())
    if (referenceLine) return { ...referenceLine, isBehavioral: false }

    const now = new Date()
    const gameId = shouldShowGameNameMemory(memory.memory, now)
    if (gameId) {
      const line = pickGameNameMemoryText(gameId, care.petState.intimacyLevel, memory.memory.recentInitiatedDialogueIds)
      return { ...line, isBehavioral: true }
    }

    const careAction = shouldShowCareMemory(memory.memory, now)
    if (careAction) {
      const stage = computeRelationshipStage(care.petState.intimacyLevel, daysSince(memory.memory.firstMetAt, now))
      const line = pickCareMemoryText(careAction, stage, care.petState.intimacyLevel, memory.memory.recentInitiatedDialogueIds)
      return { ...line, isBehavioral: true }
    }

    return null
  }

  function handleCareAction(actionId: (typeof CARE_ACTIONS)[number]['id']) {
    // Fired at button-press for every action, including 'talk' — matches
    // the other 5 actions' "실행" (executed) semantics. 'talk' specifically
    // fires when the question opens, not when it's answered (that resolution
    // has no separate event in the tracking plan); see handleTalkAnswered
    // above for where the actual stat/cooldown/exp effect lands afterward.
    trackEvent('pet_action', { action_type: actionId })
    // 대화 no longer performs an action directly — it opens a question
    // (see hooks/use-pet-talk.ts); the actual stats/cooldown/exp effect only
    // applies once the player answers (handleTalkAnswered above).
    if (actionId === 'talk') {
      const openingLine = Math.random() < TALK_OPENING_MEMORY_CHANCE ? pickTalkOpeningMemoryLine() : null
      if (openingLine) {
        memory.onInitiatedDialogueShown(openingLine.id, 'general')
        if (openingLine.isBehavioral) memory.onMemoryCommentShown()
      }
      talk.openQuestion(openingLine ?? undefined)
      return
    }
    care.performAction(actionId)
    // Deferred past this tick's paint — care.performAction above already
    // synchronously triggered the visual state/animation change; this
    // savePetMemory write is bookkeeping the player never watches happen,
    // and previously sat in front of that visual change blocking the paint
    // (see hooks/use-pet-care.ts's own trackCareInteraction deferral for
    // the same fix, same reasoning).
    window.setTimeout(() => memory.recordCareAction(actionId), 0)
    if (actionId === 'feed') play('pet-feed')
    else if (actionId === 'shower') play('pet-wash')
    else if (actionId === 'play') play('pet-play')
    else if (actionId === 'pet') play('pet-care-pop')
    // No character voice here anymore — a line on every single feed/wash/
    // play/pet press read as too chatty. Voice is reserved for occasional
    // situational moments instead (room entry below, gift claim, level-up)
    // — see lib/audio/character-voice.ts's doc comment.
  }

  /**
   * "선물 주려고 할 때" — the Statling tap that actually grants an unclaimed
   * gift's Statling Decoration to inventory (see care.claimGift/isGiftReady
   * above) and opens the reward popup for it — no toast; Level Gift claims
   * use GiftRewardPopup exclusively (every other toast in the app is
   * untouched). `if (rewardPopup) return` guards against a stray extra tap
   * re-granting/reopening while the popup from the first tap is still up
   * (grantDecoReward is itself idempotent too, so this is defense-in-depth,
   * not the only thing preventing a double-grant).
   */
  function handleClaimGift() {
    if (rewardPopup) return
    const giftLevel = care.petState.giftReadyLevel
    const reward = care.claimGift()
    if (reward) {
      playCharacterVoice(petProfile?.id)
      setRewardPopup(reward)
      if (giftLevel !== null) {
        trackEvent('level_reward_received', { level: giftLevel, reward_type: 'statling_decoration', item_id: reward.id })
      }
    }
  }

  /** GiftRewardPopup's 확인 button — the actual end of the gift state (see PetCareState.giftReadyLevel's doc comment for why this is separate from the grant itself in handleClaimGift above). */
  function handleRewardPopupConfirm() {
    care.dismissGiftClaim()
    setRewardPopup(null)
    startEventTail(PET_AUTONOMY_CONFIG.significantEventTailMs)
  }

  /** Blocks 성장시키기(and therefore every minigame it leads to) while the Statling is asleep — the only entry point into Grow/minigames from Room. */
  function handleGrowClick() {
    if (care.mood === 'sleepy') {
      toastManager.add({ title: 'Statling이 자고 있어요!', description: '잠에서 깨면 다시 시도해주세요.' })
      return
    }
    onGrow()
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-24 pt-4 sm:pb-28 sm:pt-8" data-interaction-mode={mode}>
      {SHOW_GIFT_QA && <GiftQaMenu levels={LEVEL_GIFT_LEVELS} onTrigger={care.debugTriggerGift} />}
      {rewardPopup && <GiftRewardPopup asset={rewardPopup} onConfirm={handleRewardPopupConfirm} />}

      <header className="flex items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-baseline gap-1.5 font-display text-lg font-extrabold text-foreground sm:text-xl">
          <span className="shrink-0 text-xs font-bold text-muted-foreground sm:text-sm">우리 방 ·</span>
          <span className="truncate">{statlingName}</span>
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenMission}
            className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-foreground toy-border toy-shadow-sm transition-transform active:translate-y-0.5"
            aria-label="미션"
          >
            <Crosshair size={18} strokeWidth={2.4} />
          </button>
          {/* Initial Assessment's TOP1 -> TOP2 (see RoomScreenProps' doc
              comments) — a compact icon+name pill each, sized down from the
              single badge this replaces so both fit next to the mission
              button without wrapping on a narrow phone. */}
          <div className="flex items-center gap-1">
            <StatBadge stat={STATS[topStat]} size="xs" />
            <span className="text-[10px] font-bold leading-none text-foreground">{STATS[topStat].name}</span>
          </div>
          <div className="flex items-center gap-1">
            <StatBadge stat={STATS[secondaryStat]} size="xs" />
            <span className="text-[10px] font-bold leading-none text-foreground">{STATS[secondaryStat].name}</span>
          </div>
        </div>
      </header>

      <div className="mt-1 flex items-center gap-2">
        <span className="font-display text-xs font-bold text-foreground sm:text-sm">현재 기분: {MOOD_LABEL[care.mood]}</span>
        {secondaryLabel && <span className="text-[11px] font-semibold text-muted-foreground sm:text-xs">· {secondaryLabel}</span>}
      </div>

      {/* room canvas — the focal point of this screen. Read-only: no drag/resize handles, no selection outlines, just the saved room state.
          Capped narrower on mobile (still centered, still a perfect square so
          the background art is never cropped/distorted) — full edge-to-edge
          at 270px-Statling scale left too little room below it for the HUD
          and care actions to fit without scrolling on a 375px-wide phone.
          toy-border/toy-shadow-lg go on RoomCanvas itself (not this wrapper)
          so its border sits on the exact same element theme-screen.tsx's
          editor uses — otherwise the editor's items are positioned inside a
          bordered box while Home's items are positioned inside an unbordered
          one 1.5px larger, a real (if small) coordinate-basis mismatch
          between "what you placed" and "what you see". */}
      <div className="relative mx-auto mt-3 w-full max-w-70 overflow-hidden rounded-3xl sm:mt-4 sm:max-w-none">
        <RoomCanvas
          backgroundAsset={backgroundAsset}
          items={roomState.items}
          editable={false}
          className="mx-auto toy-border toy-shadow-lg"
          style={{ maxWidth: ROOM_CANVAS_MAX_DIMENSION, maxHeight: ROOM_CANVAS_MAX_DIMENSION }}
          statlingSlot={
            <PetMoodView
              petProfile={petProfile}
              topStat={topStat}
              mood={care.mood}
              animation={animation}
              speech={speech}
              speechKey={speechKey}
              playVariantId={care.petState.lastPlayVariantId}
              offsetSign={autonomy.offsetSign}
              tiltDeg={autonomy.walkTiltDeg}
              facing={autonomy.facing}
              stats={care.petState.stats}
              isOverPetted={care.isOverPetted}
              isOverTalked={care.isOverTalked}
              isShowerAlreadySatisfied={care.isShowerAlreadySatisfied}
              isReconnectGreeting={isReconnectGreeting}
              isGiftReady={isGiftReady}
              isConsistentPlayer={isConsistentPlayerNow}
              forcedStateKey={talkExpressionKey}
              onClaimGift={handleClaimGift}
              onDismissSpeech={dismissSpeech}
              testerFolder={testerFolder}
            />
          }
        />
        <RoomCleanOverlay roomCleanliness={care.roomState.cleanliness} showSparkle={care.animation === 'shake'} />

        {/* Overlaid on the room background itself, right under the Statling
            (STATLING_Z_INDEX is 50 — this sits above it) — not pushed down
            below the care-action row anymore, so answering doesn't require
            scrolling the character out of view. The ONLY talk popup on this
            screen, and it only ever shows the choices/input — the question
            text goes through the character's own speech bubble instead (read
            directly from talk.activeQuestion in `speech` above, so it never
            auto-hides before an answer is picked), and the reply does too
            once answered (handleTalkAnswered -> care.answerTalk), so nothing
            is ever shown twice. */}
        {talk.activeQuestion && (
          <TalkQuestionCard
            question={talk.activeQuestion}
            onChoose={talk.chooseAnswer}
            onSubmitFreeText={talk.submitFreeText}
            onClose={talk.cancelQuestion}
            maxWidth={ROOM_CANVAS_MAX_DIMENSION}
          />
        )}
      </div>

      {/* Moved below the room canvas (was above it, sandwiched between the
          header and mood line, where it collided with the mission
          button/TOP1-TOP2 badges — see the bug report this addresses).
          Anchored to the Room's own content flow, not a viewport-wide fixed
          footer, so it never overlaps the header/mood UI above and never
          covers the Statling/room decor since it sits entirely outside the
          canvas box. One step up from the old text-xs, and font-semibold
          (was font-bold) per the requested "not a title" toning down. Purely
          the instruction — the character's own GIFT_READY_SPEECH bubble
          ("선물이야!") above `speech` is the Statling "talking"; both persist
          for as long as isGiftReady stays true. */}
      {isGiftReady && (
        <p className="mx-auto mt-2 w-fit rounded-full bg-secondary/60 px-3 py-1 text-center text-sm font-semibold text-accent-foreground">
          Statling을 눌러 선물을 받아보세요!
        </p>
      )}

      <PetCareHud
        stats={care.petState.stats}
        intimacyLevel={care.petState.intimacyLevel}
        intimacyExp={care.petState.intimacyExp}
        expToNext={care.expToNext}
        floatingDeltas={care.floatingDeltas}
        daysTogether={daysSince(memory.memory.firstMetAt, new Date())}
      />

      {/* care actions — compact icon buttons, 3x2 on mobile / one row on desktop */}
      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-3 sm:grid-cols-6 sm:gap-2">
        {CARE_ACTIONS.map((action) => (
          <CareActionButton
            key={action.id}
            action={action}
            cooldown={care.cooldowns[action.id]}
            showAttentionDot={care.attentionFlags[action.id]}
            disabled={memory.gameReaction.active || talk.isActive}
            onClick={() => handleCareAction(action.id)}
          />
        ))}
      </div>

      {/* grow CTA — the one action on this screen meant to stand out more than the compact HUD above */}
      <ToyButton className="mx-auto mt-3 w-full max-w-xs px-5 py-2.5 sm:mt-4 sm:py-3" onClick={handleGrowClick}>
        <Sparkles size={18} strokeWidth={2.6} />
        성장시키기
        <ArrowRight size={18} strokeWidth={2.8} />
      </ToyButton>
    </div>
  )
}
