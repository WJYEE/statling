-- =============================================================================
-- Statling — Phase 3G-2: Friend Connection backend foundation.
-- =============================================================================
-- Scope: 1 new column (profiles.friend_code) + 1 new table (friendships) +
-- 3 new SECURITY DEFINER RPCs (get_or_create_my_friend_code, create_friendship,
-- remove_friendship). No changes anywhere to pets/player_skill_records/
-- xp_totals/dex_entries or any existing ranking RPC — Friend Ranking itself is
-- Phase 3G-3, not this migration. No UI ships in this phase; every function
-- here has zero call sites in the app yet (see the Phase 3G-2 report).
--
-- -----------------------------------------------------------------------------
-- Design recap (see the Phase 3G-1/3G-2 reports for the full audit)
-- -----------------------------------------------------------------------------
-- Statling's existing share URL (/share/[petId]/...) carries a pet SPECIES
-- catalog id shared by every user matched to that character — it cannot and
-- must not be used to identify an account. profiles.nickname is not unique
-- (duplicates are an accepted product decision — see the Phase 3B-2
-- migration), so it cannot be a lookup key either. Neither is reused here.
--
-- friend_code is a brand-new, dedicated, nullable, unique, opaque public
-- identifier — 128 bits of randomness (16 bytes) hex-encoded, generated via
-- pgcrypto's gen_random_bytes (pgcrypto is already enabled — see the Phase 1
-- migration's `create extension if not exists pgcrypto;`). This is
-- deliberately NOT a raw auth.users/profiles UUID: unlike this project's
-- other UUIDs, friend_code's only job is to be pasted into a URL query
-- param, so it must never let a client (or a scraped public share link)
-- derive or guess anyone's real user_id. 128 bits of CSPRNG entropy makes
-- brute-forcing a specific code computationally infeasible; there is no
-- secondary "accept" step in this design (see below), so this unguessability
-- is the entire security boundary for friend-adding — treat it accordingly
-- in any future change.
--
-- Whether a friend_code is even embedded in a URL is a UI-layer policy
-- decision, not enforced by this migration: Phase 3G-1's original proposal
-- (stamp every share URL with it) was revised — general Statling share links
-- (Character Reveal "공유하기", MyPage "공유 링크") can end up posted
-- publicly (SNS/blogs) and must never carry a standing friend-invite token.
-- Only a link built by a future, explicit "친구와 기록 비교하기" action
-- should ever include `?ref=<friend_code>` (see lib/share/build-share-text.ts's
-- new buildFriendInviteUrl(), added alongside this migration but with no
-- caller yet either).
--
-- -----------------------------------------------------------------------------
-- Consent model — read before changing anything below
-- -----------------------------------------------------------------------------
-- No invitation/request table. Possessing a friend_code is A's invitation
-- (A chose to generate/share it); calling create_friendship with it is B's
-- consent (an explicit action B must take — this migration adds no trigger,
-- default, or automatic path that creates a friendship just from a code
-- existing or a page loading). This is exactly the model the Phase 3G-1
-- report recommended and the Phase 3G-2 task instructions confirmed.
--
-- -----------------------------------------------------------------------------
-- UUID canonical-pair ordering — verified, not guessed
-- -----------------------------------------------------------------------------
-- friendships stores one row per relationship using a canonical
-- (smaller_uuid, larger_uuid) pair so A-B and B-A can never both exist. This
-- migration was written without live DB access to this project's actual
-- Supabase instance (no service-role/DB credentials were available in this
-- session — see the Phase 3G-2 report), so per the task's own instruction
-- ("불가능하거나 애매하면 명시적인 CASE를 사용해주세요"), canonicalization
-- uses a plain `if v_uid < v_target then ... else ... end if` CASE-style
-- branch in every RPC below, never LEAST()/GREATEST(). The plain `<`
-- comparison operator on uuid IS standard, core PostgreSQL (uuid has a
-- default btree operator class providing =, <, >, <=, >= — this is exactly
-- what every existing `uuid primary key` in this schema already relies on,
-- e.g. pets.user_id, room_items.instance_id; those primary keys could not
-- function at all if uuid `<` didn't work, and they demonstrably do, in
-- production, today), so the CHECK constraint below using `<` rests on the
-- same already-proven behavior, not a new assumption.
--
-- -----------------------------------------------------------------------------
-- Security model — matches Phase 3B-3/3B-5/3B-7's ranking RPCs exactly
-- -----------------------------------------------------------------------------
-- Every RPC below is SECURITY DEFINER (the same narrow, deliberate exception
-- to this project's SECURITY INVOKER default — see the Phase 2B migration's
-- own "Security model" comment for why INVOKER was chosen there): reading
-- another user's profiles.friend_code, and inserting/deleting a friendships
-- row that isn't 100% owned by the caller alone, both need it. Hardening,
-- identical to every prior ranking RPC:
--   - `set search_path = public` (blocks a search_path-hijack attack)
--   - every table reference schema-qualified (`public.profiles`, etc.)
--   - no dynamic SQL anywhere (p_friend_code is only ever compared with `=`,
--     never concatenated into SQL text)
--   - `language plpgsql` (get_or_create_my_friend_code/create_friendship/
--     remove_friendship all WRITE, so none are `stable` — unlike the
--     read-only ranking RPCs)
--   - `revoke all ... from public` + explicit `revoke all ... from anon`,
--     then `grant execute ... to authenticated` only
--   - output columns are hard-limited to exactly what a caller needs
--     (friend_code / connected+nickname / removed) — raw user_id of the
--     OTHER party is never returned by any function in this migration.
--
-- friendships itself: RLS enabled, a caller may SELECT only rows they are a
-- party to. No INSERT/UPDATE/DELETE policy, and no insert/update/delete
-- privilege granted to `authenticated` at all — the exact same "mutation
-- only through a SECURITY DEFINER function, direct client writes impossible
-- even in principle" pattern this schema already uses for profiles (rows are
-- only ever created by handle_new_user()).
--
-- Idempotency: every statement below is safe to re-run (IF NOT EXISTS /
-- CREATE OR REPLACE), matching every prior migration in this project.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. profiles.friend_code — lazily-generated public opaque identifier
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists friend_code text;

