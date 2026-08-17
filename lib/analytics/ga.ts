/**
 * Single source of truth for the GA4 Measurement ID — every other GA-related
 * module (the <GoogleAnalytics> script loader now, the trackEvent helper
 * below) should import GA_MEASUREMENT_ID from here rather than reading
 * process.env directly, so there's one place to change if the env var name
 * ever does.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export const isGAEnabled = Boolean(GA_MEASUREMENT_ID)

/** assessment_start's release_stage param — the only place the Event Tracking Plan attaches it. No Preview/Production distinction exists in-app beyond NODE_ENV, so 'production' means "this is a production build" (Vercel Production or Preview both build with NODE_ENV=production; separate them instead via a different NEXT_PUBLIC_GA_MEASUREMENT_ID per Vercel environment — see the rollout report). */
export const RELEASE_STAGE = process.env.NODE_ENV === 'production' ? 'production' : 'development'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Where a share/UTM surface is — one source of truth reused by both
 * share_click/share_success/share_fail's `share_context` param AND
 * lib/share/build-share-text.ts's `buildShareUrl`'s `utm_content`, so a
 * share click and the visit its link produces always carry the identical
 * value instead of two hand-typed strings that could quietly drift apart.
 */
export type ShareContext = 'character_result' | 'my_page'

/**
 * Every custom GA4 event Statling sends, and its exact parameter shape — see
 * the Statling Event Tracking Plan (Confluence). Event/parameter names here
 * are the source of truth call sites must match; add a new event by adding
 * one entry here first; don't hand-roll ad-hoc gtag('event', ...) calls
 * elsewhere; keeps every call site type-checked against the plan.
 *
 * Deliberately excluded (see the rollout report for why):
 * - landing_view — GA4's automatic page_view already covers it.
 * - ability_result_view — fires at the exact same instant as
 *   mini_game_complete in this codebase (CompleteScreen mounts synchronously
 *   right after the completion handler), so it would be a pure duplicate;
 *   mini_game_complete is sent instead. Revisit only if the result screen
 *   itself ever needs its own engagement metric independent of completion
 *   (e.g. if its mount ever becomes conditionally async) — not the case
 *   today, so this stays excluded.
 * - ranking_entry_view, account_link, volume_change — no corresponding user
 *   action exists in the app yet (no per-row ranking detail view, no
 *   guest->member data migration, no volume slider UI).
 *
 * Two XP systems, deliberately not merged into one event:
 * - `xp_earned` below is Pet Care's *intimacy* EXP only (feed/shower/clean/
 *   play/pet/talk/game-reaction bonus — see hooks/use-pet-care.ts,
 *   lib/pet-care/actions.ts). It never fires for Free Play.
 * - Free Play's XP (the ranking/leaderboard ledger, lib/ranking/xp-ledger.ts)
 *   is reported only via `free_play_complete.xp_earned` below, not this
 *   event — the two ledgers are unrelated systems that happen to share the
 *   English word "XP", not one metric split across two events.
 */
export interface GAEventParams {
  assessment_start: { release_stage: string }
  mini_game_start: { ability: string; game_name: string; game_index: number; attempt: number }
  mini_game_complete: { ability: string; game_name: string; game_index: number; attempt: number; score: number }
  mini_game_retry: { ability: string; game_name: string; game_index: number; previous_score: number }
  assessment_complete: { top_ability: string; second_ability: string }
  egg_hatch_start: { top_ability: string; second_ability: string }
  statling_reveal: { statling_type: string; top_ability: string; second_ability: string }
  home_enter: { statling_type: string }
  free_play_start: { game_name: string; ability: string; difficulty: string }
  free_play_complete: { game_name: string; ability: string; difficulty: string; score: number; xp_earned: number }
  pet_action: { action_type: string }
  collection_view: Record<string, never>
  collection_statling_view: { statling_type: string; is_unlocked: boolean }
  customization_open: { customization_type: string }
  customization_apply: { customization_type: string; item_id: string; item_type: string }
  customization_remove: { customization_type: string; item_id: string; item_type: string }
  customization_save: { customization_type: string; item_count: number }
  xp_earned: { xp_amount: number; xp_source: string }
  level_up: { previous_level: number; new_level: number }
  level_reward_received: { level: number; reward_type: string; item_id: string }
  ranking_view: { ranking_type: string; period: string }
  daily_mission_view: Record<string, never>
  daily_mission_complete: { mission_id: string; mission_type: string; reward_type: string; reward_amount: number }
  achievement_view: Record<string, never>
  achievement_unlock: { achievement_id: string; achievement_type: string }
  /**
   * Fires once, only when `claimAchievementReward` (lib/missions/mission-tracker.ts)
   * actually returns `{claimed: true}` — never on a no-op (already claimed /
   * not yet unlocked). Distinct from `achievement_unlock` above: that fires
   * the moment a tier's condition is met, this fires the moment the player
   * presses "보상 받기" and the reward is actually granted — the two can be
   * arbitrarily far apart in time (or never happen at all, for the second
   * one). `room_reward_id` is only present when a Room reward was actually
   * granted alongside the XP — omitted entirely (not sent as undefined/'')
   * for an XP-only claim.
   */
  achievement_reward_claim: {
    achievement_id: string
    achievement_type: string
    reward_type: string
    reward_amount: number
    room_reward_id?: string
  }
  share_click: { action_type: string; share_context: ShareContext }
  share_success: { action_type: string; share_context: ShareContext }
  share_fail: { action_type: string; share_context: ShareContext; error_type: string }
  feedback_open: { feedback_context: string }
  feedback_submit: { feedback_context: string; rating: string; satisfaction_reason: string; reuse_intent: string }
  feedback_fail: { feedback_context: string; error_type: string }
  sign_up: { method: string }
  login: { method: string }
  logout: Record<string, never>
  audio_setting_change: { audio_type: string; enabled: boolean }
  bgm_play_mode_change: { play_mode: string }
  bgm_track_change: { track_id: string }
  my_status_view: { view_context: string }
}

/**
 * Fires a GA4 event through the gtag() global <GoogleAnalytics/> sets up —
 * a silent no-op if GA isn't enabled (no NEXT_PUBLIC_GA_MEASUREMENT_ID) or
 * gtag hasn't loaded yet (e.g. a click in the first instant after paint,
 * before the afterInteractive script runs), so call sites never need their
 * own isGAEnabled/typeof-window guard.
 */
export function trackEvent<K extends keyof GAEventParams>(name: K, params: GAEventParams[K]): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', name, params)
}
