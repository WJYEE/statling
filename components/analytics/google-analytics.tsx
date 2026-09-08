import Script from 'next/script'
import { GA_MEASUREMENT_ID } from '@/lib/analytics/ga'
import { APP_VERSION } from '@/lib/config/app.config'

/**
 * Loads the official GA4 Google tag (gtag.js) and fires the initial
 * `config` call, which is what produces the automatic page_view hit on
 * first load. Renders nothing if NEXT_PUBLIC_GA_MEASUREMENT_ID is unset, so
 * local/preview environments without a Measurement ID stay silent instead
 * of erroring.
 *
 * `strategy="afterInteractive"` + a stable `id` on both <Script> tags is
 * Next.js's documented App Router pattern for gtag.js — Next tracks loaded
 * script ids itself, so this component being re-rendered (e.g. React 19
 * strict-mode double-invoke in dev) does not insert the tag twice.
 *
 * debug_mode is enabled automatically outside production builds so GA4
 * DebugView shows hits during local development. This never affects the
 * Production deployment (NODE_ENV is always 'production' there); pointing
 * NEXT_PUBLIC_GA_MEASUREMENT_ID in Vercel's Preview environment at a
 * separate "test" GA4 property is the recommended way to keep Preview
 * traffic out of Production reports entirely — see the rollout report.
 *
 * `gtag('set', 'app_version', ...)` right after `config` registers a
 * default event parameter — gtag.js automatically merges it into every
 * subsequent `gtag('event', ...)` call (including every lib/analytics/ga.ts
 * trackEvent(), and the automatic page_view above), without touching
 * GAEventParams or any individual call site. Single source of truth:
 * lib/config/app.config.ts (mirrors package.json's "version").
 */
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null

  const config = JSON.stringify(
    process.env.NODE_ENV === 'production' ? {} : { debug_mode: true },
  )

  return (
    <>
      <Script
        id="ga-gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)}, ${config});
          gtag('set', 'app_version', ${JSON.stringify(APP_VERSION)});
        `}
      </Script>
    </>
  )
}
