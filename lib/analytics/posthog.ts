import posthog from 'posthog-js'

declare global {
  interface Window {
    posthog?: typeof posthog
  }
}

/**
 * Phase 3A-1 — single source of truth for the PostHog project key/host, same
 * pattern as lib/analytics/ga.ts's GA_MEASUREMENT_ID. Never read
 * process.env.NEXT_PUBLIC_POSTHOG_* directly anywhere else.
 */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

export const isPostHogEnabled = Boolean(POSTHOG_KEY)

let initialized = false

/**
 * Idempotent — safe to call more than once (React 19 dev-mode double-invoke,
 * multiple mounts) and a guaranteed no-op if NEXT_PUBLIC_POSTHOG_KEY is
 * unset, so the app behaves identically with or without PostHog configured;
 * it never throws or blocks rendering either way. Called at MODULE scope
 * from components/analytics/posthog-analytics.tsx (not inside a useEffect)
 * specifically so it always runs before any component that might capture an
 * event (e.g. the pageview tracker) has a chance to mount — a child
 * component's effect fires before its parent's on the same commit in React,
 * so an effect-based init here could otherwise lose that race.
 *
 * capture_pageview is off — this app is a Next.js App Router SPA
 * (app/page.tsx renders one <GameFlow/> that manages everything through
 * internal state, not real route changes), so PostHog's automatic
 * pageview-on-load only sees the initial load; real navigations (a
 * /share/[petId] link, /auth/callback) are captured manually by
 * PostHogPageview instead — see that component for why both together would
 * double-count.
 *
 * person_profiles defaults to 'identified_only' already, kept explicit here
 * so an anonymous guest never creates a full person profile — only
 * posthog.identify() (see posthog-identify.tsx, fired for a real Supabase
 * session only) does.
 *
 * session_recording.maskAllInputs masks every <input>/<textarea> VALUE
 * (password, email, the Statling naming field, feedback text, ...)
 * regardless of type — the conservative default the Phase 3A-1 task asked
 * for, covering any current or future sensitive field without needing to
 * tag each one individually. This only affects form input values, not the
 * rest of the page, so the game UI itself still records normally.
 */
export function initPostHog(): void {
  if (initialized || !isPostHogEnabled || typeof window === 'undefined') return
  initialized = true
  posthog.init(POSTHOG_KEY as string, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true },
    },
  })
  // Exposed on window the same way the classic <script> snippet install
  // always has (this is the npm/bundler install path instead, which does
  // NOT do this on its own) — purely for browser devtools/QA inspection of
  // the SDK's own public state (get_distinct_id(), config, ...), same
  // client-visible surface every analytics SDK's project key already has
  // (it's embedded in every outgoing request URL/body regardless of this
  // line) — never anything beyond what a visitor's Network tab already shows.
  window.posthog = posthog
}

/**
 * distinct_ids we've already called posthog.createPersonProfile() for, so a
 * repeated call for the SAME anonymous/identified id (e.g. restarting
 * Assessment, or resumeIntro after start() already ran this session) is a
 * no-op. Keyed by distinct_id rather than a single "already created"
 * boolean specifically so this survives posthog.reset(): reset() rotates
 * PostHog onto a brand-new anonymous distinct_id, which won't be in this
 * set yet, so the next real Assessment start correctly creates a profile
 * for that new id too. A Set (not "last id") also means switching between
 * distinct_ids — e.g. two different guest sessions sharing a tab — never
 * false-negatives into skipping a real new id.
 */
const createdPersonProfileFor = new Set<string>()

/**
 * With person_profiles: 'identified_only' (see initPostHog), an anonymous
 * visitor's events are recorded with $process_person_profile: false and
 * never attach to a Person — including any later posthog.identify() after
 * signup, which can only merge events captured *after* the anonymous
 * distinct_id was promoted. Landing-only guests should stay exactly this
 * lightweight (no Person created), but once someone actually starts (or
 * resumes) Assessment we want that guest's activity (assessment_started,
 * game_started, game_completed, ...) to be linkable to the Person that
 * identify() creates if/when they sign up later — so call this once, right
 * before that Assessment run's own events fire, to opt the current
 * distinct_id into person processing from that point on.
 *
 * Guarded by distinct_id (see createdPersonProfileFor above), not a plain
 * boolean — a plain "already called" flag would stay true forever, even
 * after posthog.reset() rotates onto a fresh anonymous id for a new guest
 * session, silently skipping that new id's profile creation. This function
 * never touches identify()/reset() themselves and never sets any person
 * property — it only flips how already-anonymous events for the current id
 * are processed going forward, so no PII is involved.
 */
export function ensurePersonProfileCreated(): void {
  if (!isPostHogEnabled || typeof window === 'undefined') return
  const distinctId = posthog.get_distinct_id()
  if (!distinctId || createdPersonProfileFor.has(distinctId)) return
  createdPersonProfileFor.add(distinctId)
  posthog.createPersonProfile()
}

/**
 * Syncs the sticky Landing A/B variant (lib/experiments/landing-variant.ts's
 * own localStorage-based 50:50 assignment, untouched by this function) onto
 * the PostHog Person as `landing_variant`, so PostHog Heatmaps — which can
 * only filter by event/person properties, never by which React component
 * actually rendered — can separate Variant A's clicks from Variant B's even
 * though both render at the identical "/" URL and neither is a PostHog
 * feature flag/group (see landing-variant.ts's own doc comment for why).
 * `$autocapture` click events don't carry this property themselves, but
 * PostHog's Heatmap tool can filter recordings/events by the *person*
 * viewing them, which this makes possible.
 *
 * Deliberate, narrow exception to ensurePersonProfileCreated's "only
 * Assessment starters get a Person profile" policy above: per posthog-js's
 * own setPersonProperties() docs, this call creates a Person profile if one
 * doesn't exist yet even under person_profiles: 'identified_only' — for
 * every Landing viewer, not just those who start Assessment. That's
 * intentional here (a landing-only bounce with no Person profile would
 * defeat the one thing this property exists for — separating Landing-page
 * click behavior by variant), but it does mean more Persons get created
 * than initPostHog's original "anonymous guest never creates a full person
 * profile" framing implied. No PII: the only value ever set is the literal
 * string 'A' or 'B'.
 */
export function syncLandingVariantPersonProperty(variant: 'A' | 'B'): void {
  if (!isPostHogEnabled || typeof window === 'undefined') return
  posthog.setPersonProperties({ landing_variant: variant })
}

export { posthog }
