import { useEffect, useMemo, useRef, useState } from 'react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { CharacterImage } from '@/components/brain-bet/character-image'
import { DecoOverlay } from '@/components/brain-bet/deco-overlay'
import { PetSpeechBubble } from '@/components/brain-bet/pet-speech-bubble'
import type { StatId } from '@/lib/brain-bet'
import { resolveCharacterAnchors } from '@/lib/character-anchor.config'
import type { PetProfile } from '@/lib/pets/pet-profile'
import {
  buildCharacterStateFolder,
  CHARACTER_STATE_SEQUENCE,
  characterStateForInteraction,
  type CharacterStateFolder,
  type CharacterStateKey,
} from '@/lib/character-state-assets'
import { loadSavedDecoPlacementState } from '@/lib/deco-placement-storage'
import { WALK_OFFSET_DISTANCE } from '@/lib/config/pet-autonomy.config'
import type { CareStatId, Mood, PetAnimation } from '@/lib/pet-care/types'
import { cn } from '@/lib/utils'

/**
 * Matches every AssetImage/CharacterImage call below — see DecoOverlay's doc
 * comment for why this must stay in sync. A `clamp()` (not a plain number)
 * so the Statling scales down on narrow phones instead of staying pinned at
 * its desktop size — 270px in a ~330px-wide mobile Room canvas read as
 * oversized. Pure CSS, no resize-listener/hydration-mismatch risk: at the
 * `sm` breakpoint (640px) and up, 46vw already exceeds 270px, so the clamp
 * ceiling keeps desktop pixel-identical to before.
 *
 * Exported so theme-screen.tsx's 테마·방 꾸미기 editor (a different screen,
 * same RoomCanvas, same normalized item coordinates) can render the Statling
 * at this exact size too — the editor used to hardcode a plain 140px here,
 * which made every placed item look correctly scaled/positioned next to the
 * Statling while editing, then visibly off (the live Room's Statling is up
 * to ~93% bigger on a PC-width viewport) the moment the same saved layout
 * showed up on the actual Home screen. Items are positioned/sized as a
 * percentage of the shared square canvas, not relative to the Statling, so
 * the only way for "what you placed" to match "what you see at home" is for
 * both screens to render the Statling at the same size.
 */
export const CHARACTER_BOX_SIZE = 'clamp(160px, 44vw, 270px)'

/** How long a manual click-preview (see the tester click handler below) overrides the live interaction-driven state before reverting. */
const TESTER_PREVIEW_HOLD_MS = 1600

/** How often (and for how long) the tester art blinks while genuinely idle — see the blink effect below. */
const BLINK_INTERVAL_MS = 4000
const BLINK_DURATION_MS = 180

const ANIMATION_CLASS: Record<PetAnimation, string> = {
  idle: 'animate-float',
  jump: 'animate-pet-jump',
  eat: 'animate-pet-eat',
  wash: 'animate-pet-wash',
  shake: 'animate-pet-clean-react',
  play: 'animate-pet-play',
  pet: 'animate-pet-pet',
  talk: 'animate-pet-talk',
  sleep: 'animate-pet-sleep',
  sad: 'animate-pet-sad',
  lookLeft: 'animate-pet-look',
  lookRight: 'animate-pet-look',
  hop: 'animate-pet-hop',
  walk: 'animate-pet-walk',
  askFood: 'animate-pet-gesture',
  askPlay: 'animate-pet-gesture',
  askAttention: 'animate-pet-gesture',
  celebrate: 'animate-pet-celebrate',
  playAlone: 'animate-pet-play', // reuses the button-놀기 motion — same visual, only the trigger source differs
  ponder: 'animate-float', // a calm musing beat — reuses the plain idle float rather than a new keyframe
}

