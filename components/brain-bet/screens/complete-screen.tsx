'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, PartyPopper, Repeat, RotateCcw, Trophy } from 'lucide-react'
import { AssetImage } from '@/components/brain-bet/asset-image'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { RadarChart } from '@/components/brain-bet/radar-chart'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { ToyButton } from '@/components/brain-bet/toy-button'
import { useSound } from '@/hooks/use-sound'
import { PLAY_ORDER, STATS, TOTAL_GAMES, type RawRecord, type StatId } from '@/lib/brain-bet'
import { EGG_STAGE_MESSAGE } from '@/lib/egg-growth'
import { cn } from '@/lib/utils'

/** Egg size (px) when nested at the radar chart's center — small on purpose, the chart is the focal point now. */
const CENTER_EGG_SIZE = 56

/**
 * Art for the egg nested at the radar's center — deliberately separate from
 * lib/egg-assets.ts's EGG_HATCH_SEQUENCE (drives EggImage/egg-image.tsx,
 * which is what the Character Reveal hatch animation on EggScreen uses).
 * That sequence is 0-6 (an uncracked "stage 0" before any game is played,
 * never reached here — CompleteScreen only exists after at least 1 game is
 * done) and must stay untouched. This one is exactly the 6 files the design
 * asked for, 1:1 with eggStage (1/6 -> stage01.png ... 6/6 -> stage06.png).
 */
const RADAR_EGG_STAGE_SRC: Record<number, string> = {
  1: '/assets/statling/eggs/hatch-sequence/stage01.png',
  2: '/assets/statling/eggs/hatch-sequence/stage02.png',
  3: '/assets/statling/eggs/hatch-sequence/stage03.png',
  4: '/assets/statling/eggs/hatch-sequence/stage04.png',
  5: '/assets/statling/eggs/hatch-sequence/stage05.png',
  6: '/assets/statling/eggs/hatch-sequence/stage06.png',
}

interface CompleteScreenProps {
  statId: StatId
  /** zero-based index of the game just finished */
  index: number
  /** this round's real 0-100 gameScore — the headline number (see game-flow.tsx, lib/scoring/*) */
  gameScore: number
  /** display raw record for this round (formatted per-game, see lib/scoring/*) — shown as a small parenthetical under the score, never as the headline */
  raw: RawRecord
  /**
   * The running 0-100 value per stat as of this round, same shape/values as
   * the `finals` state in game-flow.tsx — every stat completed so far
   * (including this one) already holds its real gameScore, every stat not
   * yet played is still 0. Fed straight into the radar chart below so it
   * accumulates one axis per game and lands on exactly the same numbers MY
   * STATUS shows once all 6 are done.
   */
  finals: Record<StatId, number>
  /** current Personal Best gameScore, if one exists and differs from this round's */
  personalBestScore?: number | null
  /** whether this round's result is now the Personal Best */
  isNewRecord?: boolean
  /** "다음: {stat}" — advances to the next game. Never called on the last (6th) result screen; that screen shows onMeetStatling/onReplay instead (see isLast below). */
  onNext: () => void
  /**
   * Primary CTA on the last (6th) result screen only — this screen now
   * doubles as the final result page (MY STATUS's own screen was removed
   * from this flow), so it borrows just MY STATUS's two actions rather than
   * any of its other UI. Starts the hatch flow.
   */
  onMeetStatling: () => void
  /** Secondary CTA on the last (6th) result screen only — restarts the 6-game Intro from game 1. */
  onReplay: () => void
  /**
   * Whether this stat still has its 1 single-game retry unused (see
   * game-flow.tsx's retryAvailable/handleRetryCurrentGame) — shows/hides
   * "한 번 더 해보기" below. Always determined purely by "has this stat's
   * retry been used yet", never by this round's score — every player sees
   * the same offer regardless of how well they did.
   */
  canRetry: boolean
  /**
   * "한 번 더 해보기" — replays just this one game, at most once. Deliberately
   * a distinct action/icon from onReplay's "다시 하기" (restarts all 6 games)
   * so the two are never visually or functionally confused.
   */
  onRetry: () => void
}

