'use client'

import { useEffect, useState } from 'react'
import { useSound } from '@/hooks/use-sound'

interface GameCountdownProps {
  /** Whole seconds to count down from, e.g. 3. */
  seconds: number
  onDone: () => void
  label?: string
}

/**
 * `countdown-whole.mp3` (see lib/audio/audio-config.ts) is a single
 * pre-mixed clip covering the entire 3-2-1-go countdown — its real,
 * measured duration is 2760ms (`ffprobe`), not the 3000ms a naive
 * "1 second per digit" clock assumes. 2026-08 QA 보정: that 240ms gap meant
 * the digits' own timer always outlasted the audio, so the "go" accent (and
 * `onDone` — which starts the real timer/input/spawn logic, since it's the
 * one thing every caller hangs actual gameplay-start off of) fired while "1"
 * was still on screen, roughly "반 박자 빠르게" as reported. Deriving each
 * digit's on-screen duration from the actual clip length instead — rather
 * than adding an artificial extra beat — keeps 3/2/1 uniform (per digit,
 * still equal durations, just correctly calibrated) AND lands the
 * remaining-hits-0 → onDone transition exactly when the audio's "go" accent
 * actually completes, so sound and gameplay-start stay in lockstep by
 * construction.
 */
const COUNTDOWN_AUDIO_DURATION_MS = 2760

/** Shared 3-2-1 countdown shown before a new game's real timer starts. */
export function GameCountdown({ seconds, onDone, label }: GameCountdownProps) {
  const [remaining, setRemaining] = useState(seconds)
  const { play } = useSound()
  const tickMs = COUNTDOWN_AUDIO_DURATION_MS / seconds

  // One pre-mixed clip (3 ticks + "go" accent, see lib/audio/audio-config.ts)
  // covers the whole countdown — played once when it starts, not per tick.
  useEffect(() => {
    play('countdown-whole')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once when the countdown starts
  }, [])

  useEffect(() => {
    if (remaining <= 0) {
      onDone()
      return
    }
    const timer = window.setTimeout(() => setRemaining((n) => n - 1), tickMs)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDone is fired exactly once when remaining hits 0, not on every parent render; tickMs is derived from the stable `seconds` prop
  }, [remaining])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
      {label && <p className="font-display text-base font-bold text-muted-foreground">{label}</p>}
      <p
        key={remaining}
        className="animate-pop-in font-display text-6xl font-extrabold text-primary"
        aria-live="assertive"
      >
        {remaining > 0 ? remaining : '시작!'}
      </p>
    </div>
  )
}
