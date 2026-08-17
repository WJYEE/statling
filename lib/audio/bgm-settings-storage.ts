import { ALL_BGM_TRACK_IDS, BGM_TRACK_MAP, DEFAULT_BGM_TRACK_ID } from '@/lib/audio/bgm-config'
import type { BgmTrackId } from '@/lib/audio/bgm-config'
import type { BgmMode, BgmSettings } from '@/lib/audio/types'

const BGM_SETTINGS_KEY = 'statling:audio:bgmSettings'
/**
 * Every device that ever opened the app before this fix auto-persisted
 * `enabled: true` on its very first boot regardless of user action (the old
 * default, plus a since-fixed bug where booting always re-saved the whole
 * settings object). That means an `enabled: true` already sitting in
 * storage isn't necessarily a deliberate choice — this key marks "this
 * device has been corrected once" so loadBgmSettings can force such a
 * leftover value back to the real default (OFF) exactly one time, without
 * ever touching a *later* explicit setBgmEnabled(true) from MyPage.
 */
const BGM_ENABLED_MIGRATION_KEY = 'statling:audio:bgmEnabledOffMigrationV1'

/**
 * One-time migration for the 12 tracks added in the 2026-08 BGM update
 * (bgm-31..bgm-42) — a device that already had a saved `selectedTrackIds`
 * list before this update shipped would otherwise show them permanently
 * unchecked in 선택곡 순차/랜덤 재생, since that saved list simply predates
 * their existence (loadBgmSettings only falls back to "select everything"
 * when the saved list is completely empty, not merely missing a few ids).
 * Adds them into this device's rotation exactly once; unchecking any of
 * them afterward behaves normally and is never re-added.
 */
const NEW_TRACKS_202608_MIGRATION_KEY = 'statling:audio:bgmNewTracks202608MigrationV1'
const NEW_TRACKS_202608: BgmTrackId[] = [
  'bgm-31',
  'bgm-32',
  'bgm-33',
  'bgm-34',
  'bgm-35',
  'bgm-36',
  'bgm-37',
  'bgm-38',
  'bgm-39',
  'bgm-40',
  'bgm-41',
  'bgm-42',
]

/**
 * Same rule as SFX (audio-settings-storage.ts) — defaults OFF, opt-in only.
 * A first-time visitor should never hear anything autoplay; BGM only starts
 * once the player explicitly flips the switch in MyPageScreen.
 */
function defaultBgmSettings(): BgmSettings {
  return {
    enabled: false,
    mode: 'repeat-one',
    repeatTrackId: DEFAULT_BGM_TRACK_ID,
    selectedTrackIds: [...ALL_BGM_TRACK_IDS],
    lastTrackId: null,
  }
}

function isBgmMode(value: unknown): value is BgmMode {
  return value === 'repeat-one' || value === 'sequential' || value === 'shuffle'
}

export function loadBgmSettings(): BgmSettings {
  const fallback = defaultBgmSettings()
  if (typeof window === 'undefined') return fallback
  try {
    const alreadyMigrated = window.localStorage.getItem(BGM_ENABLED_MIGRATION_KEY) !== null
    if (!alreadyMigrated) window.localStorage.setItem(BGM_ENABLED_MIGRATION_KEY, '1')

    const alreadyMigratedNewTracks = window.localStorage.getItem(NEW_TRACKS_202608_MIGRATION_KEY) !== null
    if (!alreadyMigratedNewTracks) window.localStorage.setItem(NEW_TRACKS_202608_MIGRATION_KEY, '1')

    const raw = window.localStorage.getItem(BGM_SETTINGS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<BgmSettings> | null
    if (!parsed || typeof parsed !== 'object') return fallback

    let selectedTrackIds = Array.isArray(parsed.selectedTrackIds)
      ? parsed.selectedTrackIds.filter((id) => BGM_TRACK_MAP.has(id))
      : []

    if (!alreadyMigratedNewTracks) {
      const missingNewTracks = NEW_TRACKS_202608.filter((id) => !selectedTrackIds.includes(id))
      if (missingNewTracks.length > 0) selectedTrackIds = [...selectedTrackIds, ...missingNewTracks]
    }

    const settings: BgmSettings = {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : fallback.enabled,
      mode: isBgmMode(parsed.mode) ? parsed.mode : fallback.mode,
      repeatTrackId: BGM_TRACK_MAP.has(parsed.repeatTrackId as never) ? (parsed.repeatTrackId as BgmSettings['repeatTrackId']) : fallback.repeatTrackId,
      selectedTrackIds: selectedTrackIds.length > 0 ? selectedTrackIds : fallback.selectedTrackIds,
      lastTrackId: BGM_TRACK_MAP.has(parsed.lastTrackId as never) ? (parsed.lastTrackId as BgmSettings['lastTrackId']) : null,
    }

    if (!alreadyMigrated && settings.enabled) return { ...settings, enabled: false }
    return settings
  } catch {
    return fallback
  }
}

export function saveBgmSettings(settings: BgmSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(BGM_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable (private mode, quota) — in-memory state still works for this session.
  }
}
