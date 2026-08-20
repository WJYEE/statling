import type { SupabaseClient } from '@supabase/supabase-js'
import { runLocalDataMigration } from '@/lib/migration/migration-orchestrator'

/**
 * Fire-and-forget entry point for "try to run the one-time localStorage ->
 * Supabase migration now" — shared by every real call site so the retry
 * logic lives in exactly one place:
 *   - lib/auth/supabase-auth-provider.tsx, right after session restore and
 *     on every SIGNED_IN event (the original Phase 2B-4 wiring).
 *   - game-flow.tsx's NamingScreen onConfirm — the retry for the race this
 *     was split out to fix: a pet that was confirmed-but-unnamed when
 *     sign-in first happened makes runLocalDataMigration() return
 *     'not_ready' (nothing written, migrated_at left untouched — see
 *     isLocalPetMigrationReady in migration-orchestrator.ts). This is the
 *     call that actually completes the migration once the name exists.
 *
 * Deliberately never awaited by callers — `user`/`loading` state updates and
 * naming-confirm navigation must never wait on a network round-trip. A
 * `failed`/thrown result only ever surfaces as a dev-only console.warn;
 * `not_ready`/`already_migrated` are expected, silent outcomes. migrated_at
 * is left untouched on anything short of a full success, so the next
 * login/reload/naming-confirm naturally retries — nothing here can strand
 * the user mid-flow or leave a dangling unhandled rejection.
 */
export function triggerBackgroundMigration(supabase: SupabaseClient): void {
  runLocalDataMigration(supabase)
    .then((result) => {
      if (result.status === 'failed' && process.env.NODE_ENV !== 'production') {
        console.warn('[migration] runLocalDataMigration failed (will retry on next login/reload):', result.failures)
      }
    })
    .catch((err: unknown) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[migration] runLocalDataMigration threw unexpectedly:', err)
      }
    })
}
