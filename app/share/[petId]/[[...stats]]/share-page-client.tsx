'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { Logo } from '@/components/brain-bet/logo'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { StatlingCompatibility } from '@/components/brain-bet/result/statling-compatibility'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { FriendInviteCta } from '@/components/share/friend-invite-cta'
import { STATS, type StatId } from '@/lib/brain-bet'
import { getPetProfileById } from '@/lib/pets/pet-profile'
import { getStatCompatibility } from '@/lib/pets/compatibility'
import { addMetPet, hasMetPet } from '@/lib/pets/dex-storage'
import { scheduleSync } from '@/lib/sync/sync-dispatcher'
import { buildDifferentRhythmCards, buildGoodMatchCards } from '@/lib/stats/stat-compatibility-copy'

interface SharePageClientProps {
  petId: string
  /** Both present together or both null — see resolve-share-params.ts. */
  topStat: StatId | null
  secondaryStat: StatId | null
}

/**
 * Public landing page for a Statling share link — the real page a link
 * preview card takes a visitor to when tapped, for both share surfaces this
 * route serves (see page.tsx's generateMetadata doc comment):
 *   - My Page's "공유 링크"/"친구에게 공유" (topStat/secondaryStat null): the
 *     original behavior, introducing whichever pet the URL names on its own.
 *   - Character Reveal's "공유하기" (topStat/secondaryStat set): leads with
 *     the TOP 1/2 stats from that diagnosis, same character either way.
 * No account or server lookup involved either way — the character (and, for
 * the reveal variant, which 2 stats to headline) is fully determined by the
 * URL itself. Clicking "내 도감에 기록하기" writes straight to the *viewer's
 * own* browser localStorage (lib/pets/dex-storage.ts) — this is
 * intentionally one-way and local-only; it does not notify or update the
 * sender's dex in any way (that would need a real backend — see the
 * discussion this feature was scoped from). The compatibility section below
 * the CTA reuses the exact same lib/pets/compatibility.ts calculation
 * Character Reveal already shows — no new algorithm, no server lookup.
 *
 * Phase 3G-4 — a friend-invite link (built only by MyPage's dedicated
 * "친구와 기록 비교하기" action, never by the general share above) adds
 * exactly one thing on top of all of this: a `?ref=<friend_code>` query
 * param, read here via useSearchParams (not a route param — resolve-share-
 * params.ts/generateMetadata/the OG image are untouched, since none of them
 * read the query string). When present, FriendInviteCta renders below the
 * existing dex CTA; when absent (every general share link, including every
 * one already in the wild), nothing here changes at all. Opening this page
 * — with or without `ref` — never creates a friendship by itself; that only
 * ever happens from FriendInviteCta's own explicit button, and Dex
 * registration above stays fully independent of whichever way that goes.
 */
export function SharePageClient({ petId, topStat, secondaryStat }: SharePageClientProps) {
  const pet = getPetProfileById(petId)
  const [recorded, setRecorded] = useState(() => hasMetPet(petId))
  const isReveal = topStat != null && secondaryStat != null
  const friendCode = useSearchParams().get('ref')

  // Same calculation Character Reveal already shows (lib/pets/compatibility.ts's
  // getStatCompatibility) — deterministic from the pet's own catalog vector,
  // no visitor-specific or server data involved, so this works identically
  // whether the visitor is logged out or an existing Statling owner.
  const compatibility = pet ? getStatCompatibility(pet) : null
  const goodMatchCards = compatibility ? buildGoodMatchCards(compatibility.goodMatches) : []
  const differentRhythmCards = compatibility ? buildDifferentRhythmCards(compatibility.differentRhythms) : []

  function handleRecord() {
    // Only reachable when !recorded (see the CTA render below), i.e. this is
    // always a genuinely new dex entry for this visitor's device — a no-op
    // for a guest visitor (see lib/sync/session-registry.ts).
    addMetPet(petId)
    scheduleSync('dex_entries')
    setRecorded(true)
  }

  return (
    <div className="dot-grid-bg mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 py-8">
      <Logo size="sm" />

      {!pet ? (
        <p className="mt-16 text-center text-sm font-bold text-muted-foreground">
          존재하지 않는 Statling 링크예요.
        </p>
      ) : (
        <>
          <p className="mt-8 text-center text-sm font-bold text-muted-foreground">
            {isReveal ? '친구의 진단 결과, 이런 Statling이 태어났어요!' : '친구가 자신의 대표 Statling을 보여줬어요!'}
          </p>

          <div className="mt-4 flex w-full flex-col items-center rounded-3xl bg-card px-6 py-8 toy-border toy-shadow-lg">
            <AssetImage src={pet.imageSrc} alt={pet.name} size={200} />
            <h1 className="mt-3 font-display text-2xl font-extrabold text-foreground">{pet.name}</h1>
            <p className="mt-2 text-center text-xs font-bold leading-relaxed text-muted-foreground">{pet.tagline}</p>

            {isReveal && (
              <div className="mt-5 flex w-full flex-col gap-2">
                {[topStat, secondaryStat].map((id, i) => (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-left toy-border"
                  >
                    <span className="font-display text-xs font-extrabold text-primary">{i === 0 ? 'TOP1' : 'TOP2'}</span>
                    <StatBadge stat={STATS[id]} size="sm" />
                    <span className="font-display text-sm font-extrabold text-secondary-foreground">
                      {STATS[id].name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 w-full">
            {recorded ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-4 text-sm font-bold text-secondary-foreground toy-border">
                <Check size={18} strokeWidth={2.6} />
                내 도감에 기록했어요!
              </div>
            ) : (
              <ToyButton className="w-full" onClick={handleRecord}>
                내 도감에 기록하기
              </ToyButton>
            )}
          </div>

          {/* Only rendered when the link is a friend invite (see this file's
              own doc comment above) — never for a plain share link. */}
          {friendCode && <FriendInviteCta friendCode={friendCode} petId={petId} />}

          {/* Extra info below the primary "내 도감에 기록하기" CTA, never above
              it — the CTA stays the first thing a visitor can act on. */}
          <StatlingCompatibility goodMatches={goodMatchCards} differentRhythms={differentRhythmCards} />

          <Link
            href="/"
            className="mt-4 flex items-center gap-1 text-xs font-bold text-muted-foreground underline-offset-2 hover:underline"
          >
            나도 Statling 시작하기
            <ArrowRight size={14} strokeWidth={2.6} />
          </Link>
        </>
      )}
    </div>
  )
}
