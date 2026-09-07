import { Sparkles } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { GamePanel } from '@/components/brain-bet/result/game-panel'
import { PetSpeechBubble } from '@/components/brain-bet/pet-speech-bubble'
import { expRequiredForLevel, formatLevelLabel } from '@/lib/pet-care/leveling'
import type { PetProfile } from '@/lib/pets/pet-profile'

/** "반짝벌이" / "바다고래가" — same technique as save-screen.tsx's withObjectParticle (을/를) and content-unlock-preview.tsx's withCompanionParticle (와/과), just the 이/가 pair here. */
function withSubjectParticle(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${word}가`
  const hasBatchim = (code - 0xac00) % 28 !== 0
  return `${word}${hasBatchim ? '이' : '가'}`
}

/**
 * Reveal's own "birth" moment — a brand-new Statling is always exactly
 * Lv.1 with 0 intimacyExp (see hooks/use-pet-care.ts's initial state /
 * lib/pet-care/leveling.ts's applyExpGain), so this never needs to read any
 * real per-user state; the numbers shown here ARE the real starting values
 * every visitor's actual Home HUD (PetCareHud) will show the instant they
 * arrive, not a mocked-up "example."
 */
const STARTING_LEVEL = 1
const STARTING_EXP = 0
const EXP_TO_NEXT = expRequiredForLevel(STARTING_LEVEL)

interface NextJourneyPreviewProps {
  petProfile: PetProfile
}

/**
 * "Reveal is not the end" fix. Full history of earlier iterations (a text-
 * explainer GamePanel with 3-step chips, then a bare-stack rewrite with a
 * pill-style XP bar, then a hierarchy rebalance) is in git log for this
 * file — kept only the essentials of that reasoning here:
 *
 * v6 (this pass) — everything below StatlingHero (speech bubble / XP card /
 * caption / 3-step menu) used to be 4 separate free-floating elements
 * between the Hero card and the CharacterTraits GamePanel, which read as
 * scattered rather than one system. Now it's ONE section, using the exact
 * same `GamePanel` "RPG status window" container CharacterTraits/
 * CompatibleEnvironment/StatDistribution/StatlingCompatibility below it
 * already use — so "내 Statling 키우기" reads as a peer section of the
 * result page, not a separate free-floating callout:
 * - A small (60px, within the 50-70px range this was asked to stay under
 *   StatlingHero's 220px portrait) `AssetImage` of the SAME petProfile.imageSrc
 *   Hero already rendered — no new art, no implication the character's
 *   appearance itself changes with level.
 * - PetSpeechBubble (shared component, untouched design language; only its
 *   own `className` prop is used to size it down) sits directly above that
 *   small portrait, in its own column, so it reads as "this specific
 *   character talking" without absolute positioning tricks that would be
 *   fragile at narrow widths.
 * - Name + Lv./XP/bar/next-level line sit in a flexible column next to the
 *   portrait — this is still the same growth data as before (nothing about
 *   XP/level calculation changes), just laid out beside the character
 *   instead of as its own separate block.
 * - The "함께할수록…" caption and the 3-step wayfinding line are unchanged
 *   in wording/relative styling from the previous pass, just now inside
 *   this one card instead of sitting in the bare page flow.
 *
 * v7 — two more changes, position/copy only, none of the internal layout
 * above: (1) reveal-screen.tsx now renders this AFTER
 * StatlingCompatibility(궁합), directly above the CTA row, instead of right
 * under StatlingHero — see that file's own comment at the new call site for
 * the reading-order reasoning; (2) the GamePanel label changed from the
 * static "내 Statling 키우기" to `${petProfile.name}의 성장`, since that
 * exact phrase is now also this card's neighboring CTA button's label —
 * having both on one screen read as a duplicate.
 *
 * v8 — the 3-step wayfinding line (게임하기 〉 스탯 키우기 〉 Statling
 * 돌보기) is now REMOVED, not just restyled: once
 * content-unlock-preview.tsx started showing a full 2x3 grid of these same
 * destinations (미니게임/꾸미기/랭킹/음악/스탯/돌보기) right above this
 * card, repeating 3 of the same 6 here read as duplicated information. This
 * card's job narrows to just "활동하면 XP가 쌓이고 {이름}이 성장한다" —
 * the growth-state HUD, not a second feature list. The closing caption
 * names the pet directly (withSubjectParticle above) instead of the
 * generic "레벨이 올라가요" so the growth being described is unambiguously
 * THIS Statling's, matching that same specificity already used by
 * content-unlock-preview.tsx's own closing line and the CTA button below.
 */
export function NextJourneyPreview({ petProfile }: NextJourneyPreviewProps) {
  return (
    // Title reuses petProfile.name (the species catalog name — same value
    // shown in StatlingHero/the small portrait below, and the same
    // "no custom nickname yet at Reveal time" reasoning save-screen.tsx's
    // own petLabel already uses), not a hardcoded character — renamed from
    // "내 Statling 키우기" specifically because the CTA button right below
    // this card now carries that exact label; keeping both would duplicate
    // the same words twice in one screen.
    <GamePanel icon={<span aria-hidden="true">✨</span>} label={`${petProfile.name}의 성장`}>
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <PetSpeechBubble text="안녕! 이제부터 잘 부탁해요!" className="max-w-28 px-2 py-1 text-[10px]" />
          <AssetImage src={petProfile.imageSrc} alt={petProfile.name} size={60} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-foreground">{petProfile.name}</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-display text-lg font-extrabold text-foreground">{formatLevelLabel(STARTING_LEVEL)}</span>
            <span className="shrink-0 font-display text-xs font-bold text-muted-foreground">
              XP {STARTING_EXP} / {EXP_TO_NEXT}
            </span>
          </div>
          <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              role="progressbar"
              aria-label="Statling Lv. 진행도"
              aria-valuemin={0}
              aria-valuemax={EXP_TO_NEXT}
              aria-valuenow={STARTING_EXP}
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, (STARTING_EXP / EXP_TO_NEXT) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] font-semibold text-muted-foreground">다음 레벨까지 {EXP_TO_NEXT} XP</p>
        </div>
      </div>

      <p className="mt-3 flex items-center justify-center gap-1 text-sm font-bold text-foreground">
        <Sparkles size={14} strokeWidth={2.6} className="text-primary" aria-hidden="true" />
        함께할수록 XP가 쌓이고 {withSubjectParticle(petProfile.name)} 성장해요!
      </p>
    </GamePanel>
  )
}
