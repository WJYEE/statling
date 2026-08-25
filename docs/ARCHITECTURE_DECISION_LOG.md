# Statling — Architecture Decision Log

> **Source of truth**: the current repository at git HEAD `4e54742` (branch `main`) — migrations under `supabase/migrations/`, and the application code that calls them. This is a fresh read of the current code, not a restatement of `docs/STATLING_MASTER_DOCUMENTATION.md` (used only to orient which files to open) or any earlier draft. Nothing from a stashed/uncommitted working tree was consulted or restored.
> **Standard of evidence**: every ADR below cites the actual file/function/migration it's grounded in. Where the *reasoning* for a decision is stated in a code comment, that's quoted or closely paraphrased and attributed as such. Where a decision's *original motivation* cannot be recovered from the repository (e.g. "why Supabase and not a custom backend in the first place"), this document says so explicitly rather than inventing a narrative. "Alternatives" describes options that are structurally reasonable given the code, not options that were provably considered and rejected, unless a comment says otherwise.

---

## ADR-001 — Supabase (Auth + Postgres + RLS + RPC) as the sole backend layer

**Status**: Accepted

**Context**: The app needs account-linked persistence, cross-device sync, and the ability to compute rankings across users — none of which a purely client-side app can do on its own.

**Decision**: All server-side concerns run through Supabase: `auth.users`/Supabase Auth for identity, Postgres tables with Row Level Security for storage, and a small set of Postgres RPC functions for the handful of operations that need to read across users (rankings, friend connections) or need atomicity a sequence of PostgREST calls can't provide (the 3 "replace" migration RPCs).

**Evidence**:
- `lib/supabase/client.ts` / `lib/supabase/server.ts` — the only two Supabase client factories in the codebase, both using `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` only (no service-role key anywhere — re-confirmed by repo-wide grep this pass).
- `supabase/migrations/20260819000000_phase1_schema_and_rls.sql` — the entire schema (20 tables as of HEAD) with RLS enabled on every one.
- No other backend technology exists in the repo — no separate Node/Express server, no other database driver, no `app/api/*` route beyond the one OG-image generator (`app/api/og/share/route.tsx`).

**Alternatives** (structurally possible, not evidenced as considered): a custom application server; Firebase/another BaaS; a fully local-only app with no account layer at all.

**Why this works**: One platform provides identity, storage, and row-level authorization together, so every new server-side feature (ranking, friends) has been added as schema + RLS + narrowly-scoped RPC rather than a new service.

**Trade-offs**: All business logic that must run with elevated privilege (cross-user ranking reads, friend-code resolution) has to be written in PL/pgSQL inside a migration file, not TypeScript — a real cost for a team more fluent in the app's own language, visible in the migration files' own extensive comments explaining SQL-specific concerns (canonical-pair ordering without `LEAST()`/`GREATEST()`, `search_path` hijack hardening, `GET DIAGNOSTICS` for row-count checks).

**Future considerations**: If a feature needs elevated-privilege logic too complex or stateful for a single PL/pgSQL function (e.g. multi-step external API calls), this pattern would need a real server component — nothing here.

**확인 불가**: the original motivation for choosing Supabase specifically (vs. a custom backend or another BaaS) is not evidenced anywhere in the repository — this ADR describes the structure that exists, not why it was first chosen.

---

## ADR-002 — Local-first with a one-time, gated migration into the account layer

**Status**: Accepted

**Context**: A visitor should be able to start playing immediately, with no account — but if they later sign up, their in-progress data shouldn't be lost or duplicated, and a returning login on a new device should restore it.

**Decision**: Every gameplay domain is written to `localStorage` first, unconditionally, whether or not the visitor is signed in. On sign-up/sign-in, a one-time migration (`lib/migration/migration-orchestrator.ts`) uploads a full snapshot to Supabase and only then flips a gate (`profiles.migrated_at`) that prevents re-running. On every later login, a separate continuous-sync/restore path (`lib/migration/session-sync.ts`, not re-read line-by-line this pass but referenced consistently across the codebase) reconciles local vs. server state.

**Evidence**:
- `runLocalDataMigration` (`lib/migration/migration-orchestrator.ts:84-169`): checks `profiles.migrated_at` first (no-op if already set), defers if `isLocalPetMigrationReady()` returns false (a confirmed-but-unnamed pet — see below), builds a full snapshot (`buildLocalDataSnapshot`), writes it (`writeLocalDataSnapshot`), and **only after every table write succeeds** sets `migrated_at` — the function's own comment: *"this is the ONE place in the whole pipeline that ever writes migrated_at, and it is always the LAST write of a run, never the first."*
- `isLocalPetMigrationReady()` (`migration-orchestrator.ts:66-71`): defers migration entirely for a pet that's `confirmed` but has no `statlingName` yet — the comment explains why: migrating early would set `migrated_at` and permanently short-circuit the later call that would have carried the name to the server, since "nothing would ever call writePetRow again to offer it one."
- Trigger points: on Supabase session restore and every `SIGNED_IN` event, plus a retry from `NamingScreen.onConfirm` specifically to catch the just-described gap.

**Alternatives**: account-required from the start (no guest mode); write directly to Supabase from the first action (no local-first layer); a background queue instead of a single gated snapshot.

**Why this works**: A visitor never has to create an account to try the product, and the "did this account's local data get uploaded yet" question always has one unambiguous, durable answer (`migrated_at`), so a partial failure is always safe to retry as a whole rather than needing per-table bookkeeping.

**Trade-offs**: The deferral logic for a confirmed-but-unnamed pet is a real, narrow edge case that has to be understood and maintained correctly — get it wrong and a real user's chosen name could silently never reach the server. The one-time gate also means this migration path can never be re-purposed for anything ongoing; continuous reconciliation had to be built as a genuinely separate mechanism.

**Future considerations**: if the app ever needs a domain to sync *before* any account exists (e.g. server-side anti-cheat), this local-first model would need to change fundamentally, not just extend.

---

## ADR-003 — `SECURITY INVOKER` by default; `SECURITY DEFINER` only as a narrow, individually-justified exception

**Status**: Accepted (the umbrella security posture referenced by ADR-004, ADR-006, ADR-007, ADR-016)

**Context**: Some RPCs (the 3 migration "replace" functions) only ever touch the caller's own rows and could safely run with the caller's own privileges. Others (ranking, friend connections) must read or write rows that RLS would otherwise block for the caller.

