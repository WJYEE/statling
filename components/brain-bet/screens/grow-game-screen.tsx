'use client'

import { useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { STATS, type StatId } from '@/lib/brain-bet'
import { GAME_DIFFICULTIES, GAME_DIFFICULTY_ORDER, type GameDifficulty } from '@/lib/game/difficulty'
import { isDifficultyUnlocked, unlockedBadgeFor, unlockHintFor, unlockProgressPercent } from '@/lib/game/difficulty-unlock'
import { GAME_POOL } from '@/lib/game/game-registry'
import { getCurrentSeasonRecordAtDifficulty, loadPlayerSkillState } from '@/lib/game/player-skill-storage'
import { cn } from '@/lib/utils'

interface GrowGameScreenProps {
  statId: StatId
  onSelect: (gameKey: string, difficulty: GameDifficulty) => void
  onBack: () => void
  /** Set when arriving here via a mini-game's own back button (see game-flow.tsx#exitFreePlayGame) — seeds this screen straight to that game's difficulty view instead of its game-list step. Undefined on a fresh entry from GrowScreen. */
  initialGameKey?: string
}

/**
 * Free Play step 2 — after picking a stat in GrowScreen, pick which of that
 * stat's registered games to play, then which of its 4 difficulty tiers
 * (spec §17). Both pool entries are always shown; there is no auto-pick or
 * repeat-avoidance here, since the player is choosing directly (see
 * lib/game/game-registry.ts#getClassicGameKey for First Play's separate
 * always-Normal path). Hard/Extreme show locked — with a plain-language
 * unlock hint and a progress bar/percent, never the internal
 * normalizedScore/threshold itself (players only ever see their own raw
 * records) — until this exact game's own best score at the tier below
 * clears the bar, at which point the card switches to a "Hard 해금!"/
 * "Extreme 해금!" badge and its own real raw-record best (once one exists)
 * — same as Easy/Normal, which are always unlocked and always show their
 * raw record. See lib/game/difficulty-unlock.ts.
 */
export function GrowGameScreen({ statId, onSelect, onBack, initialGameKey }: GrowGameScreenProps) {
  const stat = STATS[statId]
  const pool = GAME_POOL[statId]
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(initialGameKey ?? null)
  const skill = loadPlayerSkillState()

  if (selectedGameKey) {
    const game = pool.find((g) => g.key === selectedGameKey)
    if (!game) {
      setSelectedGameKey(null)
      return null
    }

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-10 pt-8">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedGameKey(null)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card toy-border"
            aria-label="뒤로 가기"
          >
            <ArrowLeft size={18} strokeWidth={2.4} />
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{game.name}</p>
            <h1 className="font-display text-xl font-extrabold text-foreground">난이도를 골라보세요</h1>
          </div>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {GAME_DIFFICULTY_ORDER.map((difficulty) => {
            const def = GAME_DIFFICULTIES[difficulty]
            const unlocked = isDifficultyUnlocked(skill, game.key, difficulty)
            // Current-season only (2026-08 후속 보정) — a record set under a
            // now-superseded difficulty/scoring rework reads as "아직 기록이
            // 없어요" here, same as never having played this tier. Unlock
            // status itself is untouched (isDifficultyUnlocked above reads
            // the unfiltered record) — a ranking-season bump never re-locks
            // a tier the player already unlocked.
            const record = getCurrentSeasonRecordAtDifficulty(skill, game.key, difficulty)
            const unlockedBadge = unlocked ? unlockedBadgeFor(difficulty) : null
            const progressPercent = unlocked ? null : unlockProgressPercent(skill, game.key, difficulty)

            return (
              <button
                key={difficulty}
                type="button"
                disabled={!unlocked}
                onClick={() => onSelect(game.key, difficulty)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-2xl bg-card px-5 py-5 text-left toy-border transition-transform',
                  unlocked ? 'hover:-translate-y-0.5 active:translate-y-0.5' : 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="flex items-center gap-1.5 font-display text-lg font-extrabold text-foreground">
                  {def.label}
                  {!unlocked && <Lock size={14} strokeWidth={2.6} />}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{def.hint}</span>

                {unlockedBadge && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                    {unlockedBadge}
                  </span>
                )}

                {/* record.raw only — the player's own actual measured record (ms/accuracy/time), never the internal normalizedScore composite it maps to. The locked-tier hint below (unlockHintFor) does state the config threshold itself, since that's the real bar to clear. */}
                {unlocked ? (
                  record?.raw ? (
                    <div className="text-xs font-semibold leading-snug text-foreground">
                      <p>최고 기록: {record.raw.primary}</p>
                      {record.raw.secondary && <p className="text-muted-foreground">{record.raw.secondary}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">아직 기록이 없어요.</p>
                  )
                ) : (
                  <div className="w-full">
                    {/* leading-snug (not the default leading-normal) so a wrapped 2-line
                        unlock hint (now stating the real "Normal에서 70점 이상..." threshold,
                        longer than the old vague copy) keeps its own lines close without
                        crowding the def.hint/badge above it — the `gap-2` on the button
                        already provides that separation. */}
                    <p className="text-xs font-bold leading-snug text-primary">{unlockHintFor(difficulty)}</p>
                    {progressPercent !== null && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground">{progressPercent}%</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-10 pt-8">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card toy-border"
          aria-label="뒤로 가기"
        >
          <ArrowLeft size={18} strokeWidth={2.4} />
        </button>
        <div className="flex items-center gap-2.5">
          <StatBadge stat={stat} size="sm" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{stat.name}</p>
            <h1 className="font-display text-xl font-extrabold text-foreground">플레이할 게임을 골라보세요</h1>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {pool.map((game) => (
          <button
            key={game.key}
            type="button"
            onClick={() => setSelectedGameKey(game.key)}
            className="flex flex-col items-start gap-1.5 rounded-2xl bg-card px-5 py-5 text-left toy-border transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
          >
            <span className="font-display text-lg font-extrabold text-foreground">{game.name}</span>
            <span className="text-xs text-muted-foreground">예상 소요 시간 약 {game.estimatedSeconds}초</span>
          </button>
        ))}
      </div>
    </div>
  )
}
