import type { AutonomousActionId, PetZone } from '@/lib/pet-care/types'

/** All timing knobs for the autonomous behavior scheduler — see hooks/use-pet-autonomy.ts. */
export const PET_AUTONOMY_CONFIG = {
  // Widened from 8-20s so the calm idle/blink gap between autonomous ticks
  // dominates screen time more clearly (see autonomous-action-selector.ts's
  // BASE_WEIGHTS for the matching per-tick weighting change).
  minIntervalMs: 10_000,
  maxIntervalMs: 24_000,
  /** How long *autonomous motion* (usePetAutonomy) stays fully paused after any user care action. Distinct from postActionDialoguePauseMs/userCooldownMs below — this one is intentionally the longest of the three. */
  pauseAfterUserActionMs: 5_000,
  /**
   * How long *random/ambient dialogue* (usePetInitiatedDialogue, via
   * room-screen.tsx's `inEventTail`) stays quiet right after an ordinary
   * care-action reply (feed/wash/play/pet/talk-answer) finishes — short on
   * purpose: just enough of a beat that a random line never seems to cut
   * off or immediately pile on top of the action's own reply. Separate from
   * pauseAfterUserActionMs (which is about autonomous *motion*, stays much
   * longer) and from pet-care.config.ts's per-action button cooldowns
   * (which are about how soon the *player* may press the same button again).
   */
  postActionDialoguePauseMs: 1_300,
  /**
   * Same idea as postActionDialoguePauseMs, but for the bigger moments —
   * a minigame reaction, a level-up, or claiming a Level Gift — which
   * deserve a slightly longer settle beat before autonomous motion/random
   * dialogue resume. Never applies to gift itself while still unclaimed;
   * that state has no timer at all (see PetCareState.giftReadyLevel).
   */
  significantEventTailMs: 1_800,
  initiatedDialogueCooldownMs: 90_000,
  requestDialogueCooldownMs: 300_000,
  longAbsenceHours: 24,
  welcomeDelayMinMs: 700,
  welcomeDelayMaxMs: 1500,
}

/** How long each autonomous action's animation/hold plays before falling back to the mood idle. */
export const AUTONOMOUS_ACTION_HOLD_MS: Record<AutonomousActionId, number> = {
  idle: 2_200,
  lookLeft: 1_400,
  lookRight: 1_400,
  smallHop: 900,
  walkLeft: 1_800,
  walkRight: 1_800,
  sleep: 3_500,
  askFood: 2_400,
  askPlay: 2_400,
  askAttention: 2_400,
  celebrate: 1_600,
  playAlone: 2_600,
  ponder: 1_800,
}

/**
 * How far the 'left'/'right' zone sits from center, as a CSS length.
 *
 * Was `clamp(100px, 30vw, 210px)` — a viewport-relative guess at "roughly
 * 60% of the Room's width" that assumed the Room scales continuously with
 * vw. It doesn't: room-screen.tsx caps the Room at a flat max-w-70 (280px)
 * below the `sm` breakpoint, then removes that cap entirely above it — so
 * the Room's actual rendered width is NOT a fixed fraction of the viewport,
 * and on phones the old formula kept growing past 280px while the Room
 * itself stayed pinned there, walking the character straight out of frame.
 *
 * Fixed by computing the real thing: availableMovement =
 * (roomWidth - characterWidth) / 2 - safePadding, entirely in CSS via
 * container query units. `100cqw` reads the Room canvas's own true
 * rendered width (see room-canvas.tsx's `@container` — the nearest
 * ancestor with a container-query context is that canvas itself, not the
 * viewport), so this stays correct through every breakpoint transition
 * automatically, with no separate mobile/desktop cases to keep in sync.
 * `clamp(160px, 44vw, 270px)` here must keep matching pet-mood-view.tsx's
 * CHARACTER_BOX_SIZE exactly — it's the one thing this can't read directly
 * off the DOM (getting a literal element's rendered size into a sibling's
 * CSS isn't possible without a resize-observer, which would reintroduce a
 * JS/CSS sync-drift risk of its own). `max(0px, ...)` is the only outer
 * guard: on a viewport too narrow for the Room to fit the character plus
 * safePadding at all, this simply stops moving instead of ever going
 * negative (which would walk the character the wrong way). No upper clamp
 * is needed — the Room's own width is already bounded by this app's
 * max-w-3xl page layout, so this formula's ceiling is that layout's, same
 * as it always was.
 */
export const WALK_OFFSET_DISTANCE = 'max(0px, calc((100cqw - clamp(160px, 44vw, 270px)) / 2 - 12px))'

/** Sign multiplier per zone — the actual distance comes from WALK_OFFSET_DISTANCE above; this only says which side. */
export const ZONE_OFFSET_SIGN: Record<PetZone, -1 | 0 | 1> = { left: -1, center: 0, right: 1 }

/**
 * Matches `.pet-zone-transition`'s CSS duration (app/globals.css) — kept
 * here purely as the documented reference that class's own comment points
 * back to; no JS reads this constant directly. Slower than before (was
 * 700ms) since a walk now covers a noticeably longer distance — keeps the
 * pace reading as an actual walk rather than a teleport.
 */
export const ZONE_TRANSITION_MS = 1400

/** How far the character leans into a walkLeft/walkRight move (degrees, signed by travel direction) — see pet-mood-view.tsx's `tiltDeg`. Reset to 0 once the walk's hold ends, same timer as the animation itself. */
export const WALK_TILT_DEG = 20

/**
 * Direct button-press cooldowns (how soon the PLAYER may press the same
 * care-action button again) live in lib/config/pet-care.config.ts
 * (FEED_COOLDOWN_MS etc) — deliberately kept short (~1.5-2s, matched to
 * REACTION_FEEDBACK_MS's own 1600ms action-animation length) and separate
 * from every pause constant on this file, which all gate the *character's
 * own* autonomous behavior instead.
 */

/** Autonomous actions never move the needle much — and never past these daily totals (reset when the calendar date changes). */
export const AUTONOMY_DAILY_ENERGY_CAP = 5
export const AUTONOMY_DAILY_HAPPINESS_CAP = 5
export const AUTONOMOUS_SLEEP_ENERGY_BONUS = 1
export const AUTONOMOUS_PLAY_ALONE_HAPPINESS_BONUS = 1
