import { ALL_SOUND_NAMES, SFX_CONFIG } from '@/lib/audio/audio-config'
import { SoundPlayer } from '@/lib/audio/audio-player'
import { ALL_BGM_TRACK_IDS, BGM_TRACK_MAP, DEFAULT_BGM_VOLUME, MAIN_THEME_TRACK_ID } from '@/lib/audio/bgm-config'
import type { BgmTrackId } from '@/lib/audio/bgm-config'
import { BgmPlayer } from '@/lib/audio/bgm-player'
import { loadBgmSettings, saveBgmSettings } from '@/lib/audio/bgm-settings-storage'
import { ALL_CHARACTER_VOICE_SRCS, characterVoiceSrc } from '@/lib/audio/character-voice'
import type { BgmMode, BgmSettings, SoundName } from '@/lib/audio/types'

/** Shared by every character voice line — see AudioManager.playCharacterVoice. Not per-character (only the src differs), so one flat config covers all of them, including future additions to character-voice.ts. */
const CHARACTER_VOICE_VOLUME = 0.4
const CHARACTER_VOICE_MIN_INTERVAL_MS = 500

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * App-wide SFX manager — a plain singleton (not a React hook/context) so it
 * can be preloaded, muted, or played from anywhere (including outside React,
 * e.g. a future imperative call from a non-component module) without
 * threading state through the component tree. hooks/use-sound.ts is a thin
 * wrapper over this for the "usual" component call site.
 *
 * Playback state (muted, last-played-at, unlocked) intentionally lives here
 * and not in React state — sounds are fire-and-forget side effects, never
 * something a component re-renders in response to.
 */
class AudioManager {
  private players = new Map<SoundName, SoundPlayer>()
  private lastPlayedAt = new Map<SoundName, number>()
  /** Keyed by resolved src (not SoundName) — character voice lines aren't a fixed enum, so they get their own small pool instead of a SFX_CONFIG entry each. See playCharacterVoice. */
  private voicePlayers = new Map<string, SoundPlayer>()
  private voiceLastPlayedAt = new Map<string, number>()
  private muted = false
  /**
   * Independent of `muted` — forced true for the whole Intro flow (Landing
   * through Naming, see game-flow.tsx's isIntroPhase) regardless of the
   * player's persisted SFX preference, so Intro is always silent even for a
   * returning player who already turned sound on in Room. Kept as a
   * separate flag rather than folded into `muted` so the two can never race:
   * AudioProvider applies the persisted `muted` setting once on mount while
   * game-flow.tsx toggles `introLocked` on every phase change — combining
   * them into one flag would make the outcome depend on which effect runs
   * last.
   */
  private introLocked = false
  private unlocked = false
  private preloaded = false

  private bgmPlayer = new BgmPlayer()
  private bgmInitialized = false
  private bgmVolume = DEFAULT_BGM_VOLUME
  private currentBgmTrackId: BgmTrackId | null = null
  /** Materialized play order for sequential/shuffle — rebuilt whenever mode or the selected-track subset changes. */
  private bgmRotation: BgmTrackId[] = []
  private bgmRotationIndex = 0
  /**
   * Hardcoded fallback, not `loadBgmSettings()` — reading localStorage here
   * would run at module-import time (this class is instantiated once at
   * import), before AudioProvider ever mounts. Real persisted settings are
   * loaded in initBgm(), called from AudioProvider the same way
   * preloadAll()/setMuted() are.
   */
  private bgmSettings: BgmSettings = {
    enabled: false,
    mode: 'repeat-one',
    repeatTrackId: MAIN_THEME_TRACK_ID,
    selectedTrackIds: [...ALL_BGM_TRACK_IDS],
    lastTrackId: null,
  }

  private getPlayer(name: SoundName): SoundPlayer {
    let player = this.players.get(name)
    if (!player) {
      player = new SoundPlayer(SFX_CONFIG[name])
      this.players.set(name, player)
    }
    return player
  }

  private getVoicePlayer(src: string): SoundPlayer {
    let player = this.voicePlayers.get(src)
    if (!player) {
      player = new SoundPlayer({ src, volume: CHARACTER_VOICE_VOLUME, minIntervalMs: CHARACTER_VOICE_MIN_INTERVAL_MS, maxConcurrent: 1 })
      this.voicePlayers.set(src, player)
    }
    return player
  }

  /** Creates (but does not play) every pooled <audio> element up front, so the first real play() has zero network/decode delay. */
  preloadAll(): void {
    if (this.preloaded || typeof window === 'undefined') return
    this.preloaded = true
    for (const name of ALL_SOUND_NAMES) {
      this.getPlayer(name).preload()
    }
    for (const src of ALL_CHARACTER_VOICE_SRCS) {
      this.getVoicePlayer(src).preload()
    }
  }

