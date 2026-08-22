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

export { posthog }
