import { forwardRef } from 'react'
import { ShareCardFooter, ShareCardHeader, ShareCardHidden } from '@/components/share/share-card-common'
import type { PetProfile } from '@/lib/pets/pet-profile'

/** One of the initial diagnosis's TOP 2 stats — no 0-100 score anywhere, per spec (Character Reveal share is about *which* Statling was born, not the raw numbers). */
export interface ShareTopStatEntry {
  /** e.g. "순발력" */
  name: string
  /** 2 short existing tags for this stat — reused as-is, never newly authored copy (see reveal-screen.tsx: STATLING_TYPES[id].typeName + getStatTypeLabel(id)). */
  keywords: [string, string]
  /** One existing line, reused as-is (STATLING_TYPES[id].personality) — never a newly authored description. */
  description: string
}

/** One compatibility entry — a real other catalog character, reused as-is from lib/stats/stat-compatibility-copy.ts (no new matching rules invented here). */
export interface ShareCompatibilityEntry {
  characterName: string
  characterImageSrc: string
}

export interface StatlingShareCardProps {
  petProfile: PetProfile
  /** [TOP 1, TOP 2] — highest first, from the *initial* diagnosis (see reveal-screen.tsx's `finals`), never later growth. */
  topStats: [ShareTopStatEntry, ShareTopStatEntry]
  goodMatch?: ShareCompatibilityEntry
  differentRhythm?: ShareCompatibilityEntry
}

/**
 * Off-screen capture target for html-to-image (see lib/share/create-share-image.ts)
 * — "내 플레이에서 어떤 Statling이 태어났는지" result card, shown from
 * RevealScreen right after the 6-game diagnosis. Deliberately never reads
 * `statlingName` (the pet's own naming step hasn't happened yet at this
 * point in the flow) — only `petProfile.name`, the catalog species name,
 * which is always already known.
 */
export const StatlingShareCard = forwardRef<HTMLDivElement, StatlingShareCardProps>(function StatlingShareCard(
  { petProfile, topStats, goodMatch, differentRhythm },
  ref,
) {
  const [top1, top2] = topStats

  return (
    <ShareCardHidden ref={ref} className="justify-between">
      <ShareCardHeader title="나의 숨겨진 스탯" />

      <div className="flex flex-col items-center gap-3">
        <img
          src={petProfile.imageSrc}
          alt=""
          width={300}
          height={300}
          className="h-[300px] w-[300px] object-contain"
        />
        <p className="font-display text-5xl font-extrabold text-foreground">{petProfile.name}</p>
      </div>

      <div className="flex w-full flex-col gap-4">
        {[top1, top2].map((entry, i) => (
          <div
            key={entry.name}
            className="flex items-center gap-6 rounded-[1.75rem] bg-card px-8 py-6 text-left toy-border toy-shadow-sm"
          >
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary font-display text-2xl font-extrabold text-primary-foreground toy-border">
              {i === 0 ? 'TOP1' : 'TOP2'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="font-display text-3xl font-extrabold text-foreground">{entry.name}</span>
                {entry.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-accent px-3.5 py-1 text-lg font-bold text-accent-foreground toy-border"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-xl leading-snug text-muted-foreground">{entry.description}</p>
            </div>
          </div>
        ))}
      </div>

      {(goodMatch || differentRhythm) && (
        <div className="w-full">
          <p className="mb-3 font-display text-xl font-bold text-muted-foreground">Statling 궁합</p>
          <div className="grid grid-cols-2 gap-4">
            {goodMatch && (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-4 py-5 toy-border toy-shadow-sm">
                <span className="rounded-full bg-secondary px-3 py-1 text-base font-bold text-secondary-foreground">
                  잘 맞는 Statling
                </span>
                <img
                  src={goodMatch.characterImageSrc}
                  alt=""
                  width={110}
                  height={110}
                  className="h-[110px] w-[110px] object-contain"
                />
                <p className="font-display text-xl font-extrabold text-foreground">{goodMatch.characterName}</p>
              </div>
            )}
            {differentRhythm && (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-4 py-5 toy-border toy-shadow-sm">
                <span className="rounded-full bg-muted px-3 py-1 text-base font-bold text-muted-foreground">
                  잘 안 맞는 Statling
                </span>
                <img
                  src={differentRhythm.characterImageSrc}
                  alt=""
                  width={110}
                  height={110}
                  className="h-[110px] w-[110px] object-contain"
                />
                <p className="font-display text-xl font-extrabold text-foreground">{differentRhythm.characterName}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <ShareCardFooter message={'너의 플레이에서는\n어떤 Statling이 태어날까?'} />
    </ShareCardHidden>
  )
})
