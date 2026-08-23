import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
import { Baloo_2, Nunito } from 'next/font/google'
import { GoogleAnalytics } from '@/components/analytics/google-analytics'
import { PostHogAnalytics } from '@/components/analytics/posthog-analytics'
import { PostHogIdentify } from '@/components/analytics/posthog-identify'
import { AppToastProvider } from '@/components/brain-bet/toast-provider'
import { AudioProvider } from '@/components/brain-bet/audio-provider'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { getSiteUrl } from '@/lib/env/site-url'
import './globals.css'

const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-baloo',
})

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-nunito',
})

/**
 * Phase 3E-3 — resolved via lib/env/site-url.ts's shared getSiteUrl(),
 * which tries NEXT_PUBLIC_APP_URL then Vercel's own deployment env vars
 * before ever falling back to localhost (and logs loudly if it has to).
 * Metadata is evaluated at build/request time on the server, where
 * window.location isn't available — unlike the client-side share flow,
 * which checks window.location.origin first (see build-share-text.ts).
 */
const SITE_URL = getSiteUrl()

/**
 * Common Open Graph/Twitter metadata for the whole service. There's no
 * per-user dynamic result page yet (see lib/share/), so every link preview
 * — including one pasted from the share button into KakaoTalk/Messages —
 * uses this same static title/description/image rather than assuming a
 * user's own pet shows up automatically. og:image is supplied by
 * app/opengraph-image.tsx (Next's file convention wires it up automatically).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Statling — 나의 숨겨진 스탯을 발견해보세요',
  description:
    '6개의 짧은 미니게임을 플레이하며 나만의 6가지 능력치를 발견하세요. 모든 스탯을 발견하면 나만의 Statling이 깨어납니다.',
  generator: 'v0.app',
  openGraph: {
    title: '나만의 스탯링을 만나보세요',
    description: '6개의 두뇌 스탯을 분석해 나와 가장 닮은 스탯링을 확인해보세요.',
    url: SITE_URL,
    siteName: 'Statling',
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '나만의 스탯링을 만나보세요',
    description: '6개의 두뇌 스탯을 분석해 나와 가장 닮은 스탯링을 확인해보세요.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  // A custom `viewport` export replaces Next's default meta tag entirely, so
  // width/initialScale must be spelled out here — without them, in-app
  // browsers like KakaoTalk's WebView fall back to a desktop-width layout
  // viewport (~980px) instead of the actual device width, which is what was
  // pushing/clipping fixed-width mobile UI (e.g. the Landing autosave notice
  // card) off to the right.
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f0e3' },
    { media: '(prefers-color-scheme: dark)', color: '#3a352d' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`bg-background ${baloo.variable} ${nunito.variable}`}>
      <body className="antialiased">
        <AppToastProvider>
          <AuthProvider>
            {/* Phase 3A-1 — renders nothing; a silent sibling that only reads
                useAuth() to sync PostHog identity. AudioProvider/children's
                own order and behavior are unchanged. */}
            <PostHogIdentify />
            <AudioProvider>{children}</AudioProvider>
          </AuthProvider>
        </AppToastProvider>
        <GoogleAnalytics />
        <PostHogAnalytics />
        {process.env.NODE_ENV === 'production' && <Analytics />}
        {process.env.NODE_ENV === 'production' && <SpeedInsights />}
      </body>
    </html>
  )
}
