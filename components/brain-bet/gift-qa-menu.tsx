'use client'

interface GiftQaMenuProps {
  /** Ascending — see lib/deco-supported-assets.ts's LEVEL_GIFT_LEVELS. */
  levels: number[]
  /** Forces that level's gift to open — see hooks/use-pet-care.ts#debugTriggerGift. */
  onTrigger: (level: number) => void
}

/**
 * Dev/QA only — forces any single level's Statling Decoration gift open on
 * demand, so its full PNG/banner/click-claim/inventory-unlock/reward-toast
 * chain can be checked without grinding real intimacy XP up to that level.
 * `onTrigger` only ever sets PetCareState.giftReadyLevel (never
 * intimacyLevel/intimacyExp) — claiming afterward runs the exact same
 * production `claimGift` a real level-up gift would. Mirrors
 * qa-skip-menu.tsx's `<details>` dropdown pattern/styling exactly; kept as
 * its own sibling component (rather than folded into QaSkipMenu) since that
 * one lives in game-flow.tsx, outside usePetCare's owner (RoomScreen).
 * Rendered only when room-screen.tsx's SHOW_GIFT_QA is on — never shown in
 * a normal production build.
 */
export function GiftQaMenu({ levels, onTrigger }: GiftQaMenuProps) {
  return (
    <details className="fixed left-3 top-3 z-50 select-none">
      <summary
        className="cursor-pointer list-none rounded-full bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground toy-border"
        title="개발용: 레벨 Gift를 강제로 발생시켜 테스트합니다 (실제 레벨/XP는 변경되지 않음)"
      >
        Gift · QA
      </summary>
      <div className="mt-1 flex max-h-[80vh] w-28 flex-col gap-0.5 overflow-y-auto rounded-xl bg-card p-1.5 toy-border toy-shadow">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onTrigger(level)}
            className="rounded-lg px-2 py-1 text-left text-[11px] font-semibold text-foreground hover:bg-secondary"
          >
            Lv.{level} Gift
          </button>
        ))}
      </div>
    </details>
  )
}