**Decision**: Default every RPC to `SECURITY INVOKER`; use `SECURITY DEFINER` only for the specific functions that structurally require reading/writing across users, and treat each one as an individually-audited exception, never a blanket capability.

**Evidence** — quoted directly from `supabase/migrations/20260820000000_phase2b_replace_rpcs.sql:32-59` (the migration that established this posture):
> "All 3 functions are SECURITY INVOKER, not SECURITY DEFINER. ... Because every function runs SECURITY INVOKER, the DELETE/INSERT inside it execute as the calling (authenticated) role, so: (a) the existing grants above are sufficient... (b) the existing RLS policies still apply IN FULL, exactly as if the caller had issued the DELETE/INSERT directly via PostgREST — a bug in a function body below (e.g. a forgotten WHERE clause) would still be caught by RLS as a second, independent layer, which is the entire reason INVOKER was chosen over DEFINER here. A DEFINER function would run as the function's OWNER... bypassing RLS entirely and making the function's own WHERE/auth.uid() logic the ONLY thing standing between a bug and a cross-user data leak — unacceptable for something this security-sensitive."

Every later `SECURITY DEFINER` function explicitly references this same posture as its justification: the friend-connection migration's own comment (`20260828000000_phase3g2_friend_connection.sql:75-77`) states the DEFINER functions are "the same narrow, deliberate exception to this project's SECURITY INVOKER default... reading another user's `profiles.friend_code`, and inserting/deleting a `friendships` row that isn't 100% owned by the caller alone, both need it."

**Alternatives**: making every RPC `SECURITY DEFINER` for simplicity; loosening RLS policies directly instead of writing narrow RPCs.

**Why this works**: RLS remains a real, independent safety net for the majority of functions; only a small, auditable set of functions (11 as of HEAD: 6 global-ranking + 5 friend) carry the higher risk of bypassing it, and every one of them hard-limits its own output columns as a second layer of containment (see ADR-006).

**Trade-offs**: every `SECURITY DEFINER` function is a place where a coding mistake has strictly worse consequences than elsewhere in the schema — this raises the review bar specifically for those 11 functions.

**Future considerations**: any new cross-user read/write should default to asking "can this be INVOKER?" first, per this project's own established precedent, before reaching for DEFINER.

---

## ADR-004 — Ranking computed server-side via `SECURITY DEFINER` RPCs, behind a client-side provider abstraction that ended up partially bypassed

**Status**: Accepted, with one documented architectural nuance

**Context**: Global and (later) friend-scoped leaderboards need to rank all users' (or all friends') records, which per-row RLS cannot do for a single caller.

**Decision**: Six global-ranking RPCs (`get_overall_leaderboard_top`/`get_my_overall_rank`, `get_game_leaderboard_top`/`get_my_game_rank`, `get_xp_leaderboard_top`/`get_my_xp_rank`) plus three friend-scoped equivalents, all `SECURITY DEFINER`, all called directly from `ranking-screen.tsx`'s data-fetching hooks. The client only normalizes response field-casing; it does no sorting or aggregation.

**Evidence**:
- `lib/ranking/overall-leaderboard.ts`, `xp-leaderboard.ts`, `game-leaderboard.ts` — each calls `client.rpc('get_*_top', {...})` / `client.rpc('get_my_*', {...})` directly.
- Friend-scoped RPCs (`supabase/migrations/20260829000000_phase3g3_friend_ranking_rpcs.sql`) replicate the identical formula/tie-break SQL as their global counterparts, scoped by a `friendships`-derived CTE joined against `auth.uid()` server-side — never a client-supplied "who to include" list.

**The documented nuance**: `lib/ranking/ranking-provider.ts` defines a `RankingProvider` interface with its own doc comment (lines 60-70) explicitly framed as *"Ranking's swap seam: RankingScreen only ever talks to `rankingProvider`... Today that's LocalRankingProvider (device-local skill records + deterministic placeholder rivals, no backend). Once a real leaderboard exists server-side, adding a SupabaseRankingProvider... and swapping the singleton's assignment is the entire migration."* A real server-side leaderboard now exists (the 9 RPCs above), but `ranking-screen.tsx` was wired to call the RPCs **directly**, not through this abstraction — a grep confirms `ranking-screen.tsx` imports zero symbols from `ranking-provider.ts` beyond the `RankedDifficulty` type. The `LocalRankingProvider`/synthetic-rival-name implementation (`PLACEHOLDER_NAMES`, e.g. `'몽글이'`, `'또리'`) is **not dead in an absolute sense** — it is still imported and used by `lib/missions/ranking-achievements.ts` to power rank-based achievement/mission-unlock checks, a feature entirely separate from the visible Ranking screen.

**Alternatives**: wire `ranking-screen.tsx` through the `RankingProvider` interface as originally designed (a `SupabaseRankingProvider` implementing it); or remove the interface/local provider once the real backend shipped.

**Why this works**: the visible Ranking screen is confirmed 100% RPC-driven for both global and friend scope — real, correct data reaches users. The achievement system's use of synthetic placeholder data for rank-based unlocks is a much lower-stakes use case (an achievement about "top-ranked" doesn't need to reflect the real global leaderboard with the same fidelity a visible ranking screen does).

**Trade-offs**: the codebase now carries two independent, disconnected ways of answering "what's my rank" — the real RPC path (screen) and the synthetic path (achievements) — which is a real maintenance-burden and a source of potential confusion for anyone reading `ranking-provider.ts`'s doc comment at face value and assuming it still describes the live ranking screen's architecture.

**Future considerations**: either retire `ranking-provider.ts`/`LocalRankingProvider` by rewriting `ranking-achievements.ts` to call the real RPCs too, or explicitly re-scope the provider's doc comment to describe its actual current (achievement-only) role, so the abstraction's documented intent matches its real usage.

---

## ADR-005 — Friend relationships stored as one canonical, ordered pair row, not two directional rows

**Status**: Accepted

**Context**: A friendship between two users is inherently symmetric (if A is B's friend, B is A's friend) — but naively storing "A → B" and "B → A" as two separate rows risks the two ever disagreeing, and doubles the storage/RLS-check surface for no benefit.

**Decision**: One row per relationship, with `user_id_a`/`user_id_b` always ordered smaller-UUID-first, enforced by a CHECK constraint.

