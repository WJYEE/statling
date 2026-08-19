import type { ReactNode } from 'react'
import { HelpCircle, Save } from 'lucide-react'
import { Logo } from '@/components/brain-bet/logo'
import { ProgressTrack } from '@/components/brain-bet/progress-track'
import { StatBadge } from '@/components/brain-bet/stat-badge'
import { FreePlayBadge } from '@/components/brain-bet/games/shared/free-play-badge'
import type { StatDef } from '@/lib/brain-bet'
import { GAME_DIFFICULTY_DISPLAY_LABEL, type GameDifficulty } from '@/lib/game/difficulty'

interface GameHudProps {
  stat: StatDef
  gameName: string
  mode: 'first' | 'free'
  index: number
  difficulty: GameDifficulty
  /**
   * One short line always visible (spec §3: "게임 시작 전 짧은 한 줄 목표는 항상 표시 가능")
   * — e.g. "목표 색만 클릭하세요". Styled orange (the same persistent rule-reminder
   * look every other mini-game uses, see GameRuleReminder) so it doubles as the
   * in-play rule reminder, not just a pre-game blurb.
   */
  objective: string
  /** Right-aligned status chip content — a timer, round counter, or score-in-progress. */
  statusSlot?: ReactNode
  onHelp: () => void
  /** Free Play only (see FreePlayBadge) — Intro's `mode === 'first'` branch never reads this. */
  onBack: () => void
}

/**
 * Common header for every new mini-game — kept visually identical across
 * all 6 so they read as one game system rather than six different design
 * languages (spec §13). Mirrors the existing games' own header structure
 * (Logo + ProgressTrack/FREE PLAY, then a stat/title row) so the new games
 * don't feel like a bolt-on.
 */
export function GameHud({ stat, gameName, mode, index, difficulty, objective, statusSlot, onHelp, onBack }: GameHudProps) {
  return (
    <header className="flex flex-col gap-4">
      {mode === 'first' && (
        <div className="flex justify-end">
          {/* Every completed Intro game is already checkpointed by the time this screen shows (see game-flow.tsx's recordIntroCheckpoint) — a static reassurance badge, not a transient spinner. */}
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-secondary-foreground toy-border">
            <Save size={11} strokeWidth={2.6} />
            자동 저장 중
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" />
        {mode === 'first' ? <ProgressTrack current={index} /> : <FreePlayBadge onBack={onBack} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatBadge stat={stat} size="md" />
          <div>
            {/* Difficulty is a Free Play concept only — Assessment (mode 'first')
                always plays Normal with no tier choice, so showing "(Normal)" there
                would just be noise. See lib/game/difficulty.ts's GameDifficulty doc. */}
            {mode === 'free' && (
              <p className="text-xs font-bold text-muted-foreground">
                {stat.name} <span>({GAME_DIFFICULTY_DISPLAY_LABEL[difficulty]})</span>
              </p>
            )}
            <h1 className="font-display text-xl font-extrabold leading-none text-foreground">{gameName}</h1>
            <p className="mt-1 max-w-[14rem] text-pretty text-xs font-semibold text-primary">
              {objective}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {statusSlot}
          <button
            type="button"
            onClick={onHelp}
            aria-label={`${gameName} 게임 방법 보기`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-foreground toy-border toy-shadow-sm"
          >
            <HelpCircle size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