  play(name: SoundName): void {
    if (this.muted || this.introLocked || typeof window === 'undefined') return
    try {
      const config = SFX_CONFIG[name]
      const minInterval = config.minIntervalMs ?? 0
      if (minInterval > 0) {
        const last = this.lastPlayedAt.get(name) ?? 0
        const now = performance.now()
        if (now - last < minInterval) return
        this.lastPlayedAt.set(name, now)
      }
      this.getPlayer(name).play()
    } catch {
      // A missing/broken sound must never interrupt the caller's flow.
    }
  }

  /**
   * Character voice line for whichever interaction just happened (feed/pet/
   * level-up/...) — see lib/audio/character-voice.ts for how `petId` resolves
   * to a file, and hooks/use-pet-care.ts / room-screen.tsx for the current
   * call sites. Same muted/introLocked gate and missing-file safety as
   * play(); dedup is per-file (`src`), not per-character, so rapid presses
   * on the same pet never overlap regardless of which line is playing.
   */
  playCharacterVoice(petId: string | null | undefined): void {
    if (this.muted || this.introLocked || typeof window === 'undefined') return
    try {
      const src = characterVoiceSrc(petId)
      const last = this.voiceLastPlayedAt.get(src) ?? 0
      const now = performance.now()
      if (now - last < CHARACTER_VOICE_MIN_INTERVAL_MS) return
      this.voiceLastPlayedAt.set(src, now)
      this.getVoicePlayer(src).play()
    } catch {
      // A missing/broken voice clip must never interrupt the caller's flow.
    }
  }

  stop(name: SoundName): void {
    this.players.get(name)?.stop()
  }

  stopAll(): void {
    for (const player of this.players.values()) player.stop()
    for (const player of this.voicePlayers.values()) player.stop()
  }

  setVolume(name: SoundName, volume: number): void {
    this.getPlayer(name).setVolume(volume)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.stopAll()
  }

  isMuted(): boolean {
    return this.muted
  }

  /** See `introLocked` field doc above. Locking stops whatever's already playing, same as setMuted(true). */
  setIntroLocked(locked: boolean): void {
    this.introLocked = locked
    if (locked) this.stopAll()
  }

  /**
   * Mobile Safari (and Chrome autoplay policy generally) refuses to play
   * *any* <audio> until a real user gesture has reached the page — playing
   * one muted, zero-volume-safe tick here on the very first pointerdown
   * "unlocks" the pooled elements for every sound played afterward. Safe to
   * call repeatedly; only the first call after a fresh load does anything.
   */
  unlock(): void {
    if (this.unlocked || typeof window === 'undefined') return
    this.unlocked = true
    for (const name of ALL_SOUND_NAMES) {
      this.getPlayer(name).unlock()
    }
    for (const src of ALL_CHARACTER_VOICE_SRCS) {
      this.getVoicePlayer(src).unlock()
    }
  }

  /**
   * BGM is deliberately NOT gated by `muted`/`introLocked` — those encode an
   * SFX-only product decision (SFX defaults off until opt-in, forced silent
   * for the whole Intro). BGM defaults off the same way (see
   * bgm-settings-storage.ts) but is tracked through its own
   * `bgmSettings.enabled` flag, so the two systems can never fight over one
   * boolean.
   *
   * Called once from AudioProvider on mount, same spot as preloadAll(). Not
   * called from any screen/minigame — see game-flow.tsx comment banning
   * per-screen BGM calls; this is the only start point plus the mode/track
   * setters below (driven by MyPageScreen) and the internal ended-driven
   * advanceBgm().
   */
  initBgm(): void {
    if (this.bgmInitialized || typeof window === 'undefined') return
    this.bgmInitialized = true
    this.bgmSettings = loadBgmSettings()
    this.bgmPlayer.onEnded(() => this.advanceBgm())
    this.bgmPlayer.setVolume(this.bgmVolume)
    this.rebuildBgmRotation()

    const startId =
      this.bgmSettings.mode === 'repeat-one' ? this.bgmSettings.repeatTrackId : this.resolveResumeTrackId()
    this.loadBgmTrack(startId)
  }

  /** Mirrors SoundPlayer/AudioManager's SFX unlock() — the same first-gesture listener in AudioProvider calls both. */
  unlockBgm(): void {
    if (!this.bgmInitialized || !this.bgmSettings.enabled) return
    this.bgmPlayer.play()
  }

  isBgmEnabled(): boolean {
    return this.bgmSettings.enabled
  }

  setBgmEnabled(enabled: boolean): void {
    this.bgmSettings.enabled = enabled
    this.persistBgmSettings()
    if (!this.bgmInitialized) {
      if (enabled) this.initBgm()
      return
    }
    if (enabled) {
      this.bgmPlayer.play()
    } else {
      this.bgmPlayer.pause()
    }
  }