**Evidence** (`supabase/migrations/20260828000000_phase3g2_friend_connection.sql:129-136`):
```sql
create table if not exists public.friendships (
  user_id_a  uuid not null references auth.users (id) on delete cascade,
  user_id_b  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_a, user_id_b),
  constraint friendships_ordered check (user_id_a < user_id_b),
  constraint friendships_no_self check (user_id_a <> user_id_b)
);
```
`create_friendship`/`remove_friendship` both canonicalize the pair in application code via an explicit `if v_uid < v_target then ... else ... end if` branch (`create_friendship`, lines 266-272) — the migration's own comment states this uses a plain CASE-style branch rather than `LEAST()`/`GREATEST()` specifically because it was written without live database access to verify those functions' exact behavior in this project's Postgres version, so it fell back to the one construct the author could verify by first principles.

**Alternatives**: two directional rows (A→B and B→A) kept in sync by application logic or a trigger; a separate `status` enum on a single row instead of a canonical-ordering CHECK.

**Why this works**: `friendships_ordered` makes "does this pair already have a row" a single-row lookup with no `OR`-across-two-possible-orderings query, and the `PRIMARY KEY (user_id_a, user_id_b)` constraint makes a duplicate-insert attempt a plain, cheap conflict (`on conflict ... do nothing`) rather than requiring the application to first check for the row's existence in either direction.

