import type { BgmTrackId } from '@/lib/audio/bgm-config'

/**
 * Every SFX name the app can play, keyed 1:1 to a file in
 * public/assets/statling/audio/sfx_fix/<name>.mp3 (see audio-config.ts).
 * Adding a new sound is: drop the mp3 in that folder, add one entry to
 * SoundName + SFX_CONFIG — nothing else in the audio system needs to change.
 */
export type SoundName =
  | 'ui-click-soft'
  | 'ui-confirm'
  | 'ui-back'
  | 'modal-open'
  | 'countdown-whole'
  | 'game-start'
  | 'answer-correct'
  | 'answer-wrong-soft'
  | 'game-complete'
  | 'pet-care-pop'
  | 'pet-level-up'
  | 'pet-feed'
  | 'pet-wash'
  | 'pet-play'
  | 'pet-reveal'
  // sfx_archieve set — newer asset pass layered on top of the sfx_fix set
  // above (which stays exactly as-is; nothing in it was removed). See
  // audio-config.ts's ARCHIEVE_SFX_BASE_PATH.
  | 'click'
  | 'confirm'
  | 'final-result'
  | 'level-up'
  | 'wrong'
  | 'achievement'

export interface SoundConfig {
  /** Public path, e.g. /assets/statling/audio/sfx_fix/ui-click-soft.mp3 */
  src: string
  /** 0~1 relative volume — see audio-config.ts for the starting values. */
  volume: number
  /**
   * Repeat calls within this window are dropped (spec §3, e.g. rapid clicks
   * on ui-click-soft). 0 = no dedup window.
   */
  minIntervalMs?: number
  /**
   * How many overlapping instances of this one sound may play at once
   * (spec §3, e.g. answer-correct capped at 3). Also doubles as the pooled
   * <audio> element count, so repeated triggers never wait on a previous
   * instance to finish before a new one can start.
   */
  maxConcurrent?: number
}

/** 단일 반복 / 선택곡 순차 재생 / 선택곡 랜덤 재생 — see lib/audio/audio-manager.ts. */
export type BgmMode = 'repeat-one' | 'sequential' | 'shuffle'

/**
 * Persisted BGM preference (see bgm-settings-storage.ts). `selectedTrackIds`
 * is the "선택곡" subset used by sequential/shuffle rotation — defaults to
 * all 31 tracks until the player narrows it down. `lastTrackId` lets a
 * reload resume roughly where playback left off instead of always
 * restarting the rotation from the top.
 */
export interface BgmSettings {
  enabled: boolean
  mode: BgmMode
  repeatTrackId: BgmTrackId
  selectedTrackIds: BgmTrackId[]
  lastTrackId: BgmTrackId | null
}
