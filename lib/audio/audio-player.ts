import type { SoundConfig } from '@/lib/audio/types'

/**
 * One pooled, reusable set of <audio> elements for a single sound. Playing
 * never does `new Audio()` per call (perf requirement in the spec) — it
 * round-robins across `maxConcurrent` pre-created elements so a sound can be
 * retriggered before its previous instance finishes without either cutting
 * it off or allocating anything.
 *
 * All failures (missing file, decode error, autoplay block) are swallowed —
 * a sound that can't play must never throw or break the calling screen.
 */
export class SoundPlayer {
  private elements: HTMLAudioElement[] = []
  private nextIndex = 0
  private loaded = false

  constructor(private readonly config: SoundConfig) {}

  preload(): void {
    if (this.loaded || typeof window === 'undefined') return
    this.loaded = true
    const count = Math.max(1, this.config.maxConcurrent ?? 1)
    try {
      for (let i = 0; i < count; i += 1) {
        const el = new Audio()
        el.src = this.config.src
        el.preload = 'auto'
        el.volume = this.config.volume
        this.elements.push(el)
      }
    } catch {
      // Audio() unavailable (non-browser env) — play() below no-ops safely.
    }
  }

  setVolume(volume: number): void {
    for (const el of this.elements) el.volume = volume
  }

  /**
   * No separate "unlock" pass exists anymore (see the removed `unlock()`
   * method this file used to have — see git history if that reasoning is
   * ever needed again). Every play() call here IS the real, intended sound
   * for whatever just happened, called directly. When triggered from inside
   * a real user gesture's own call stack (a click handler, most SFX in this
   * app), the browser's autoplay policy treats it as gesture-activated on
   * its own — no priming needed. When triggered from a non-gesture context
   * (e.g. a setTimeout-driven reaction), it plays fine as long as the page
   * has had *any* prior gesture this session (the policy is per-document,
   * not per-element — see AudioProvider's doc comment); if the very first
   * sound of the session happens to fire before any gesture at all, the
   * rejected promise below is silently swallowed and simply doesn't play —
   * correct behavior, not a bug, since nothing should play before the
   * player has touched the page. Nothing here needs to remember "did this
   * element unlock before" — the next real trigger just tries again fresh.
   */
  play(): void {
    if (typeof window === 'undefined') return
    this.preload()
    if (this.elements.length === 0) return

    const el = this.elements[this.nextIndex]
    this.nextIndex = (this.nextIndex + 1) % this.elements.length
    try {
      el.currentTime = 0
      // play() returns a Promise that rejects if the browser blocks
      // autoplay before any user gesture — silently ignored, never surfaced.
      void el.play()?.catch(() => {})
    } catch {
      // Some mobile browsers throw synchronously instead of rejecting.
    }
  }

  stop(): void {
    for (const el of this.elements) {
      try {
        el.pause()
        el.currentTime = 0
      } catch {
        // ignore
      }
    }
  }
}
