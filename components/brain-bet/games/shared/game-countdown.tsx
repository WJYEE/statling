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
 * 2026-08 QA 3차 보정: the previous fix derived each digit's on-screen
 * duration from `countdown-whole.mp3`'s total measured length (2760ms),
 * which fixed the MATH but not the actual feel — QA still heard the "go"
 * beep land early. Root cause: matching a fixed clip's TOTAL duration only
 * guarantees the last digit's remaining-hits-0 transition and the clip's
 * end coincide — it says nothing about whether the 3 digits were shown for
 * genuinely EQUAL beats along the way (a pre-mixed clip's internal tick
 * spacing is whatever the audio designer baked in, not necessarily uniform,
 * and definitely not guaranteed to match a "duration / 3" calculation).
 *
 * Dropped `countdown-whole` for this component entirely. Now uses a fixed,
 * code-owned BEAT_MS for every digit transition (3→2→1→go, all exactly
 * BEAT_MS apart — see the requested rhythm), and switched to two separate,
 * already-existing assets instead of one baked clip:
 * - `countdown-tick` (transcoded from the pre-existing sfx_fix/
 *   countdown-tick.wav — verified via `ffprobe`/`silencedetect` to contain 3
 *   audible ticks starting at ~0ms/993ms/1993ms, i.e. already an even ~1s
 *   cadence) plays once at mount, one tick landing under each digit almost
 *   exactly on beat.
 * - `countdown-final` (the dedicated "go" accent this project's own SFX
 *   spec always intended for this exact moment — public/assets/statling/
 *   audio/sfx_fix/readme's "카운트다운 틱" section) fires at the 4th beat,
 *   in the SAME synchronous call as `onDone()` — so "마지막 삑" and
 *   "실제 게임 시작" are literally one event, never two.
 * No new audio was generated — both are existing project assets.
 */
const BEAT_MS = 1000

/** Shared 3-2-1 countdown shown before a new game's real timer starts. */
export function GameCountdown({ seconds, onDone, label }: GameCountdownProps) {
  const [remaining, setRemaining] = useState(seconds)
  const { play } = useSound()

  // The 3-tick clip covers the whole 3→2→1 run — played once when it
  // starts, not per digit (see the module doc comment for why its internal
  // spacing already lines up with BEAT_MS).
  useEffect(() => {
    play('countdown-tick')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once when the countdown starts
  }, [])

  useEffect(() => {
    if (remaining <= 0) {
      play('countdown-final')
      onDone()
      return
    }
    const timer = window.setTimeout(() => setRemaining((n) => n - 1), BEAT_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDone/play fire exactly once when remaining hits 0, not on every parent render
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