**Trade-offs**: every piece of code that touches this table (the two write RPCs, the three friend-ranking RPCs' scoping CTEs) has to correctly re-derive "who is the other party" via a `case when user_id_a = v_uid then user_id_b else user_id_a end`-style branch, since the row itself doesn't label which side is "me."

**Future considerations**: if a future feature needs asymmetric state per party (e.g. "who initiated," "per-side mute"), this schema would need genuinely new columns or a second table — it cannot represent per-direction state today, by design.

---

## ADR-006 — `friend_code`: a dedicated 128-bit opaque token, never a raw user id

**Status**: Accepted

**Context**: Users need something shareable to find and connect with each other. The account's own primary key (`auth.users.id`/`profiles.id`) already uniquely identifies them, but using it directly in a public share link would expose a raw account identifier to anyone who received the link.

**Decision**: A dedicated `profiles.friend_code` column, unrelated to the account id and unrelated to `nickname` (which isn't unique), generated as `encode(gen_random_bytes(16), 'hex')` — 128 bits of pgcrypto CSPRNG entropy — lazily on first use, unique-indexed.

**Evidence**:
- `supabase/migrations/20260828000000_phase3g2_friend_connection.sql:20-31` (quoted): *"friend_code is a brand-new, dedicated, nullable, unique, opaque public identifier — 128 bits of randomness... This is deliberately NOT a raw auth.users/profiles UUID... 128 bits of CSPRNG entropy makes brute-forcing a specific code computationally infeasible; there is no secondary 'accept' step in this design..., so this unguessability is the entire security boundary for friend-adding."*
- `get_or_create_my_friend_code()` (lines 167-215): race-safe lazy generation (`update ... where friend_code is null`, retried up to 5× on a `unique_violation`).
- Verified this pass: no friend-related RPC (`create_friendship`, `remove_friendship`, `get_friend_invite_preview`, or the 3 friend-ranking RPCs) returns another party's raw `user_id` in its output — every one is hard-limited to `nickname`/`friend_code`/derived metrics/booleans.

**Alternatives**: use the account UUID directly in invite links; derive a code from `nickname` (rejected implicitly by the fact that nickname isn't unique — see the Phase 3B-2 migration).

**Why this works**: a leaked/screenshotted invite link never reveals an actual account identifier, and 128 bits makes guessing a valid code computationally infeasible.

**Trade-offs — explicitly named in the migration's own comment**: because there is no secondary "accept" step (see ADR-005's consent model), **the code itself is the entire access-control boundary** — anyone who has it can preview the owner's nickname and attempt a connection. This is a deliberate design choice, not an oversight, but it does mean `friend_code` functions as a capability token, not merely an identifier — a meaningfully different security property than a normal "username" would have, and worth naming explicitly for anyone extending this system later.

**Future considerations**: if the product ever needs revocable/rotatable invite links (e.g. "I want to invalidate my old code"), the current lazy-generate-once model has no rotation mechanism — that would be new work, not a config change.

---

## ADR-007 — Friend-table mutation restricted entirely to `SECURITY DEFINER` RPCs; zero client write access via RLS

**Status**: Accepted

**Context**: `friendships` rows describe a relationship between two accounts, neither of which "owns" the row in the usual single-owner RLS sense — a naive RLS policy allowing either party to write could let one party unilaterally falsify or corrupt state that should require both parties' consent to exist.

**Decision**: RLS on `friendships` grants **SELECT only**; there is no INSERT/UPDATE/DELETE policy, and no such privilege is granted to `authenticated` at all. The only way to create or remove a row is through `create_friendship`/`remove_friendship`, both `SECURITY DEFINER`, both constructing their `WHERE`/`INSERT` targets exclusively from `auth.uid()` plus a server-resolved target id — never from a client-supplied row or id pair.

**Evidence** (`supabase/migrations/20260828000000_phase3g2_friend_connection.sql:141-150`):
```sql
alter table public.friendships enable row level security;
create policy "friendships_select_own" on public.friendships
  for select using (auth.uid() = user_id_a or auth.uid() = user_id_b);
-- Deliberately no INSERT/UPDATE/DELETE policy, and no such privilege granted below.
grant select on public.friendships to authenticated;
```
`remove_friendship`'s own comment (lines 293-296) makes the guarantee explicit: *"The WHERE clause is built entirely from {v_uid, v_target} (never a raw caller-supplied id pair), so this can only ever delete a friendship the caller is genuinely a party to — that guarantee holds independent of RLS (which this SECURITY DEFINER function bypasses), purely from how the query itself is constructed."*

**Alternatives**: an RLS policy allowing either party to INSERT/DELETE directly (rejected implicitly — no such policy exists); a "both parties must approve" application-level workflow instead of pushing the guarantee into the query construction itself.

**Why this works**: a client can never construct an arbitrary `friendships` write, even via a crafted PostgREST request — the two-party integrity guarantee lives in the RPC's own query construction rather than depending on a client to behave, which is a stronger guarantee than RLS alone could provide for a two-owner row.

**Trade-offs**: any future friend-related mutation (e.g. a hypothetical "block" feature) will need its own new `SECURITY DEFINER` function following this same pattern — there is no generic client write path to extend.

**Future considerations**: none identified beyond ADR-003's general guidance to keep new DEFINER functions narrow and individually justified.

---

## ADR-008 — Pending friend-invite acceptance uses `sessionStorage`, the only use of it anywhere in the app

**Status**: Accepted

**Context**: A guest who clicks "connect" on a friend-invite link must sign up/in before `create_friendship` can run under their own identity. Google OAuth is a hard, full-page redirect — the app is left entirely and returns to a bare origin URL with no path/query preserved.

**Decision**: Store the pending `friend_code` in `sessionStorage` (not `localStorage`, and not relying on the URL surviving the round trip), consumed exactly once by a root-level effect after auth resolves.

**Evidence**:
- `app/auth/callback/route.ts` — confirmed (by direct reading, per the citing comment) to redirect back to the bare origin, dropping any original path/query.
- `lib/friends/pending-friend-code.ts:15-18` (quoted): *"sessionStorage (not localStorage) is deliberate: a pending invite is single-visit intent tied to the tab that received the invite link, not something that should silently resurface in an unrelated future tab/session days later."*
- The same file's comment also notes the email/password path doesn't hard-navigate, but a guest could still close the tab mid-flow, so both auth paths deliberately share this one mechanism rather than one relying on in-memory state and the other on storage.
- Consumption: a `useEffect` in `game-flow.tsx` gated on `user`, which fires on every fresh mount (the app always remounts at `/`), reads and immediately clears the pending code, then calls `create_friendship` once. Server-side idempotency (`on conflict do nothing`) makes a duplicate resume harmless.

**Alternatives**: `localStorage` (rejected per the comment — wrong persistence semantics for "single-visit intent"); re-encoding the code into the OAuth `redirectTo` URL itself (would require `app/auth/callback/route.ts` to thread an arbitrary query param through the whole OAuth handshake, a larger and more fragile change than storing one string).

**Why this works**: solves the actual problem (surviving exactly one hard redirect) without over-persisting intent that should expire with the browsing session — this is the one place in the entire app where `localStorage`'s "persist until explicitly cleared" semantics were judged wrong for the data's actual lifetime.

**Trade-offs**: if the user closes the tab before completing login, the pending invite is silently lost — by design, not a bug, but a real behavioral cost worth knowing about when debugging a "my friend invite didn't seem to work" report.

**Future considerations**: none identified — this is a narrowly-scoped, self-contained mechanism.

---

## ADR-009 — General share links and friend-invite links are built by two separate functions; `?ref=` is never bundled into a casual share

**Status**: Accepted

**Context**: Statling already has general-purpose share links (Character Reveal, MyPage) that can end up posted publicly on social media or blogs. If every share link carried a friend-invite token, anyone who saw a publicly-posted share link could silently connect as a "friend" of the poster.

**Decision**: `buildShareUrl(explicitUrl, context)` (general) and `buildFriendInviteUrl(explicitUrl, context, friendCode)` (friend-invite only) are two distinct functions; the latter wraps the former, adding `?ref=<friendCode>` on top. Only the explicit "친구와 기록 비교하기" MyPage action ever calls the friend-invite variant.

**Evidence** (`lib/share/build-share-text.ts:50-59`, quoted): *"Never call this for a general share (Character Reveal's '공유하기', MyPage's plain '공유 링크') — those must keep calling buildShareUrl as-is, with no ref param, since a general share link can end up posted publicly (SNS/blogs) and a standing friend-invite token must never ride along with every casual share."* Also stated in the schema migration itself (`20260828000000...sql:33-41`): the original Phase 3G-1 proposal to stamp *every* share URL with the code was explicitly revised for this reason before the current two-function split was built.

**Alternatives**: one `buildShareUrl` that always includes `?ref=` when the caller is signed in (the originally-proposed, then-revised design); a link-shortener/redemption-token system instead of a raw query param.

**Why this works**: the invite capability (ADR-006's trade-off) is scoped to exactly the one UI action a user deliberately takes to invite someone, never leaking into links meant for broad, anonymous sharing.

**Trade-offs**: two near-identical functions to keep in sync if the underlying UTM/URL-building logic ever changes — `buildFriendInviteUrl` must remember to keep wrapping `buildShareUrl` rather than drifting into its own reimplementation.

**Future considerations**: if a future feature needs a third "kind" of share link with its own token, this two-function pattern (wrap, don't duplicate) is the established precedent to follow.

---

## ADR-010 — Public share-URL identifier (`slug`) separated from the internal catalog id, with permanent legacy-URL support

**Status**: Accepted

**Context**: Statling's internal pet-catalog id (e.g. `01_치즈털실냥이`) is non-ASCII and was originally used directly as the Share URL path segment. A more URL-friendly, stable public identifier was wanted, but changing the URL shape risks breaking every already-shared link (including ones carrying `?ref=` friend-invite tokens or UTM parameters).

**Decision**: Add a `slug: string` field (e.g. `'cheese-cat'`) to each of the 30 static catalog entries — hand-picked, not database-backed, not derived by transliteration. Resolve a share URL's raw segment via `getPetProfileByPublicUrlId(raw) = getPetProfileBySlug(raw) ?? getPetProfileById(raw)` — slug first, falling back to the legacy internal id, **forever, with no redirect ever issued**.

**Evidence**:
- `lib/pets/pet-profile.ts:14-26` (`PetProfile.id` vs `PetProfile.slug` doc comments), `:61` (*"Hand-picked per pet (not derived from `name`), since a mechanical Korean->English transliteration would be neither readable nor stable"*), `:119-132` (module-load uniqueness assertion — throws on a duplicate slug, not a DB constraint), `:143-157` (`getPetProfileByPublicUrlId`'s doc comment, quoted in part): *"Tries the stable public `slug` first..., then falls back to the legacy internal `id`... so a pre-existing link keeps resolving forever, and neither form ever collides with the other (slugs are lowercase ASCII/hyphen, internal ids are numeric-prefixed Korean, disjoint by construction)."*
- No migration anywhere adds a `slug` column — confirmed by reading all 14 migration files; this is a pure application-code feature.
- New app-generated links (Reveal, MyPage, friend-invite) all build with `.slug`; `generateMetadata`'s canonical/OG URL advertises the slug form to crawlers even when the visited URL was the legacy form.

**Alternatives**: a database-generated/stored slug column with a migration + backfill; a redirect from legacy to new URLs; keeping the internal id as the only public identifier (the pre-existing state).

**Why this works**: zero database migration risk (a pure static-data change), zero broken-link risk for anything already shared, and the internal id remains completely untouched everywhere else in the system (see ADR-014) — this is a purely additive, low-risk way to improve the public-facing URL shape.

**Trade-offs**: two permanently-valid URL forms for the same content, forever — a minor SEO/canonicalization cost (mitigated by always advertising the slug form as canonical), and any future catalog editor must remember never to change an already-shared pet's slug, since there is no migration/versioning mechanism for it — only a runtime collision check, which would catch a *duplicate* but not silently "fix" a *changed* slug breaking old links.

**Future considerations**: if the catalog ever needs per-instance (not per-species) public identifiers, this slug design would need to move from "one slug per character type" to "one slug per (user, pet)" — a materially different, likely database-backed feature.

---

## ADR-011 — Statling's "birthday" reuses the existing `pets.confirmed_at` timestamp instead of a new column

**Status**: Accepted

**Context**: A new onboarding beat wanted to celebrate "the day this Statling was born" — but the app already records the moment a pet is locked in (`confirmPet()` sets `pets.confirmed = true` / `confirmed_at = now()`), and that moment is conceptually identical to "the day this Statling came into being."

**Decision**: `BirthdayScreen` derives its birthday date directly from `pets.confirmedAt` (client field name; `confirmed_at` in the DB), rather than introducing a new column.

**Evidence** (`components/brain-bet/screens/birthday-screen.tsx:29`, quoted): *"pets.confirmedAt (StoredPetProfile) — the moment '이 Statling과 함께하기' was clicked, this Phase's chosen Statling-birthday source of truth (see the Phase 3I-1 report for why: it's the actual confirm/birth moment, already persisted and synced, no new column needed)."*

**Distinguishing it from `PetMemory.firstMetAt`**: a separate field, `pet_memory.first_met_at`, powers a different, pre-existing "days together" figure shown elsewhere in the Room UI (e.g. `pet-care-hud.tsx`). These are two different concepts that happen to both derive from "when did this relationship begin": `confirmed_at` is "the moment I locked in this specific character," `first_met_at` is "the moment this device first encountered this pet's care/memory state." `BirthdayScreen` deliberately uses only the former.

**Alternatives**: a new `pets.birth_date`/`statling_birth_date` column, set once at confirmation time (functionally near-identical to reusing `confirmed_at`, but as a genuinely new, redundant column).

**Why this works**: zero schema change, zero new sync-domain wiring, and the value was already durable and already replicated through the existing migration/restore machinery — "no new column needed" is a literal, verifiable claim about this specific value already being present everywhere it needs to be.

**Trade-offs**: `confirmed_at`'s meaning is now overloaded — "when the pet was confirmed" (its original, still-accurate meaning) and "the pet's birthday" (its new UI framing) are the same value serving two purposes. If a future feature ever needed the two concepts to diverge (e.g. an allowed "change my Statling's canonical birthday" setting, independent of a re-confirmation), this reuse would have to be undone.

**Future considerations**: none identified beyond the divergence risk just named.

---

## ADR-012 — User `birth_date`/`gender` modeled as optional, guest-inaccessible profile fields with no local mirror

**Status**: Accepted

**Context**: A new profile-onboarding step wanted to optionally collect the human user's own birth date and gender — but the app's guest-first architecture means a large fraction of visitors at this point in the flow have no account row to write to at all.

**Decision**: `profiles.birth_date`/`profiles.gender`, both nullable, both written only through `updateProfileBirthday()` directly against Supabase — **no `localStorage` mirror exists for either field**, and the input UI is hidden entirely (not merely disabled) for a signed-out visitor.

**Evidence**:
- `supabase/migrations/20260901000000_phase3i1_profile_birthday.sql` — adds `birth_date date` (`check (birth_date is null or birth_date <= current_date)`) and `gender text` (`check (gender is null or gender in ('female','male','other','prefer_not_to_say'))`), both nullable, no default.
- `lib/profile/birthday.ts:4-19` (quoted): *"NOT part of lib/migration/write-local-snapshot.ts's domain machinery and NOT a lib/sync/sync-dispatcher.ts domain. Neither field has a localStorage-first offline copy... Deliberately guest-inaccessible: since there is no local mirror, a logged-out visitor has no row to write to."*
- `birthday-screen.tsx:125` — the entire input block is gated on `user` (from `useAuth()`); a guest sees only the Statling-birthday moment (ADR-011), never the profile-question UI at all.
- `handleContinue` (`birthday-screen.tsx:65-104`) never blocks progression: not signed in → continue immediately; both fields blank → continue with no network call; a save failure → error toast but still continues.
- Client-side validation (`validateBirthDate`, `lib/profile/birthday.ts:45-65`) enforces the same "never future" rule as the DB CHECK, plus a client-only "not implausibly old" (120-year) heuristic that the DB does not enforce — the module's own comment frames "too old" as "a soft UX floor, not a DB-level invariant."
- No `trackEvent`/`trackProductEvent` call exists anywhere in `birthday-screen.tsx` or `lib/profile/birthday.ts` — neither `birth_date` nor `gender` is ever sent to GA4 or PostHog (verified by reading both files in full this pass).

**Alternatives**: a `localStorage`-first copy synced later like most other domains (the app's usual pattern — explicitly not used here); making the fields required to reach Room (rejected — the whole screen is designed to never block).

**Why this works**: this is the same pattern already established for `nickname` (also Supabase-only, no local mirror), applied consistently to genuinely sensitive personal data — and the complete absence of an analytics send-path for either field means this PII cannot leak into either analytics platform even by an unrelated future mistake elsewhere, since there's no code path that ever reads these values except the one write function and whatever future feature might explicitly query `profiles` for them.

**Trade-offs**: because there's no local mirror, this data is genuinely unavailable to a guest, and is lost if the write itself fails (though the failure is surfaced via toast, not silently swallowed) — this is a deliberate lower level of durability than every other domain in the app gets.

**Future considerations**: if this data is ever surfaced in a personalization feature that also needs to work for guests, the "no local mirror" design would need to be revisited.

---

## ADR-013 — GA4 and PostHog run in parallel with explicitly separated roles, never merged into one call

**Status**: Accepted

**Context**: The product wants both acquisition/traffic-shaped reporting (the kind GA4 is built for) and product-behavior/funnel/A-B/retention analysis (the kind PostHog is built for).

**Decision**: Two entirely independent event-tracking layers — `trackEvent` (`lib/analytics/ga.ts`) and `trackProductEvent` (`lib/analytics/analytics.ts`) — fired as separate, adjacent calls at the same real user actions, never through a shared dispatch function, and with deliberately different event *names/shapes* even when describing the same action (e.g. GA4's `mini_game_complete` vs. PostHog's `game_completed`).

**Evidence** (`lib/analytics/analytics.ts:3-20`, quoted in part): *"This is a PostHog-only companion to lib/analytics/ga.ts, not a replacement or a migration of it: GA4 (acquisition/traffic) keeps firing its own events at its own existing call sites, completely untouched. This layer exists so the small set of PRODUCT/funnel/retention events... have one typed, centralized place to be added — call sites never call posthog.capture() directly, and never repeat this taxonomy inline."* And (`analytics.ts:150-156`): *"Fires a PostHog product event... Deliberately PostHog-only for this phase: GA4's own trackEvent() calls at these same moments are untouched and keep firing independently — this is always an ADDITIONAL call next to the existing one, never a replacement."*

New friend-feature events land in both files with matching shapes but are still two separate typed entries and two separate call sites (e.g. `friend-invite-cta.tsx` fires both `trackEvent('friend_invite_opened', ...)` and `trackProductEvent('friend_invite_opened', ...)` as adjacent, independent calls, per the pattern established for every prior event).

**Alternatives**: one unified analytics abstraction that fans out to both platforms internally; using only one platform for everything.

**Why this works**: neither platform's config needs to try to serve a purpose it isn't suited for, and the codebase's own comment makes the intended division ("GA4 = acquisition/traffic," "PostHog = product/funnel/A-B/retention") explicit and enforceable at the type level (`GAEventParams` vs. `ProductEventParams` are separate interfaces).

**Trade-offs**: every event that matters to both systems needs two call sites and two (deliberately different-shaped) definitions to keep in sync by hand — there is no compiler-enforced guarantee the two stay paired when a new event is added, only convention (visible as an adjacent-lines pattern at every call site).

**확인 불가**: whether "why two platforms instead of one" reflects a deliberate product-analytics strategy decided elsewhere (e.g. cost, team familiarity, feature gaps in one platform) is not evidenced in the repository — only the *role split between the two, once both exist* is code-documented, not the original choice to run both.

**Future considerations**: if the event count keeps growing, a shared "define once, dispatch to both with per-platform shape mapping" layer would remove the hand-sync risk — not built today.

---

## ADR-014 — Internal `petId` remains the identity used by Dex, sync, and analytics; `slug` is a share-URL-only public representation

**Status**: Accepted (a direct consequence of ADR-010, recorded separately because it spans different subsystems)

**Context**: Once a public `slug` existed for Share URLs (ADR-010), every other subsystem that already referenced a pet by its internal catalog id needed a clear answer: keep using the internal id, or switch to the new slug too.

**Decision**: Every non-Share-URL subsystem keeps using the internal `id` — never the `slug` — untouched by the slug feature.

**Evidence**:
- `lib/pets/dex-storage.ts:44` — `addMetPet(petId: string)` is called with the internal id both when a user's own pet is confirmed and when a friend's shared Statling is recorded via `share-page-client.tsx`; the Dex's own `metPetIds` array stores internal ids.
- `lib/pets/pet-profile.ts:18-20` — `PetProfile.slug`'s own doc comment states this explicitly: *"used ONLY in Share URLs... never as a lookup key anywhere else in the app (Dex, Ranking, Supabase, analytics `pet_id` all keep using `id`, untouched)."*
- Supabase: `pets.character_id` (the DB column) still stores the internal id — no migration ever added a `slug` column (confirmed in ADR-010's evidence).
- Analytics: GA4's `friend_invite_opened{pet_id}` and its PostHog counterpart both send the internal id, per each event's own doc comment describing `pet_id` as "the species catalog id already sent by several existing events (e.g. `statling_reveal`'s `statling_type`)" — never the slug.

**Alternatives**: migrating every internal reference to the slug as well, for a single consistent identifier throughout the app (rejected implicitly — the doc comment states this was a deliberate scope limit of the slug feature).

**Why this works**: the slug feature shipped as a strictly additive, narrowly-scoped change — every existing subsystem's behavior, storage shape, and analytics event shape is provably untouched, which is exactly what made ADR-010's "permanent legacy URL, zero migration risk" property possible in the first place. Splitting "public representation" (slug) from "internal identity" (id) cleanly is what let one change without touching the other.

**Trade-offs**: two different identifiers for the same conceptual entity now exist in the codebase, and any future code that needs to go from "a slug I have" back to "the internal id" (or vice versa) must remember to use `getPetProfileBySlug`/`getPetProfileById` rather than assuming the two are interchangeable strings.

**Future considerations**: none beyond what ADR-010 already names.

---

## ADR-015 — `create_friendship`'s schema change required `DROP FUNCTION` + `CREATE FUNCTION`, not `CREATE OR REPLACE`

**Status**: Accepted (an operational/maintenance precedent, not a product decision)

**Context**: Analytics needed `create_friendship` to report whether a connection was genuinely new (vs. an idempotent re-accept of an existing friendship) — but the function's original `returns table(connected boolean, nickname text)` shape had no such field, and this project's usual pattern for fixing an already-applied RPC is `create or replace function` (successfully used once already, for the Overall-ranking ambiguous-column bug).

**Decision**: Drop the function and recreate it with a third output column, `is_new_connection boolean`, rather than attempting `CREATE OR REPLACE`.

**Evidence** (`supabase/migrations/20260831000000_phase3g5_followup_create_friendship_is_new.sql`, per the earlier ground-up audit of this file): the migration's own comment states this was **not** a documentation-derived choice but confirmed by a real failed apply attempt against this project's own database, which returned Postgres error `42P13: cannot change return type of existing function` — `CREATE OR REPLACE FUNCTION` cannot alter a function's declared `RETURNS TABLE(...)` OUT-parameter list, only its body. The fix computes `is_new_connection` via `GET DIAGNOSTICS v_row_count = row_count` immediately after the idempotent `INSERT ... ON CONFLICT DO NOTHING`, and — because `DROP FUNCTION` clears any privilege grants on the dropped object (unlike `CREATE OR REPLACE`, which preserves them) — the migration explicitly reissues `revoke ... from public/anon` + `grant execute ... to authenticated` in the same file.

**Alternatives**: keep the 2-column shape and add a *new*, separate function for the "is this new" question (avoids the DROP+CREATE issue entirely, at the cost of two round trips from the client instead of one).

**Why this works**: the DROP+CREATE approach keeps the client-facing API to one RPC call, matching every other create/remove RPC's shape (a single call, a single result row).

**Trade-offs**: a `DROP FUNCTION` is a real schema-breaking operation for the brief window between the drop and the recreate — any concurrent caller mid-transaction against the old function during that window would fail. In a migration-file-applied system (not a live hot-patch), this window is whatever the migration-runner's own execution takes, not something this repository's tooling appears to control finely (确인 불가 on the exact deployment mechanics from the repo alone).

**Future considerations**: this migration is now the project's own documented precedent for "how to change an RPC's return shape" — any future signature change should follow this same DROP+reissue-grants pattern rather than assuming `CREATE OR REPLACE` will work.

---

## ADR-016 — `get_friend_invite_preview` is the schema's one function granted to `anon`

**Status**: Accepted

**Context**: A logged-out visitor who opens a friend-invite link should see who invited them ("OO님과 친구가 되어...") before being asked to sign up — but `create_friendship` requires an authenticated session and has real side effects, and `profiles` RLS blocks cross-user reads even for signed-in callers, let alone anonymous ones.

**Decision**: One new, narrowly-scoped, read-only `SECURITY DEFINER` function, granted to **both** `anon` and `authenticated` — the only function in the entire schema with any `anon` grant at all.

**Evidence** (`supabase/migrations/20260830000000_phase3g4_friend_invite_preview.sql:67-87`, per the ground-up audit of this file): `get_friend_invite_preview(p_friend_code text) returns table(nickname text)`, `language sql stable`, a single exact-match `SELECT`, returning zero rows for an unknown/blank code rather than raising. Justified in the migration's own reasoning as safe specifically because: the exposed data (`nickname`) is already public ranking information elsewhere in the app; the lookup is exact-match only (no partial match, no listing/enumeration capability); and the function has zero side effects (a plain `SELECT`, nothing written).

**Alternatives** (per the migration's own stated reasoning): reusing `create_friendship` for the preview (rejected — it requires a session and has side effects); relying on `profiles` RLS directly (rejected — blocks the cross-user read even for an authenticated caller, let alone a guest).

**Why this works**: the previewed information (a nickname) carries materially less risk than anything else in the friend system, and every property that would make an anon-accessible function dangerous (write access, enumeration, non-public data) is absent by construction.

**Trade-offs**: this is a genuine first crack in an otherwise-universal "anon gets zero table/function access" posture across the whole schema — worth flagging explicitly to anyone reviewing this schema's security model for the first time, since every other access-control statement in this codebase can be read as "anon has nothing," and this is the sole, deliberate exception.

**Future considerations**: any future anon-accessible function should be held to at least this same bar (read-only, exact-match, already-public data, zero side effects) — this migration is the project's working precedent for what's judged acceptable to expose without authentication.

---

## Decision Index

| ADR | Decision | Category | Status | Main Trade-off |
|---|---|---|---|---|
| ADR-001 | Supabase (Auth+Postgres+RLS+RPC) as the sole backend | Data / Persistence | Accepted | Elevated-privilege logic must live in PL/pgSQL, not app code |
| ADR-002 | Local-first with a one-time, gated account migration | Persistence / Product Architecture | Accepted | Deferral edge case (confirmed-but-unnamed pet) must stay correct |
| ADR-003 | `SECURITY INVOKER` default, `SECURITY DEFINER` narrow exception | Security | Accepted | Every DEFINER function is a higher-stakes review surface |
| ADR-004 | Ranking via server RPCs, behind a partially-bypassed provider abstraction | Data / Product Architecture | Accepted | Two disconnected ranking data paths (screen vs. achievements) |
| ADR-005 | Friend relationships as one canonical ordered-pair row | Data | Accepted | Cannot represent per-direction/asymmetric state |
| ADR-006 | `friend_code`: 128-bit opaque token, never a raw UUID | Security | Accepted | The code itself is the entire access-control boundary |
| ADR-007 | Friend-table mutation restricted to `SECURITY DEFINER` RPCs | Security | Accepted | No generic client write path for future friend features |
| ADR-008 | Pending friend-invite uses `sessionStorage`, not localStorage | Authentication / Persistence | Accepted | Closing the tab mid-flow silently drops the pending invite |
| ADR-009 | General share vs. friend-invite links built by separate functions | Sharing / Security | Accepted | Two functions to keep in sync by convention |
| ADR-010 | Public `slug` separated from internal `petId`, permanent legacy URLs | Sharing / Data | Accepted | Two permanently-valid URL forms forever |
| ADR-011 | Statling birthday reuses `pets.confirmed_at`, no new column | Data / Product Architecture | Accepted | `confirmed_at` now serves two overloaded meanings |
| ADR-012 | `birth_date`/`gender`: optional, guest-inaccessible, no local mirror, no analytics | Data / Privacy | Accepted | Zero durability for a guest; data lost if guest never logs in |
| ADR-013 | GA4 + PostHog run in parallel with separated roles | Analytics | Accepted | Manual two-call-site sync burden for every new event |
| ADR-014 | Internal `petId` stays canonical for Dex/sync/analytics; slug is URL-only | Data / Sharing | Accepted | Two identifiers to keep straight for the same entity |
| ADR-015 | `create_friendship`'s new field required DROP+CREATE, not REPLACE | Data / Persistence | Accepted | Grants must be manually reissued after DROP |
| ADR-016 | `get_friend_invite_preview` is the schema's sole anon-accessible RPC | Security | Accepted | First crack in an otherwise-universal anon-zero-access posture |

---

## Portfolio-Relevant Architecture Decisions

Selected for interview relevance to data analytics / DX (developer experience) / AX (application experience) / product-data roles — chosen for depth of trade-off reasoning, not for impressive-sounding outcomes.

**ADR-002 — Local-first with a one-time, gated account migration.**
Problem: let anonymous users start immediately without losing progress if they later create an account. Choice: write everything to `localStorage` unconditionally, then run a single, idempotent, all-or-nothing upload gated by one durable flag (`profiles.migrated_at`), set only after every table write succeeds. Technical grounding: the gate is deliberately the *last* write, not the first, so a partial failure is always safe to retry as a whole rather than needing per-domain reconciliation bookkeeping. Data/product angle: this is a concrete example of designing for eventual, gated consistency between two data stores with very different durability guarantees, without introducing a distributed-transaction system.

**ADR-003 — `SECURITY INVOKER` by default, `SECURITY DEFINER` as a named exception.**
Problem: some server functions must read across users; most don't need to. Choice: default to running with the caller's own privileges (so RLS remains a real, independent safety net), and treat every privilege-elevated function as an individually justified, narrowly-scoped exception. Technical grounding: the reasoning is stated directly in the migration that established the pattern — a bug in an INVOKER function is still caught by RLS; a bug in a DEFINER function is not. Data/product angle: this is a clear, articulable example of defense-in-depth applied to a real schema, not an abstract principle — useful to walk through in a security-minded data-engineering conversation.

**ADR-004 — Ranking via server RPCs, with an honestly-documented architectural gap.**
Problem: compute cross-user leaderboards server-side. Choice: nine purpose-built RPCs, called directly by the UI. Technical grounding: a pre-existing client-side "provider" abstraction, explicitly designed to make swapping in a real backend a one-line change, ended up bypassed by the actual integration — the real backend was wired in directly, and the abstraction now survives only for an unrelated (achievement-checking) use case. Data/product angle: a genuinely useful, honest story about an abstraction that didn't get used the way it was designed to be — the kind of "here's a real gap I can identify and would clean up" answer that's more credible than a story with no rough edges.

**ADR-006 — `friend_code` as an opaque 128-bit token, not a raw account id.**
Problem: let users share an invite link without leaking an account identifier. Choice: a dedicated, high-entropy random token, structurally unrelated to the account's real id or its (non-unique) nickname. Technical grounding: the code doubles as the entire access-control boundary, since there's no separate accept/approve step — a deliberate, named trade-off, not an oversight. Data/product angle: a compact example of designing an identifier's *properties* (unguessable, revocation-free, capability-like) to match its actual security role, rather than reusing a convenient existing id.

**ADR-010 — Public slug separated from internal identity, with permanent legacy URLs.**
Problem: improve public share-URL readability without breaking already-shared links. Choice: a purely additive, static, application-code-only slug field, resolved with a slug-first/id-fallback lookup that never redirects. Technical grounding: zero database migration, zero risk to any already-shared link (including ones carrying UTM or friend-invite tokens), verified by confirming no other subsystem (Dex, analytics, Supabase) was touched by the change (see ADR-014). Data/product angle: a clean illustration of separating a system's *external, user-facing representation* from its *internal identity* — directly relevant to any conversation about public API/URL design and backward compatibility.

**ADR-012 — Optional profile fields with zero analytics exposure.**
Problem: collect optional, sensitive demographic data (birth date, gender) without it leaking into either analytics platform or degrading the guest experience. Choice: Supabase-only storage with no local mirror, guest-hidden input, and — verified directly in code, not assumed — no call site anywhere that sends either field to GA4 or PostHog. Data/product angle: a directly relevant example of a privacy-by-construction pattern for a data/analytics role — the absence of a leak path was verified, not merely assumed, which is exactly the kind of due diligence this kind of role should be able to describe doing.

**ADR-013 — Parallel GA4 + PostHog with an explicit role split.**
Problem: support both acquisition/traffic reporting and product-behavior/funnel/A-B analysis. Choice: two independent, differently-shaped event taxonomies, fired as separate calls at the same real actions, with the intended division stated directly in code comments and enforced structurally via two separate TypeScript interfaces. Data/product angle: a concrete, code-verifiable example of designing an analytics layer around "which tool is this question actually for" rather than routing everything through one system — useful to discuss the trade-off between platform specialization and manual-sync maintenance cost.

---

## Final QA notes

Before writing this document, the following were each independently re-read from the current HEAD rather than assumed from the Master Documentation or prior conversation: `supabase/migrations/20260828000000_phase3g2_friend_connection.sql` (full), `supabase/migrations/20260820000000_phase2b_replace_rpcs.sql` (security-model section), `lib/friends/pending-friend-code.ts` (full), `lib/share/build-share-text.ts` (full), `lib/pets/pet-profile.ts` (through `findCharacterByStats`), `lib/profile/birthday.ts` (full), `components/brain-bet/screens/birthday-screen.tsx` (full), `lib/pets/dex-storage.ts` (full), `lib/migration/migration-orchestrator.ts` (full), `lib/ranking/ranking-provider.ts` (interface + doc comment), `lib/missions/ranking-achievements.ts` (top of file). Specific checks made against the required QA list:
- No table/column/RPC name above was used without being read directly in a migration file this session (not merely recalled).
- `LocalRankingProvider`/`ranking-provider.ts` is explicitly described as dead **for the visible Ranking screen** but alive **for `ranking-achievements.ts`** — the two are not conflated.
- Every mention of `slug` is scoped to Share URLs only; every mention of Dex/sync/analytics identity is scoped to the internal `id` — never mixed.
- No claim above states that a given `localStorage` domain is also Supabase-synced, or vice versa, without a specific citation (e.g. `birth_date`/`gender` are explicitly called out as having *no* local mirror, unlike most other domains).
- No GA4/PostHog event name or property above was invented — `friend_invite_opened`, `friend_connected`, `friend_ranking_viewed` and their shapes were confirmed by direct reads of `lib/analytics/ga.ts`/`lib/analytics/analytics.ts` earlier in this session.
- `anon` vs. `authenticated` grants are stated per-function from the actual `revoke`/`grant` statements in each migration, not inferred.
- "Phase 3G-2"/"Phase 3I-1"/etc. labels are used only as direct citations of the migration files' own self-identification, never as a stand-in for an "architecture layer" or invented framework name.
