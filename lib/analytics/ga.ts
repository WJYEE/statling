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
    dataLayer?: unknown[]
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
  /**
   * Fires on every arrival at Room, not just the first ever one —
   * entry_type distinguishes a brand-new pet's very first Home entry
   * ('first_time', fired right after Profile Setup) from every later
   * revisit ('returning', fired by the bootReady restore effect for an
   * already-confirmed, already-named pet). Mirrors PostHog's
   * home_entered{entry_type}, which already covers both cases — this
   * closes the gap where 'returning' only reached PostHog before.
   */
  home_enter: { statling_type: string; entry_type: 'first_time' | 'returning' }
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
  /**
   * Phase 3G-5 — fires only once a friend-invite share page
   * (/share/[petId]?...&ref=<code>) has confirmed the `ref` actually
   * resolves to a real inviter (see components/share/friend-invite-cta.tsx's
   * own ready-state guard) — never for a plain share link, never for an
   * unknown/invalid ref. `pet_id` is the species catalog id already sent by
   * several existing events (e.g. `statling_reveal`'s `statling_type`) — not
   * personal data. Never friend_code/ref/nickname/any identity.
   */
  friend_invite_opened: { pet_id: string }
  /**
   * Phase 3G-5 — fires only when create_friendship() reports a genuinely NEW
   * connection (Phase 3G-5 Follow-up migration's `is_new_connection`), never
   * for an idempotent re-accept of an already-existing friendship. `source`
   * distinguishes the two call sites that can create one: an already
   * signed-in user clicking the Friend CTA directly (`direct`), or a guest
   * who logged in and had a pending invite resumed by game-flow.tsx's own
   * effect (`resumed`) — see that effect's doc comment. No identity of
   * either party is ever included.
   */
  friend_connected: { source: 'direct' | 'resumed' }
  /**
   * Phase 3G-5 — fires when the user actually selects the 친구 scope in
   * Ranking (RankingScreen's own [전체|친구] selector), for whichever
   * ranking_type they land on — never on a retry-button refetch, never
   * repeatedly per render (see ranking-screen.tsx's own effect for the exact
   * once-per-scope/tab-change guard). game_id/difficulty are only present
   * for ranking_type: 'game', once a specific game+difficulty is actually
   * selected — omitted (not sent empty) for 'overall'/'xp'. No friend_code,
   * nickname, or per-friend identity ever included.
   */
  friend_ranking_viewed: { ranking_type: 'overall' | 'game' | 'xp'; game_id?: string; difficulty?: string }
  /**
   * Phase 3J-2 — BirthdayScreen mount (the mandatory birth_date/gender step
   * between Naming and Room). Fires once per real screen entry (empty-deps
   * effect, same convention as statling_reveal) — a funnel-entry signal
   * only, never the actual birth_date/gender/email/nickname/uuid values (see
   * that component's own doc comment). No params by design: the point is
   * step-entry vs. step-completion counting, not per-field breakdown.
   */
  profile_setup_view: Record<string, never>
  /**
   * Phase 3J-2 — fires once, right before BirthdayScreen's onContinue() is
   * actually called (every real exit path: guest skip, both fields left
   * blank, or a save attempt that didn't hit a client-side validation
   * error) — never on a validation failure, since that path returns before
   * reaching this call. No params — same PII exclusion as profile_setup_view
   * above.
   */
  profile_setup_complete: Record<string, never>
  /**
   * Phase 3K-1 — fires once, the instant RoomScreen's birthday check
   * confirms today matches profiles.birth_date's month/day AND opens the
   * popup (see room-screen.tsx's own once-per-local-day guard). No
   * params — the birth_date value itself must never reach GA4, only the
   * fact that the moment happened, same PII exclusion as profile_setup_view.
   */
  birthday_celebration_shown: Record<string, never>
  /**
   * GrowScreen mount (Room's "성장시키기" CTA target — Free Play's game-pick
   * step). Fires once per real screen entry (empty-deps effect, same
   * once-per-mount convention as profile_setup_view/statling_reveal) — a
   * Path Exploration entry signal only. Deliberately distinct from
   * free_play_start (game-flow.tsx), which fires later, only once a
   * specific game+difficulty is actually confirmed — grow_view instead
   * marks "the user opened Grow," including anyone who opens it and leaves
   * without picking anything. No params: nothing PII, no extra dimension
   * needed for the home_enter → Grow/Ranking/My Page comparison this was
   * added for.
   */
  grow_view: Record<string, never>
  /**
   * MyPageScreen mount. Fires once per real screen entry (empty-deps
   * effect, same convention as grow_view/profile_setup_view) — a Path
   * Exploration entry signal only, added alongside grow_view/ranking_view
   * so home_enter's three main downstream destinations (Grow/Ranking/My
   * Page) are all comparably instrumented. No params — same no-PII/no-extra
   * -dimension rationale as grow_view.
   */
  my_page_view: Record<string, never>
}

/**
 * Fires a GA4 event through the gtag() global <GoogleAnalytics/> sets up —
 * a silent no-op only if GA isn't enabled (no NEXT_PUBLIC_GA_MEASUREMENT_ID)
 * or this runs on the server, so call sites never need their own
 * isGAEnabled/typeof-window guard.
 *
 * If window.gtag isn't a function yet (<GoogleAnalytics/>'s
 * strategy="afterInteractive" scripts haven't run yet — this used to mean
 * the hit was dropped entirely, e.g. a screen that mounts very early after
 * a fresh page load such as a post-OAuth-redirect restore, see
 * ANALYTICS_GAP_AUDIT.md), install the exact same minimal shim that
 * script's own inline snippet defines (dataLayer.push(arguments)) and call
 * that instead. This is Google's own documented pattern for queueing gtag
 * calls before gtag.js has loaded — the library drains the whole dataLayer
 * array once it's ready, so an event queued here is still correctly
 * attributed, never dropped. No duplicate send risk: this function only
 * ever calls window.gtag(...) once per invocation, whichever form it is.
 * Harmless if <GoogleAnalytics/>'s own inline script then runs moments
 * later — a top-level `function gtag(){...}` declaration in a classic
 * script unconditionally reassigns window.gtag, but that later shim is
 * functionally identical, and the actual gtag('js', ...)/gtag('config', ...)
 * bootstrap calls only ever happen there, exactly once either way.
 */
export function trackEvent<K extends keyof GAEventParams>(name: K, params: GAEventParams[K]): void {
  if (typeof window === 'undefined' || !isGAEnabled) return
  if (typeof window.gtag !== 'function') {
    const dataLayer = (window.dataLayer = window.dataLayer || [])
    window.gtag = window.gtag || function gtag() {
      // eslint-disable-next-line prefer-rest-params -- must push the real
      // `arguments` object, matching gtag.js's own documented shim exactly.
      dataLayer.push(arguments)
    }
  }
  window.gtag('event', name, params)
}
