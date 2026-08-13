'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Crosshair, Sparkles } from 'lucide-react'
import { Toast } from '@base-ui/react/toast'
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
import { isConsistentPlayer } from '@/lib/pet-care/pet-memory'
import { computeInteractionMode } from '@/lib/pet-care/interaction-mode'
import type { PetAnimation } from '@/lib/pet-care/types'
import { RECONNECT_ANGRY_HOLD_MS } from '@/lib/config/character-state.config'
import { TALK_EXPRESSION_HOLD_MS } from '@/lib/config/talk.config'
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
  })

  /**
   * `talk.isActive` and `isGiftReady` are both included here (and,
   * transitively, in suppressForAutonomy below) so an open question or a
   * pending gift can never be preempted by an autonomous "말 걸기" line or
   * motion — those used to be able to fire while either waited on the
   * player, which is exactly what let their bubble appear to "change to
   * something else" underneath them.
   */
  const suppressForDialogue = !!care.levelUpEvent || care.reactionActive || memory.gameReaction.active || talk.isActive || isGiftReady
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

  const animation: PetAnimation =
    memory.gameReaction.active && memory.gameReaction.animation
      ? memory.gameReaction.animation
      : care.reactionActive
        ? care.animation
        : autonomy.active && autonomy.animation
          ? autonomy.animation
          : care.animation

  const secondaryLabel = care.secondaryTags[0] ? SECONDARY_TAG_LABEL[care.secondaryTags[0]] : null

  function handleCareAction(actionId: (typeof CARE_ACTIONS)[number]['id']) {
    // 대화 no longer performs an action directly — it opens a question
    // (see hooks/use-pet-talk.ts); the actual stats/cooldown/exp effect only
    // applies once the player answers (handleTalkAnswered above).
    if (actionId === 'talk') {
      talk.openQuestion()
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
    const reward = care.claimGift()
    if (reward) {
      playCharacterVoice(petProfile?.id)
      setRewardPopup(reward)
    }
  }

  /** GiftRewardPopup's 확인 button — the actual end of the gift state (see PetCareState.giftReadyLevel's doc comment for why this is separate from the grant itself in handleClaimGift above). */
  function handleRewardPopupConfirm() {
    care.dismissGiftClaim()
    setRewardPopup(null)
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
          className="toy-border toy-shadow-lg"
          statlingSlot={
            <PetMoodView
              petProfile={petProfile}
              topStat={topStat}
              mood={care.mood}
              animation={animation}
              speech={speech}
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
