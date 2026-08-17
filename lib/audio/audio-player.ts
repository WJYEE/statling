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
  /** Per-element unlock outcome (see unlock() below) — index-aligned with `elements`. An element only ever reads `true` once its own play() promise has actually resolved inside a real gesture; a still-`false` element gets retried on the NEXT unlock() call instead of being treated as permanently lost. */
  private elementUnlocked: boolean[] = []

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
      this.elementUnlocked = new Array(this.elements.length).fill(false)
    } catch {
      // Audio() unavailable (non-browser env) — play() below no-ops safely.
    }
  }

  setVolume(volume: number): void {
    for (const el of this.elements) el.volume = volume
  }

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

  /**
   * Mobile Safari/Chrome only allow an <audio> element to play once it has
   * been play()'d inside a real user-gesture call stack. Muting before
   * play() (and restoring the original muted state after) is what actually
   * keeps this silent — pausing alone still let a real chorus of blips
   * through on some mobile in-app browsers (e.g. KakaoTalk's WebView),
   * because el.play() can render a frame of audible audio before the
   * pause() in the .then() callback lands. Every pooled element across every
   * sound gets unlocked here in one pass (see AudioManager.unlock), so
   * without muting this was the "several SFX auto-play on first mobile
   * touch" bug.
   *
   * Per-element outcome is tracked (`elementUnlocked`) rather than assumed —
   * some mobile WebViews only honor a limited number of play() activations
   * within one gesture's call stack, so a handful of elements (often near
   * the end of AudioManager's ~30-element unlock loop) can silently fail
   * here even though the manager-level call "succeeded." Already-unlocked
   * elements are skipped (cheap no-op) so this stays safe to call again and
   * again — AudioProvider's gesture listener does exactly that on every
   * subsequent tap, not just the first — and any element that failed simply
   * gets another real gesture to try again on, instead of staying broken
   * for the rest of the session.
   */
  unlock(): void {
    this.preload()
    for (let i = 0; i < this.elements.length; i += 1) {
      if (this.elementUnlocked[i]) continue
      const el = this.elements[i]
      try {
        const wasMuted = el.muted
        el.muted = true
        const restore = (succeeded: boolean) => {
          el.pause()
          el.currentTime = 0
          el.muted = wasMuted
          if (succeeded) this.elementUnlocked[i] = true
        }
        const playResult = el.play()
        if (playResult && typeof playResult.then === 'function') {
          playResult.then(() => restore(true)).catch(() => restore(false))
        } else {
          restore(true)
        }
      } catch {
        // ignore — leaves elementUnlocked[i] false, retried on the next unlock() call
      }
    }
  }
}
