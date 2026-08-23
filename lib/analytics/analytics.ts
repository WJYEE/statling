import { posthog, isPostHogEnabled } from './posthog'

/**
 * Phase 3A-2 — Statling's Product Analytics Event Taxonomy. This is a
 * PostHog-only companion to lib/analytics/ga.ts, not a replacement or a
 * migration of it: GA4 (acquisition/traffic) keeps firing its own events at
 * its own existing call sites, completely untouched. This layer exists so
 * the small set of PRODUCT/funnel/retention events chosen for this phase
 * have one typed, centralized place to be added — call sites never call
 * posthog.capture() directly, and never repeat this taxonomy inline.
 *
 * Event names are deliberately NOT a 1:1 rename of GAEventParams — where
 * GA4's existing name/shape already reads as a clear user action (e.g.
 * `level_up`), the same word is reused here for a human cross-referencing
 * the two systems; where GA4's name was UI/implementation-shaped (mini_game_*
 * split by flow, customization_save with a type param, share_click/success)
 * it's re-cut into the "what did the user do" shape the taxonomy calls for
 * (game_started/game_completed, room_saved/decoration_saved,
 * share_started/share_completed). See the Phase 3A-2 report for the full
 * rationale per event and for the events deliberately NOT connected yet.
 */
export interface ProductEventParams {
  /** Onboarding funnel step 1. entry_source distinguishes the 3 real call sites of game-flow.tsx's start() (landing button, "처음부터 다시 하기", and the post-login auto-start effect for a freshly-authenticated user with no local pet) — see start()'s call sites. */
  assessment_started: { entry_source: 'landing' | 'restart' | 'post_login_auto'; auth_state: 'guest' | 'member' }
  /** Onboarding funnel step 2 — fires once, only from CompleteScreen's onMeetStatling (the 6th/last result screen; see emitCompletionEvent's doc comment), matching assessment_complete's GA4 choke point exactly. completed_games is always TOTAL_GAMES (6) at this reachable point. duration_ms is derived from the Intro checkpoint's own startedAt (lib/game/intro-progress-storage.ts) read right before it's cleared; null if that checkpoint was somehow already gone. */
  assessment_completed: { completed_games: number; duration_ms: number | null; top_stat: string; second_stat: string }
  /** Onboarding funnel step 3 — reveal-screen.tsx mount, matching statling_reveal's GA4 choke point exactly. */
  statling_revealed: { character_id: string; top_stat: string; second_stat: string }
  /**
   * Onboarding funnel step 4 — SaveScreen's "나중에 하기" only. The
   * sign_up choice is deliberately NOT sent here: SaveScreen's onContinue IS
   * AuthForm's onAuthenticated, which fires immediately after auth-form.tsx
   * already sends GA4's `sign_up` at the exact same moment — a
   * choice:'sign_up' event here would be a pure duplicate signal, not new
   * funnel information. See the Phase 3A-2 report for this reasoning.
   */
  auth_choice_made: { choice: 'skip' }
  /** Onboarding funnel step 5 — NamingScreen's onConfirm. Never the actual name string — length only (see the Phase 3A-2 report's privacy section). */
  naming_completed: { name_length: number }
  /**
   * Onboarding funnel step 6 (terminal). entry_type is only ever
   * 'first_time' (the exact home_enter GA4 choke point — the doc comment at
   * that call site calls it out as THE one genuinely-first Home entry) or
   * 'returning' (the bootReady mount effect landing straight in Room because
   * a confirmed+named pet was already stored). A finer 'restored' (a
   * same-effect landing caused specifically by a just-completed Supabase
   * restore, vs. a plain same-device revisit) was investigated but isn't
   * cleanly distinguishable at this choke point without a new tracking flag
   * — not instrumented rather than guessed. See the Phase 3A-2 report.
   */
  home_entered: { entry_type: 'first_time' | 'returning' }
  /** Free Play + Assessment, unified by game_id rather than 12 separate event names — enterStatGame (mode 'assessment', always difficulty 'normal') and confirmFreePlayGame (mode 'free_play') are the two choke points, matching mini_game_start/free_play_start's GA4 timing exactly, including on a retry. */
  game_started: { game_id: string; difficulty: string; mode: 'assessment' | 'free_play' }
  /** emitCompletionEvent — the single existing choke point both mini_game_complete and free_play_complete already share, gated the same way they are (only valid/completed attempts reach it at all). completion_result distinguishes a retry from a first try using the same isRetry the GA4 call already receives. */
  game_completed: {
    game_id: string
    difficulty: string
    mode: 'assessment' | 'free_play'
    normalized_score: number
    completion_result: 'first_attempt' | 'retry'
  }
  /** hooks/use-pet-care.ts's finalizeAction — fires only when result.animation !== 'idle', the same sentinel blockedByCooldown() already uses for "this action was blocked, nothing happened" across all 6 actions. A cooldown-blocked tap therefore never reaches here, unlike GA4's pet_action (which fires at button-press regardless). Covers feed/shower/clean/play/pet/talk under one event, action as the property. */
  care_action_completed: { action: string }
  level_up: { level: number }
  achievement_unlocked: { achievement_id: string; achievement_type: string }
  achievement_claimed: { achievement_id: string; reward_type: string; xp_reward: number }
  daily_mission_claimed: { mission_id: string; reward_type: string; xp_reward: number }
  /** theme-screen.tsx's room save — customization_save{customization_type:'room'}'s PostHog counterpart. */
  room_saved: { item_count: number }
  /** statling-screen.tsx's Statling decoration save — customization_save{customization_type:'statling'}'s PostHog counterpart. */
  decoration_saved: { item_count: number }
  /** share_click's PostHog counterpart — never the share URL/text itself, only which channel (web_share vs png) and which surface (character_result vs my_page) the click started from. */
  share_started: { channel: string; share_context: string }
  /** share_success's PostHog counterpart, same channel/share_context shape as share_started. */
  share_completed: { channel: string; share_context: string }
  /**
   * Phase 3E-2 — Landing A/B experiment exposure (spec §12). `variant` is
   * the ONLY property — UTM is deliberately NOT duplicated here (spec:
   * "UTM을 이벤트마다 중복 전송하지 마세요"). Cross-referencing "which UTM
   * source saw which variant" works natively in PostHog without any extra
   * property: this event's own `$pageview` (same page load, same session)
   * already carries the full UTM query string in `$current_url`, and
   * PostHog surfaces `$initial_utm_source`/etc as person properties once
   * identified — Funnels/Trends can filter or break down by BOTH this
   * event's `variant` property AND the session/person's UTM properties at
   * the same time. Fired at most once per real page load — see
   * components/brain-bet/screens/landing-experiment.tsx's own doc comment
   * for the exact once-per-mount guard.
   */
  landing_experiment_viewed: { variant: 'A' | 'B' }
}

/**
 * Fires a PostHog product event — a silent no-op if PostHog isn't configured
 * (no NEXT_PUBLIC_POSTHOG_KEY) so call sites never need their own
 * isPostHogEnabled guard, same ergonomics as ga.ts's trackEvent. Deliberately
 * PostHog-only for this phase: GA4's own trackEvent() calls at these same
 * moments are untouched and keep firing independently — this is always an
 * ADDITIONAL call next to the existing one, never a replacement.
 */
export function trackProductEvent<K extends keyof ProductEventParams>(name: K, properties: ProductEventParams[K]): void {
  if (!isPostHogEnabled) return
  posthog.capture(name, properties)
}