  getBgmMode(): BgmMode {
    return this.bgmSettings.mode
  }

  setBgmMode(mode: BgmMode): void {
    if (this.bgmSettings.mode === mode) return
    this.bgmSettings.mode = mode
    this.persistBgmSettings()
    this.rebuildBgmRotation()
    this.syncBgmTrackToSettings()
  }

  getBgmRepeatTrackId(): BgmTrackId {
    return this.bgmSettings.repeatTrackId
  }

  setBgmRepeatTrack(id: BgmTrackId): void {
    if (!BGM_TRACK_MAP.has(id)) return
    this.bgmSettings.repeatTrackId = id
    this.persistBgmSettings()
    if (this.bgmSettings.mode === 'repeat-one') this.loadBgmTrack(id)
  }

  getBgmSelectedTrackIds(): BgmTrackId[] {
    return [...this.bgmSettings.selectedTrackIds]
  }

  /** The "선택곡" subset sequential/shuffle rotate through — falls back to all 31 tracks if the caller clears the selection entirely. */
  setBgmSelectedTrackIds(ids: BgmTrackId[]): void {
    const filtered = ids.filter((id) => BGM_TRACK_MAP.has(id))
    this.bgmSettings.selectedTrackIds = filtered.length > 0 ? filtered : [...ALL_BGM_TRACK_IDS]
    this.persistBgmSettings()
    if (this.bgmSettings.mode !== 'repeat-one') {
      this.rebuildBgmRotation()
      this.syncBgmTrackToSettings()
    }
  }

  getCurrentBgmTrackId(): BgmTrackId | null {
    return this.currentBgmTrackId
  }

  /** Manual "next" for the settings UI. No-op in repeat-one — there's only the one chosen track. */
  skipBgm(): void {
    if (!this.bgmInitialized || this.bgmSettings.mode === 'repeat-one') return
    this.advanceBgm()
  }

  setBgmVolume(volume: number): void {
    this.bgmVolume = volume
    this.bgmPlayer.setVolume(volume)
  }

  private persistBgmSettings(): void {
    saveBgmSettings(this.bgmSettings)
  }

  private rebuildBgmRotation(): void {
    const ids = this.bgmSettings.selectedTrackIds.length > 0 ? this.bgmSettings.selectedTrackIds : ALL_BGM_TRACK_IDS
    this.bgmRotation = this.bgmSettings.mode === 'shuffle' ? shuffle(ids) : [...ids]
    const idx = this.currentBgmTrackId ? this.bgmRotation.indexOf(this.currentBgmTrackId) : -1
    this.bgmRotationIndex = idx >= 0 ? idx : 0
  }

  private resolveResumeTrackId(): BgmTrackId {
    const saved = this.bgmSettings.lastTrackId
    const idx = saved ? this.bgmRotation.indexOf(saved) : -1
    this.bgmRotationIndex = idx >= 0 ? idx : 0
    return this.bgmRotation[this.bgmRotationIndex] ?? MAIN_THEME_TRACK_ID
  }

  /** Only switches tracks if the mode change actually implies a different one — avoids an audible restart when e.g. the current track is already in the newly-selected subset. */
  private syncBgmTrackToSettings(): void {
    const targetId =
      this.bgmSettings.mode === 'repeat-one' ? this.bgmSettings.repeatTrackId : this.bgmRotation[this.bgmRotationIndex]
    if (!targetId) return
    this.bgmPlayer.setLoop(this.bgmSettings.mode === 'repeat-one')
    if (targetId === this.currentBgmTrackId) return
    this.loadBgmTrack(targetId)
  }

  private loadBgmTrack(id: BgmTrackId): void {
    const track = BGM_TRACK_MAP.get(id)
    if (!track) return
    this.currentBgmTrackId = id
    this.bgmSettings.lastTrackId = id
    this.persistBgmSettings()
    this.bgmPlayer.setLoop(this.bgmSettings.mode === 'repeat-one')
    this.bgmPlayer.load(track.src)
    if (this.bgmSettings.enabled) this.bgmPlayer.play()
  }

  /**
   * `<audio>`'s native `loop` already handles repeat-one, so this only ever
   * fires for sequential/shuffle — advancing via the real `ended` event
   * (never a timer/estimated duration, per spec) so it can't drift or fire
   * early on a track with unusual trailing silence.
   */
  private advanceBgm(): void {
    if (this.bgmSettings.mode === 'repeat-one') return
    if (this.bgmRotation.length === 0) this.rebuildBgmRotation()
    if (this.bgmRotation.length === 0) return
    this.bgmRotationIndex = (this.bgmRotationIndex + 1) % this.bgmRotation.length
    const nextId = this.bgmRotation[this.bgmRotationIndex]
    if (nextId) this.loadBgmTrack(nextId)
  }
}

export const audioManager = new AudioManager()
