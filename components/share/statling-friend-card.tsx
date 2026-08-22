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
import { STATLING_TYPES, STATS, type StatId } from '@/lib/brain-bet'
import type { PetProfile } from '@/lib/pets/pet-profile'

export interface StatlingFriendCardProps {
  /** Current look — no per-pet equipped-accessory system exists yet (see docs), so this is always the catalog idle art, same as everywhere else in the app. */
  petProfile: PetProfile
  /** The user's own nickname for the pet — always available by the time MyPage exists (set on the Naming screen, long before Home/MyPage are reachable). */
  statlingName: string
  /** The pet's initial-diagnosis TOP 1/2 stats (see MyPageScreenProps) — same "no raw score" tag treatment as StatlingShareCard. */
  topStat: StatId
  secondaryStat: StatId
  /** insight.strengths[0] / insight.cautions[0] for this same topStat/secondaryStat pair — see StatlingShareCard's own doc comment for why these are shown verbatim, never rewritten. */
  strength?: string
  weakness?: string
  /** goodMatchCards/differentRhythmCards — same real compatibility data StatlingShareCard uses, always exactly 2 entries each. */
  goodMatches?: ShareCardCompatItem[]
  differentRhythms?: ShareCardCompatItem[]
  /** Total registered mini-game count (see lib/game/game-registry.ts#allGamePools) for the closing feature-card row. */
  gameCount: number
  /** The user's currently-equipped Room background image src — see ShareCardHero's own doc comment. */
  roomBackgroundSrc?: string | null
}

/**
 * Off-screen capture target for html-to-image (see lib/share/create-share-image.ts)
 * — "내가 현재 키우고 있는 Statling" invite card, shown from MyPageScreen.
 *
 * Phase 3C-2 — reuses the same psychology-test-result layout
 * StatlingShareCard has (character/type/TOP2/strength/compatibility), per
 * the spec's "이번 Phase에서 무조건 두 카드를 만들지 말 것" direction: MyPage
 * keeps sharing the Reveal-originated Result Card rather than getting a
 * bespoke Companion/Growth card this phase. One real difference from
 * StatlingShareCard: the "type description" line uses
 * STATLING_TYPES[topStat].personality (a flavor-text sentence about the
 * *type*, already used identically by the on-screen compatibility cards —
 * see lib/stats/stat-compatibility-copy.ts's own `trait` field) rather than
 * buildCoreTraitSummary, since that function needs the user's live 6-stat
 * `finals` — a value MyPageScreen has never needed to load and isn't worth
 * threading through just for this. Both are 100% pre-existing copy either
 * way, never newly authored.
 *
 * Phase 3C-2 Follow-up: same layout refinement as StatlingShareCard —
 * bigger Hero, no type-name badge, strength+weakness pair, both
 * compatibility entries per group, bigger closing feature row.
 */
export const StatlingFriendCard = forwardRef<HTMLDivElement, StatlingFriendCardProps>(function StatlingFriendCard(
  { petProfile, statlingName, topStat, secondaryStat, strength, weakness, goodMatches, differentRhythms, gameCount, roomBackgroundSrc },
  ref,
) {
  return (
    <ShareCardHidden ref={ref} className="justify-between gap-2 py-8">
      <ShareCardHeader />

      <ShareCardHero imageSrc={petProfile.imageSrc} name={statlingName} roomBackgroundSrc={roomBackgroundSrc} />

      <ShareCardTypeLine text={STATLING_TYPES[topStat].personality} />

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
        message={'같이 Statling 키우고\n미니게임 하자!'}
        subtitle={`${gameCount}가지 미니게임으로 나만의 Statling을 만나보세요.`}
      />
    </ShareCardHidden>
  )
})
