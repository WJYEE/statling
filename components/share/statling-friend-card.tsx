import { forwardRef } from 'react'
import { ShareCardFooter, ShareCardHeader, ShareCardHidden } from '@/components/share/share-card-common'
import { formatLevelLabel } from '@/lib/pet-care/leveling'
import type { PetProfile } from '@/lib/pets/pet-profile'

export interface StatlingFriendCardProps {
  /** Current look — no per-pet equipped-accessory system exists yet (see docs), so this is always the catalog idle art, same as everywhere else in the app. */
  petProfile: PetProfile
  /** The user's own nickname for the pet — always available by the time MyPage exists (set on the Naming screen, long before Home/MyPage are reachable). */
  statlingName: string
  level: number
  daysTogether: number
  totalPlays: number
}

/**
 * Off-screen capture target for html-to-image (see lib/share/create-share-image.ts)
 * — "내가 현재 키우고 있는 Statling" invite card, shown from MyPageScreen.
 * Deliberately carries none of the initial-diagnosis TOP 2 stats or scores
 * (that's StatlingShareCard's job, from Character Reveal) — only real,
 * currently-available growth numbers.
 */
export const StatlingFriendCard = forwardRef<HTMLDivElement, StatlingFriendCardProps>(function StatlingFriendCard(
  { petProfile, statlingName, level, daysTogether, totalPlays },
  ref,
) {
  return (
    <ShareCardHidden ref={ref} className="justify-between">
      <ShareCardHeader />

      <div className="flex flex-col items-center gap-4">
        <img
          src={petProfile.imageSrc}
          alt=""
          width={420}
          height={420}
          className="h-[420px] w-[420px] object-contain"
        />
        <div>
          <p className="font-display text-7xl font-extrabold text-foreground">{statlingName}</p>
          <p className="mt-3 font-display text-3xl font-bold text-muted-foreground">{petProfile.name}</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-4">
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-card px-4 py-6 toy-border toy-shadow-sm">
          <span className="font-display text-4xl font-extrabold text-foreground">{formatLevelLabel(level)}</span>
          <span className="text-xl font-bold text-muted-foreground">레벨</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-card px-4 py-6 toy-border toy-shadow-sm">
          <span className="font-display text-4xl font-extrabold text-foreground">{daysTogether}일</span>
          <span className="text-xl font-bold text-muted-foreground">함께한 시간</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-card px-4 py-6 toy-border toy-shadow-sm">
          <span className="font-display text-4xl font-extrabold text-foreground">{totalPlays}회</span>
          <span className="text-xl font-bold text-muted-foreground">미니게임</span>
        </div>
      </div>

      <ShareCardFooter message={'같이 Statling 키우고\n미니게임 하자!'} />
    </ShareCardHidden>
  )
})