comment on column public.profiles.friend_code is
  'Phase 3G-2 — public opaque friend-invite identifier. NULL until the account first calls get_or_create_my_friend_code() (lazy create). 32 lowercase hex chars = 128 bits of pgcrypto CSPRNG entropy, never the raw profiles/auth.users id, never reused from nickname (nickname is not unique — see the Phase 3B-2 migration). Unguessable by design: there is no secondary approval step before a friendship forms (see this migration''s header), so this token IS the entire security boundary for who can friend this account.';

create unique index if not exists idx_profiles_friend_code on public.profiles (friend_code);

-- No RLS/grant change needed here — profiles.friend_code rides on the
-- EXISTING profiles_select_own / profiles_update_own policies and the
-- existing `grant select, update on public.profiles to authenticated`
-- (both from the Phase 1 migration). Direct client SELECT still only ever
-- returns the caller's OWN row (their own friend_code, never anyone else's)
-- — cross-user friend_code lookup happens exclusively inside the SECURITY
-- DEFINER functions below, never through a client-side PostgREST query.


-- -----------------------------------------------------------------------------
-- 2. friendships — one row per confirmed, mutual relationship
-- -----------------------------------------------------------------------------
create table if not exists public.friendships (
  user_id_a  uuid not null references auth.users (id) on delete cascade,
  user_id_b  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_a, user_id_b),
  constraint friendships_ordered check (user_id_a < user_id_b),
  constraint friendships_no_self check (user_id_a <> user_id_b)
);

comment on table public.friendships is
  'Phase 3G-2 — one row per mutual friendship, canonicalized as (smaller_uuid, larger_uuid) via friendships_ordered so A-B and B-A can never both exist and a duplicate insert is a simple PRIMARY KEY conflict. auth.users FK with ON DELETE CASCADE on both sides — deleting either account removes the relationship. No columns beyond the two user ids and created_at: no status/pending state (see this migration''s header for the consent model), no metadata. Client-side mutation is impossible by design (no INSERT/UPDATE/DELETE policy, no such privilege granted to authenticated) — only create_friendship()/remove_friendship() below can ever write to this table.';

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own" on public.friendships
  for select
  using (auth.uid() = user_id_a or auth.uid() = user_id_b);

-- Deliberately no INSERT/UPDATE/DELETE policy, and no such privilege granted
-- below — see this table's own comment and this migration's header.
grant select on public.friendships to authenticated;

