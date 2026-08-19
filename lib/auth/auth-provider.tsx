/**
 * The single import path every consumer uses (AuthForm, MyPageScreen,
 * SaveScreen, app/layout.tsx) — which backend is actually active is decided
 * only here. Switched to the real Supabase-backed implementation now that a
 * Supabase project is configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY — see
 * .env.local.example). To fall back to the localStorage-only implementation
 * (no server required), change the export below to:
 *
 *   export { LocalAuthProvider as AuthProvider } from './local-auth-provider'
 *
 * No other file needs to change — every provider implementation satisfies
 * the same AuthContextValue contract (see lib/auth/auth-context.tsx).
 */
export { SupabaseAuthProvider as AuthProvider } from './supabase-auth-provider'
export { useAuth } from './auth-context'
