import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import statlingLogo from '@/public/assets/statling/logo/ChatGPT_tight.png'

/**
 * Every share-card PNG (Character Reveal's result card, MyPage's
 * friend-invite card, ...) is captured at this literal pixel size — a 4:5
 * vertical ratio that reads well both as an Instagram feed post and a
 * mobile share-sheet preview. Shared here so every card variant stays the
 * same shape without each one re-declaring the numbers.
 */
export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

interface ShareCardHiddenProps {
  children: ReactNode
  className?: string
}

/**
 * The off-screen capture target every share card variant renders inside —
 * see the original StatlingShareCard doc comment (still accurate) for why
 * this exact opacity/aria-hidden/inert/pointer-events-none combination on
 * the OUTER wrapper (never the ref'd node itself) is required for
 * html-to-image to capture a real, non-blank PNG.
 */
export const ShareCardHidden = forwardRef<HTMLDivElement, ShareCardHiddenProps>(function ShareCardHidden(
  { children, className },
  ref,
) {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none fixed left-0 top-0 -z-50 opacity-0"
      style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
    >
      <div
        ref={ref}
        className={cn('flex h-full w-full flex-col items-center bg-background px-20 py-20 text-center', className)}
      >
        {children}
      </div>
    </div>
  )
})

/**
 * Shared top-of-card brand mark, reused by every card variant so they read
 * as one Statling design system. `title`, if given, is a pill directly
 * under the wordmark (e.g. a result headline).
 *
 * Phase 3C-1: uses the same official logo asset as the real, on-screen
 * `Logo` component (components/brain-bet/logo.tsx) — a plain `<img src=...>`
 * rather than next/image's `<Image>`, matching every other image already
 * inside a ShareCardHidden capture target (see StatlingShareCard/
 * StatlingFriendCard's pet images) since html-to-image needs a plain,
 * already-resolved <img> src to rasterize reliably. Previously a generic
 * Lucide `<Egg>` icon in a colored chip — visibly different from the real
 * logo shown one screen before (RevealScreen's own `<Logo>`) and one screen
 * after (the share landing page's `<Logo>`).
 */
export function ShareCardHeader({ title }: { title?: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-5">
        <img src={statlingLogo.src} alt="" width={80} height={80} className="h-20 w-20 object-contain" />
        <span className="font-display text-5xl font-extrabold text-foreground">Statling</span>
      </div>
      {title && (
        <span className="rounded-full bg-accent px-8 py-3.5 font-display text-2xl font-bold text-accent-foreground toy-border toy-shadow-sm">
          {title}
        </span>
      )}
    </div>
  )
}

/**
 * Shared bottom-of-card closing line, reused by every card variant.
 * Phase 3C-2 Follow-up: wrapped in a highlighted chip (not just plain text)
 * per the spec's "지금보다 조금 더 눈에 띄게" — still one short message, never
 * a CTA-button-styled banner.
 * Phase 3C-2 Follow-up 2: an optional small subtitle line under the main
 * message (e.g. "N가지 미니게임으로 나만의 Statling을 만나보세요.") — sized to
 * stay legible after a real SNS/메신저 downscale, never a speech bubble.
 */
export function ShareCardFooter({ message, subtitle }: { message: string; subtitle?: string }) {
  return (
    <div className="w-full rounded-2xl bg-accent/60 px-5 py-3.5 toy-border">
      <p className="whitespace-pre-line text-pretty text-center font-display text-2xl font-extrabold leading-snug text-foreground">
        {message}
      </p>
      {subtitle && (
        <p className="mt-2 text-pretty text-center text-base font-bold text-foreground/70">{subtitle}</p>
      )}
    </div>
  )
}

interface ShareCardHeroProps {
  imageSrc: string
  /** The Statling's own name — big, front and center. */
  name: string
  /**
   * Phase 3C-2 — the user's *currently equipped* Room background (see
   * lib/room/room-storage.ts#loadSavedRoomState + lib/room-assets.ts#ROOM_ASSETS),
   * framed behind the character so the card doesn't read as "character
   * floating on blank card". Deliberately just the flat background image,
   * not the full interactive RoomCanvas (equipped furniture, per-item
   * layering, @container-relative positioning, drag handles) — that system
   * is built for live interaction, not a static html-to-image capture, and
   * reusing it here would be a much larger, riskier integration for a
   * decorative-only element. Optional/best-effort: a caller that can't
   * resolve one (or passes null) still gets a plain rounded box behind the
   * character, never a broken image.
   */
  roomBackgroundSrc?: string | null
}

/**
 * Phase 3C-2 — the shared "hero" block every share card variant centers on:
 * just the user's actual Statling (character, in its own room-framed
 * stage, + name). Separate from ShareCardTypeLine/ShareCardTag/
 * ShareCardCompatGroup below, which each card variant composes underneath
 * this in whatever order fits its own content (see StatlingShareCard/
 * StatlingFriendCard) — this component only owns the character itself
 * staying the clear visual majority of the card.
 *
 * Phase 3C-2 Follow-up: the room frame + character are both noticeably
 * bigger (320px frame / 260px character, up from 288px / 224px), and the
 * type badge pill that used to sit under the name is gone entirely (see
 * StatlingShareCard/StatlingFriendCard's own doc comments — the type data
 * itself is untouched, this UI just no longer shows it here since it
 * overlapped with coreTrait/TOP STATS below).
 */