interface PetMoodViewProps {
  petProfile: PetProfile | null
  topStat: StatId
  mood: Mood
  animation: PetAnimation
  speech: string | null
  playVariantId?: string
  /** Which horizontal zone the autonomous scheduler currently has the Statling in — -1 left / 0 centered / 1 right — see hooks/use-pet-autonomy.ts's `offsetSign`. The actual distance is WALK_OFFSET_DISTANCE (lib/config/pet-autonomy.config.ts), applied below via translateX(calc(sign * distance)). */
  offsetSign?: -1 | 0 | 1
  onDismissSpeech?: () => void
  /** Signed lean angle (degrees) while walking left/right — see hooks/use-pet-autonomy.ts's `walkTiltDeg`. 0 the rest of the time. */
  tiltDeg?: number
  /** Which way the body currently faces — see hooks/use-pet-autonomy.ts's `facing`. The source art always faces 'left'; 'right' mirrors it (and everything layered on it, deco included) via CSS scaleX(-1). */
  facing?: 'left' | 'right'
  /** Raw 0-100 care stats — several of the 24 states (sick/tired/love/excited/happy, and each action's "already satisfied" check) read straight from these. See characterStateForInteraction. */
  stats: Record<CareStatId, number>
  /** True briefly after a petting streak — see hooks/use-pet-care.ts's `isOverPetted`. */
  isOverPetted?: boolean
  /** True briefly after a talking streak — see hooks/use-pet-care.ts's `isOverTalked`. */
  isOverTalked?: boolean
  /** True briefly right after mount, following a long absence — see room-screen.tsx's `isReconnectGreeting`. */
  isReconnectGreeting?: boolean
  /** True while an unclaimed level-milestone gift is waiting — tapping the Statling (see the click handler below) claims it. */
  isGiftReady?: boolean
  /** "미니게임을 일정 수준 이상 꾸준히 플레이했을 때" — see lib/pet-care/pet-memory.ts#isConsistentPlayer. */
  isConsistentPlayer?: boolean
  /** A 대화 answer's own expression, held briefly — see hooks/use-pet-talk.ts and characterStateForInteraction's `forcedStateKey`. Wins over everything else while set. */
  forcedStateKey?: CharacterStateKey | null
  /** Called when the Statling is tapped while isGiftReady — see hooks/use-pet-care.ts's `claimGift`. */
  onClaimGift?: () => void
  /**
   * Dev/QA only (see qa-skip-menu.tsx) — when set, the character is rendered
   * from this folder's 24-state art instead of the normal petProfile/type
   * image, driven live by `mood`/`animation` via characterStateForInteraction.
   * Clicking the character also cycles through all 24 states one at a time
   * (with a little pop + sparkle), so states with no real trigger yet
   * (angry, gift, evolve, ...) are still viewable — see
   * lib/character-state-assets.ts for which states each path covers.
   */
  testerFolder?: CharacterStateFolder | null
}

/**
 * The character itself + whatever's currently layered around it: the
 * action-driven motion class, a transient effect glyph for the action that
 * triggered it, an ambient glyph for moods that read best as always-on
 * (joyful sparkle / dirty dust), the autonomous left/right zone offset, and
 * the speech bubble. Passed as RoomCanvas's `statlingSlot`, so it owns no
 * positioning of its own beyond `relative` (RoomCanvas centers/z-indexes
 * it) — the zone offset is an *additional* translateX on top of that,
 * which composes correctly since nested transforms apply independently.
 */
