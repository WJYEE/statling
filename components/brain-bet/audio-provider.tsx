'use client'

import { useEffect } from 'react'
import { audioManager } from '@/lib/audio/audio-manager'
import { loadSfxEnabled } from '@/lib/audio/audio-settings-storage'
import type { SoundName } from '@/lib/audio/types'

const BGM_UNLOCK_EVENTS: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown']

/**
 * Mounted once in app/layout.tsx (same spot as AppToastProvider). It sits
 * above game-flow.tsx's phase-switching tree and never remounts on in-app
 * navigation, which is exactly what BGM relies on to survive screen changes
 * and minigames uninterrupted. Four jobs:
 *
 * 1. Preload every SFX and apply the persisted SFX ON/OFF preference, so the
 *    first real play() call has no load delay and respects a prior mute.
 *    Preloading only ever creates the <audio> elements and sets `.src` — it
 *    never calls play(), so this has no autoplay-policy interaction at all.
 * 2. Start BGM (audioManager.initBgm()) — attempts to play immediately;
 *    desktop browsers with a permissive autoplay policy may actually start
 *    it right here.
 * 3. Retry BGM playback on a real user gesture if step 2 got blocked (see
 *    AudioManager.unlockBgm's own doc comment for why BGM alone still needs
 *    this — it's the one thing that must start playing for real the instant
 *    a gesture makes that possible, unlike SFX below). SFX deliberately has
 *    NO equivalent listener here anymore (2026-08 QA 5차): batch-priming
 *    ~30 pooled SFX/voice elements with play() on every gesture — even
 *    muted-then-paused — was itself what let a handful of audio frames leak
 *    through on some mobile WebViews the instant the page was touched.
 *    SoundPlayer.play() is safe to call completely unprimed: called from
 *    inside a real gesture (any click — see handleDelegatedClick below, or
 *    any care-action button), the browser treats that call itself as
 *    gesture-activated; called from a non-gesture context (e.g. a
 *    setTimeout-driven reaction) after the page has had any prior gesture
 *    this session, the per-document autoplay policy already allows it; and
 *    if it's ever rejected, the promise is already silently swallowed (see
 *    SoundPlayer.play()) — nothing to "retry" because nothing was ever
 *    primed in the first place, the next real trigger just tries fresh.
 * 4. A single delegated click listener that plays 'click' for any plain
 *    button the app doesn't otherwise give a specific sound to. This is what
 *    makes "일반 버튼 → click.mp3" work for the app's
 *    ~40 one-off `<button>` elements without editing every one of them:
 *      - add `data-sfx="some-other-sound"` to a button to override which
 *        sound it plays
 *      - add `data-sfx-skip` to a button that already calls play(...)
 *        itself (e.g. a care action button), so it doesn't double-fire
 *    This handler's own `audioManager.play(...)` call is itself what makes
 *    every plain-button SFX gesture-activated — no separate unlock step.
 *
 * Renders no DOM of its own — purely a side-effect wrapper around children,
 * matching AppToastProvider's "just wrap children" shape.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    audioManager.setMuted(!loadSfxEnabled())
    audioManager.preloadAll()
    audioManager.initBgm()

    function unlockBgmOnGesture() {
      audioManager.unlockBgm()
    }
    for (const eventName of BGM_UNLOCK_EVENTS) {
      document.addEventListener(eventName, unlockBgmOnGesture, { passive: true })
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
      for (const eventName of BGM_UNLOCK_EVENTS) {
        document.removeEventListener(eventName, unlockBgmOnGesture)
      }
      document.removeEventListener('click', handleDelegatedClick)
    }
  }, [])

  return <>{children}</>
}
