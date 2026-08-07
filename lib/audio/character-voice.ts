const VOICE_BASE_PATH = '/assets/statling/audio/sfx_archieve'

/**
 * Only these 5 characters have a dedicated voice clip today — every other
 * roster id (see lib/character-state-assets.ts's CHARACTER_ROSTER, 30 total)
 * falls back to the shared `statling2.mp3` line. Adding a 6th+ dedicated
 * voice later is exactly one more entry here, nothing else in the audio
 * system changes.
 *
 * The file name is NOT always `${petProfile.id}.mp3` — the sfx_archieve
 * voice files are named after the character's real on-disk folder (its
 * display name), and for 3 of these 5 that differs from the `id` string
 * lib/pets/pet-profile.ts's CHARACTER_DEFS actually uses (a pre-existing
 * mismatch between the id and the folder's own display name, unrelated to
 * SFX — see e.g. id '02_로봇' vs the real folder/voice file '02_플로봇').
 * Keying this map by `id` (not by folder name) is what lets every call site
 * just pass `petProfile.id` straight through without needing to know about
 * that mismatch at all.
 */
const CHARACTER_VOICE_FILE_BY_ID: Record<string, string> = {
  '01_치즈털실냥이': '01_치즈털실냥이',
  '02_로봇': '02_플로봇',
  '03_양': '03_잎사귀양',
  '04_상처도치': '04_상처도치',
  '05_노란병아리': '05_알삐약이',
}

const FALLBACK_VOICE_FILE = 'statling2'

/** Resolved path for every voice file this module can ever return — used to preload/unlock them all up front (see AudioManager.preloadAll/unlock), same as the fixed SoundName set. */
export const ALL_CHARACTER_VOICE_SRCS: string[] = [
  ...new Set([...Object.values(CHARACTER_VOICE_FILE_BY_ID), FALLBACK_VOICE_FILE]),
].map((fileName) => `${VOICE_BASE_PATH}/${fileName}.mp3`)

/** `petProfile.id` (e.g. '01_치즈털실냥이') -> its voice clip's public path, falling back to the shared line for any of the other 25 roster characters or when there's no confirmed pet yet. */
export function characterVoiceSrc(petId: string | null | undefined): string {
  const fileName = (petId && CHARACTER_VOICE_FILE_BY_ID[petId]) || FALLBACK_VOICE_FILE
  return `${VOICE_BASE_PATH}/${fileName}.mp3`
}