export function PetMoodView({
  petProfile,
  topStat,
  mood,
  animation,
  speech,
  playVariantId,
  offsetSign = 0,
  tiltDeg = 0,
  facing = 'left',
  stats,
  isOverPetted = false,
  isOverTalked = false,
  isReconnectGreeting = false,
  isGiftReady = false,
  isConsistentPlayer = false,
  forcedStateKey = null,
  onClaimGift,
  onDismissSpeech,
  testerFolder,
}: PetMoodViewProps) {
  // Loaded once per mount — GameFlow remounts RoomScreen (and this) on every
  // phase switch (see game-flow.tsx's stepKey), so returning here from the
  // Statling tab after saving Deco edits always reflects the latest data
  // without needing a separate refresh signal. Read-only here: Room never
  // edits Deco, only displays it (see DecoOverlay).
  const [decoItems] = useState(() => loadSavedDecoPlacementState().items)

  // Manual click-through preview (tester mode only) — null means "just show
  // whatever mood/animation would really display right now".
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [clickTick, setClickTick] = useState(0)
  const previewTimeoutRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current != null) window.clearTimeout(previewTimeoutRef.current)
    }
  }, [])

  const handleTesterClick = () => {
    if (!testerFolder) return
    setPreviewIndex((i) => ((i ?? -1) + 1) % CHARACTER_STATE_SEQUENCE.length)
    setClickTick((t) => t + 1)
    if (previewTimeoutRef.current != null) window.clearTimeout(previewTimeoutRef.current)
    previewTimeoutRef.current = window.setTimeout(() => setPreviewIndex(null), TESTER_PREVIEW_HOLD_MS)
  }

  // The real representative pet's own 24-state folder — same asset-path
  // convention as a tester folder (see buildCharacterStateFolder), so a real
  // petProfile drives the exact same live mood/animation -> art mapping
  // 01_치즈털실냥이 already used, instead of a single static idle image.
  // testerFolder (QA override) always wins when both are present.
  const realFolder = useMemo(
    () => (petProfile ? buildCharacterStateFolder(petProfile.id, petProfile.name) : null),
    [petProfile],
  )
  const activeFolder = testerFolder ?? realFolder

  const liveStateKey = activeFolder
    ? characterStateForInteraction({
        mood,
        animation,
        stats,
        isOverPetted,
        isOverTalked,
        isReconnectGreeting,
        isGiftReady,
        isConsistentPlayer,
        forcedStateKey: forcedStateKey ?? undefined,
      })
    : null

  // Periodic blink — only while the live (non-preview) state genuinely reads
  // as idle; stops the moment an action/mood pushes it to anything else.
  const [isBlinking, setIsBlinking] = useState(false)
  const blinkTimeoutRef = useRef<number | null>(null)
  useEffect(() => {
    if (liveStateKey !== 'idle') {
      setIsBlinking(false)
      return
    }
    const interval = window.setInterval(() => {
      setIsBlinking(true)
      blinkTimeoutRef.current = window.setTimeout(() => setIsBlinking(false), BLINK_DURATION_MS)
    }, BLINK_INTERVAL_MS)
    return () => {
      window.clearInterval(interval)
      if (blinkTimeoutRef.current != null) window.clearTimeout(blinkTimeoutRef.current)
    }
  }, [liveStateKey])

  // Manual click-preview only ever applies in tester mode — a real pet
  // always just shows whatever mood/animation is actually happening.
  const isPreviewing = testerFolder != null && previewIndex != null
  const displayedLiveKey = isBlinking ? 'blink' : liveStateKey
  // Falls back to the sequence's first entry ('idle') rather than ever being
  // undefined — activeFolder truthy must always resolve to *some* real
  // asset, never fall through to the CharacterImage branch below (that
  // branch showing up alongside a live/tester caption was exactly the
  // "wrong pet, broken image" bug).
  const stateDef = isPreviewing
    ? CHARACTER_STATE_SEQUENCE[previewIndex]
    : (CHARACTER_STATE_SEQUENCE.find((d) => d.key === displayedLiveKey) ?? CHARACTER_STATE_SEQUENCE[0])

  // Resolved against whichever state is actually on screen right now (tester
  // preview included) — see lib/character-anchor.config.ts. This is what lets
  // a Deco sticker keep tracking the head/face/body as the Statling's pose
  // changes, instead of drifting the moment mood/animation swaps the art.
  const anchors = useMemo(
    () => resolveCharacterAnchors(activeFolder?.folderId ?? null, stateDef.key),
    [activeFolder, stateDef.key],
  )

  return (
    <div
      className="pet-zone-transition relative flex flex-col items-center"
      style={{ transform: `translateX(calc(${offsetSign} * ${WALK_OFFSET_DISTANCE})) rotate(${tiltDeg}deg)` }}
    >
      {speech && (
        <PetSpeechBubble key={speech} text={speech} onDismiss={onDismissSpeech} className="absolute -top-16 z-10" />
      )}

      {/* Facing flip — separate from the outer zone-move transform above, its
          own short transition, and applied here (not on the outer wrapper)
          so it mirrors the character + DecoOverlay together (a placed
          sticker keeps tracking the same anchor as the body turns) while
          leaving the speech bubble sibling above completely unaffected. */}
      <div
        className="pet-facing-transition relative"
        style={{ transform: facing === 'right' ? 'scaleX(-1)' : 'scaleX(1)' }}
      >
        {testerFolder ? (
          <button
            type="button"
            onClick={handleTesterClick}
            className="block cursor-pointer rounded-full"
            title="클릭하면 다음 표정을 미리 볼 수 있어요"
          >
            <DecoOverlay
              items={decoItems}
              characterSize={CHARACTER_BOX_SIZE}
              anchors={anchors}
              characterSlot={
                <AssetImage
                  key={`${stateDef.key}-${clickTick}`}
                  src={testerFolder.assets[stateDef.key]}
                  alt={`${testerFolder.displayName} — ${stateDef.label}`}
                  size={CHARACTER_BOX_SIZE}
                  className={cn(isPreviewing ? 'animate-pop-in' : ANIMATION_CLASS[animation])}
                />
              }
            />
          </button>
        ) : realFolder && petProfile ? (
          isGiftReady ? (
            <button
              type="button"
              onClick={onClaimGift}
              className="block cursor-pointer rounded-full"
              title="탭해서 선물을 받아보세요"
            >
              <DecoOverlay
                items={decoItems}
                characterSize={CHARACTER_BOX_SIZE}
                anchors={anchors}
                characterSlot={
                  <AssetImage
                    src={realFolder.assets[stateDef.key]}
                    alt={petProfile.name}
                    size={CHARACTER_BOX_SIZE}
                    className={ANIMATION_CLASS[animation]}
                  />
                }
              />
            </button>
          ) : (
            <DecoOverlay
              items={decoItems}
              characterSize={CHARACTER_BOX_SIZE}
              anchors={anchors}
              characterSlot={
                <AssetImage
                  src={realFolder.assets[stateDef.key]}
                  alt={petProfile.name}
                  size={CHARACTER_BOX_SIZE}
                  className={ANIMATION_CLASS[animation]}
                />
              }
            />
          )
        ) : (
          <DecoOverlay
            items={decoItems}
            characterSize={CHARACTER_BOX_SIZE}
            anchors={anchors}
            characterSlot={<CharacterImage type={topStat} size={CHARACTER_BOX_SIZE} className={ANIMATION_CLASS[animation]} />}
          />
        )}

        {isPreviewing && (
          <>
            <span
              key={`spark-${clickTick}`}
              className="animate-sparkle-burst pointer-events-none absolute -right-2 -top-2 text-2xl"
              aria-hidden="true"
            >
              ✨
            </span>
            <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-foreground toy-border">
              {stateDef?.number}. {stateDef?.label}
            </span>
          </>
        )}

        {!isPreviewing && animation === 'shake' && (
          <span className="animate-sparkle-burst absolute -right-2 -top-2 text-2xl" aria-hidden="true">
            ✨
          </span>
        )}
        {!isPreviewing && animation === 'jump' && (
          <span className="animate-sparkle-burst absolute -right-3 -top-3 text-3xl" aria-hidden="true">
            ✨
          </span>
        )}
        {!isPreviewing && animation === 'askFood' && (
          <span className="animate-pop-in absolute -right-2 -top-2 text-2xl" aria-hidden="true">
            🍽️
          </span>
        )}
        {!isPreviewing && animation === 'askPlay' && (
          <span className="animate-pop-in absolute -right-2 -top-2 text-2xl" aria-hidden="true">
            💭
          </span>
        )}
        {!isPreviewing && animation === 'celebrate' && (
          <span className="animate-sparkle-burst absolute -right-3 -top-3 text-2xl" aria-hidden="true">
            🎉
          </span>
        )}

        {!isPreviewing && animation === 'idle' && mood === 'joyful' && (
          <span
            className={cn('animate-egg-glow-pulse absolute -right-2 -top-2 text-xl')}
            aria-hidden="true"
          >
            ✨
          </span>
        )}
        {!isPreviewing && animation === 'idle' && mood === 'dirty' && (
          <span className="animate-egg-glow-pulse absolute -left-2 -top-1 text-xl" aria-hidden="true">
            💨
          </span>
        )}
      </div>
    </div>
  )
}