export function ShareCardHero({ imageSrc, name, roomBackgroundSrc }: ShareCardHeroProps) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative flex h-80 w-80 items-center justify-center overflow-hidden rounded-[2rem] bg-secondary toy-border">
        {roomBackgroundSrc && (
          <img src={roomBackgroundSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div
          className="absolute rounded-full bg-black/15 blur-[3px]"
          style={{ width: '40%', height: '8%', bottom: '12%' }}
          aria-hidden="true"
        />
        <img src={imageSrc} alt="" width={260} height={260} className="relative h-65 w-65 object-contain" />
      </div>
      <p className="font-display text-4xl font-extrabold text-foreground">{name}</p>
    </div>
  )
}

/** The quoted one-line "type description" — Reveal passes buildCoreTraitSummary's real output, MyPage passes STATLING_TYPES[topStat].personality; see each card's own doc comment for why they differ. Never newly authored per-card copy. */
export function ShareCardTypeLine({ text }: { text: string }) {
  return (
    <p className="max-w-sm text-pretty text-balance text-center font-display text-2xl font-bold leading-snug text-foreground">
      &ldquo;{text}&rdquo;
    </p>
  )
}

/** Small uppercase section caption (e.g. "TOP STATS") — consistent typography across every card section without each one re-declaring the classes. Phase 3C-2 Follow-up 2: text-sm -> text-base (readability pass). */
export function ShareCardSectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-base font-extrabold uppercase tracking-wide text-muted-foreground">{children}</p>
}

/** One small pill (e.g. a TOP STATS ability). Phase 3C-2 Follow-up 2: text-sm -> text-lg (readability pass — TOP STATS was explicitly called out). */
export function ShareCardTag({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-lg font-bold text-foreground toy-border">
      {icon}
      {label}
    </span>
  )
}

/**
 * Side-by-side "나의 강점" / "나의 약점" pair (Phase 3C-2 Follow-up —
 * previously strength-only). Either half renders independently so a missing
 * weakness (or strength) never breaks the layout. Text is real, verbatim
 * lib/stats/stat-insights.ts copy — line-clamped, never rewritten/truncated
 * content, only a max-lines CSS safety net against an unusually long
 * sentence.
 * Phase 3C-2 Follow-up 2: label text-xs -> text-sm, body text-sm -> text-base
 * (readability pass — explicitly called out as "강점/약점 설명").
 */
export function ShareCardTraitPair({ strength, weakness }: { strength?: string; weakness?: string }) {
  if (!strength && !weakness) return null
  return (
    <div className="grid w-full grid-cols-2 gap-3">
      {strength && (
        <div className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-2.5 toy-border">
          <span className="text-sm font-extrabold text-foreground">✨ 나의 강점</span>
          <p className="line-clamp-3 text-pretty text-base font-bold leading-snug text-muted-foreground">{strength}</p>
        </div>
      )}
      {weakness && (
        <div className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-2.5 toy-border">
          <span className="text-sm font-extrabold text-foreground">🌱 나의 약점</span>
          <p className="line-clamp-3 text-pretty text-base font-bold leading-snug text-muted-foreground">{weakness}</p>
        </div>
      )}
    </div>
  )
}

export interface ShareCardCompatItem {
  characterName: string
  characterImageSrc: string
  /** Short existing compatibility blurb (lib/pets/compatibility.ts's GOOD_MATCH_BLURB/DIFFERENT_RHYTHM_BLURB, via lib/stats/stat-compatibility-copy.ts's `reason` field) — never newly authored. */
  reason?: string
}

/**
 * One compatibility group (e.g. "💕 잘 맞는 Statling" with its real 2
 * entries) — reused as-is by both cards, never recomputing which Statlings
 * are shown (see lib/pets/compatibility.ts/lib/stats/stat-compatibility-copy.ts,
 * the same data the on-screen StatlingCompatibility panel already uses).
 * Phase 3C-2 Follow-up: shows both of the 2 real entries that data always
 * returns (previously only `[0]`).
 *
 * Phase 3C-2 Follow-up 2: 1 row x 2 columns -> 2 rows x 1 column, each row a
 * horizontal [image | name+reason] layout — the portrait shrinks (52px ->
 * 40px) so the name (text-sm -> text-xl) and reason (text-[11px] ->
 * text-base) can both read clearly after a real SNS/메신저 downscale, per the
 * readability spec. Same 2 real entries either way, only the layout changed.
 */
export function ShareCardCompatGroup({ label, items }: { label: string; items: ShareCardCompatItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-2xl bg-card px-4 py-2.5 toy-border">
      <span className="text-sm font-extrabold text-foreground">{label}</span>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div key={item.characterName} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>, same html-to-image-safe pattern as every other image in this capture target */}
            <img src={item.characterImageSrc} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
            <div className="min-w-0 flex-1 text-left">
              <p className="font-display text-xl font-extrabold text-foreground">{item.characterName}</p>
              {item.reason && (
                <p className="line-clamp-2 text-pretty text-base leading-snug text-muted-foreground">{item.reason}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One "service feature" card (e.g. "🎮 12가지 미니게임" / "🌱 함께 성장하는
 * 친구") — Phase 3C-2 Follow-up: replaces the old tiny ShareCardTag pill for
 * this specific role, sized to actually read as a small feature card (icon +
 * title + one short line), per the spec's "이전보다 확실히 크게" — but still
 * capped to 2 side by side, always smaller/quieter than ShareCardHero.
 * Phase 3C-2 Follow-up 2: title text-sm -> text-base, description text-xs ->
 * text-sm (readability pass — explicitly called out as "하단 feature 설명").
 */
export function ShareCardFeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-card px-3 py-2.5 text-center toy-border">
      <span aria-hidden="true">{icon}</span>
      <span className="font-display text-base font-extrabold text-foreground">{title}</span>
      <span className="text-pretty text-sm leading-snug text-muted-foreground">{description}</span>
    </div>
  )
}
