'use client'

import { useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { STATS, type StatId } from '@/lib/brain-bet'
import { GAME_DIFFICULTIES, GAME_DIFFICULTY_ORDER, type GameDifficulty } from '@/lib/game/difficulty'
import { isDifficultyUnlocked, unlockHintFor } from '@/lib/game/difficulty-unlock'
import { GAME_POOL } from '@/lib/game/game-registry'
import { loadPlayerSkillState } from '@/lib/game/player-skill-storage'
import { cn } from '@/lib/utils'

interface GrowGameScreenProps {
  statId: StatId
  onSelect: (gameKey: string, difficulty: GameDifficulty) => void
  onBack: () => void
}

/**
 * Free Play step 2 — after picking a stat in GrowScreen, pick which of that
 * stat's registered games to play, then which of its 4 difficulty tiers
 * (spec §17). Both pool entries are always shown; there is no auto-pick or
 * repeat-avoidance here, since the player is choosing directly (see
 * lib/game/game-registry.ts#getClassicGameKey for First Play's separate
 * always-Normal path). Hard/Extreme show locked (with the score needed to
 * unlock) until this exact game's own best score at the tier below clears
 * the bar — see lib/game/difficulty-unlock.ts.
 */
export function GrowGameScreen({ statId, onSelect, onBack }: GrowGameScreenProps) {
  const stat = STATS[statId]
  const pool = GAME_POOL[statId]
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(null)
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
            return (
              <button
                key={difficulty}
                type="button"
                disabled={!unlocked}
                onClick={() => onSelect(game.key, difficulty)}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-2xl bg-card px-5 py-5 text-left toy-border transition-transform',
                  unlocked ? 'hover:-translate-y-0.5 active:translate-y-0.5' : 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="flex items-center gap-1.5 font-display text-lg font-extrabold text-foreground">
                  {def.label}
                  {!unlocked && <Lock size={14} strokeWidth={2.6} />}
                </span>
                <span className="text-xs text-muted-foreground">{def.hint}</span>
                {!unlocked && (
                  <span className="text-xs font-bold text-primary">{unlockHintFor(difficulty)}</span>
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
