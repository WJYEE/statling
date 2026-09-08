'use client'

import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { Logo } from '@/components/brain-bet/logo'
import { PetSpeechBubble } from '@/components/brain-bet/pet-speech-bubble'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { withCompanionParticle } from '@/components/brain-bet/result/content-unlock-preview'
import type { PetProfile } from '@/lib/pets/pet-profile'
import {
  STATLING_NAME_MAX_LENGTH,
  STATLING_NAME_MIN_LENGTH,
  getStatlingNameBlockedReason,
  isValidStatlingName,
} from '@/lib/naming'

/** "몽이라고" / "별빛이라고" — same batchim-check technique as content-unlock-preview.tsx's withCompanionParticle (와/과), just the 이라고/라고 pair (quoting the name back) instead. */
function withQuotativeParticle(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${word}라고`
  const hasBatchim = (code - 0xac00) % 28 !== 0
  return `${word}${hasBatchim ? '이라고' : '라고'}`
}

/** How long the "같이 놀러 가기" click's own reaction bounce plays before onPlay actually fires — short enough to never read as a loading delay (spec: 최대 약 200~300ms). */
const PLAY_CLICK_REACTION_MS = 250

interface NamingScreenProps {
  /** The already-confirmed representative pet — same PetProfile as Reveal (see lib/pets/pet-flow.ts#resolveCurrentPetProfile), never the old getTopStat-based CharacterImage. */
  petProfile: PetProfile
  /**
   * Already-saved name, if this screen is reached again after the name was
   * already set but Home hasn't actually been entered yet — e.g. a refresh
   * while sitting on the post-name "함께 놀아볼까요?" sub-state below (see
   * game-flow.tsx's boot-restore effect, which uses lib/home-entry-storage.ts
   * to tell this apart from a genuinely returning visit). Starts this
   * screen directly in the confirmed sub-state instead of the input form.
   */
  initialName?: string
  /** Fires once the name is validated — game-flow.tsx persists it (localStorage/Supabase/migration retry) but does NOT navigate anywhere; this screen swaps to its own "함께 놀아볼까요?" sub-state instead of a separate phase/screen. */
  onNameSaved: (name: string) => void
  /** "같이 놀러 가기" — the one action that actually leaves this screen for Home. */
  onPlay: () => void
}

/**
 * Naming, now followed by an in-place "이름 지은 직후 ownership을 이어가는"
 * beat instead of a separate transition screen — same component, same
 * mount, just a second internal stage (input -> confirmed) swapped in after
 * a valid name is set. Deliberately not its own Phase: a whole extra
 * screen mount/unmount would read as "yet another onboarding step" for
 * something meant to feel like a single continuous moment.
 */
export function NamingScreen({ petProfile, initialName, onNameSaved, onPlay }: NamingScreenProps) {
  const [name, setName] = useState('')
  const [confirmedName, setConfirmedName] = useState<string | null>(initialName?.trim() || null)
  // Bumped on every "같이 놀러 가기" tap — used as the pet portrait's `key`
  // so React remounts it and the one-shot .animate-pet-jump entrance
  // animation (below) restarts cleanly, the same trick used for the
  // confirm-name entrance itself (key stays 0 there, natural first mount).
  const [playReactionKey, setPlayReactionKey] = useState(0)
  const valid = isValidStatlingName(name)
  const blockedReason = getStatlingNameBlockedReason(name)

  function handleConfirmName() {
    if (!valid) return
    const trimmed = name.trim()
    onNameSaved(trimmed)
    setConfirmedName(trimmed)
  }

  /**
   * A short "통통" reaction bounce before actually leaving for Home —
   * skipped entirely under prefers-reduced-motion (calls onPlay immediately
   * rather than waiting out a delay the animation itself never plays).
   * PLAY_CLICK_REACTION_MS caps the delay well short of feeling like
   * navigation lag.
   */
  function handlePlayClick() {
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      onPlay()
      return
    }
    setPlayReactionKey((k) => k + 1)
    window.setTimeout(onPlay, PLAY_CLICK_REACTION_MS)
  }

  if (confirmedName) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <Logo size="sm" />

        {/* Character + speech bubble grouped tightly as one "first
            interaction" cluster (spec: 하나의 interaction scene처럼 묶여
            보이도록) — the bubble pops in slightly after the portrait's own
            entrance bounce starts, reacting to the name the user just set
            rather than a generic greeting. .animate-pet-jump is the
            existing one-shot "level up"-style bounce (0.7s, already
            disabled under prefers-reduced-motion globally, see
            app/globals.css) — reused as-is, no new keyframes. */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <PetSpeechBubble text={`${withQuotativeParticle(confirmedName)}? 마음에 들어요!`} className="[animation-delay:250ms]" />
          <AssetImage key={playReactionKey} src={petProfile.imageSrc} alt={confirmedName} size={160} className="animate-pet-jump" />
        </div>

        <h1 className="mt-3 flex items-center justify-center gap-1.5 text-balance font-display text-2xl font-extrabold leading-snug text-foreground">
          <Sparkles size={22} strokeWidth={2.6} className="text-primary" aria-hidden="true" />
          {withCompanionParticle(confirmedName)} 함께 놀아볼까요?
        </h1>

        <ToyButton className="mt-6 w-full" data-sfx="confirm" onClick={handlePlayClick}>
          같이 놀러 가기
          <ArrowRight size={20} strokeWidth={2.8} />
        </ToyButton>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <Logo size="sm" />

      <div className="mt-6">
        <AssetImage src={petProfile.imageSrc} alt={petProfile.name} size={140} className="animate-float" />
      </div>
      <p className="mt-2 text-sm font-bold text-muted-foreground">{petProfile.name}</p>

      <h1 className="mt-4 text-balance font-display text-2xl font-extrabold leading-snug text-foreground">
        이 친구에게
        <br />
        이름을 지어주세요.
      </h1>

      <div className="mt-6 w-full">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, STATLING_NAME_MAX_LENGTH))}
          placeholder={petProfile.name}
          maxLength={STATLING_NAME_MAX_LENGTH}
          className="w-full rounded-2xl bg-card px-4 py-3.5 text-center font-display text-lg font-extrabold text-foreground toy-border outline-none placeholder:font-sans placeholder:font-normal placeholder:text-muted-foreground"
        />
        <p className={`mt-2 text-xs font-semibold ${blockedReason ? 'text-destructive' : 'text-muted-foreground'}`}>
          {blockedReason ??
            `${STATLING_NAME_MIN_LENGTH}~${STATLING_NAME_MAX_LENGTH}자로 지어주세요. (${name.trim().length}/${STATLING_NAME_MAX_LENGTH})`}
        </p>
      </div>

      <ToyButton className="mt-6 w-full" disabled={!valid} data-sfx="confirm" onClick={handleConfirmName}>
        이름 정하기
        <ArrowRight size={20} strokeWidth={2.8} />
      </ToyButton>
    </div>
  )
}
