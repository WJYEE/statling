'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Crosshair, Sparkles } from 'lucide-react'
import { Toast } from '@base-ui/react/toast'
import { CareActionButton } from '@/components/brain-bet/care-action-button'
import { PetCareHud } from '@/components/brain-bet/pet-care-hud'
import { PetMoodView } from '@/components/brain-bet/pet-mood-view'
import { RoomCanvas } from '@/components/brain-bet/room-canvas'
import { RoomCleanOverlay } from '@/components/brain-bet/room-clean-overlay'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { usePetCare } from '@/hooks/use-pet-care'
import { usePetMemory } from '@/hooks/use-pet-memory'
import { usePetInitiatedDialogue } from '@/hooks/use-pet-initiated-dialogue'
import { usePetAutonomy } from '@/hooks/use-pet-autonomy'
import { useSound } from '@/hooks/use-sound'
import { STATS, type StatId } from '@/lib/brain-bet'
import type { CharacterStateFolder } from '@/lib/character-state-assets'
import type { PetProfile } from '@/lib/pets/pet-profile'
import { CARE_ACTIONS } from '@/lib/room'
import { ROOM_ASSETS } from '@/lib/room-assets'
import { loadSavedRoomState } from '@/lib/room/room-storage'
import { MOOD_LABEL, SECONDARY_TAG_LABEL } from '@/lib/pet-care/mood'
import { isConsistentPlayer } from '@/lib/pet-care/pet-memory'
import { computeInteractionMode } from '@/lib/pet-care/interaction-mode'
import type { PetAnimation } from '@/lib/pet-care/types'
import { RECONNECT_ANGRY_HOLD_MS } from '@/lib/config/character-state.config'

interface RoomScreenProps {
  statlingName: string
  topStat: StatId
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
 * The 4 hooks below are called in a deliberate priority order — care ->
 * memory -> initiatedDialogue -> autonomy — so each only ever needs the
 * *already-computed* output of a higher-priority hook to decide whether it
 * may start something new (`suppressed`). This avoids any circular "mode
 * feeds back into the hooks that produced it" dependency; `mode` itself
 * (computed last, from everyone's output) is a pure display-only value.
 */
export function RoomScreen({ statlingName, topStat, petProfile, onGrow, onOpenMission, testerFolder }: RoomScreenProps) {
  const care = usePetCare()
  const toastManager = Toast.useToastManager()
  const { play, playCharacterVoice } = useSound()

  const memory = usePetMemory(care.applyEffect)

  const suppressForDialogue = !!care.levelUpEvent || care.reactionActive || memory.gameReaction.active
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

  const isGiftReady = care.petState.giftReadyLevel !== null
  const isConsistentPlayerNow = isConsistentPlayer(memory.memory)

  useEffect(() => {
    if (!care.levelUpEvent) return
    toastManager.add({ title: `Lv.${care.levelUpEvent.level} 달성!`, type: 'success' })
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
    hasSpeaking: initiatedDialogue.active,
    hasAutonomousMotion: autonomy.active,
  })

  const speech = memory.gameReaction.speech ?? care.speech ?? initiatedDialogue.speech ?? null
  const dismissSpeech = memory.gameReaction.active
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
    care.performAction(actionId)
    memory.recordCareAction(actionId)
    if (actionId === 'feed') play('pet-feed')
    else if (actionId === 'shower') play('pet-wash')
    else if (actionId === 'play') play('pet-play')
    else if (actionId === 'pet') play('pet-care-pop')
    // Character voice layers on top of the SFX above for every care action,
    // 'talk' included — see lib/audio/character-voice.ts for how petId
    // resolves to a clip, and its own doc comment for how to wire in more
    // interactions later.
    playCharacterVoice(petProfile?.id)
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
      <header className="flex items-center justify-between gap-3">
        <h1 className="flex items-baseline gap-1.5 font-display text-lg font-extrabold text-foreground sm:text-xl">
          <span className="text-xs font-bold text-muted-foreground sm:text-sm">우리 방 ·</span>
          {statlingName}
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
          <StatBadge stat={STATS[topStat]} size="sm" />
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
              isReconnectGreeting={isReconnectGreeting}
              isGiftReady={isGiftReady}
              isConsistentPlayer={isConsistentPlayerNow}
              onClaimGift={care.claimGift}
              onDismissSpeech={dismissSpeech}
              testerFolder={testerFolder}
            />
          }
        />
        <RoomCleanOverlay roomCleanliness={care.roomState.cleanliness} showSparkle={care.animation === 'shake'} />
      </div>

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
            disabled={memory.gameReaction.active}
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
