/**
 * Single source of truth for the GA4 Measurement ID — every other GA-related
 * module (the <GoogleAnalytics> script loader now, future pageview/event
 * helpers later) should import GA_MEASUREMENT_ID from here rather than
 * reading process.env directly, so there's one place to change if the env
 * var name ever does.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export const isGAEnabled = Boolean(GA_MEASUREMENT_ID)
