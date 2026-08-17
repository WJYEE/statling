import type { SoundConfig, SoundName } from '@/lib/audio/types'

const SFX_BASE_PATH = '/assets/statling/audio/sfx_fix'
/** Newer asset pass — separate folder, separate filename convention (no shared prefix with sfx_fix), so the two sets are kept in their own path constants rather than one shared sfxSrc(). */
const ARCHIEVE_SFX_BASE_PATH = '/assets/statling/audio/sfx_archieve'

function sfxSrc(name: SoundName): string {
  return `${SFX_BASE_PATH}/${name}.mp3`
}

function archieveSfxSrc(fileName: string): string {
  return `${ARCHIEVE_SFX_BASE_PATH}/${fileName}.mp3`
}

/**
 * Starting volumes match public/assets/statling/audio/sfx_fix/readme's "볼륨
 * 기준" table 1:1 — tune per-sound here as real mixed assets come in, no
 * call site ever hardcodes a volume.
 *
 * minIntervalMs/maxConcurrent encode spec §3 (dedup/overlap rules):
 * - ui-click-soft: dropped if retriggered within 70ms (spec: 50~80ms)
 * - countdown-whole: one baked-in clip covering the entire 3-2-1-go
 *   countdown (countdown-intro's 3 ticks immediately followed by
 *   countdown-final's "go" accent, pre-mixed — see sfx_fix/countdown-whole.mp3)
 *   — no longer used by game-countdown.tsx (2026-08 QA 3차: its baked-in
 *   internal timing couldn't be made to match a uniform on-screen 3-2-1
 *   beat), kept registered in case anything else ever wants the old
 *   single-clip behavior.
 * - countdown-tick / countdown-final: game-countdown.tsx's replacement —
 *   countdown-tick.mp3 (transcoded from the pre-existing sfx_fix/
 *   countdown-tick.wav, itself a 3-beat clip with audible ticks starting at
 *   ~0/993/1993ms — i.e. already an even ~1s cadence) plays once at mount,
 *   and countdown-final.mp3 (the dedicated "go" accent this readme's own
 *   §5 always intended for this exact moment) fires exactly when the 4th,
 *   code-timed beat (1000ms after "1") arrives — see game-countdown.tsx.
 */
export const SFX_CONFIG: Record<SoundName, SoundConfig> = {
  'ui-click-soft': { src: sfxSrc('ui-click-soft'), volume: 0.25, minIntervalMs: 70, maxConcurrent: 2 },
  'ui-confirm': { src: sfxSrc('ui-confirm'), volume: 0.35, minIntervalMs: 80, maxConcurrent: 1 },
  'ui-back': { src: sfxSrc('ui-back'), volume: 0.25, minIntervalMs: 80, maxConcurrent: 1 },
  'modal-open': { src: sfxSrc('modal-open'), volume: 0.3, minIntervalMs: 100, maxConcurrent: 1 },
  'countdown-whole': { src: sfxSrc('countdown-whole'), volume: 0.4, minIntervalMs: 500, maxConcurrent: 1 },
  'countdown-tick': { src: sfxSrc('countdown-tick'), volume: 0.4, minIntervalMs: 500, maxConcurrent: 1 },
  'countdown-final': { src: sfxSrc('countdown-final'), volume: 0.45, minIntervalMs: 300, maxConcurrent: 1 },
  'game-start': { src: sfxSrc('game-start'), volume: 0.45, minIntervalMs: 200, maxConcurrent: 1 },
  'answer-correct': { src: sfxSrc('answer-correct'), volume: 0.35, minIntervalMs: 60, maxConcurrent: 3 },
  'answer-wrong-soft': { src: sfxSrc('answer-wrong-soft'), volume: 0.3, minIntervalMs: 60, maxConcurrent: 3 },
  'game-complete': { src: sfxSrc('game-complete'), volume: 0.5, minIntervalMs: 300, maxConcurrent: 1 },
  'pet-care-pop': { src: sfxSrc('pet-care-pop'), volume: 0.35, minIntervalMs: 100, maxConcurrent: 2 },
  'pet-level-up': { src: sfxSrc('pet-level-up'), volume: 0.55, minIntervalMs: 300, maxConcurrent: 1 },
  'pet-feed': { src: sfxSrc('pet-feed'), volume: 0.35, minIntervalMs: 150, maxConcurrent: 1 },
  'pet-wash': { src: sfxSrc('pet-wash'), volume: 0.35, minIntervalMs: 150, maxConcurrent: 1 },
  'pet-play': { src: sfxSrc('pet-play'), volume: 0.35, minIntervalMs: 150, maxConcurrent: 1 },
  'pet-reveal': { src: sfxSrc('pet-reveal'), volume: 0.55, minIntervalMs: 300, maxConcurrent: 1 },

  // ---- sfx_archieve set ----
  /** Global delegated click default (see audio-provider.tsx) — same dedup window as the sfx_fix sound it replaces as the default (ui-click-soft), which stays defined/available above if ever needed again. */
  click: { src: archieveSfxSrc('click'), volume: 0.25, minIntervalMs: 70, maxConcurrent: 2 },
  /** 저장 / 테마 적용 / 꾸미기 저장 / 이름 확정 / 기타 '확정' 동작. */
  confirm: { src: archieveSfxSrc('confirm'), volume: 0.35, minIntervalMs: 80, maxConcurrent: 1 },
  /** 각 미니게임 종료 후 결과 화면이 나타날 때. */
  'final-result': { src: archieveSfxSrc('final-result'), volume: 0.5, minIntervalMs: 300, maxConcurrent: 1 },
  /** 레벨업 시. */
  'level-up': { src: archieveSfxSrc('level-up'), volume: 0.55, minIntervalMs: 300, maxConcurrent: 1 },
  /** 미니게임 오답 시 — same generous overlap allowance as answer-correct, since a fast-paced game can legitimately rack up several near-simultaneous misses. */
  wrong: { src: archieveSfxSrc('wrong'), volume: 0.3, minIntervalMs: 60, maxConcurrent: 3 },
  /** 업적 달성 시 — registered and ready to call (play('achievement')), but no achievement/mission system exists yet to call it from (mission-screen.tsx is still Coming Soon) — see character-voice.ts's doc comment for the same "ready, not yet wired" shape. */
  achievement: { src: archieveSfxSrc('achievement'), volume: 0.5, minIntervalMs: 300, maxConcurrent: 1 },
}

export const ALL_SOUND_NAMES = Object.keys(SFX_CONFIG) as SoundName[]
