import { forwardRef } from 'react'
import { Gamepad2, Sprout } from 'lucide-react'
import {
  ShareCardCompatGroup,
  ShareCardFeatureCard,
  ShareCardFooter,
  ShareCardHeader,
  ShareCardHero,
  ShareCardHidden,
  ShareCardSectionLabel,
  ShareCardTag,
  ShareCardTraitPair,
  ShareCardTypeLine,
  type ShareCardCompatItem,
} from '@/components/share/share-card-common'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { STATS, type StatId } from '@/lib/brain-bet'
import type { PetProfile } from '@/lib/pets/pet-profile'

export interface StatlingShareCardProps {
  petProfile: PetProfile
  /** The initial diagnosis's TOP 1/2 stats (see reveal-screen.tsx's `topStat`/`secondaryStat`) — shown only as two small tags, never raw scores. */
  topStat: StatId
  secondaryStat: StatId
  /** buildCoreTraitSummary(finals, topStat, secondaryStat)'s real output (see reveal-screen.tsx) — the screen's own already-computed "핵심 성향" sentence, never recalculated or newly authored here. */
  coreTrait: string
  /** insight.strengths[0] / insight.cautions[0] (see lib/stats/stat-insights.ts#buildStatInsight) — the screen's own already-computed sentences, shown verbatim (never truncated/rewritten, to avoid inventing new phrasing). */
  strength?: string
  weakness?: string
  /** goodMatchCards/differentRhythmCards (see lib/stats/stat-compatibility-copy.ts) — real compatibility data from the pet's own catalog vector, always exactly 2 entries each; passed through as-is, never sliced to 1 or recomputed. */
  goodMatches?: ShareCardCompatItem[]
  differentRhythms?: ShareCardCompatItem[]
  /** Total registered mini-game count (see lib/game/game-registry.ts#allGamePools) for the closing feature-card row. */
  gameCount: number
  /** The user's currently-equipped Room background image src (see ShareCardHero's own doc comment) — optional/best-effort. */
  roomBackgroundSrc?: string | null
}

/**
 * Off-screen capture target for html-to-image (see lib/share/create-share-image.ts)
 * — "내 플레이에서 어떤 Statling이 태어났는지" result card, shown from
 * RevealScreen right after the 6-game diagnosis. Deliberately never reads
 * `statlingName` (the pet's own naming step hasn't happened yet at this
 * point in the flow) — only `petProfile.name`, the catalog species name,
 * which is always already known.
 *
 * Phase 3C-2 — a psychology-test-style result card: "나의 능력을 분석했더니
 * 이런 Statling이 나왔어요", not just "내 Statling을 소개할게요". Every piece
 * of content here is a direct reuse of data RevealScreen (or its upstream
 * lib/pets, lib/stats helpers) already computes for the on-screen result —
 * coreTrait, strength/weakness, and compatibility are never recalculated or
 * newly authored inside this purely-presentational component. Deliberately
 * still no 6-stat chart/raw scores/XP/ranking.
 *
 * Phase 3C-2 Follow-up: bigger Hero, no more type-name badge (redundant with
 * coreTrait/TOP STATS — see ShareCardHero's own doc comment), both strength
 * AND weakness (not strength-only), both compatibility entries per group
 * (not just the first), and a more prominent closing feature row + footer.
 * `SHARE_CARD_WIDTH`/`HEIGHT` (1080x1350) are unchanged, so every section
 * below is kept deliberately compact (tight gaps, 1-2 line text caps) —
 * this got measurably richer without the card's fixed capture canvas
 * growing, verified by checking the actual saved PNG isn't clipped.
 */
export const StatlingShareCard = forwardRef<HTMLDivElement, StatlingShareCardProps>(function StatlingShareCard(
  { petProfile, topStat, secondaryStat, coreTrait, strength, weakness, goodMatches, differentRhythms, gameCount, roomBackgroundSrc },
  ref,
) {
  return (
    <ShareCardHidden ref={ref} className="justify-between gap-2 py-8">
      <ShareCardHeader />

      <ShareCardHero imageSrc={petProfile.imageSrc} name={petProfile.name} roomBackgroundSrc={roomBackgroundSrc} />

      <ShareCardTypeLine text={coreTrait} />

      <div className="flex w-full flex-col items-center gap-1.5">
        <ShareCardSectionLabel>TOP STATS</ShareCardSectionLabel>
        <div className="flex items-center gap-3">
          <ShareCardTag icon={<StatBadge stat={STATS[topStat]} size="xs" />} label={STATS[topStat].name} />
          <ShareCardTag icon={<StatBadge stat={STATS[secondaryStat]} size="xs" />} label={STATS[secondaryStat].name} />
        </div>
      </div>

      <ShareCardTraitPair strength={strength} weakness={weakness} />

      {goodMatches && goodMatches.length > 0 && <ShareCardCompatGroup label="💕 잘 맞는 Statling" items={goodMatches} />}
      {differentRhythms && differentRhythms.length > 0 && (
        <ShareCardCompatGroup label="🎐 잘 안 맞는 Statling" items={differentRhythms} />
      )}

      <div className="flex w-full gap-3">
        <ShareCardFeatureCard
          icon={<Gamepad2 size={22} strokeWidth={2.4} />}
          title={`${gameCount}가지 미니게임`}
          description="숨겨진 능력을 발견해요"
        />
        <ShareCardFeatureCard
          icon={<Sprout size={22} strokeWidth={2.4} />}
          title="함께 성장하는 친구"
          description="같이 키우고 성장해요"
        />
      </div>

      <ShareCardFooter
        message={'너의 플레이에서는\n어떤 Statling이 태어날까?'}
        subtitle={`${gameCount}가지 미니게임으로 나만의 Statling을 만나보세요.`}
      />
    </ShareCardHidden>
  )
})
