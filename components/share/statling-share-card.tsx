import { forwardRef } from 'react'
import { ShareCardFooter, ShareCardHeader, ShareCardHidden } from '@/components/share/share-card-common'
import { STAT_DISPLAY_ORDER, STATS, type StatId } from '@/lib/brain-bet'
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
  /**
   * All optional-safe display-only additions — every one of these is a
   * pre-trimmed slice of content the RevealScreen already computes via its
   * existing copy-generation functions (buildStatInsight, CompatibleEnvironment's
   * own composition, `finals`) — see reveal-screen.tsx's call site. Nothing
   * here is newly authored or recalculated inside this component; missing
   * fields just quietly skip that block rather than showing an empty panel.
   */
  strengths?: string[]
  cautions?: string[]
  compatibleEnvironment?: string[]
  /** Same shape as StatDistribution's own `finals` prop — a compact bar-per-stat mini version renders if given. */
  finals?: Record<StatId, number>
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
  { petProfile, topStats, goodMatch, differentRhythm, strengths, cautions, compatibleEnvironment, finals },
  ref,
) {
  const [top1, top2] = topStats
  const hasFeaturePanel = (strengths && strengths.length > 0) || (cautions && cautions.length > 0) || (compatibleEnvironment && compatibleEnvironment.length > 0)

  return (
    <ShareCardHidden ref={ref} className="justify-between">
      <ShareCardHeader title="나의 숨겨진 스탯" />

      <div className="flex flex-col items-center gap-2">
        <img
          src={petProfile.imageSrc}
          alt=""
          width={230}
          height={230}
          className="h-57.5 w-57.5 object-contain"
        />
        <p className="font-display text-4xl font-extrabold text-foreground">{petProfile.name}</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {[top1, top2].map((entry, i) => (
          <div
            key={entry.name}
            className="flex items-center gap-5 rounded-[1.5rem] bg-card px-7 py-4 text-left toy-border toy-shadow-sm"
          >
            <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-foreground toy-border">
              {i === 0 ? 'TOP1' : 'TOP2'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-2xl font-extrabold text-foreground">{entry.name}</span>
                {entry.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-accent px-3 py-0.5 text-base font-bold text-accent-foreground toy-border"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-lg leading-snug text-muted-foreground">{entry.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* "강점 / 주의할 점 / 잘 맞는 환경" — every line here is a pre-trimmed
          slice of RevealScreen's own buildStatInsight()/CompatibleEnvironment
          copy (see reveal-screen.tsx's call site), never newly authored for
          this card. One compact panel (not 3 separate cards) to keep the
          1080x1350 canvas from feeling packed. */}
      {hasFeaturePanel && (
        <div className="w-full rounded-[1.5rem] bg-card px-7 py-5 text-left toy-border toy-shadow-sm">
          {strengths && strengths.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg font-extrabold text-foreground">✨ 강점</span>
              {strengths.map((item) => (
                <span key={item} className="text-base leading-snug text-secondary-foreground">
                  {item}
                </span>
              ))}
            </div>
          )}
          {cautions && cautions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg font-extrabold text-foreground">⚠ 주의</span>
              {cautions.map((item) => (
                <span key={item} className="text-base leading-snug text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
          )}
          {compatibleEnvironment && compatibleEnvironment.length > 0 && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg font-extrabold text-foreground">📚 잘 맞는 환경</span>
              {compatibleEnvironment.map((item) => (
                <span key={item} className="text-base leading-snug text-secondary-foreground">
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* "나의 6가지 스탯" mini distribution — same `finals` values StatDistribution
          already renders on-screen, just a tighter bar-per-stat list with no
          card-panel chrome, sized to fit this card's remaining space. */}
      {finals && (
        <div className="w-full">
          <ul className="flex w-full flex-col gap-1.5">
            {STAT_DISPLAY_ORDER.map((id) => {
              const stat = STATS[id]
              const value = Math.max(0, Math.min(100, finals[id] ?? 0))
              return (
                <li key={id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-left text-base font-bold text-foreground">{stat.name}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-md bg-foreground/10">
                    <div className="h-full rounded-sm" style={{ width: `${value}%`, backgroundColor: `var(${stat.colorVar})` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-base font-bold text-muted-foreground">{value}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(goodMatch || differentRhythm) && (
        <div className="w-full">
          <p className="mb-2 font-display text-lg font-bold text-muted-foreground">Statling 궁합</p>
          <div className="grid grid-cols-2 gap-3">
            {goodMatch && (
              <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-4 py-3 toy-border toy-shadow-sm">
                <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">
                  잘 맞는 Statling
                </span>
                <img
                  src={goodMatch.characterImageSrc}
                  alt=""
                  width={90}
                  height={90}
                  className="h-22.5 w-22.5 object-contain"
                />
                <p className="font-display text-lg font-extrabold text-foreground">{goodMatch.characterName}</p>
              </div>
            )}
            {differentRhythm && (
              <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-4 py-3 toy-border toy-shadow-sm">
                <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground">
                  잘 안 맞는 Statling
                </span>
                <img
                  src={differentRhythm.characterImageSrc}
                  alt=""
                  width={90}
                  height={90}
                  className="h-22.5 w-22.5 object-contain"
                />
                <p className="font-display text-lg font-extrabold text-foreground">{differentRhythm.characterName}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <ShareCardFooter message={'너의 플레이에서는\n어떤 Statling이 태어날까?'} />
    </ShareCardHidden>
  )
})
