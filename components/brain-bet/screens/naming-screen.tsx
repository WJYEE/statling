'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { Logo } from '@/components/brain-bet/logo'
import { ToyButton } from '@/components/brain-bet/toy-button'
import type { PetProfile } from '@/lib/pets/pet-profile'
import {
  STATLING_NAME_MAX_LENGTH,
  STATLING_NAME_MIN_LENGTH,
  getStatlingNameBlockedReason,
  isValidStatlingName,
} from '@/lib/naming'

interface NamingScreenProps {
  /** The already-confirmed representative pet — same PetProfile as Reveal (see lib/pets/pet-flow.ts#resolveCurrentPetProfile), never the old getTopStat-based CharacterImage. */
  petProfile: PetProfile
  onConfirm: (name: string) => void
}

export function NamingScreen({ petProfile, onConfirm }: NamingScreenProps) {
  const [name, setName] = useState('')
  const valid = isValidStatlingName(name)
  const blockedReason = getStatlingNameBlockedReason(name)

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

      <ToyButton
        className="mt-6 w-full"
        disabled={!valid}
        data-sfx="confirm"
        onClick={() => valid && onConfirm(name.trim())}
      >
        이름 정하기
        <ArrowRight size={20} strokeWidth={2.8} />
      </ToyButton>
    </div>
  )
}
