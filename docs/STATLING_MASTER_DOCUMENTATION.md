# Statling — Master Technical Documentation

> **Source of truth**: the current repository code (`c:\mipet\Brain_Pet`), at git HEAD `4e54742` (branch `main`), audited directly — not `DEVELOPMENT_PLAN.md`/`MVP_SCOPE.md`/`GAME_SPEC.MD`/`기획.md`, which are planning documents cited only to distinguish *planned* from *implemented*.
> **Method**: every claim below is grounded in an actual file, cited as `path:line` wherever practical. Where the repository does not contain enough evidence to answer a question, this document says **"확인 불가"** rather than guessing.
> **This is a ground-up re-audit**, not an update of an earlier draft. An earlier version of this document (written against an older commit) is invalid and was not used as a source — several of its conclusions (no Friend System, no separate public slug, no birthday UI, sessionStorage unused) are **reversed** below, because real feature work landed on `main` since then. Where this matters, the change is called out explicitly.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Data Architecture](#3-data-architecture)
4. [Assessment & Ability System](#4-assessment--ability-system)
5. [Mini Game System](#5-mini-game-system)
6. [Statling / Pet System](#6-statling--pet-system)
7. [Ranking System](#7-ranking-system)
8. [Friend System](#8-friend-system)
9. [Share & Dex](#9-share--dex)
10. [Authentication & Persistence](#10-authentication--persistence)
11. [Analytics](#11-analytics)
12. [Security & Privacy](#12-security--privacy)
13. [Production / QA Architecture](#13-production--qa-architecture)
14. [Architecture Decision Log](#14-architecture-decision-log)
15. [Current Implementation Status](#15-current-implementation-status)

---

## 1. Product Overview

### 1.1 What Statling is

Statling is a Next.js single-page web app in which a visitor plays a short battery of mini-games to discover 6 "abilities," is deterministically matched to one of 30 fixed pet characters based on their top-2 abilities, then raises that pet in a "Room," climbs global and (now) **friends-only** leaderboards, and can connect with friends via a shareable invite code.

### 1.2 Core loop

```
Assessment (6 mini-games, ~2-3 min) → Statling reveal → Room (daily care) →
Free Play (retry any of 12 games at 4 difficulties) → Ranking (global or friends) →
Share / Friend Connect
```

### 1.3 Real user flow (code-traced)

Everything except 4 narrow URL endpoints (§1.4) is **one single-page app** — a single React component, `GameFlow` (`components/brain-bet/game-flow.tsx`), driving a `phase` state machine. The browser URL stays at `/` throughout.

**The full `Phase` union — 18 values** (`game-flow.tsx:173-191`):
`landing`, `login`, `game`, `complete`, `freeplay-complete`, `egg`, `reveal`, `save`, `naming`, **`birthday`**, `room`, `mystats`, `ranking`, `mypage`, `statling`, `grow`, `grow-game`, `mission`.

**First-time guest path**:

```
landing               Landing A/B experiment (see §2, §11)
  → game              1st of 6 assessment mini-games (start('landing'), game-flow.tsx:899-909)
  → complete          result screen for that ability
  → game → complete   … repeated for all 6 abilities (goNextFirst, game-flow.tsx:971-976)
  → egg               handleMeetStatling() locks in the pet (game-flow.tsx:1768-1783)
  → reveal            character reveal
  → save              handleConfirmPet() ("이 Statling과 함께하기", game-flow.tsx:1865-1879) — login/signup upsell, skippable
  → naming            name the Statling (1-8 chars, profanity-filtered)
  → birthday          NEW — "Statling's birthday" beat + optional birth_date/gender (game-flow.tsx:2092)
  → room              genuine first Home arrival (BirthdayScreen.onContinue, game-flow.tsx:2101)
```

**`birthday` is new** (commit `4e54742`, "feat: add birthday and optional profile onboarding"), inserted strictly between Naming and Room, and reachable **only** from the one first-time `NamingScreen.onConfirm` call site — a returning user with an already-named, confirmed pet is routed straight to `room` and never sees it again (`game-flow.tsx:445-464`). It always shows a "🎂 {name}의 생일이에요!" moment sourced from the pet's own `confirmedAt` timestamp (no new field needed for that part), and — **only for a signed-in account** (hidden entirely for a guest) — offers optional `birth_date`/`gender` inputs that save straight to Supabase and never block progression, even on a save failure (`components/brain-bet/screens/birthday-screen.tsx:65-103`).

**Room-nav-accessible phases** (not onboarding steps — `NAV_PHASES = ['room','mystats','ranking','statling','mypage']`, `game-flow.tsx:194`): 내 스탯(`mystats`), **랭킹(`ranking`, now with a 전체/친구 scope toggle — §7)**, Statling(`statling`), 마이페이지(`mypage`).

**Reached only from Room**: `mission`, `grow` → `grow-game` → `game`/`freeplay-complete` (Free Play, same phase names as assessment, distinguished only by `flowMode`).

**Corrected reference flow** (against the code):
> Landing → Assessment(6 games) → Egg → Reveal → Save(login/signup, skippable) → Naming → **Birthday/optional profile** → Room → (Free Play / Ranking[global or friends] / MyPage / Statling / Mission) → **Share / Friend Connect**

The originally-hypothesized "Birthday/Profile onboarding" step now genuinely exists, exactly where a reasonable person would expect it (right after Naming). "Friend" in the flow is now a real, separate connect action (§8) — not merely a share-card label.

### 1.4 Real URL-addressable routes

Still only 5:

| Route | File | Kind |
|---|---|---|
| `/` | `app/page.tsx` | renders `<GameFlow/>` |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth/email-confirm redirect target |
| `/share/[petId]` and `/share/[petId]/[topStat]/[secondaryStat]` | `app/share/[petId]/[[...stats]]/page.tsx` | public share landing — **the `petId` segment now accepts a public slug OR a legacy internal id**, see §9.2 |
| `/api/og/share` | `app/api/og/share/route.tsx` | dynamic per-pet OG image |
| `/opengraph-image` | `app/opengraph-image.tsx` | static site-wide default OG image |

---

## 2. System Architecture

| Technology | Role in Statling |
|---|---|
| **Next.js 16.2.6** (App Router, Turbopack) | Whole app. `next.config.mjs` sets `typescript: { ignoreBuildErrors: true }` and `images: { unoptimized: true }` — **`next build` does not fail on TS errors** despite `tsconfig.json`'s `"strict": true`. |
| **TypeScript** | Strict-mode typed, not enforced at build time (above). |
| **Supabase** | Postgres + Auth + RLS + RPC. Browser (`lib/supabase/client.ts`) and server (`lib/supabase/server.ts`) clients, **both anon-key only** — no service-role client anywhere in the repo (re-confirmed by grep in this audit). |
| **Supabase Auth** | Google OAuth + email/password. No anonymous/guest Supabase session — guest data lives only in localStorage/sessionStorage. |
| **PostgreSQL** (via Supabase) | **20 tables** now (the original 19 + new `friendships`), across **14 migrations** (up from 8). RLS enabled on every table. See §3. |
| **RPC** | Three families: (a) 3 `SECURITY INVOKER` migration-replace functions; (b) 6 `SECURITY DEFINER` global-ranking RPCs; (c) **NEW**: 5 `SECURITY DEFINER` friend RPCs (`get_or_create_my_friend_code`, `create_friendship`, `remove_friendship`, plus 3 friend-scoped ranking RPCs) + **1 `SECURITY DEFINER` function granted to `anon`** (`get_friend_invite_preview`) — the only anon-accessible RPC in the whole schema. See §3, §7, §8, §12. |
| **Vercel** | Deployment target. Still **no `vercel.json`, no CI config** (`.github` doesn't exist) — deployment relies solely on `next build` succeeding. See §13. |
| **`proxy.ts`** | Next.js 16's renamed Middleware convention. Session-cookie refresh only; no gating/redirects/header injection. Unchanged. |
| **GA4** | 35 original event types + **3 new friend events** (`friend_invite_opened`, `friend_connected`, `friend_ranking_viewed`) = 38 total. See §11. |
| **PostHog** | The currently-*committed* catalog is **20 event types**: the original Phase 3A-2 set (17) + `landing_experiment_viewed` + the 3 new friend events. See §11.4 for an important caveat about this number. |
| **localStorage** | Still the primary guest data store; ~26+ keys, unchanged mechanics. |
| **sessionStorage** | **Now used** — one key, `statling.pendingFriendCode.v1` (`lib/friends/pending-friend-code.ts`), holding a friend-invite code across the Google-OAuth hard-redirect round trip. This reverses an earlier "zero usage" finding. See §8.4, §10.4. |

---

## 3. Data Architecture

*Full audit: all 14 migration files under `supabase/migrations/` read in full, chronologically. `supabase/verify_phase1.sql` still exists but is stale — it only verifies the original 19 Phase-1 tables and was never updated for Phase 2/3.*

### 3.1 Migration inventory (14 files, chronological)

1. `20260819000000_phase1_schema_and_rls.sql` — the original 19-table schema + RLS.
2. `20260820000000_phase2b_replace_rpcs.sql` — 3 atomic-replace migration RPCs.
3. `20260822000000_phase2d6_followup_sync_updated_at.sql` — `profiles.sync_updated_at`.
4. `20260823000000_phase3b2_profile_nickname.sql` — `profiles.nickname`.
5. `20260824000000_phase3b3_xp_leaderboard_rpcs.sql` — XP leaderboard RPCs.
6. `20260825000000_phase3b5_overall_leaderboard_rpcs.sql` — Overall leaderboard RPCs.
7. `20260826000000_phase3b5_followup_fix_ambiguous_column.sql` — bug fix for #6.
8. `20260827000000_phase3b7_game_leaderboard_rpcs.sql` — per-game leaderboard RPCs.
9. **`20260828000000_phase3g2_friend_connection.sql`** — NEW: `friendships` table, `profiles.friend_code`, `get_or_create_my_friend_code`, `create_friendship` (v1), `remove_friendship`.
10. **`20260828010000_phase3g2_followup_gen_random_bytes_search_path.sql`** — NEW: `search_path` bug fix for friend-code generation.
11. **`20260829000000_phase3g3_friend_ranking_rpcs.sql`** — NEW: 3 friend-scoped ranking RPCs.
12. **`20260830000000_phase3g4_friend_invite_preview.sql`** — NEW: `get_friend_invite_preview` (the one anon-accessible RPC).
13. **`20260831000000_phase3g5_followup_create_friendship_is_new.sql`** — NEW: `create_friendship` v2 (adds `is_new_connection`), via DROP+CREATE.
14. **`20260901000000_phase3i1_profile_birthday.sql`** — NEW: `profiles.birth_date`, `profiles.gender`.

**Note**: the "public slugs for Statling share URLs" feature (commit `b3d9dbb`) has **no corresponding migration** — it's purely static, hand-authored data in application code (§6.2, §9.2), never touching the database.

### 3.2 Schema shape (20 tables)

The original 19 (see the table below) are unchanged in shape except `profiles`, which gained 5 columns across 5 separate migrations.

| Table | PK | Purpose |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`) | account metadata — see §3.4 |
| `pets` | `user_id` | server-authoritative Statling record (1-user-1-pet via PK) |
| `player_skill_records` | `(user_id, game_id, difficulty)` | best record per game×difficulty |
| `xp_totals` | `user_id` | `total_xp`, `weekly_xp`, `week_key` |
| `dex_entries` | `(user_id, character_id)` | "met" character collection, append-only |
| `achievements`, `daily_missions`, `attendance`, `activity_counters` | `user_id`-scoped | progress/streak/counter state |
| `pet_care_state`, `room_state`, `room_care_state` | `user_id` | care stats, room background, room cleanliness |
| `room_items`, `deco_placement_items` | `instance_id` (uuid) | placed furniture/decorations — the only tables besides `user_notes` with DELETE |
| `room_inventory`, `deco_inventory` | `(user_id, asset_id)` | unlocked assets, append-only |
| `pet_memory`, `dialogue_memory` | `user_id` | relationship/dialogue memory |
| `user_notes` | `id` (uuid) | free-text notes, append+delete, no update |
| **`friendships`** (NEW) | **`(user_id_a, user_id_b)`** | symmetric friend connections — see §3.3, §8 |

### 3.3 `friendships` — the new table, and its two-party RLS pattern

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
- **Symmetric, not directional** — one canonically-ordered row (`user_id_a < user_id_b`, enforced by CHECK) represents an already-mutual friendship. **No status column, no pending/request state at all.** The migration's own header states the consent model plainly: "No invitation/request table... possessing a friend_code is A's invitation... calling `create_friendship` with it is B's consent." The row is born already-confirmed.
- **RLS — the schema's one materially different pattern** (every other table uses a single `auth.uid() = user_id`):
  ```sql
  create policy "friendships_select_own" on public.friendships
    for select using (auth.uid() = user_id_a or auth.uid() = user_id_b);
  -- Deliberately no INSERT/UPDATE/DELETE policy, and no such grant either.
  grant select on public.friendships to authenticated;
  ```
  Mutation is possible **only** through the SECURITY DEFINER RPCs (§3.5), which build their own `WHERE`/`INSERT` targets from `auth.uid()` + a resolved target id server-side — never from a client-supplied row.

### 3.4 `profiles` — full current column list

| Column | Type | Added in | Constraint |
|---|---|---|---|
| `id` | `uuid` (PK) | Phase 1 | FK → `auth.users(id)` cascade |
| `legacy_device_id` | `text` | Phase 1 | — |
| `migrated_at` | `timestamptz` | Phase 1 | — |
| `created_at`/`updated_at` | `timestamptz` | Phase 1 | — |
| `sync_updated_at` | `timestamptz` | Phase 2D-6 Follow-up | — |
| `nickname` | `text` | Phase 3B-2 | no unique constraint (duplicates allowed by product decision) |
| **`friend_code`** | `text` | **Phase 3G-2** | **unique index**; nullable until lazily generated |
| **`birth_date`** | `date` | **Phase 3I-1** | `check (birth_date is null or birth_date <= current_date)` |
| **`gender`** | `text` | **Phase 3I-1** | `check (gender is null or gender in ('female','male','other','prefer_not_to_say'))` |

**Correction vs. an earlier finding**: `birth_date`/`gender` and `friend_code` now genuinely exist. They were previously absent because these commits hadn't landed yet — not because they were "optionally designed out."

None of the 5 new/added columns got a dedicated RLS policy — all rely on the pre-existing `profiles_select_own`/`profiles_update_own`. This means a client can read/write its *own* `friend_code`/`birth_date`/`gender` directly via PostgREST too; what's actually gated is *cross-user* access, which only the narrow RPCs provide.

### 3.5 RPC functions (full current list)

**Migration RPCs** (`SECURITY INVOKER`, unchanged): `replace_room_items`, `replace_deco_placement_items`, `replace_user_notes`.

**Global ranking RPCs** (`SECURITY DEFINER`, unchanged): `get_xp_leaderboard_top`/`get_my_xp_rank`, `get_overall_leaderboard_top`/`get_my_overall_rank` (bug-fixed once for an ambiguous-column error), `get_game_leaderboard_top`/`get_my_game_rank`.

**Friend RPCs (all NEW, all `SECURITY DEFINER`)**:
- `get_or_create_my_friend_code() returns text` — lazy-generates `encode(gen_random_bytes(16), 'hex')` (128 bits), race-safe retry loop. **Bug-fixed once**: the function's own `search_path = public` hardening accidentally hid pgcrypto's `gen_random_bytes` (installed in Supabase's separate `extensions` schema) — fixed by widening to `search_path = public, extensions`.
- `create_friendship(p_friend_code text) returns table(connected boolean, nickname text, is_new_connection boolean)` — resolves code → target user, canonicalizes the pair, `insert ... on conflict do nothing` (idempotent). **The `is_new_connection` column required a DROP+CREATE**, not `CREATE OR REPLACE` — Postgres cannot change a function's declared `returns table(...)` OUT-parameter list via `CREATE OR REPLACE`; the migration comment states this was confirmed by a real failed apply attempt (`42P13: cannot change return type of existing function`) before switching to DROP+CREATE. Grants had to be **reissued** after the DROP, since `DROP FUNCTION` clears privilege grants (unlike `CREATE OR REPLACE`, which preserves them).
- `remove_friendship(p_friend_code text) returns table(removed boolean)` — idempotent delete, `authenticated`-only (not anon).
- `get_friend_overall_ranking()`, `get_friend_xp_ranking()`, `get_friend_game_ranking(p_game_id, p_difficulty)` — identical formulas/tiebreaks to their global counterparts, scoped via a `friendships`-derived CTE joined against `auth.uid()` directly inside the function (never a client-supplied "who to include" parameter — deliberately, so knowing a `friend_code` without an actual confirmed row can never surface ranking data). Each also returns `friend_code` (of an already-mutual friend, judged safe — see §12) and `is_me` (safe here since a friend population is small and every identity is already known to the caller).
- **`get_friend_invite_preview(p_friend_code text) returns table(nickname text)`** — `language sql stable`, single exact-match SELECT. **The only function in the entire schema granted to `anon`** (as well as `authenticated`), so a logged-out visitor can see "OO님과 친구가 되어..." before signing in. Judged safe: read-only, one column, exact-match-only (no enumeration), zero side effects.

### 3.6 Supabase client setup

Unchanged: browser (`lib/supabase/client.ts`) and server (`lib/supabase/server.ts`) clients, both anon-key only, both `null`-on-missing-env rather than throwing. **No service-role key used anywhere** in the codebase (re-confirmed by grep this session).

---

## 4. Assessment & Ability System

### 4.1 The 6 abilities (unchanged)

Canonical source: `lib/brain-bet.ts`.

| id | Korean | Assessment ("classic") game |
|---|---|---|
| `reaction` | 순발력 | `reaction-classic` |
| `memory` | 기억력 | `memory-classic` |
| `focus` | 집중력 | `focus-classic` |
| `judgment` | 판단력 | `judgment-classic` |
| `spatial` | 공간감각 | `spatial-classic` |
| `reasoning` | 추리력 | `reasoning-classic` |

### 4.2 Assessment structure (unchanged)

`TOTAL_GAMES = 6`, always Normal difficulty, always the pool's "classic" entry per ability (`getClassicGameKey`), one retry allowed per stat. Progress checkpointing lets a refresh mid-run resume.

### 4.3 `score` vs `normalizedScore` (unchanged)

Per-game formulas built from shared primitives (`lib/scoring/shared.ts`). `gameScore` (never shown to the user) and `normalizedScore` (stored per-record) are the same number — the latter explicitly reuses the former rather than recomputing. A `final` "real percentile" field exists in the type but is always `undefined`.

Representative formulas: Reaction `speed(70%)+validity(30%)`; Memory `weightedAccuracy(85%)+speed(15%)`; Spatial `difficultyWeightedAccuracy + mirrorAccuracy + timeScore + timeoutScore` (exact weights in `lib/config/spatial.config.ts`, not fully re-verified this pass).

### 4.4 Statling decision — deterministic, unchanged in spirit, one nuance confirmed

`beginPetAssignment(finals)` (`lib/pets/pet-flow.ts`): ranks all 6 finals (`pickTopTwoStats`), exact-matches the top-2 pair against the 30-character catalog (`findCharacterByStats`). **Tie-break nuance**: equal-valued stats are resolved by a **freshly reshuffled random order each time** (`rankStatsByFinals`'s Fisher-Yates pre-shuffle), not a fixed priority list — the only randomness in the whole pipeline. Rarity and compatibility play no role in selection (§6.7).

### 4.5 Downstream consumers (unchanged)

Pet assignment; `PlayerSkillState` localStorage; `StatusScreen`'s `computeCurrentStats`; Ranking (global and now friend-scoped); XP (`lib/ranking/xp-ledger.ts`); per-game difficulty unlock; server sync (`player_skill_records`, `xp_totals`, `pet_care_state`, `pet_memory`, `pets`, `dex_entries` — confirmed exact `scheduleSync(...)` channel names this pass).

---

## 5. Mini Game System

**Still exactly 12 games** (confirmed, no discrepancy), 2 per ability × 6 abilities, via `GAME_POOL` in `lib/game/game-registry.ts`.

**Unlock rule, per-game, unchanged**: Hard unlocks at Normal `normalizedScore ≥ 60`; Extreme unlocks at Hard `normalizedScore ≥ 70` (`lib/config/difficulty.config.ts` — these thresholds were lowered at some point from an earlier 70/80, per an in-code comment; current values confirmed at 60/70).

| game id | Korean name | Ability | Extreme / tier-specific structure |
|---|---|---|---|
| `reaction-classic` | 신호 반응 | reaction | uniform scaling only |
| `reaction-dodge-run` | 장애물 피하기 | reaction | **Yes** — Extreme is the app's only true endless/survival mode (no clock, 1-hit ends the run, Extreme-only safe-lane pattern); ranking metric itself switches per tier (Hard: `obstaclesDodged`, Extreme/default: `survivedMs`) |
| `memory-classic` | 패턴 기억 | memory | none confirmed |
| `memory-story-recall` | 물건 기억 | memory | Hard/Extreme add a `'color'` question category |
| `focus-classic` | 표적 찾기 | focus | none confirmed |
| `focus-color-target` | 특정 색만 클릭 | focus | 확인 불가 |
| `judgment-classic` | 규칙 전환 | judgment | **Yes (Hard+Extreme, shared)** — 2-way→3-way answer domain |
| `decision-best-choice` | 무엇을 선택할까 | judgment | 확인 불가 |
| `spatial-classic` | 회전 도형 찾기 | spatial | none confirmed structurally (mirror-distractors tied to internal level, not tier) |
| `spatial-fit-puzzle` | 퍼즐 끼우기 | spatial | none confirmed (ranked by completion time, not accuracy) |
| `reasoning-classic` | 규칙 찾기 | reasoning | none confirmed |
| `reasoning-number-pattern` | 숫자 규칙 | reasoning | none confirmed |

Raw-record-vs-ranking-metric mapping still lives at `lib/ranking/game-ranking-metrics.config.ts`, unchanged location; `reaction-dodge-run` remains the clearest example of a genuinely tier-overridden ranking metric.

---

## 6. Statling / Pet System

### 6.1 Character count — still 30

`CHARACTER_DEFS`/`CHARACTER_CATALOG` in `lib/pets/pet-profile.ts`, one per each of the 30 possible ordered stat pairs. The larger legacy `lib/character-assets.ts` registry remains explicitly superseded.

### 6.2 Public slug — NEW, and it's purely client-side, not a database feature

Commit `b3d9dbb` ("add public slugs for Statling share URLs") added a new field to the static catalog, **not** a new database column:

```ts
export interface PetProfile {
  id: string    // e.g. '01_치즈털실냥이' — internal catalog id, still used everywhere EXCEPT share URLs
  slug: string  // e.g. 'cheese-cat' — public, ASCII, hand-picked, Share-URL-only
  ...
}
```
- **Hand-picked, not derived/hashed** — each of the 30 catalog entries carries its own literal slug string. Uniqueness enforced by a module-load runtime assertion (throws on collision), not a DB constraint.
- **Not stored in Supabase at all** — `pets.character_id` still references the internal `id`; there is no `slug` column anywhere in the 14 migrations.
- **Resolution**: `getPetProfileByPublicUrlId(raw)` = `getPetProfileBySlug(raw) ?? getPetProfileById(raw)` — tries slug first, falls back to the legacy internal id.
- **Legacy URLs work forever, no redirect** — deliberately, because a redirect would need to perfectly thread through `?ref=` (friend-invite) and UTM query params on already-shared links; the code's own comment states "a legacy link therefore just resolves normally, forever." Only `generateMetadata`'s canonical/OG URL advertises the new slug form to crawlers.
- New app-generated share links (Reveal, MyPage, friend-invite) all use `petProfile.slug` now, never the internal id.
- Scope: the slug identifies a **character species** (shared by every user matched to it), not a per-user pet instance or an account — "it cannot and must not be used to identify an account" (source comment). Unrelated to `friend_code`, which does identify an account.

### 6.3 Naming — unchanged

`lib/naming.ts`: 1-8 chars, hardcoded profanity blocklist.

### 6.4 `confirmed`/`confirmedAt` and the Statling "birthday" — NOW REAL (reverses an earlier finding)

`confirmPet()` still sets `pets.confirmed=true`/`confirmedAt=now()` on Reveal confirmation — but this timestamp is **now actually surfaced as a birthday**, via the new `BirthdayScreen` (§1.3, §10.2): a 🎂 moment reading `"{name}의 생일이에요!"` with the date derived from `confirmedAt`, explicitly chosen over adding a new column ("no new column needed" — source comment). This is separate from, and unrelated to, the new `profiles.birth_date` (the human user's own birth date, optional, account-scoped, only for signed-in users).

### 6.5 Room actions — still 6, unchanged

feed/shower/clean-the-room/play/pet/talk (`CareActionId` in `lib/room.ts`).

### 6.6 Growth/evolution — still no visual evolution

`evolve` (pose #24 of the 24-state expression system) remains unwired — same finding as before, re-confirmed at HEAD. Leveling is still purely a number + cosmetic unlocks (dialogue tone, idle-motion variant, decoration gifts), never a base-character swap.

### 6.7 Rarity / compatibility — unchanged

`getPetRarity()` still always returns `'common'`. `compatibility.ts` is still flavor-text-only, live-wired into 7+ UI surfaces, never used in selection.

---

## 7. Ranking System

### 7.1 Categories — now with a scope toggle

Still 3 ranking **types** (Overall/Per-Game/XP), but the screen now also exposes a **scope** selector: 전체(`global`) / **친구(`friends`, NEW)** — `RANKING_SCOPES` in `ranking-screen.tsx`, a segmented control independent of which type tab is active. Scope resets to `global` on every fresh entry (not persisted).

### 7.2 Friend-scoped ranking — NEW, reverses an earlier "ranking is entirely global" finding

3 new RPCs (§3.5) power the 친구 scope, each scoping population via a `friendships`-derived CTE joined directly against `auth.uid()` inside the function — never a client-supplied friend list. Formula/tiebreak logic is **byte-for-byte identical** to the global counterparts (verified line-by-line this pass), just population-restricted. A friend-scoped empty state exists ("아직 비교할 친구가 없어요"). No top-N limit — a friend population is always small, so caller + every friend returns fully ranked in one call.

### 7.3 Hard/Extreme split — unchanged

### 7.4 Client vs server computation — still 100% RPC for the *visible ranking UI*, one nuance

All 6 (global) + 3 (friend) ranking RPCs are called directly; the client only normalizes response shape. **Correction to an earlier "fully dead code" finding**: `LocalRankingProvider` (the client-side mock-rival ranking system) is **not entirely dead** — it's still imported and used by `lib/missions/ranking-achievements.ts` to power rank-based achievement/mission unlock checks, a feature entirely separate from what's rendered in `ranking-screen.tsx`. The visible Ranking screen itself (global and friend scope alike) remains confirmed 100% RPC-driven.

### 7.5 Tie-breaking — unchanged

UI states "동일한 기록은 먼저 달성한 순서대로" (first-achieved-wins); concrete SQL implementation confirmed identical between global and friend RPCs this pass.

### 7.6 Nickname requirement — unchanged, and confirmed to gate both scopes uniformly

The shared gate runs before `scope`/`activeTab` are even considered, so both global and friend views share the identical nickname prerequisite; every ranking RPC (global and friend) independently re-enforces it server-side too.

### 7.7 Removing a friend from Ranking

Each friend-scope ranking row now renders a remove-friend icon button (`UserMinus`) with a confirm dialog, calling `remove_friendship` — see §8.5.

---

## 8. Friend System

**This section is a complete rewrite. An earlier audit of an older commit found zero implementation — that finding is now obsolete.** The Friend System (internally tagged "Phase 3G" in code comments — confirming this was the correct internal name all along, just not yet built at the time it was first asked about) is real, shipped across 5 migrations and matching application code.

### 8.1 Data model — symmetric, no request/pending state

`public.friendships` (§3.3): one canonically-ordered row per confirmed pair, no status column at all. **Possessing a `friend_code` IS the invitation; calling `create_friendship` with it IS consent** — there is no separate "pending request" concept anywhere in the schema or code.

### 8.2 `friend_code` — a real, non-UUID, unguessable identifier

`profiles.friend_code`: 128-bit (`gen_random_bytes(16)`, hex-encoded) CSPRNG token, unique-indexed, lazily generated on first use. **Never a raw user UUID, and no function anywhere returns another user's raw `user_id`** — every friend-related RPC's output columns are hard-limited to `nickname`/`friend_code`/derived ranking metrics/booleans (verified by reading every RPC body this pass).

### 8.3 Invite flow — full trace

1. **MyPage** — "친구와 기록 비교하기" button → `getOrCreateMyFriendCode()` (RPC) → builds `/share/{slug}?ref={friendCode}` via `buildFriendInviteUrl` (a thin wrapper adding `?ref=` on top of the normal UTM-stamped share URL — same `ShareContext`/`utm_content` as a plain MyPage share, so `?ref=` presence is what actually distinguishes the two, not any UTM field).
2. **Recipient opens the link** — `share-page-client.tsx` reads `ref` via `useSearchParams()`; if present, `FriendInviteCta` renders below the existing Dex CTA.
3. **`FriendInviteCta`** fetches a preview (inviter's nickname) via `get_friend_invite_preview` — works even logged-out, since that's the one anon-accessible RPC.
4. **Logged-in visitor**: clicking "connect" calls `create_friendship` directly.
5. **Guest visitor**: the code is stashed in **sessionStorage** (`statling.pendingFriendCode.v1`) rather than called immediately, and an inline `AuthForm` appears. This exists specifically because Google OAuth is a hard redirect that drops any in-page state/query params — `app/auth/callback/route.ts` redirects back to the bare origin.
6. **Resume after login**: a root-level `useEffect` in `game-flow.tsx` (gated on `user`, fires on every fresh mount since `GameFlow` always remounts at `/`) reads and immediately clears the pending code, then calls `create_friendship` — the one and only place a pending code is ever consumed. Idempotent server-side, so a duplicate resume attempt is harmless.
7. **Opening the link never creates a friendship by itself** — only the explicit connect action (direct or resumed) does. Dex registration ("내 도감에 기록하기") is completely independent of `?ref=` and behaves identically either way — meeting a friend's Statling via their invite link does nothing different in the Dex than meeting a stranger's.

### 8.4 Removing a friend — exists, both backend and UI

`remove_friendship` RPC (idempotent, `authenticated`-only, not anon) + a per-row remove button in every friend-scope Ranking panel, gated behind a confirm dialog.

### 8.5 Security posture summary

- RLS: SELECT-only, two-party OR-clause; zero write access via RLS (mutation only through the 3 write RPCs).
- No raw UUID ever exposed to another user, in any friend-related output.
- `get_friend_invite_preview` is the schema's sole anon-accessible function, deliberately scoped to be safe (read-only, one column, exact-match, no enumeration).
- Friend-scoped ranking RPCs derive "who to include" from `auth.uid()` + the `friendships` table server-side — never from a client-supplied parameter, so knowing someone's `friend_code` without an actual confirmed connection can never surface their ranking data.

### 8.6 Friend feature analytics

3 new events, identical shape across GA4 and PostHog: `friend_invite_opened{pet_id}`, `friend_connected{source:'direct'|'resumed'}` (fires only when `is_new_connection` is true, never on an idempotent re-accept), `friend_ranking_viewed{ranking_type, game_id?, difficulty?}`. No identity data (friend_code, user_id, nickname) in any of them.

### 8.7 What's still NOT part of the friend system

No blocking, no friend limit, no notifications, no activity feed, no "friend request" UI (moot, given the consent model), no restore-on-new-device for the friend list specifically (it's server-side/account-scoped so it's implicitly available on any device the account logs into — but it isn't part of the migration/restore snapshot machinery the way game data is, since there's nothing local to restore).

---

## 9. Share & Dex

### 9.1 Three share flows now (was 2)

| Flow | URL shape | Distinguishing element |
|---|---|---|
| Character Reveal "공유하기" | `/share/{slug}/{topStat}/{secondaryStat}` | `utm_content='character_result'` |
| MyPage "공유 링크" | `/share/{slug}` | `utm_content='my_page'` |
| **MyPage "친구와 기록 비교하기" (friend invite)** | `/share/{slug}?ref={friendCode}` | same `utm_content='my_page'` as plain MyPage share — **only the `?ref=` param distinguishes it**, not UTM |

All three share the same landing page, image generation, save/OS-share cascade.

### 9.2 URL structure — public slug + permanent legacy compatibility (§6.2)

Route directory is unchanged (`app/share/[petId]/[[...stats]]/`) — only what the segment *resolves to* changed. No redirect from legacy to slug form, ever, by deliberate design (query-param preservation risk).

### 9.3 Friend-invite share is now a real, distinct flow — not just a card style

Reverses an earlier finding. Opening a `?ref=` link and taking the explicit connect action now creates an actual `friendships` row (§8.3) — this is materially different from before, when "friend" in a card name was purely cosmetic.

### 9.4 UTM — unchanged fixed triple, no new `utm_content` value

Friend-invite links reuse `'my_page'` — `?ref=` (outside the UTM scheme) is the only marker.

### 9.5 OG metadata — still 2 generators, only the input-resolution layer is slug-aware

`app/api/og/share/route.tsx` (dynamic per-pet) still receives the resolved *internal* id as its query param, never the slug directly; `app/opengraph-image.tsx` (static default) is untouched.

### 9.6 Dex — unchanged mechanism, confirmed NOT friend-aware

Still pure localStorage + the same 18-domain Supabase sync. Meeting a friend's Statling via their invite link does nothing different in the Dex than meeting a stranger's via a plain link — the only friend-specific effect of `?ref=` is whether `FriendInviteCta` renders at all.

---

## 10. Authentication & Persistence

### 10.1 Auth methods — unchanged

Google OAuth + email/password only, no anonymous Supabase session.

### 10.2 NEW: Birthday / profile onboarding step

Inserted between Naming and Room (§1.3, §6.4). Collects `birth_date` (date input) and `gender` (female/male/other/prefer_not_to_say picker) — **only shown to a signed-in account**, hidden entirely for a guest (no local mirror exists to write to). **Genuinely optional at every branch**: guest → auto-continue with no UI shown at all; signed-in + blank fields → auto-continue, no network call; signed-in + save failure → error toast but still continues. **No localStorage mirror for either field, by design** — data is Supabase-only (`profiles.birth_date`/`gender`, RLS-scoped to the owner), same pattern already established for `nickname`.

### 10.3 Guest → login migration — still the same 18 domains; friend data and birthday/gender are explicitly NOT part of it

`LocalDataSnapshot`'s domain list is unchanged. Neither friend connections nor birth_date/gender are migrated/synced through this machinery — friend connections are exclusively server-side (created via RPC, never touch localStorage), and birthday/gender have no local mirror to migrate in the first place.

### 10.4 Cross-device restore & conflict resolution — same Case A/B/C/D/E; friends/birthday are not part of the restore snapshot either

Switching devices does carry friend connections and birthday/gender forward, but only because they're plain account-scoped Supabase columns/rows read live on demand — not because they're part of the explicit 18-domain restore snapshot the way game data is.

### 10.5 localStorage vs sessionStorage — sessionStorage is now used

**Reverses an earlier "zero usage" finding.** `lib/friends/pending-friend-code.ts` uses `sessionStorage` (not localStorage) for `statling.pendingFriendCode.v1`, deliberately — a pending friend-invite acceptance is framed as "single-visit intent tied to the tab that received the link," not something that should resurface in an unrelated future session. localStorage's ~26-key surface is otherwise unchanged; no new localStorage key was added for birthday/friend features (both are Supabase-only with no local cache).

### 10.6 Device id — unchanged

Still the same broadly-shared, pre-auth, per-browser mechanism described previously; not used by the friend system (which is entirely account/RPC-based) or the Landing A/B experiment.

---

## 11. Analytics

### 11.1 GA4 — 38 event types now (35 + 3 new)

New: `friend_invite_opened: {pet_id: string}`, `friend_connected: {source:'direct'|'resumed'}`, `friend_ranking_viewed: {ranking_type:'overall'|'game'|'xp', game_id?, difficulty?}` (`lib/analytics/ga.ts`, tagged "Phase 3G-5" in comments — confirming the internal phase-naming convention the user originally referenced). All existing 35 events unchanged.

### 11.2 PostHog — 20 event types in the currently-*committed* code, with an important caveat

`lib/analytics/analytics.ts`'s committed `ProductEventParams` currently has: the original Phase 3A-2 set (`assessment_started`, `assessment_completed`, `statling_revealed`, `auth_choice_made`, `naming_completed`, `home_entered`, `game_started`, `game_completed`, `care_action_completed`, `level_up`, `achievement_unlocked`, `achievement_claimed`, `daily_mission_claimed`, `room_saved`, `decoration_saved`, `share_started`, `share_completed` — 17 events), plus `landing_experiment_viewed` (Phase 3E-2), plus the 3 new friend events (Phase 3G-5) = **20 total**.

**Caveat worth recording**: earlier work-in-progress in this development history added several more PostHog events (`ranking_viewed`, `share_preview_opened`, `talk_started`, `talk_answered`, `memory_dialogue_shown`, and a `game_completed.is_personal_best` field) — none of that is present in the current committed `analytics.ts`. This is a concrete illustration of why this document only trusts what's actually committed at HEAD: uncommitted work-in-progress, however real at the time, is not part of the app until it lands.

### 11.3 PostHog identity/pageview mechanics — unchanged

`person_profiles:'identified_only'`, `capture_pageview:false`, manual `$pageview` on real route changes only, `identify()`/`reset()` tied to Supabase auth state.

### 11.4 PII policy — clean, re-verified for the friend events specifically

No friend event includes `friend_code`, `user_id`, or `nickname` — only `pet_id` (a species catalog id, not personal data), `source`, and ranking-type/game metadata. All prior PII findings (naming length-only, feedback enum-only, method-only auth events) still hold.

---

## 12. Security & Privacy

- **RLS**: enabled on all 20 tables now (19 + `friendships`), no exceptions. `anon` is granted table access nowhere; the friendships table adds a two-party `OR` SELECT pattern but zero write access via RLS.
- **`SECURITY DEFINER`** usage expanded from 6 to **11** functions (6 global-ranking + 5 friend), still the deliberate, narrow exception to an INVOKER-by-default posture — every one of them hard-limits its output columns and never returns a raw cross-user `user_id`.
- **The one genuinely new security-relevant surface**: `get_friend_invite_preview` is the schema's **first and only** function ever granted to `anon`. This is a real, deliberate expansion of the previously anon-zero attack surface — justified narrowly (read-only, single column, exact-match, no enumeration, zero side effects), but worth flagging explicitly as a security-relevant change from the prior all-`authenticated`-only posture.
- **No service-role client** anywhere (re-confirmed).
- **`friend_code`** is a real, deliberate design choice to avoid exposing raw UUIDs for the friend feature — confirmed never returned by any RPC.
- **`birth_date`/`gender`**: now real columns, RLS-scoped to the owner only (`profiles_select_own`/`profiles_update_own`), no cross-user read path exists for them anywhere (no RPC returns another user's birth_date/gender).
- **PII in analytics**: re-verified clean, including the 3 new friend events.
- **`gen_random_bytes` search_path bug**: a real production bug (function couldn't find pgcrypto's function under a locked-down `search_path=public`) — fixed by widening to `public, extensions`. Worth noting as a concrete example of the tension between `search_path` hijack-hardening and Supabase's non-`public` extension install location.

---

## 13. Production / QA Architecture

All findings from the prior audit are **re-confirmed unchanged** at HEAD `4e54742`:

- **Build**: `next build` only, no separate typecheck script, `typescript:{ignoreBuildErrors:true}` still set, `images:{unoptimized:true}` also set.
- **Test suite**: still definitively does not exist (no config, no dependency, no test files — re-confirmed by fresh grep).
- **CI/CD**: still no `.github`, no `vercel.json`.
- **eslint**: still referenced by the `lint` script but not an installed dependency.
- **QA flags**: `NEXT_PUBLIC_ENABLE_TEST_SKIP` unchanged; the 2 beta-notice flags unchanged. **No new flags were added** for the friend/slug/birthday features.
- **Env vars**: no new ones introduced by any of the new features — the friend system uses the existing Supabase RPC surface, public slugs are static code constants, birthday/profile writes go through the existing browser client.

---

## 14. Architecture Decision Log

*Continuing the standard of only including decisions with an actual, code-cited rationale.*

### 14.1 Friend connections are symmetric with no request/pending state

- **Problem**: model a mutual friend relationship without building a full request/accept/reject state machine.
- **Decision**: a single canonically-ordered row is the *only* state; possessing the other party's `friend_code` already constitutes their consent to be found, and calling `create_friendship` is the caller's own consent.
- **Reason**: the migration's own header frames this explicitly as the chosen consent model, deliberately simpler than a request/response table.
- **Trade-off**: no way to "decline" a request (there is no request to decline) and no notification that someone tried to connect — the model only supports "I have your code and I'm choosing to connect," never "please let me connect."

### 14.2 `friend_code` is a 128-bit random token, never a raw user id

- **Problem**: give users something shareable to find each other without exposing account internals.
- **Decision**: `encode(gen_random_bytes(16),'hex')`, unique-indexed, generated lazily.
- **Reason**: explicit design intent, corroborated by the fact that no friend-related RPC ever returns a raw `user_id` anywhere in its output.
- **Trade-off**: a leaked/screenshotted code lets anyone preview the owner's nickname (`get_friend_invite_preview`, deliberately anon-accessible) and attempt a connection — accepted as low-risk since it's exactly the intended sharing mechanism, and the nickname is already public ranking data.

### 14.3 `create_friendship`'s `is_new_connection` addition required DROP+CREATE, not CREATE OR REPLACE

- **Problem**: analytics needed to distinguish a genuinely new connection from an idempotent re-accept.
- **Alternatives**: `CREATE OR REPLACE FUNCTION` (the project's usual pattern for RPC fixes, used successfully for the Overall-ranking ambiguous-column bug).
- **Decision**: `DROP FUNCTION` then `CREATE FUNCTION` with an added OUT column.
- **Reason**: Postgres cannot change a function's declared `returns table(...)` shape via `CREATE OR REPLACE` — confirmed by the migration's own comment describing a real failed apply attempt (`42P13`).
- **Trade-off**: privilege grants are cleared by `DROP FUNCTION` and must be explicitly reissued in the same migration — a sharp edge this project's usual "just replace the body" pattern doesn't have, now documented as a precedent for any future function whose signature needs to change.

### 14.4 `get_friend_invite_preview` is the one function granted to `anon`

- **Problem**: a logged-out visitor needs to see who invited them before being asked to sign up.
- **Alternatives considered per the migration's own reasoning**: reusing `create_friendship` (rejected — it raises without a session and has side effects), relying on `profiles` RLS (rejected — blocks cross-user reads even for authenticated callers).
- **Decision**: one narrowly-scoped, `anon`-granted, read-only, single-column, exact-match RPC.
- **Reason**: judged safe because the exposed data (nickname) is already public ranking information, there's no enumeration surface (exact match only), and no state changes.
- **Trade-off**: this is the schema's first-ever crack in an otherwise-universal "anon gets nothing" posture — a deliberate, narrow one, but a real precedent that should be weighed carefully before any future anon-accessible function is added.

### 14.5 Public share slugs are hand-picked static data, not database-generated

- **What's there**: a literal `slug` string per catalog entry, uniqueness enforced at module load, never touching Supabase.
- **On the "why" of hand-picking over derivation**: the code states plainly that a mechanical Korean→English transliteration would be "neither readable nor stable" — an explicit, code-cited reason.
- **On the "why" of no database column**: no comment explicitly argues this; it's a reasonable inference (the slug identifies a shared *species*, not a per-account row, so there's no per-user state to store) but not something the code states as a deliberate trade-off analysis, so this part is reported as structural fact rather than a documented decision.

### 14.6 Legacy share URLs (internal id) resolve forever, with no redirect to the new slug form

- **Problem**: introducing a nicer slug-based URL risks breaking already-shared links, especially ones carrying `?ref=` friend-invite codes or UTM params.
- **Decision**: the resolver tries slug first, falls back to the legacy internal id — permanently, no redirect ever issued from old to new.
- **Reason**: the code states this explicitly — a redirect would have to perfectly thread through query params on every possible already-shared link shape, and there's no user-facing benefit to forcing one.
- **Trade-off**: two permanently-valid URL forms for the same content forever (a minor SEO/canonicalization cost, mitigated by `generateMetadata` always advertising the slug form as canonical to crawlers).

### 14.7 Pending friend-invite codes use sessionStorage, not localStorage

- **Problem**: a friend-invite code needs to survive a Google OAuth hard-redirect round trip (which drops all in-page state and query params) so the connection can complete after login.
- **Decision**: `sessionStorage`, not this app's otherwise-universal `localStorage` convention.
- **Reason**: framed explicitly as "single-visit intent tied to the tab that received the invite link" — deliberately should NOT resurface in an unrelated future tab/session days later, unlike every other piece of persisted state in this app.
- **Trade-off**: if a user closes the tab before completing login, the pending invite is silently lost (by design) rather than resuming on a later visit — a deliberate scope-narrowing versus this app's usual "persist everything, resume anytime" posture.

---

## 15. Current Implementation Status

| Area | Status |
|---|---|
| Landing A/B experiment | Production implemented |
| Assessment (6 games, deterministic scoring/pet assignment) | Production implemented |
| Egg/Reveal/Save/Naming/**Birthday**/Room onboarding | Production implemented |
| Room care actions (6) | Production implemented |
| Free Play (12 games × 4 tiers) | Production implemented |
| Overall / Per-Game / XP ranking, **global scope** | Production implemented |
| **Friend-scoped ranking (전체/친구 toggle)** | **Production implemented** (was: not implemented) |
| **Friend System** (friend_code, symmetric connections, invite/connect/remove, guest→login resume) | **Production implemented** (was: not implemented at all — planning-doc-only) |
| **Public share-URL slugs, with permanent legacy compatibility** | **Production implemented** (was: not implemented — internal id used directly) |
| **Birthday / optional profile onboarding (birth_date, gender)** | **Production implemented** (was: not implemented — no schema, no UI) |
| Guest→login migration, cross-device restore, conflict resolution | Production implemented (unchanged; friend/birthday data explicitly outside this machinery, by design) |
| Character-result Share + Friend-invite share, OG images, UTM | Production implemented |
| Dex | Production implemented (confirmed not friend-aware — meeting a friend's pet behaves identically to meeting a stranger's) |
| GA4 (38 events) + PostHog (20 events, committed) dual analytics | Production implemented |
| `LocalRankingProvider` (mock ranking) | **Partially alive** — dead for the visible Ranking screen, but still powers `ranking-achievements.ts`'s rank-based mission/achievement unlocks (correction to an earlier "fully dead" finding) |
| `evolve` character pose / visual evolution | Implemented but unwired (unchanged) |
| Pet rarity tiers | Implemented but inert, always `'common'` (unchanged) |
| Automated test suite | Does not exist (unchanged) |
| CI/CD pipeline | Does not exist (unchanged) |
| `eslint` | Not installed despite a checked-in `lint` script (unchanged) |
| Friend blocking, notifications, activity feed, friend limits | Not implemented — no schema/RPC/UI found for any of these |
| Complex/multi-stage pet evolution, Shop, Inventory, Furniture Editing, Guild, Chat, Season Ranking | Planned/TODO only — still no implementation found |
| Exact tie-break SQL algorithm inside ranking RPCs (global and friend) | 확인 불가 at the exact-algorithm level from TypeScript alone, though behavior is described in UI copy and formulas were verified line-by-line equal between global/friend |
| Whether `NEXT_PUBLIC_ENABLE_TEST_SKIP` is actually unset in live Vercel Production | 확인 불가 — code gate is sound, live env value is outside repo scope |
| Whether `friendships`/`dex_entries` writes are end-to-end verified in live production (vs. code paths merely existing) | 확인 불가 — no automated test suite exists to confirm live behavior independently |
