const VOICE_BASE_PATH = '/assets/statling/audio/sfx_archieve'

/**
 * Only these 5 characters have a dedicated voice clip today — every other
 * roster id (see lib/character-state-assets.ts's CHARACTER_ROSTER, 30 total)
 * falls back to the shared `statling2.mp3` line. Adding a 6th+ dedicated
 * voice later is exactly one more id here, nothing else in the audio system
 * changes.
 *
 * The voice file is always named `${petProfile.id}.mp3` — ids match each
 * character's real on-disk folder name 1:1 (see lib/pets/pet-profile.ts's
 * CHARACTER_DEFS), so no separate id-to-filename alias table is needed.
 */
const CURATED_VOICE_IDS = new Set(['01_치즈털실냥이', '02_플로봇', '03_잎사귀양', '04_상처도치', '05_알삐약이'])

const FALLBACK_VOICE_FILE = 'statling2'

/** Resolved path for every voice file this module can ever return — used to preload/unlock them all up front (see AudioManager.preloadAll/unlock), same as the fixed SoundName set. */
export const ALL_CHARACTER_VOICE_SRCS: string[] = [...CURATED_VOICE_IDS, FALLBACK_VOICE_FILE].map(
  (fileName) => `${VOICE_BASE_PATH}/${fileName}.mp3`,
)

/** `petProfile.id` (e.g. '01_치즈털실냥이') -> its voice clip's public path, falling back to the shared line for any of the other 25 roster characters or when there's no confirmed pet yet. */
export function characterVoiceSrc(petId: string | null | undefined): string {
  const fileName = petId && CURATED_VOICE_IDS.has(petId) ? petId : FALLBACK_VOICE_FILE
  return `${VOICE_BASE_PATH}/${fileName}.mp3`
}
