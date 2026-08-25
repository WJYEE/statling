-- =============================================================================
-- Statling — Phase 3G-4: friend invite preview RPC.
-- =============================================================================
-- Scope: 1 new SECURITY DEFINER function + its grants only. No table/column/
-- RLS change anywhere. Does not touch the Phase 3G-2 (friend_code/
-- friendships/create_friendship/remove_friendship) or Phase 3G-3 (friend
-- ranking) migrations at all.
--
-- -----------------------------------------------------------------------------
-- Why this needed a new function — investigated first, not assumed
-- -----------------------------------------------------------------------------
-- The share page (/share/[petId]/...?ref=<friend_code>) wants to show
-- "OO님과 친구가 되어 기록을 비교할까요?" BEFORE the visitor commits to
-- anything, including while still a logged-out guest (see the Phase 3G-4
-- report §6 — Guest flow). No existing RPC can safely serve this:
--   - create_friendship(p_friend_code) DOES return the inviter's nickname,
--     but only as a side effect of actually creating the friendship, and it
--     `raise exception`s when auth.uid() is null (verified against the Phase
--     3G-2 migration/Security QA) — unusable as a side-effect-free, pre-login
--     preview.
--   - profiles.friend_code/nickname are not selectable cross-user through
--     plain PostgREST (profiles_select_own RLS, unchanged) — a client can
--     only ever see its OWN profiles row directly.
-- So a new, narrow, read-only function is justified here, per the task's own
-- "이미 기존 RPC로 안전하게 해결 가능하면 새 RPC를 만들지 마세요" instruction
-- — the investigation came up empty, hence this file.
--
-- -----------------------------------------------------------------------------
-- The ONE deliberate exception to this project's anon-blocked convention
-- -----------------------------------------------------------------------------
-- Every other function in this project (every Phase 3B ranking RPC, every
-- Phase 3G-2/3G-3 friend RPC) explicitly revokes execute from anon. This one
-- grants it to BOTH anon and authenticated, on purpose: a friend-invite link
-- must show its preview to a guest who hasn't logged in yet (see the Guest
-- flow note above) — blocking anon here would mean a guest sees nothing
-- useful before being asked to sign in, defeating the whole point of the
-- preview. This is judged safe because:
--   1. `nickname` is not newly-sensitive data — it is the exact same value
--      every ranking-eligible participant's row already displays to any
--      other authenticated ranking viewer (Phase 3B). This function does not
--      expose it any further than "already a public display name," it only
--      changes WHO can look one up and BY WHAT KEY (a friend_code, not
--      general search).
--   2. Zero side effects — `language sql`, no INSERT/UPDATE/DELETE anywhere
--      in this function, so even repeated/scripted calls can only ever read.
--   3. Returns exactly one column (nickname) for exactly one row, keyed only
--      by an exact friend_code match — no listing, no fuzzy search, no way
--      to enumerate codes or discover anyone's code from their nickname
--      (there is no reverse lookup here). Zero user_id/email/other profiles
--      columns, matching every other friend/ranking RPC's output-shape
--      discipline.
--   4. An unknown/invalid/self code returns zero rows, never an error (same
--      "uniform no-row, never an exception" contract as get_my_xp_rank etc.)
--      — a tampered or expired-looking `ref` degrades to "no preview shown"
--      exactly like an unknown petId already degrades to a plain
--      generateMetadata `{}` fallback (page.tsx), never a broken page.
--
-- -----------------------------------------------------------------------------
-- Hardening — otherwise identical to every prior SECURITY DEFINER function
-- -----------------------------------------------------------------------------
-- `set search_path = public`, schema-qualified table reference
-- (public.profiles), no dynamic SQL, `language sql stable` (read-only).
--
-- Idempotency: `create or replace function` is safe to re-run.
-- =============================================================================

create or replace function public.get_friend_invite_preview(p_friend_code text)
returns table(nickname text)
language sql
security definer
stable
set search_path = public
as $$
  select p.nickname
  from public.profiles p
  where p.friend_code = btrim(coalesce(p_friend_code, ''))
    and p.nickname is not null
    and btrim(p.nickname) <> ''
  limit 1;
$$;

comment on function public.get_friend_invite_preview(text) is
  'Phase 3G-4 — SECURITY DEFINER, deliberately granted to BOTH anon and authenticated (see this migration''s header for why). Read-only lookup of the nickname belonging to one friend_code, for the share page''s pre-login invite preview. Zero rows for any unknown/invalid code, never an error. Never returns user_id/email/any other profiles column.';

revoke all on function public.get_friend_invite_preview(text) from public;
grant execute on function public.get_friend_invite_preview(text) to anon;
grant execute on function public.get_friend_invite_preview(text) to authenticated;

-- =============================================================================
-- End of Phase 3G-4 migration.
-- =============================================================================