export function CompleteScreen({
  statId,
  index,
  gameScore,
  raw,
  finals,
  personalBestScore,
  isNewRecord,
  onNext,
  onMeetStatling,
  onReplay,
  canRetry,
  onRetry,
}: CompleteScreenProps) {
  const stat = STATS[statId]
  const isLast = index === TOTAL_GAMES - 1
  const nextStat = isLast ? null : STATS[PLAY_ORDER[index + 1]]
  /** How many of the 6 First Play games are done as of this screen — doubles as the Egg's growth stage. */
  const eggStage = index + 1
  /** Stats discovered so far, in play order, through and including this round — drives the radar chart's progressive reveal. */
  const revealedStats = PLAY_ORDER.slice(0, index + 1)
  const { play } = useSound()

  /**
   * The center-egg's motion has two phases: a one-shot "reveal" shake (this
   * stat just got measured — see animate-egg-reveal-shake(-strong) below),
   * then an infinite idle breathing loop once that settles. `false` on every
   * mount (GameFlow remounts this screen fresh each round via stepKey, so
   * there's no stale state to reset here) and flipped by the shake's own
   * onAnimationEnd — never a timer, so it can't drift out of sync with
   * whatever duration the CSS actually ends up using.
   */
  const [eggSettled, setEggSettled] = useState(false)

  useEffect(() => {
    play('final-result')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once per mount (GameFlow remounts this screen fresh each round via stepKey)
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center px-5 py-10 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground toy-border toy-shadow-sm">
        <PartyPopper size={14} strokeWidth={2.6} />
        {stat.name} 발견
      </span>

      <div className="relative mt-6">
        <StatBadge stat={stat} size="lg" />
        <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground toy-border">
          <Check size={14} strokeWidth={3.5} />
        </span>
      </div>

      <h1 className="mt-5 max-w-md font-display text-3xl font-extrabold leading-tight text-foreground">
        좋아요!
        <br />
        <span className="text-primary">{stat.name}</span>을 발견했어요.
      </h1>

      {/* this round's gameScore — the headline number; raw detail (개수/정확도) is a small parenthetical below it, never the other way around */}
      <div className="mt-6 w-full max-w-md rounded-2xl bg-card px-6 py-5 toy-border toy-shadow">
        <div className="flex items-center justify-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            이번 점수
          </p>
          {isNewRecord && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              <Trophy size={10} strokeWidth={3} />
              NEW RECORD
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-4xl font-extrabold leading-none text-foreground">
          {gameScore}
          <span className="text-lg">점</span>
        </p>
        <div className="mt-2 flex flex-col items-center gap-0.5">
          <p className="text-xs font-semibold text-muted-foreground">{raw.primary}</p>
          {raw.secondary && <p className="text-xs font-semibold text-muted-foreground">{raw.secondary}</p>}
        </div>

        {personalBestScore != null && !isNewRecord && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              개인 최고
            </p>
            <p className="mt-1 font-display text-lg font-extrabold text-foreground">
              {personalBestScore}점
            </p>
          </div>
        )}
      </div>

      {/* accumulated stat radar with the growing egg nested at its center.
          The radar reuses the same `finals` values MY STATUS shows later,
          revealing one axis per completed game (see revealedStats above);
          the egg gives a very light one-shot glow + shake each time a new
          axis fills in, then settles into a barely-there idle breathing loop
          (see eggSettled above) so it never sits completely still — instead
          of the old per-stage glow/ring/sparkle set, which was tuned for a
          much larger egg off to the side and would overwhelm this smaller,
          centered one. */}
      <div className="mt-6 flex w-full max-w-md flex-col items-center gap-2 rounded-2xl bg-card px-6 py-6 toy-border toy-shadow-sm sm:max-w-lg sm:px-8">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">누적 스탯</p>
        <RadarChart
          values={finals}
          revealedStats={revealedStats}
          newlyRevealedStat={statId}
          compact
          centerSlot={
            <div
              key={eggStage}
              className={cn(
                'relative',
                eggSettled
                  ? eggStage >= 4
                    ? 'animate-egg-breathe-restless'
                    : 'animate-egg-breathe'
                  : isLast
                    ? 'animate-egg-reveal-shake-strong'
                    : 'animate-egg-reveal-shake',
              )}
              style={{ width: CENTER_EGG_SIZE, height: CENTER_EGG_SIZE }}
              onAnimationEnd={(e) => {
                // Ignore the shimmer <span>'s own animationend bubbling up —
                // only this div's reveal-shake finishing should flip the phase.
                if (e.target === e.currentTarget) setEggSettled(true)
              }}
            >
              <span
                className="animate-egg-subtle-shimmer pointer-events-none absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 14px 5px var(--accent)' }}
                aria-hidden="true"
              />
              <AssetImage
                src={RADAR_EGG_STAGE_SRC[eggStage] ?? RADAR_EGG_STAGE_SRC[TOTAL_GAMES]}
                alt={`알 성장 단계 ${eggStage}`}
                size={CENTER_EGG_SIZE}
              />
            </div>
          }
        />
        <p className="mt-2 text-pretty text-sm font-bold text-foreground">{EGG_STAGE_MESSAGE[eggStage]}</p>
        <p className="text-xs font-semibold text-muted-foreground">알 성장 {eggStage}/{TOTAL_GAMES}</p>
      </div>

      {/* overall progress */}
      <div className="mt-6 flex w-full max-w-md flex-col items-center gap-2">
        <ProgressTrack current={index + 1} />
      </div>

      {/* Secondary "재도전" CTA — offered identically to every player
          regardless of this round's score (never hidden just because the
          score was low), at most once per stat. Deliberately its own block
          with its own icon (Repeat), never merged into or styled like
          onReplay's "다시 하기" below (a full 6-game restart) so the two
          can't be confused for one another. */}
      {canRetry && (
        <div className="mt-5 flex w-full max-w-md flex-col items-center gap-1.5">
          <ToyButton className="w-full" variant="secondary" onClick={onRetry}>
            <Repeat size={18} strokeWidth={2.6} />
            한 번 더 해보기
          </ToyButton>
          <p className="text-[11px] font-semibold text-muted-foreground">재도전은 1회만 가능해요</p>
        </div>
      )}

      {/* continue CTA — the last (6th) result screen is now the final result
          page (MY STATUS's own screen no longer appears in this flow), so it
          shows MY STATUS's two actions instead of "다음"; every earlier
          screen keeps the single "다음" CTA unchanged. */}
      {isLast ? (
        <div className="mt-4 flex w-full max-w-md flex-col items-center justify-center gap-3 sm:max-w-lg sm:flex-row">
          <ToyButton className="w-full sm:w-auto" onClick={onMeetStatling}>
            나의 Statling 만나러 가기
            <ArrowRight size={20} strokeWidth={2.8} />
          </ToyButton>
          <ToyButton className="w-full sm:w-auto" variant="secondary" onClick={onReplay}>
            <RotateCcw size={20} strokeWidth={2.6} />
            다시 하기
          </ToyButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="group mt-4 inline-flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 font-display text-lg font-extrabold text-primary-foreground toy-border toy-shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          다음: {nextStat?.name}
          <ArrowRight
            size={20}
            strokeWidth={2.8}
            className="transition-transform duration-150 group-hover:translate-x-1"
          />
        </button>
      )}
    </div>
  )
}
