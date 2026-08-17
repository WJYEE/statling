'use client'

import { useEffect } from 'react'
import { audioManager } from '@/lib/audio/audio-manager'
import { loadSfxEnabled } from '@/lib/audio/audio-settings-storage'
import type { SoundName } from '@/lib/audio/types'

const UNLOCK_EVENTS: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown']

/**
 * Mounted once in app/layout.tsx (same spot as AppToastProvider). It sits
 * above game-flow.tsx's phase-switching tree and never remounts on in-app
 * navigation, which is exactly what BGM relies on to survive screen changes
 * and minigames uninterrupted. Four jobs:
 *
 * 1. Preload every SFX and apply the persisted SFX ON/OFF preference, so the
 *    first real play() call has no load delay and respects a prior mute.
 * 2. Start BGM (audioManager.initBgm()) — attempts to play immediately;
 *    desktop browsers with a permissive autoplay policy may actually start
 *    it right here.
 * 3. Unlock <audio> playback on every real user gesture — required by
 *    mobile Safari/Chrome autoplay policy (spec §10). Deliberately NOT a
 *    once-only listener: some mobile WebViews only honor a limited number
 *    of play() activations within one gesture's call stack, so a handful of
 *    the ~30 pooled elements can silently fail to unlock on the very first
 *    tap (see SoundPlayer.unlock's doc comment) — a persistent listener
 *    gives any still-locked element another real shot on every later tap
 *    instead of leaving it broken for the rest of the session. Cheap once
 *    everything's actually unlocked, since AudioManager.unlock()/unlockBgm()
 *    both skip elements already confirmed. Same listener resumes BGM if
 *    step 2 got blocked, so a player never has to press "play".
 * 4. A single delegated click listener that plays 'click' for any plain
 *    button the app doesn't otherwise give a specific sound to. This is what
 *    makes "일반 버튼 → click.mp3" work for the app's
 *    ~40 one-off `<button>` elements without editing every one of them:
 *      - add `data-sfx="some-other-sound"` to a button to override which
 *        sound it plays
 *      - add `data-sfx-skip` to a button that already calls play(...)
 *        itself (e.g. a care action button), so it doesn't double-fire
 *
 * Renders no DOM of its own — purely a side-effect wrapper around children,
 * matching AppToastProvider's "just wrap children" shape.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    audioManager.setMuted(!loadSfxEnabled())
    audioManager.preloadAll()
    audioManager.initBgm()

    function unlock() {
      audioManager.unlock()
      audioManager.unlockBgm()
    }
    for (const eventName of UNLOCK_EVENTS) {
      document.addEventListener(eventName, unlock, { passive: true })
    }

    function handleDelegatedClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const trigger = target.closest<HTMLElement>('button, [role="button"]')
      if (!trigger) return
      if (trigger.hasAttribute('data-sfx-skip')) return
      if ((trigger as HTMLButtonElement).disabled) return

      const explicitSound = trigger.getAttribute('data-sfx') as SoundName | null
      audioManager.play(explicitSound ?? 'click')
    }
    document.addEventListener('click', handleDelegatedClick)

    return () => {
      for (const eventName of UNLOCK_EVENTS) {
        document.removeEventListener(eventName, unlock)
      }
      document.removeEventListener('click', handleDelegatedClick)
    }
  }, [])

  return <>{children}</>
}