create index if not exists idx_friendships_user_b on public.friendships (user_id_b);
-- (user_id_a is already covered by the PRIMARY KEY's leading column.)


-- -----------------------------------------------------------------------------
-- 3. get_or_create_my_friend_code — lazy-create, race-safe
-- -----------------------------------------------------------------------------
-- Concurrency: two near-simultaneous calls for the SAME user must never both
-- "win" with different codes. The `update ... where id = v_uid and
-- friend_code is null` guard means only one concurrent transaction can ever
-- actually set the column; the other sees `not found`, re-reads, and returns
-- whatever the winner actually stored — both calls return the SAME code,
-- never an error. A cross-user hex collision (astronomically unlikely at 128
-- bits, but not literally impossible) is caught as unique_violation and
-- retried with a freshly generated token, up to 5 attempts.
create or replace function public.get_or_create_my_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text;
  v_attempt integer := 0;
begin
  if v_uid is null then
    raise exception 'get_or_create_my_friend_code: no authenticated user' using errcode = '28000';
  end if;

  select p.friend_code into v_code from public.profiles p where p.id = v_uid;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := encode(gen_random_bytes(16), 'hex');

    begin
      update public.profiles
      set friend_code = v_code
      where id = v_uid and friend_code is null;

      if found then
        return v_code;
      end if;

      -- Someone else's concurrent call already set it — return that value.
      select p.friend_code into v_code from public.profiles p where p.id = v_uid;
      if v_code is not null then
        return v_code;
      end if;
      -- v_code somehow still null (shouldn't happen) -> loop and retry.
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'get_or_create_my_friend_code: failed to generate a unique code after % attempts', v_attempt
          using errcode = 'P0001';
      end if;
      -- retry with a freshly generated token
    end;
  end loop;
end;
$$;

comment on function public.get_or_create_my_friend_code() is
  'Phase 3G-2 — SECURITY DEFINER. Returns the caller''s existing profiles.friend_code, or lazily generates+stores a new 128-bit random one on first call. Race-safe for concurrent calls by the same user; retries on the (astronomically unlikely) cross-user collision.';

revoke all on function public.get_or_create_my_friend_code() from public;
revoke all on function public.get_or_create_my_friend_code() from anon;
grant execute on function public.get_or_create_my_friend_code() to authenticated;


-- -----------------------------------------------------------------------------
-- 4. create_friendship — B's explicit consent, using A's shared code
-- -----------------------------------------------------------------------------
-- Idempotent: re-adding an already-existing friendship (e.g. B revisits the
-- same invite link and clicks again) is a no-op success, never an error —
-- `on conflict (user_id_a, user_id_b) do nothing`.
create or replace function public.create_friendship(p_friend_code text)
returns table(connected boolean, nickname text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_code            text;
  v_target          uuid;
  v_target_nickname text;
  v_a               uuid;
  v_b               uuid;
begin
  if v_uid is null then
    raise exception 'create_friendship: no authenticated user' using errcode = '28000';
  end if;

  v_code := btrim(coalesce(p_friend_code, ''));
  if v_code = '' then
    raise exception 'create_friendship: invalid friend code' using errcode = 'P0001';
  end if;

  select p.id, p.nickname into v_target, v_target_nickname
  from public.profiles p
  where p.friend_code = v_code;

  if v_target is null then
    raise exception 'create_friendship: friend code not found' using errcode = 'P0001';
  end if;

  if v_target = v_uid then
    raise exception 'create_friendship: cannot friend yourself' using errcode = 'P0001';
  end if;

  if v_uid < v_target then
    v_a := v_uid;
    v_b := v_target;
  else
    v_a := v_target;
    v_b := v_uid;
  end if;

  insert into public.friendships (user_id_a, user_id_b)
  values (v_a, v_b)
  on conflict (user_id_a, user_id_b) do nothing;

  return query select true, v_target_nickname;
end;
$$;

comment on function public.create_friendship(text) is
  'Phase 3G-2 — SECURITY DEFINER. Resolves p_friend_code to its owning account, rejects an unknown code or a self-friend attempt, then inserts the canonicalized (user_id_a < user_id_b) friendships row (idempotent — already-friends is a no-op success). Returns only connected/nickname; the other party''s raw user_id is never part of the output.';

revoke all on function public.create_friendship(text) from public;
revoke all on function public.create_friendship(text) from anon;
grant execute on function public.create_friendship(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. remove_friendship — either party can end the relationship
-- -----------------------------------------------------------------------------
-- The WHERE clause is built entirely from {v_uid, v_target} (never a raw
-- caller-supplied id pair), so this can only ever delete a friendship the
-- caller is genuinely a party to — that guarantee holds independent of RLS
-- (which this SECURITY DEFINER function bypasses), purely from how the query
-- itself is constructed. Idempotent: an unknown/foreign code, or a code
-- belonging to someone the caller was never friends with, both just return
-- `removed: false` rather than raising, and removing an already-removed
-- relationship (0 rows deleted) still returns `removed: true` — "you and
-- this person are not friends" is the same end state either way.
create or replace function public.remove_friendship(p_friend_code text)
returns table(removed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_target uuid;
  v_a      uuid;
  v_b      uuid;
begin
  if v_uid is null then
    raise exception 'remove_friendship: no authenticated user' using errcode = '28000';
  end if;

  v_code := btrim(coalesce(p_friend_code, ''));
  if v_code = '' then
    return query select false;
    return;
  end if;

  select p.id into v_target from public.profiles p where p.friend_code = v_code;
  if v_target is null or v_target = v_uid then
    return query select false;
    return;
  end if;

  if v_uid < v_target then
    v_a := v_uid;
    v_b := v_target;
  else
    v_a := v_target;
    v_b := v_uid;
  end if;

  delete from public.friendships
  where user_id_a = v_a and user_id_b = v_b;

  return query select true;
end;
$$;

comment on function public.remove_friendship(text) is
  'Phase 3G-2 — SECURITY DEFINER. Resolves p_friend_code to its owning account and deletes the canonicalized friendships row between that account and the caller, if any. Idempotent (removing a non-existent relationship still reports success). Only ever deletes a row the caller is a party to, by construction of the WHERE clause.';

revoke all on function public.remove_friendship(text) from public;
revoke all on function public.remove_friendship(text) from anon;
grant execute on function public.remove_friendship(text) to authenticated;

-- =============================================================================
-- End of Phase 3G-2. No Friend Ranking RPC, no [전체|친구] UI, no Share-page
-- CTA, no analytics event — see the Phase 3G-2 report for what's deferred to
-- Phase 3G-3/3G-4/3G-5 and why.
-- =============================================================================
