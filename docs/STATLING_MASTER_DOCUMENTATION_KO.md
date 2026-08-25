# Statling — 마스터 기술 문서

> **진실의 기준(Source of truth)**: 현재 저장소 코드(`c:\mipet\Brain_Pet`), git HEAD `4e54742`(`main` 브랜치)를 직접 감사한 결과를 기준으로 한다. `DEVELOPMENT_PLAN.md`/`MVP_SCOPE.md`/`GAME_SPEC.MD`/`기획.md`는 기준이 아니며, 이들은 *계획됨(planned)*과 *구현됨(implemented)*을 구분하기 위해서만 인용되는 기획 문서다.

> **방법(Method)**: 아래의 모든 주장은 실제 파일을 근거로 하며, 가능한 경우 `path:line` 형식으로 인용한다. 저장소에 질문에 답할 만큼 충분한 근거가 없는 경우, 이 문서는 추측하지 않고 **"확인 불가"**라고 명시한다.

> **이 문서는 처음부터 다시 수행한 재감사(ground-up re-audit)다.** 이전 초안을 업데이트한 것이 아니다. 더 오래된 커밋을 기준으로 작성된 이전 버전 문서는 유효하지 않으며 출처로 사용하지 않았다. 그 문서의 여러 결론(친구 시스템 없음, 별도 공개 slug 없음, 생일 UI 없음, sessionStorage 미사용)은 이후 실제 기능 작업이 `main`에 반영되었기 때문에 아래에서 **뒤집힌다**. 중요한 변경점은 명시적으로 표시한다.

---

## 목차

1. [제품 개요](#1-제품-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [데이터 아키텍처](#3-데이터-아키텍처)
4. [평가 및 능력 시스템](#4-평가-및-능력-시스템)
5. [미니게임 시스템](#5-미니게임-시스템)
6. [Statling / 펫 시스템](#6-statling--펫-시스템)
7. [랭킹 시스템](#7-랭킹-시스템)
8. [친구 시스템](#8-친구-시스템)
9. [공유 및 도감](#9-공유-및-도감)
10. [인증 및 영속성](#10-인증-및-영속성)
11. [분석(Analytics)](#11-분석analytics)
12. [보안 및 개인정보](#12-보안-및-개인정보)
13. [프로덕션 / QA 아키텍처](#13-프로덕션--qa-아키텍처)
14. [아키텍처 의사결정 로그](#14-아키텍처-의사결정-로그)
15. [현재 구현 상태](#15-현재-구현-상태)

---

## 1. 제품 개요

### 1.1 Statling이란 무엇인가

Statling은 방문자가 짧은 미니게임 묶음을 플레이하여 6개의 "능력"을 발견하고, 상위 2개 능력을 기준으로 30개의 고정 펫 캐릭터 중 하나에 결정론적으로 매칭된 뒤, "Room"에서 해당 펫을 키우고, 글로벌 및 현재는 **친구 전용** 리더보드에 오르며, 공유 가능한 초대 코드를 통해 친구와 연결할 수 있는 Next.js 단일 페이지 웹 앱이다.

### 1.2 핵심 루프

```
평가(미니게임 6개, 약 2~3분) → Statling 공개 → Room(일일 돌봄) →
Free Play(12개 게임 중 원하는 게임을 4개 난이도로 재도전) → Ranking(전체 또는 친구) →
공유 / 친구 연결
```

### 1.3 실제 사용자 흐름(코드 추적)

4개의 좁은 URL 엔드포인트(§1.4)를 제외한 모든 것은 **하나의 단일 페이지 앱**이다. 단일 React 컴포넌트인 `GameFlow`(`components/brain-bet/game-flow.tsx`)가 `phase` 상태 머신을 구동한다. 전체 과정에서 브라우저 URL은 `/`에 머문다.

**전체 `Phase` 유니온 — 18개 값** (`game-flow.tsx:173-191`):

`landing`, `login`, `game`, `complete`, `freeplay-complete`, `egg`, `reveal`, `save`, `naming`, **`birthday`**, `room`, `mystats`, `ranking`, `mypage`, `statling`, `grow`, `grow-game`, `mission`.

**최초 방문 게스트 경로**:

```
landing               랜딩 A/B 실험(§2, §11 참조)
  → game              6개 평가 미니게임 중 첫 번째(start('landing'), game-flow.tsx:899-909)
  → complete          해당 능력의 결과 화면
  → game → complete   … 6개 능력 모두에 대해 반복(goNextFirst, game-flow.tsx:971-976)
  → egg               handleMeetStatling()이 펫을 확정(game-flow.tsx:1768-1783)
  → reveal            캐릭터 공개
  → save              handleConfirmPet()("이 Statling과 함께하기", game-flow.tsx:1865-1879) — 로그인/회원가입 유도, 건너뛰기 가능
  → naming            Statling 이름 지정(1~8자, 비속어 필터 적용)
  → birthday          신규 — "Statling의 생일" 연출 + 선택적 birth_date/gender(game-flow.tsx:2092)
  → room              실제 최초 Home 진입(BirthdayScreen.onContinue, game-flow.tsx:2101)
```

**`birthday`는 신규 기능이다**(커밋 `4e54742`, "feat: add birthday and optional profile onboarding"). Naming과 Room 사이에 정확히 삽입되며, 최초 1회의 `NamingScreen.onConfirm` 호출 지점에서만 도달할 수 있다. 이미 이름이 지정되고 확정된 펫이 있는 재방문 사용자는 곧바로 `room`으로 이동하며 다시는 이 화면을 보지 않는다(`game-flow.tsx:445-464`). 항상 펫 자체의 `confirmedAt` 타임스탬프에서 가져온 "🎂 {name}의 생일이에요!" 순간을 보여주며(이 부분에는 새 필드가 필요하지 않음), **로그인된 계정에만**(게스트에게는 완전히 숨김) 선택적 `birth_date`/`gender` 입력을 제공한다. 이 값은 Supabase에 직접 저장되며 저장 실패가 발생해도 진행을 막지 않는다(`components/brain-bet/screens/birthday-screen.tsx:65-103`).

**Room 내비게이션으로 접근 가능한 phase**(온보딩 단계가 아님 — `NAV_PHASES = ['room','mystats','ranking','statling','mypage']`, `game-flow.tsx:194`): 내 스탯(`mystats`), **랭킹(`ranking`, 현재 전체/친구 범위 토글 포함 — §7)**, Statling(`statling`), 마이페이지(`mypage`).

**Room에서만 도달 가능**: `mission`, `grow` → `grow-game` → `game`/`freeplay-complete`(Free Play. 평가와 같은 phase 이름을 사용하며 `flowMode`로만 구분됨).

**코드를 기준으로 수정된 참조 흐름**:

> Landing → Assessment(6 games) → Egg → Reveal → Save(login/signup, skippable) → Naming → **Birthday/optional profile** → Room → (Free Play / Ranking[global or friends] / MyPage / Statling / Mission) → **Share / Friend Connect**

처음에 가정했던 "Birthday/Profile onboarding" 단계는 이제 실제로 존재하며, 예상할 수 있는 위치인 Naming 직후에 정확히 들어가 있다. 흐름에서 "Friend" 역시 이제 단순한 공유 카드 라벨이 아니라 실제 별도의 연결 액션(§8)이다.

### 1.4 실제 URL 접근 가능 라우트

여전히 5개뿐이다:

| Route | File | 종류 |
|---|---|---|
| `/` | `app/page.tsx` | `<GameFlow/>` 렌더링 |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth/이메일 확인 리디렉션 대상 |
| `/share/[petId]` 및 `/share/[petId]/[topStat]/[secondaryStat]` | `app/share/[petId]/[[...stats]]/page.tsx` | 공개 공유 랜딩 — **이제 `petId` 세그먼트는 공개 slug 또는 레거시 내부 id를 허용**, §9.2 참조 |
| `/api/og/share` | `app/api/og/share/route.tsx` | 펫별 동적 OG 이미지 |
| `/opengraph-image` | `app/opengraph-image.tsx` | 사이트 전체 정적 기본 OG 이미지 |

---

## 2. 시스템 아키텍처

| 기술 | Statling에서의 역할 |
|---|---|
| **Next.js 16.2.6** (App Router, Turbopack) | 전체 앱. `next.config.mjs`는 `typescript: { ignoreBuildErrors: true }`와 `images: { unoptimized: true }`를 설정한다. 따라서 `tsconfig.json`의 `"strict": true`에도 불구하고 **`next build`는 TS 오류로 실패하지 않는다**. |
| **TypeScript** | strict-mode 타입 사용. 단, 빌드 시 강제되지 않음(위 내용 참조). |
| **Supabase** | Postgres + Auth + RLS + RPC. 브라우저(`lib/supabase/client.ts`)와 서버(`lib/supabase/server.ts`) 클라이언트 모두 **anon-key만 사용**한다. 저장소 어디에도 service-role 클라이언트가 없다(이번 감사에서 grep으로 재확인). |
| **Supabase Auth** | Google OAuth + 이메일/비밀번호. 익명/게스트 Supabase 세션은 없으며 게스트 데이터는 localStorage/sessionStorage에만 존재한다. |
| **PostgreSQL** (Supabase 경유) | 현재 **20개 테이블**(기존 19개 + 신규 `friendships`), **14개 migration**(기존 8개에서 증가). 모든 테이블에 RLS 활성화. §3 참조. |
| **RPC** | 세 계열: (a) 3개의 `SECURITY INVOKER` migration-replace 함수, (b) 6개의 `SECURITY DEFINER` 글로벌 랭킹 RPC, (c) **신규**: 5개의 `SECURITY DEFINER` 친구 RPC(`get_or_create_my_friend_code`, `create_friendship`, `remove_friendship`, 그리고 친구 범위 랭킹 RPC 3개) + **`anon`에 권한이 부여된 `SECURITY DEFINER` 함수 1개**(`get_friend_invite_preview`) — 전체 스키마에서 유일하게 anon이 접근 가능한 RPC. §3, §7, §8, §12 참조. |
| **Vercel** | 배포 대상. 여전히 **`vercel.json` 없음, CI 설정 없음**(`.github` 자체가 없음). 배포는 오직 `next build` 성공에 의존한다. §13 참조. |
| **`proxy.ts`** | Next.js 16에서 이름이 변경된 Middleware 규약. 세션 쿠키 갱신만 수행하며 gating/redirect/header injection은 없다. 변경 없음. |
| **GA4** | 기존 이벤트 타입 35개 + **신규 친구 이벤트 3개**(`friend_invite_opened`, `friend_connected`, `friend_ranking_viewed`) = 총 38개. §11 참조. |
| **PostHog** | 현재 *커밋된* 카탈로그는 **이벤트 타입 20개**: 기존 Phase 3A-2 세트(17개) + `landing_experiment_viewed` + 신규 친구 이벤트 3개. 이 숫자의 중요한 주의점은 §11.4 참조. |
| **localStorage** | 여전히 주요 게스트 데이터 저장소. 약 26개 이상의 키, 메커니즘 변경 없음. |
| **sessionStorage** | **현재 사용됨** — 키 1개, `statling.pendingFriendCode.v1`(`lib/friends/pending-friend-code.ts`). Google OAuth 하드 리디렉션 왕복 동안 친구 초대 코드를 보관한다. 이전의 "사용량 0" 결론을 뒤집는다. §8.4, §10.4 참조. |

---

## 3. 데이터 아키텍처

*전체 감사: `supabase/migrations/` 아래의 migration 파일 14개를 시간순으로 모두 전문 확인했다. `supabase/verify_phase1.sql`은 여전히 존재하지만 오래된 상태다. 원래의 Phase-1 테이블 19개만 검증하며 Phase 2/3에 맞게 업데이트된 적이 없다.*

### 3.1 Migration 목록(14개, 시간순)

1. `20260819000000_phase1_schema_and_rls.sql` — 원래의 19개 테이블 스키마 + RLS.
2. `20260820000000_phase2b_replace_rpcs.sql` — 3개의 원자적 교체(atomic-replace) migration RPC.
3. `20260822000000_phase2d6_followup_sync_updated_at.sql` — `profiles.sync_updated_at`.
4. `20260823000000_phase3b2_profile_nickname.sql` — `profiles.nickname`.
5. `20260824000000_phase3b3_xp_leaderboard_rpcs.sql` — XP 리더보드 RPC.
6. `20260825000000_phase3b5_overall_leaderboard_rpcs.sql` — Overall 리더보드 RPC.
7. `20260826000000_phase3b5_followup_fix_ambiguous_column.sql` — #6 버그 수정.
8. `20260827000000_phase3b7_game_leaderboard_rpcs.sql` — 게임별 리더보드 RPC.
9. **`20260828000000_phase3g2_friend_connection.sql`** — 신규: `friendships` 테이블, `profiles.friend_code`, `get_or_create_my_friend_code`, `create_friendship`(v1), `remove_friendship`.
10. **`20260828010000_phase3g2_followup_gen_random_bytes_search_path.sql`** — 신규: 친구 코드 생성의 `search_path` 버그 수정.
11. **`20260829000000_phase3g3_friend_ranking_rpcs.sql`** — 신규: 친구 범위 랭킹 RPC 3개.
12. **`20260830000000_phase3g4_friend_invite_preview.sql`** — 신규: `get_friend_invite_preview`(유일한 anon 접근 가능 RPC).
13. **`20260831000000_phase3g5_followup_create_friendship_is_new.sql`** — 신규: `create_friendship` v2(`is_new_connection` 추가), DROP+CREATE 방식.
14. **`20260901000000_phase3i1_profile_birthday.sql`** — 신규: `profiles.birth_date`, `profiles.gender`.

**참고**: "Statling 공유 URL용 공개 slug" 기능(커밋 `b3d9dbb`)에는 **대응하는 migration이 없다**. 이는 애플리케이션 코드에 직접 작성된 순수 정적 데이터(§6.2, §9.2)이며 데이터베이스를 전혀 건드리지 않는다.

### 3.2 스키마 형태(20개 테이블)

기존 19개(아래 표)는 `profiles`를 제외하면 형태가 변하지 않았다. `profiles`에는 5개의 별도 migration을 통해 5개 컬럼이 추가되었다.

| 테이블 | PK | 목적 |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`) | 계정 메타데이터 — §3.4 참조 |
| `pets` | `user_id` | 서버 권위(server-authoritative)의 Statling 레코드(PK를 통해 사용자 1명당 펫 1마리) |
| `player_skill_records` | `(user_id, game_id, difficulty)` | 게임×난이도별 최고 기록 |
| `xp_totals` | `user_id` | `total_xp`, `weekly_xp`, `week_key` |
| `dex_entries` | `(user_id, character_id)` | "만난" 캐릭터 컬렉션, append-only |
| `achievements`, `daily_missions`, `attendance`, `activity_counters` | `user_id` 범위 | 진행도/연속 기록/카운터 상태 |
| `pet_care_state`, `room_state`, `room_care_state` | `user_id` | 돌봄 수치, 방 배경, 방 청결도 |
| `room_items`, `deco_placement_items` | `instance_id` (uuid) | 배치된 가구/장식 — `user_notes` 외에 DELETE가 있는 유일한 테이블 |
| `room_inventory`, `deco_inventory` | `(user_id, asset_id)` | 해금된 에셋, append-only |
| `pet_memory`, `dialogue_memory` | `user_id` | 관계/대화 메모리 |
| `user_notes` | `id` (uuid) | 자유 텍스트 메모, 추가+삭제 가능, 업데이트 없음 |
| **`friendships`** (신규) | **`(user_id_a, user_id_b)`** | 대칭형 친구 연결 — §3.3, §8 참조 |

### 3.3 `friendships` — 신규 테이블과 양 당사자 RLS 패턴

```sql
create table if not exists public.friendships (
  user_id_a uuid not null references auth.users (id) on delete cascade,
  user_id_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_a, user_id_b),
  constraint friendships_ordered check (user_id_a < user_id_b),
  constraint friendships_no_self check (user_id_a <> user_id_b)
);
```

- **방향성이 아닌 대칭형** — 정규 순서로 정렬된 하나의 행(`user_id_a < user_id_b`, CHECK로 강제)이 이미 상호 성립된 친구 관계를 나타낸다. **status 컬럼도 없고 pending/request 상태도 전혀 없다.** migration 헤더 자체가 동의 모델을 명확히 설명한다: "초대/요청 테이블 없음... `friend_code`를 가지고 있는 것이 A의 초대이며... 그것으로 `create_friendship`을 호출하는 것이 B의 동의다." 행은 생성 순간부터 이미 확정된 관계다.
- **RLS — 스키마에서 실질적으로 다른 유일한 패턴**(다른 모든 테이블은 단일 `auth.uid() = user_id` 사용):

```sql
create policy "friendships_select_own" on public.friendships
  for select using (auth.uid() = user_id_a or auth.uid() = user_id_b);
-- 의도적으로 INSERT/UPDATE/DELETE policy가 없으며 해당 grant도 없음.
grant select on public.friendships to authenticated;
```

변경(mutation)은 **오직** SECURITY DEFINER RPC(§3.5)를 통해 가능하다. 이 RPC들은 클라이언트가 전달한 행을 사용하지 않고, 서버 측에서 `auth.uid()` + 해석된 대상 id를 바탕으로 자체 `WHERE`/`INSERT` 대상을 구성한다.

### 3.4 `profiles` — 현재 전체 컬럼 목록

| 컬럼 | 타입 | 추가 시점 | 제약 |
|---|---|---|---|
| `id` | `uuid` (PK) | Phase 1 | FK → `auth.users(id)` cascade |
| `legacy_device_id` | `text` | Phase 1 | — |
| `migrated_at` | `timestamptz` | Phase 1 | — |
| `created_at`/`updated_at` | `timestamptz` | Phase 1 | — |
| `sync_updated_at` | `timestamptz` | Phase 2D-6 Follow-up | — |
| `nickname` | `text` | Phase 3B-2 | unique 제약 없음(제품 결정에 따라 중복 허용) |
| **`friend_code`** | `text` | **Phase 3G-2** | **unique index**; 지연 생성 전까지 nullable |
| **`birth_date`** | `date` | **Phase 3I-1** | `check (birth_date is null or birth_date <= current_date)` |
| **`gender`** | `text` | **Phase 3I-1** | `check (gender is null or gender in ('female','male','other','prefer_not_to_say'))` |

**이전 결론에 대한 수정**: `birth_date`/`gender`와 `friend_code`는 이제 실제로 존재한다. 이전에 없었던 이유는 해당 커밋들이 아직 반영되지 않았기 때문이지, "선택적으로 설계에서 제외"되었기 때문이 아니다.

새로 추가된 5개 컬럼 중 어느 것도 전용 RLS 정책을 받지 않았다. 모두 기존 `profiles_select_own`/`profiles_update_own`에 의존한다. 따라서 클라이언트는 PostgREST를 통해 자신의 `friend_code`/`birth_date`/`gender`를 직접 읽고 쓸 수도 있다. 실제로 제한되는 것은 *다른 사용자에 대한 접근*이며, 이는 좁게 정의된 RPC를 통해서만 가능하다.

### 3.5 RPC 함수(현재 전체 목록)

**Migration RPC** (`SECURITY INVOKER`, 변경 없음): `replace_room_items`, `replace_deco_placement_items`, `replace_user_notes`.

**글로벌 랭킹 RPC** (`SECURITY DEFINER`, 변경 없음): `get_xp_leaderboard_top`/`get_my_xp_rank`, `get_overall_leaderboard_top`/`get_my_overall_rank`(모호한 컬럼 오류로 한 차례 버그 수정), `get_game_leaderboard_top`/`get_my_game_rank`.

**친구 RPC(모두 신규, 모두 `SECURITY DEFINER`)**:

- `get_or_create_my_friend_code() returns text` — `encode(gen_random_bytes(16), 'hex')`(128비트)을 지연 생성하며 race-safe 재시도 루프를 사용한다. **한 차례 버그 수정됨**: 함수 자체의 `search_path = public` 보안 강화가 Supabase의 별도 `extensions` 스키마에 설치된 pgcrypto의 `gen_random_bytes`를 실수로 숨겼다. `search_path = public, extensions`로 넓혀 해결했다.
- `create_friendship(p_friend_code text) returns table(connected boolean, nickname text, is_new_connection boolean)` — 코드 → 대상 사용자를 해석하고 쌍을 정규화한 뒤 `insert ... on conflict do nothing`(멱등성)을 수행한다. **`is_new_connection` 컬럼 추가에는 `CREATE OR REPLACE`가 아니라 DROP+CREATE가 필요했다.** Postgres는 `CREATE OR REPLACE`로 함수의 선언된 `returns table(...)` OUT 파라미터 목록을 변경할 수 없다. migration 주석에는 DROP+CREATE로 전환하기 전에 실제 적용 시도에서 `42P13: cannot change return type of existing function` 오류가 발생했음이 기록되어 있다. `DROP FUNCTION`은 `CREATE OR REPLACE`와 달리 권한 grant를 제거하므로 DROP 후 grant도 **다시 부여해야 했다**.
- `remove_friendship(p_friend_code text) returns table(removed boolean)` — 멱등 삭제, `authenticated` 전용(anon 아님).
- `get_friend_overall_ranking()`, `get_friend_xp_ranking()`, `get_friend_game_ranking(p_game_id, p_difficulty)` — 글로벌 대응 함수와 동일한 공식/동점 처리 규칙을 사용하되, 함수 내부에서 `auth.uid()`와 직접 조인되는 `friendships` 기반 CTE를 통해 범위를 제한한다. 클라이언트가 "누구를 포함할지" 전달하는 파라미터는 의도적으로 존재하지 않는다. 따라서 실제 확정된 행 없이 `friend_code`만 알고 있어도 랭킹 데이터를 노출할 수 없다. 각 함수는 이미 상호 친구인 상대의 `friend_code`(안전하다고 판단 — §12)와 `is_me`도 반환한다(친구 집단은 작고 모든 신원이 호출자에게 이미 알려져 있으므로 여기서는 안전).
- **`get_friend_invite_preview(p_friend_code text) returns table(nickname text)`** — `language sql stable`, 단일 정확 일치 SELECT. 전체 스키마에서 **`anon`과 `authenticated` 모두에 권한이 부여된 유일한 함수**다. 따라서 로그아웃 방문자도 로그인 전에 "OO님과 친구가 되어..."를 볼 수 있다. 읽기 전용, 한 컬럼, 정확 일치만 허용(열거 불가), 부작용 0이므로 안전하다고 판단했다.

### 3.6 Supabase 클라이언트 설정

변경 없음: 브라우저(`lib/supabase/client.ts`)와 서버(`lib/supabase/server.ts`) 클라이언트 모두 anon-key만 사용하고, 환경변수가 없을 때 예외를 던지지 않고 `null`을 반환한다. 코드베이스 어디에도 **service-role 키를 사용하지 않는다**(이번 세션에서 grep으로 재확인).

---

## 4. 평가 및 능력 시스템

### 4.1 6개 능력(변경 없음)

정식 기준 소스: `lib/brain-bet.ts`.

| id | 한국어 | 평가("classic") 게임 |
|---|---|---|
| `reaction` | 순발력 | `reaction-classic` |
| `memory` | 기억력 | `memory-classic` |
| `focus` | 집중력 | `focus-classic` |
| `judgment` | 판단력 | `judgment-classic` |
| `spatial` | 공간감각 | `spatial-classic` |
| `reasoning` | 추리력 | `reasoning-classic` |

### 4.2 평가 구조(변경 없음)

`TOTAL_GAMES = 6`, 항상 Normal 난이도, 능력별로 항상 풀의 "classic" 항목(`getClassicGameKey`)을 사용하며 스탯당 한 번의 재도전이 허용된다. 진행 체크포인트 덕분에 실행 중 새로고침해도 이어서 진행할 수 있다.

### 4.3 `score` vs `normalizedScore`(변경 없음)

게임별 공식은 공통 프리미티브(`lib/scoring/shared.ts`)로 구성된다. `gameScore`(사용자에게 표시되지 않음)와 `normalizedScore`(레코드별 저장)는 동일한 숫자다. 후자는 재계산하지 않고 전자를 명시적으로 재사용한다. 타입에는 `final` "실제 백분위(real percentile)" 필드가 존재하지만 항상 `undefined`다.

대표 공식: Reaction `speed(70%)+validity(30%)`; Memory `weightedAccuracy(85%)+speed(15%)`; Spatial `difficultyWeightedAccuracy + mirrorAccuracy + timeScore + timeoutScore`(정확한 가중치는 `lib/config/spatial.config.ts`; 이번 패스에서 완전히 재검증하지 않음).

### 4.4 Statling 결정 — 결정론적이며 기본 원리는 변경 없음, 한 가지 세부사항 확인

`beginPetAssignment(finals)`(`lib/pets/pet-flow.ts`): 6개 final을 모두 순위화(`pickTopTwoStats`)하고 상위 2개 쌍을 30개 캐릭터 카탈로그와 정확히 매칭한다(`findCharacterByStats`). **동점 처리 세부사항**: 같은 값의 스탯은 고정 우선순위가 아니라 **매번 새로 섞인 무작위 순서**(`rankStatsByFinals`의 Fisher-Yates 사전 셔플)로 결정된다. 이것이 전체 파이프라인에서 유일한 무작위성이다. 희귀도와 궁합은 선택에 영향을 주지 않는다(§6.7).

### 4.5 다운스트림 소비처(변경 없음)

펫 배정; `PlayerSkillState` localStorage; `StatusScreen`의 `computeCurrentStats`; Ranking(글로벌 및 현재 친구 범위); XP(`lib/ranking/xp-ledger.ts`); 게임별 난이도 해금; 서버 동기화(`player_skill_records`, `xp_totals`, `pet_care_state`, `pet_memory`, `pets`, `dex_entries` — 이번 패스에서 정확한 `scheduleSync(...)` 채널 이름 확인).

---

## 5. 미니게임 시스템

**여전히 정확히 12개 게임**이다(확인 완료, 불일치 없음). `lib/game/game-registry.ts`의 `GAME_POOL`을 통해 6개 능력 × 능력당 2개로 구성된다.

**게임별 해금 규칙, 변경 없음**: Normal `normalizedScore ≥ 60`이면 Hard 해금, Hard `normalizedScore ≥ 70`이면 Extreme 해금(`lib/config/difficulty.config.ts`). 코드 주석에 따르면 과거 70/80에서 낮아졌으며 현재 값은 60/70으로 확인됐다.

| game id | 한국어 이름 | 능력 | Extreme / 티어별 구조 |
|---|---|---|---|
| `reaction-classic` | 신호 반응 | reaction | 균일한 스케일링만 적용 |
| `reaction-dodge-run` | 장애물 피하기 | reaction | **있음** — Extreme은 앱에서 유일한 진짜 무한/생존 모드(시간 제한 없음, 1회 충돌로 종료, Extreme 전용 safe-lane 패턴). 랭킹 지표 자체도 티어에 따라 변경됨(Hard: `obstaclesDodged`, Extreme/default: `survivedMs`) |
| `memory-classic` | 패턴 기억 | memory | 확인된 별도 구조 없음 |
| `memory-story-recall` | 물건 기억 | memory | Hard/Extreme에서 `'color'` 질문 카테고리 추가 |
| `focus-classic` | 표적 찾기 | focus | 확인된 별도 구조 없음 |
| `focus-color-target` | 특정 색만 클릭 | focus | 확인 불가 |
| `judgment-classic` | 규칙 전환 | judgment | **있음(Hard+Extreme 공통)** — 2방향→3방향 답변 도메인 |
| `decision-best-choice` | 무엇을 선택할까 | judgment | 확인 불가 |
| `spatial-classic` | 회전 도형 찾기 | spatial | 구조적으로 확인된 별도 요소 없음(mirror distractor는 티어가 아닌 내부 level에 연결) |
| `spatial-fit-puzzle` | 퍼즐 끼우기 | spatial | 확인된 별도 구조 없음(정확도가 아닌 완료 시간으로 랭킹) |
| `reasoning-classic` | 규칙 찾기 | reasoning | 확인된 별도 구조 없음 |
| `reasoning-number-pattern` | 숫자 규칙 | reasoning | 확인된 별도 구조 없음 |

raw record와 ranking metric의 매핑은 여전히 `lib/ranking/game-ranking-metrics.config.ts`에 있다. 위치는 변하지 않았으며 `reaction-dodge-run`은 실제로 티어에 따라 랭킹 지표가 오버라이드되는 가장 명확한 예다.

---

## 6. Statling / 펫 시스템

### 6.1 캐릭터 수 — 여전히 30개

`lib/pets/pet-profile.ts`의 `CHARACTER_DEFS`/`CHARACTER_CATALOG`. 가능한 30개의 순서 있는 스탯 쌍 각각에 하나씩 대응한다. 더 큰 레거시 `lib/character-assets.ts` 레지스트리는 여전히 명시적으로 대체된 상태다.

### 6.2 공개 slug — 신규, 순수 클라이언트 측 기능이며 데이터베이스 기능이 아님

커밋 `b3d9dbb`("add public slugs for Statling share URLs")는 정적 카탈로그에 새 필드를 추가했으며, **새 데이터베이스 컬럼을 추가한 것이 아니다**:

```ts
export interface PetProfile {
  id: string    // 예: '01_치즈털실냥이' — 내부 카탈로그 id, 공유 URL을 제외한 모든 곳에서 계속 사용
  slug: string  // 예: 'cheese-cat' — 공개용, ASCII, 수동 지정, 공유 URL 전용
  ...
}
```

- **파생/해시가 아닌 수동 지정** — 30개 카탈로그 항목 각각이 자체 literal slug 문자열을 가진다. 고유성은 DB 제약이 아니라 모듈 로드 시 runtime assertion(충돌 시 throw)으로 강제한다.
- **Supabase에는 전혀 저장하지 않음** — `pets.character_id`는 여전히 내부 `id`를 참조하며 14개 migration 어디에도 `slug` 컬럼이 없다.
- **해석(Resolution)**: `getPetProfileByPublicUrlId(raw)` = `getPetProfileBySlug(raw) ?? getPetProfileById(raw)` — 먼저 slug를 시도하고 실패하면 레거시 내부 id로 fallback한다.
- **레거시 URL은 영구적으로 작동하며 redirect 없음** — 의도된 설계다. redirect를 사용하면 이미 공유된 링크의 `?ref=`(친구 초대)와 UTM query param을 완벽히 전달해야 하기 때문이다. 코드 주석은 "따라서 레거시 링크는 그냥 정상적으로, 영원히 해석된다"고 명시한다. 크롤러에는 `generateMetadata`의 canonical/OG URL만 새 slug 형태를 알린다.
- 새로 앱이 생성하는 공유 링크(Reveal, MyPage, 친구 초대)는 모두 이제 내부 id가 아니라 `petProfile.slug`를 사용한다.
- 범위: slug는 사용자별 펫 인스턴스나 계정이 아니라 **캐릭터 종(species)**을 식별한다(해당 캐릭터에 매칭된 모든 사용자가 공유). 소스 주석에는 "계정을 식별하는 데 사용할 수 없고 사용해서도 안 된다"고 적혀 있다. 계정을 식별하는 `friend_code`와는 무관하다.

### 6.3 이름 지정 — 변경 없음

`lib/naming.ts`: 1~8자, 하드코딩된 비속어 차단 목록.

### 6.4 `confirmed`/`confirmedAt`과 Statling "생일" — 이제 실제 기능(이전 결론 뒤집힘)

`confirmPet()`은 Reveal 확정 시 여전히 `pets.confirmed=true`/`confirmedAt=now()`를 설정한다. 하지만 이제 이 타임스탬프는 새 `BirthdayScreen`(§1.3, §10.2)을 통해 **실제로 생일로 노출된다**. `confirmedAt`에서 날짜를 가져와 `"{name}의 생일이에요!"`라는 🎂 순간을 보여준다. 새 컬럼을 추가하는 대신 이를 사용하기로 명시적으로 선택했다("no new column needed" — 소스 주석). 이는 새 `profiles.birth_date`와 별개이며 관련이 없다. 후자는 사람 사용자의 생년월일로, 선택 사항이며 계정 범위이고 로그인 사용자에게만 적용된다.

### 6.5 Room 액션 — 여전히 6개, 변경 없음

feed/shower/clean-the-room/play/pet/talk (`lib/room.ts`의 `CareActionId`).

### 6.6 성장/진화 — 여전히 시각적 진화 없음

`evolve`(24상태 표정 시스템의 pose #24)는 여전히 연결되지 않았다. 이전과 동일한 결론이며 HEAD에서 재확인했다. 레벨업은 여전히 숫자 + 코스메틱 해금(대화 톤, idle-motion 변형, 장식 선물)일 뿐, 기본 캐릭터 자체가 교체되지는 않는다.

### 6.7 희귀도 / 궁합 — 변경 없음

`getPetRarity()`는 여전히 항상 `'common'`을 반환한다. `compatibility.ts`는 여전히 flavor text 전용이며 7개 이상의 UI surface에 실제 연결되어 있지만 선택 로직에는 사용되지 않는다.

---

## 7. 랭킹 시스템

### 7.1 카테고리 — 이제 범위 토글 포함

랭킹 **유형**은 여전히 3개(Overall/Per-Game/XP)지만 화면에 **범위(scope)** 선택기도 추가되었다: 전체(`global`) / **친구(`friends`, 신규)**. `ranking-screen.tsx`의 `RANKING_SCOPES`이며 활성 유형 탭과 독립된 segmented control이다. 범위는 새로 진입할 때마다 `global`로 초기화되며 저장되지 않는다.

### 7.2 친구 범위 랭킹 — 신규, 이전의 "랭킹은 전부 글로벌" 결론을 뒤집음

신규 RPC 3개(§3.5)가 친구 범위를 지원한다. 각 함수는 내부에서 `auth.uid()`와 직접 조인되는 `friendships` 기반 CTE를 통해 모집단을 제한하며, 클라이언트가 친구 목록을 전달하지 않는다. 공식/동점 처리 로직은 글로벌 대응 함수와 **바이트 단위로 동일**하며(이번 패스에서 줄별 확인), 모집단만 제한된다. 친구 범위 빈 상태("아직 비교할 친구가 없어요")가 존재한다. top-N 제한은 없다. 친구 모집단은 항상 작으므로 호출자 + 모든 친구를 한 번의 호출로 전체 순위화하여 반환한다.

### 7.3 Hard/Extreme 분리 — 변경 없음

### 7.4 클라이언트 vs 서버 계산 — *표시되는 랭킹 UI*는 여전히 100% RPC, 단 한 가지 세부사항

6개 글로벌 + 3개 친구 랭킹 RPC를 모두 직접 호출하며 클라이언트는 응답 형태만 정규화한다. **이전의 "완전히 죽은 코드" 결론에 대한 수정**: `LocalRankingProvider`(클라이언트 측 mock rival 랭킹 시스템)는 **완전히 죽은 것이 아니다**. `lib/missions/ranking-achievements.ts`에서 여전히 import되어 순위 기반 업적/미션 해금 체크에 사용된다. 이는 `ranking-screen.tsx`에 렌더링되는 기능과 완전히 별개다. 표시되는 Ranking 화면 자체는 글로벌/친구 범위 모두 100% RPC 기반임이 확인됐다.

### 7.5 동점 처리 — 변경 없음

UI에는 "동일한 기록은 먼저 달성한 순서대로"라고 표시된다(first-achieved-wins). 이번 패스에서 글로벌과 친구 RPC의 구체적인 SQL 구현이 동일함을 확인했다.

### 7.6 닉네임 요구사항 — 변경 없음, 두 범위 모두 동일하게 gate됨을 확인

공통 gate는 `scope`/`activeTab`을 고려하기 전에 실행되므로 글로벌과 친구 뷰 모두 동일한 닉네임 전제조건을 공유한다. 모든 랭킹 RPC(글로벌/친구) 역시 서버 측에서 이를 독립적으로 다시 강제한다.

### 7.7 Ranking에서 친구 삭제

친구 범위의 각 랭킹 행에는 이제 확인 대화상자와 함께 친구 삭제 아이콘 버튼(`UserMinus`)이 표시되며 `remove_friendship`을 호출한다. §8.5 참조.

---

## 8. 친구 시스템

**이 섹션은 완전히 다시 작성되었다. 이전의 오래된 커밋 감사에서는 구현이 0이라고 판단했지만 이제 그 결론은 폐기됐다.** 친구 시스템(코드 주석 내부에서는 "Phase 3G"로 태그됨 — 처음 질문 당시 아직 구축되지 않았을 뿐 내부 명칭 자체는 맞았음을 확인)은 실제로 구현되어 있으며, 5개의 migration과 이에 대응하는 애플리케이션 코드로 배포됐다.

### 8.1 데이터 모델 — 대칭형, request/pending 상태 없음

`public.friendships`(§3.3): 확정된 쌍마다 정규 순서로 된 행 하나, status 컬럼 없음. **`friend_code`를 가지고 있는 것 자체가 초대이며, 그것으로 `create_friendship`을 호출하는 것이 동의다.** 스키마와 코드 어디에도 별도의 "pending request" 개념이 없다.

### 8.2 `friend_code` — 실제 존재하는, UUID가 아니며 추측하기 어려운 식별자

`profiles.friend_code`: 128비트(`gen_random_bytes(16)`, hex 인코딩) CSPRNG 토큰. unique index가 있으며 최초 사용 시 지연 생성된다. **raw user UUID가 아니며 어떤 함수도 다른 사용자의 raw `user_id`를 반환하지 않는다.** 모든 친구 관련 RPC 출력 컬럼은 `nickname`/`friend_code`/파생 랭킹 지표/boolean으로 엄격히 제한된다(이번 패스에서 모든 RPC body를 읽어 확인).

### 8.3 초대 흐름 — 전체 추적

1. **MyPage** — "친구와 기록 비교하기" 버튼 → `getOrCreateMyFriendCode()`(RPC) → `buildFriendInviteUrl`을 통해 `/share/{slug}?ref={friendCode}` 생성. 이는 일반 UTM이 붙은 공유 URL 위에 `?ref=`를 추가하는 얇은 wrapper다. 일반 MyPage 공유와 동일한 `ShareContext`/`utm_content`를 사용하므로 실제 둘을 구분하는 것은 UTM 필드가 아니라 `?ref=` 존재 여부다.
2. **수신자가 링크를 연다** — `share-page-client.tsx`가 `useSearchParams()`를 통해 `ref`를 읽는다. 존재하면 기존 Dex CTA 아래에 `FriendInviteCta`를 렌더링한다.
3. **`FriendInviteCta`**는 `get_friend_invite_preview`를 통해 초대자 닉네임 preview를 가져온다. 이것은 유일한 anon 접근 가능 RPC이므로 로그아웃 상태에서도 작동한다.
4. **로그인된 방문자**: "connect" 클릭 시 `create_friendship`을 직접 호출한다.
5. **게스트 방문자**: 코드를 즉시 호출하지 않고 **sessionStorage**(`statling.pendingFriendCode.v1`)에 보관하고 inline `AuthForm`을 표시한다. 이는 Google OAuth가 페이지 내 상태/query param을 잃는 hard redirect이기 때문에 필요하다. `app/auth/callback/route.ts`는 bare origin으로 리디렉션한다.
6. **로그인 후 재개**: `game-flow.tsx`의 root-level `useEffect`(`user`로 gate되며 `GameFlow`가 `/`에서 항상 새로 mount되므로 매 fresh mount마다 실행 가능)가 pending code를 읽고 즉시 지운 뒤 `create_friendship`을 호출한다. pending code가 소비되는 유일한 위치다. 서버 측이 멱등성이므로 중복 재개 시도는 무해하다.
7. **링크를 여는 것만으로 친구 관계가 생성되지는 않는다.** 명시적인 connect 액션(직접 또는 resumed)만 관계를 생성한다. Dex 등록("내 도감에 기록하기")은 `?ref=`와 완전히 독립적이며 어느 경우든 동일하게 동작한다. 친구의 초대 링크로 Statling을 만나도 낯선 사람의 Statling을 만난 것과 Dex에서는 차이가 없다.

### 8.4 친구 삭제 — 백엔드와 UI 모두 존재

`remove_friendship` RPC(멱등, `authenticated` 전용, anon 아님) + 모든 친구 범위 Ranking 패널의 행별 삭제 버튼. 확인 대화상자를 거친다.

### 8.5 보안 태세 요약

- RLS: SELECT 전용, 양 당사자 OR 절. RLS를 통한 쓰기 권한 0(변경은 3개의 write RPC를 통해서만 가능).
- 친구 관련 출력 어디에서도 raw UUID가 다른 사용자에게 노출되지 않는다.
- `get_friend_invite_preview`는 스키마의 유일한 anon 접근 가능 함수이며 안전하도록 의도적으로 범위를 좁혔다(읽기 전용, 한 컬럼, 정확 일치, 열거 불가).
- 친구 범위 랭킹 RPC는 서버 측에서 `auth.uid()` + `friendships` 테이블을 통해 "누구를 포함할지" 결정하며 클라이언트 파라미터를 사용하지 않는다. 따라서 실제 확정 연결 없이 누군가의 `friend_code`만 알고 있어도 그 사람의 랭킹 데이터는 노출되지 않는다.

### 8.6 친구 기능 분석 이벤트

GA4와 PostHog에서 형태가 동일한 신규 이벤트 3개: `friend_invite_opened{pet_id}`, `friend_connected{source:'direct'|'resumed'}`(`is_new_connection`이 true일 때만 발생하며 멱등 재수락에는 발생하지 않음), `friend_ranking_viewed{ranking_type, game_id?, difficulty?}`. 어느 이벤트에도 신원 데이터(`friend_code`, `user_id`, `nickname`)가 포함되지 않는다.

### 8.7 여전히 친구 시스템에 포함되지 않은 것

차단 없음, 친구 수 제한 없음, 알림 없음, 활동 피드 없음, "친구 요청" UI 없음(현재 동의 모델에서는 애초에 해당 개념이 필요 없음), 친구 목록만을 위한 신규 기기 복원 기능 없음. 다만 친구 관계는 서버/계정 범위이므로 계정으로 로그인하는 모든 기기에서 암묵적으로 사용 가능하다. 게임 데이터와 달리 로컬에서 복원할 것이 없으므로 migration/restore snapshot 메커니즘의 일부는 아니다.

---

## 9. 공유 및 도감

### 9.1 현재 공유 흐름은 3개(기존 2개)

| 흐름 | URL 형태 | 구분 요소 |
|---|---|---|
| Character Reveal "공유하기" | `/share/{slug}/{topStat}/{secondaryStat}` | `utm_content='character_result'` |
| MyPage "공유 링크" | `/share/{slug}` | `utm_content='my_page'` |
| **MyPage "친구와 기록 비교하기"(친구 초대)** | `/share/{slug}?ref={friendCode}` | 일반 MyPage 공유와 같은 `utm_content='my_page'` — **UTM이 아니라 `?ref=` 파라미터만 구분 요소** |

세 흐름 모두 동일한 landing page, 이미지 생성, 저장/OS 공유 cascade를 사용한다.

### 9.2 URL 구조 — 공개 slug + 영구적인 레거시 호환성(§6.2)

라우트 디렉터리는 그대로다(`app/share/[petId]/[[...stats]]/`). 바뀐 것은 세그먼트가 *무엇으로 해석되는지*뿐이다. 레거시 → slug 형태로의 redirect는 의도적으로 영구히 없다(query param 보존 위험).

### 9.3 친구 초대 공유는 이제 실제 별도 흐름 — 단순 카드 스타일이 아님

이전 결론을 뒤집는다. 이제 `?ref=` 링크를 열고 명시적인 connect 액션을 수행하면 실제 `friendships` 행이 생성된다(§8.3). 과거 "friend"가 카드 이름의 장식적 표현에 불과했던 것과 실질적으로 다르다.

### 9.4 UTM — 고정된 세 값 그대로, 새 `utm_content` 값 없음

친구 초대 링크도 `'my_page'`를 재사용한다. UTM 체계 밖의 `?ref=`가 유일한 표시자다.

### 9.5 OG 메타데이터 — 여전히 생성기 2개, 입력 해석 계층만 slug-aware

`app/api/og/share/route.tsx`(펫별 동적)는 여전히 해석된 *내부* id를 query param으로 받으며 slug 자체를 직접 받지 않는다. `app/opengraph-image.tsx`(정적 기본)는 변경되지 않았다.

### 9.6 Dex — 메커니즘 변경 없음, 친구 인식 기능이 아님을 확인

여전히 순수 localStorage + 동일한 18-domain Supabase sync다. 친구 초대 링크로 친구의 Statling을 만나는 것은 일반 링크로 낯선 사람의 Statling을 만나는 것과 Dex에서 아무 차이가 없다. `?ref=`의 유일한 친구 전용 효과는 `FriendInviteCta` 렌더링 여부다.

---

## 10. 인증 및 영속성

### 10.1 인증 방식 — 변경 없음

Google OAuth + 이메일/비밀번호만 지원하며 익명 Supabase 세션은 없다.

### 10.2 신규: 생일 / 프로필 온보딩 단계

Naming과 Room 사이에 삽입됨(§1.3, §6.4). `birth_date`(date input)와 `gender`(female/male/other/prefer_not_to_say picker)를 수집한다. **로그인 계정에만 표시**되며 게스트에게는 완전히 숨겨진다(쓸 수 있는 로컬 mirror가 없음). **모든 분기에서 실제로 선택 사항**이다: 게스트 → UI를 전혀 보여주지 않고 자동 진행; 로그인 + 빈 필드 → 네트워크 호출 없이 자동 진행; 로그인 + 저장 실패 → 오류 toast를 보여주지만 계속 진행. **두 필드 모두 의도적으로 localStorage mirror가 없다.** 데이터는 Supabase 전용(`profiles.birth_date`/`gender`, 소유자 범위 RLS)이며 이미 `nickname`에 적용된 패턴과 같다.

### 10.3 게스트 → 로그인 migration — 여전히 같은 18개 domain; 친구 데이터와 birthday/gender는 명시적으로 제외

`LocalDataSnapshot`의 domain 목록은 변하지 않았다. 친구 연결과 birth_date/gender 어느 것도 이 메커니즘을 통해 migration/sync되지 않는다. 친구 연결은 오직 서버 측(RPC로 생성, localStorage를 전혀 사용하지 않음)이며 birthday/gender는 애초에 migration할 로컬 mirror가 없다.

### 10.4 기기 간 복원 및 충돌 해결 — 동일한 Case A/B/C/D/E; 친구/birthday도 restore snapshot에 포함되지 않음

기기를 바꾸어도 친구 연결과 birthday/gender는 이어진다. 하지만 이는 게임 데이터처럼 명시적인 18-domain restore snapshot에 포함되기 때문이 아니라, 단순한 계정 범위 Supabase 컬럼/행을 필요할 때 실시간으로 읽기 때문이다.

### 10.5 localStorage vs sessionStorage — 이제 sessionStorage 사용

**이전의 "사용량 0" 결론을 뒤집는다.** `lib/friends/pending-friend-code.ts`는 `statling.pendingFriendCode.v1`에 localStorage가 아니라 `sessionStorage`를 의도적으로 사용한다. pending 친구 초대 수락은 "초대 링크를 받은 탭에 연결된 단일 방문 의도"로 정의되며, 관계없는 미래 세션에서 다시 나타나서는 안 된다. localStorage의 약 26개 키 구조는 그 외에는 변하지 않았다. birthday/friend 기능을 위한 새 localStorage 키는 추가되지 않았다(둘 다 로컬 캐시 없는 Supabase 전용).

### 10.6 Device id — 변경 없음

이전과 동일한, 넓게 공유되는 인증 전/브라우저별 메커니즘이다. 완전히 계정/RPC 기반인 친구 시스템이나 Landing A/B 실험에는 사용되지 않는다.

---

## 11. 분석(Analytics)

### 11.1 GA4 — 현재 이벤트 타입 38개(35 + 신규 3)

신규: `friend_invite_opened: {pet_id: string}`, `friend_connected: {source:'direct'|'resumed'}`, `friend_ranking_viewed: {ranking_type:'overall'|'game'|'xp', game_id?, difficulty?}`(`lib/analytics/ga.ts`, 주석에 "Phase 3G-5"로 태그 — 사용자가 처음 언급했던 내부 phase 명명 규칙을 확인). 기존 35개 이벤트는 모두 변경 없음.

### 11.2 PostHog — 현재 *커밋된* 코드에는 이벤트 타입 20개, 중요한 주의점 있음

`lib/analytics/analytics.ts`의 커밋된 `ProductEventParams`에는 현재 다음이 있다: 기존 Phase 3A-2 세트(`assessment_started`, `assessment_completed`, `statling_revealed`, `auth_choice_made`, `naming_completed`, `home_entered`, `game_started`, `game_completed`, `care_action_completed`, `level_up`, `achievement_unlocked`, `achievement_claimed`, `daily_mission_claimed`, `room_saved`, `decoration_saved`, `share_started`, `share_completed` — 17개), + `landing_experiment_viewed`(Phase 3E-2), + 신규 친구 이벤트 3개(Phase 3G-5) = **총 20개**.

**기록할 가치가 있는 주의점**: 이 개발 이력의 이전 work-in-progress에서는 PostHog 이벤트가 더 추가된 적이 있다(`ranking_viewed`, `share_preview_opened`, `talk_started`, `talk_answered`, `memory_dialogue_shown`, 그리고 `game_completed.is_personal_best` 필드). 그러나 현재 커밋된 `analytics.ts`에는 어느 것도 존재하지 않는다. 이는 이 문서가 왜 HEAD에 실제 커밋된 것만 신뢰하는지를 보여주는 구체적인 예다. 당시 실제로 존재했던 작업 중 코드라도 커밋되어 반영되기 전에는 앱의 일부가 아니다.

### 11.3 PostHog identity/pageview 메커니즘 — 변경 없음

`person_profiles:'identified_only'`, `capture_pageview:false`, 실제 route 변경 시에만 수동 `$pageview`, Supabase auth 상태에 연결된 `identify()`/`reset()`.

### 11.4 PII 정책 — 깨끗함, 특히 친구 이벤트에 대해 재검증

친구 이벤트에는 `friend_code`, `user_id`, `nickname`이 포함되지 않는다. `pet_id`(개인 데이터가 아닌 종 카탈로그 id), `source`, 랭킹 유형/게임 메타데이터만 포함된다. 기존의 모든 PII 결론(이름 지정은 길이만, 피드백은 enum만, 인증 이벤트는 method만)도 그대로 유효하다.

---

## 12. 보안 및 개인정보

- **RLS**: 이제 20개 테이블(19 + `friendships`) 모두에서 활성화, 예외 없음. `anon`에는 어떤 테이블 접근 권한도 부여되지 않는다. friendships 테이블은 양 당사자 `OR` SELECT 패턴을 추가하지만 RLS를 통한 쓰기 접근은 0이다.
- **`SECURITY DEFINER`** 사용은 6개에서 **11개 함수**(글로벌 랭킹 6 + 친구 5)로 증가했다. 여전히 INVOKER 기본 원칙에 대한 의도적이고 좁은 예외다. 모든 함수는 출력 컬럼을 엄격히 제한하며 다른 사용자의 raw `user_id`를 반환하지 않는다.
- **실제로 새롭게 생긴 보안 관련 surface 하나**: `get_friend_invite_preview`는 스키마에서 **처음이자 유일하게 `anon`에 권한이 부여된 함수**다. 이는 이전의 anon 접근 0 공격 표면을 실제로 의도적으로 확장한 것이다. 읽기 전용, 단일 컬럼, 정확 일치, 열거 불가, 부작용 0으로 좁게 정당화되지만, 기존의 전면 `authenticated` 전용 태세에서 바뀐 보안 관련 변경점으로 명시적으로 표시할 가치가 있다.
- **service-role 클라이언트 없음**(재확인).
- **`friend_code`**는 친구 기능에서 raw UUID 노출을 피하기 위한 실제 의도적 설계다. 어떤 RPC에서도 raw UUID가 반환되지 않음을 확인했다.
- **`birth_date`/`gender`**: 이제 실제 컬럼이며 소유자에게만 RLS 범위 지정(`profiles_select_own`/`profiles_update_own`). 다른 사용자의 birth_date/gender를 읽는 경로는 어디에도 없다(어떤 RPC도 반환하지 않음).
- **Analytics의 PII**: 신규 친구 이벤트 3개를 포함해 깨끗함을 재확인.
- **`gen_random_bytes` search_path 버그**: 실제 프로덕션 버그였다. 잠긴 `search_path=public`에서 함수가 pgcrypto 함수를 찾지 못했고 `public, extensions`로 넓혀 수정했다. `search_path` hijack 방어 강화와 Supabase가 extension을 `public`이 아닌 별도 위치에 설치하는 구조 사이의 긴장을 보여주는 구체적인 사례다.

---

## 13. 프로덕션 / QA 아키텍처

이전 감사의 모든 결론은 HEAD `4e54742`에서 **변경 없이 재확인됐다**:

- **Build**: `next build`만 사용. 별도 typecheck 스크립트 없음. `typescript:{ignoreBuildErrors:true}`가 여전히 설정되어 있고 `images:{unoptimized:true}`도 설정됨.
- **Test suite**: 여전히 명확하게 존재하지 않는다(config 없음, dependency 없음, test file 없음 — 새 grep으로 재확인).
- **CI/CD**: 여전히 `.github` 없음, `vercel.json` 없음.
- **eslint**: `lint` 스크립트에서는 여전히 참조하지만 설치된 dependency가 아니다.
- **QA flags**: `NEXT_PUBLIC_ENABLE_TEST_SKIP` 변경 없음; beta-notice flag 2개도 변경 없음. 친구/slug/birthday 기능을 위한 **새 flag는 추가되지 않았다**.
- **Env vars**: 신규 기능이 도입한 새 환경변수 없음. 친구 시스템은 기존 Supabase RPC surface를 사용하고, 공개 slug는 정적 코드 상수이며, birthday/profile 쓰기는 기존 브라우저 클라이언트를 통해 수행한다.

---

## 14. 아키텍처 의사결정 로그

*실제 코드에 인용 가능한 근거가 있는 결정만 포함한다는 기존 기준을 계속 적용한다.*

### 14.1 친구 연결은 request/pending 상태가 없는 대칭형 구조

- **문제**: 완전한 요청/수락/거절 상태 머신을 만들지 않고 상호 친구 관계를 모델링해야 한다.
- **결정**: 정규 순서로 된 단일 행이 *유일한* 상태다. 상대방의 `friend_code`를 가지고 있는 것 자체가 검색되는 것에 대한 상대의 동의를 의미하고, `create_friendship` 호출은 호출자 자신의 동의를 의미한다.
- **이유**: migration 헤더 자체가 이를 선택된 동의 모델로 명시하며, request/response 테이블보다 의도적으로 단순한 구조다.
- **트레이드오프**: 요청을 "거절"할 방법이 없다(거절할 요청 자체가 없음). 누군가 연결을 시도했다는 알림도 없다. 모델은 "네 코드를 가지고 있고 내가 연결하기로 선택했다"만 지원하며 "나와 연결해 주세요"는 지원하지 않는다.

### 14.2 `friend_code`는 128비트 랜덤 토큰이며 raw user id가 아님

- **문제**: 계정 내부 정보를 노출하지 않으면서 사용자가 서로 찾을 수 있는 공유 가능한 값을 제공해야 한다.
- **결정**: `encode(gen_random_bytes(16),'hex')`, unique index, 지연 생성.
- **이유**: 명시적 설계 의도이며 어떤 친구 관련 RPC도 출력에서 raw `user_id`를 반환하지 않는다는 사실로 뒷받침된다.
- **트레이드오프**: 코드가 유출되거나 스크린샷으로 공유되면 누구나 소유자의 닉네임(`get_friend_invite_preview`, 의도적으로 anon 접근 가능)을 미리 보고 연결을 시도할 수 있다. 하지만 이것이 정확히 의도된 공유 메커니즘이고 닉네임은 이미 공개 랭킹 데이터이므로 낮은 위험으로 수용했다.

### 14.3 `create_friendship`의 `is_new_connection` 추가에는 CREATE OR REPLACE가 아니라 DROP+CREATE가 필요

- **문제**: analytics에서 진짜 신규 연결과 멱등 재수락을 구분해야 했다.
- **대안**: `CREATE OR REPLACE FUNCTION`(Overall 랭킹의 ambiguous-column 버그 수정에 성공적으로 사용된, 프로젝트의 일반적인 RPC 수정 패턴).
- **결정**: `DROP FUNCTION` 후 OUT 컬럼을 추가한 `CREATE FUNCTION`.
- **이유**: Postgres는 `CREATE OR REPLACE`로 함수의 선언된 `returns table(...)` 형태를 변경할 수 없다. migration 주석에 실제 실패한 적용 시도(`42P13`)가 기록되어 있다.
- **트레이드오프**: `DROP FUNCTION`은 권한 grant를 제거하므로 같은 migration에서 명시적으로 다시 부여해야 한다. 프로젝트의 일반적인 "body만 교체" 패턴에는 없는 날카로운 부분이며, 향후 함수 signature 변경 시 선례로 문서화됐다.

### 14.4 `get_friend_invite_preview`는 `anon`에 권한이 부여된 유일한 함수

- **문제**: 로그아웃 방문자가 회원가입을 요구받기 전에 누가 자신을 초대했는지 볼 수 있어야 한다.
- **migration 자체의 논리에 따른 검토 대안**: `create_friendship` 재사용(거부 — 세션 없이 호출하면 오류가 나고 부작용이 있음), `profiles` RLS 의존(거부 — 인증된 호출자에게도 다른 사용자 읽기를 차단함).
- **결정**: 범위를 좁힌, `anon` 권한의, 읽기 전용, 단일 컬럼, 정확 일치 RPC 하나.
- **이유**: 노출 데이터(닉네임)는 이미 공개 랭킹 정보이고, 열거 surface가 없으며(정확 일치만), 상태 변경도 없으므로 안전하다고 판단했다.
- **트레이드오프**: 이는 그동안 보편적이었던 "anon은 아무것도 받지 않는다" 태세에 생긴 스키마 최초의 틈이다. 의도적으로 좁은 틈이지만 실제 선례이므로 향후 anon 접근 함수를 추가하기 전에 신중히 고려해야 한다.

### 14.5 공개 공유 slug는 DB 생성이 아닌 수동 지정 정적 데이터

- **존재하는 구조**: 카탈로그 항목마다 literal `slug` 문자열 하나, 모듈 로드 시 고유성 강제, Supabase에는 전혀 저장하지 않음.
- **파생 대신 수동 지정을 택한 이유**: 코드는 기계적인 한국어→영어 음역이 "읽기 쉽지도 안정적이지도 않다"고 명확히 말한다. 코드에 근거가 있는 명시적 이유다.
- **DB 컬럼이 없는 이유**: 이를 명시적으로 논증하는 주석은 없다. slug가 계정별 행이 아닌 공유 *종(species)*을 식별하므로 사용자별 상태를 저장할 필요가 없다는 합리적 추론은 가능하지만, 코드가 의도적 트레이드오프 분석으로 명시한 것은 아니므로 이 부분은 문서화된 결정이 아닌 구조적 사실로 보고한다.

### 14.6 레거시 공유 URL(내부 id)은 새 slug 형태로 redirect하지 않고 영구적으로 해석됨

- **문제**: 더 나은 slug URL을 도입하면 이미 공유된 링크, 특히 `?ref=` 친구 초대 코드나 UTM param이 있는 링크가 깨질 위험이 있다.
- **결정**: resolver가 먼저 slug를 시도하고 레거시 내부 id로 fallback한다. 영구적이며 old→new redirect는 절대 발행하지 않는다.
- **이유**: 코드가 명시적으로 설명한다. redirect를 사용하면 가능한 모든 기존 공유 링크 형태의 query param을 완벽하게 전달해야 하며, 강제로 redirect할 사용자 측 이점도 없다.
- **트레이드오프**: 같은 콘텐츠에 대해 두 개의 URL 형태가 영구적으로 유효하다(작은 SEO/canonicalization 비용). `generateMetadata`가 크롤러에 항상 slug 형태를 canonical로 알리는 것으로 완화한다.

### 14.7 Pending 친구 초대 코드는 localStorage가 아닌 sessionStorage 사용

- **문제**: 친구 초대 코드는 Google OAuth hard redirect 왕복(페이지 내 상태와 query param을 모두 잃음)을 견뎌야 로그인 후 연결을 완료할 수 있다.
- **결정**: 이 앱의 다른 거의 모든 영속 상태 관례인 `localStorage`가 아니라 `sessionStorage`.
- **이유**: "초대 링크를 받은 탭에 연결된 단일 방문 의도"로 명시적으로 정의한다. 앱의 다른 영속 상태와 달리 며칠 뒤 관계없는 탭/세션에서 다시 나타나서는 안 된다.
- **트레이드오프**: 사용자가 로그인 완료 전에 탭을 닫으면 pending 초대는 이후 방문에서 재개되지 않고 조용히 사라진다(의도된 동작). 앱의 일반적인 "모든 것을 저장하고 언제든 재개" 태세보다 의도적으로 범위를 좁힌 것이다.

---

## 15. 현재 구현 상태

| 영역 | 상태 |
|---|---|
| Landing A/B 실험 | 프로덕션 구현 완료 |
| Assessment(6개 게임, 결정론적 점수/펫 배정) | 프로덕션 구현 완료 |
| Egg/Reveal/Save/Naming/**Birthday**/Room 온보딩 | 프로덕션 구현 완료 |
| Room 돌봄 액션(6개) | 프로덕션 구현 완료 |
| Free Play(12개 게임 × 4개 티어) | 프로덕션 구현 완료 |
| Overall / Per-Game / XP 랭킹, **글로벌 범위** | 프로덕션 구현 완료 |
| **친구 범위 랭킹(전체/친구 토글)** | **프로덕션 구현 완료** (이전: 미구현) |
| **친구 시스템**(`friend_code`, 대칭 연결, 초대/연결/삭제, 게스트→로그인 재개) | **프로덕션 구현 완료** (이전: 전혀 미구현 — 기획 문서에만 존재) |
| **공개 공유 URL slug + 영구적인 레거시 호환성** | **프로덕션 구현 완료** (이전: 미구현 — 내부 id 직접 사용) |
| **생일 / 선택적 프로필 온보딩(`birth_date`, `gender`)** | **프로덕션 구현 완료** (이전: 미구현 — 스키마/UI 없음) |
| 게스트→로그인 migration, 기기 간 복원, 충돌 해결 | 프로덕션 구현 완료(변경 없음; 설계상 친구/birthday 데이터는 명시적으로 이 메커니즘 밖에 있음) |
| 캐릭터 결과 Share + 친구 초대 share, OG 이미지, UTM | 프로덕션 구현 완료 |
| Dex | 프로덕션 구현 완료(친구 인식 기능이 아님을 확인 — 친구 펫을 만나는 것과 낯선 사람의 펫을 만나는 것이 동일하게 동작) |
| GA4(38개 이벤트) + PostHog(커밋된 20개 이벤트) 이중 analytics | 프로덕션 구현 완료 |
| `LocalRankingProvider`(mock ranking) | **부분적으로 살아 있음** — 표시되는 Ranking 화면에서는 dead지만 `ranking-achievements.ts`의 순위 기반 미션/업적 해금에는 여전히 사용됨(이전 "완전히 dead" 결론 수정) |
| `evolve` 캐릭터 pose / 시각적 진화 | 구현됐지만 연결되지 않음(변경 없음) |
| 펫 희귀도 티어 | 구현됐지만 비활성, 항상 `'common'`(변경 없음) |
| 자동화 테스트 suite | 존재하지 않음(변경 없음) |
| CI/CD 파이프라인 | 존재하지 않음(변경 없음) |
| `eslint` | 체크인된 `lint` 스크립트에서 참조하지만 설치되지 않음(변경 없음) |
| 친구 차단, 알림, 활동 피드, 친구 수 제한 | 미구현 — 어느 항목도 schema/RPC/UI를 찾지 못함 |
| 복잡한/다단계 펫 진화, Shop, Inventory, Furniture Editing, Guild, Chat, Season Ranking | 계획/TODO만 존재 — 여전히 구현을 찾지 못함 |
| 랭킹 RPC(글로벌/친구) 내부의 정확한 동점 처리 SQL 알고리즘 | TypeScript만으로는 정확한 알고리즘 수준에서 확인 불가. 다만 UI 문구에 동작이 설명되어 있고 글로벌/친구 간 공식이 줄 단위로 동일함은 검증됨 |
| 실제 Vercel Production에서 `NEXT_PUBLIC_ENABLE_TEST_SKIP`이 정말 unset인지 여부 | 확인 불가 — 코드 gate는 정상이나 live env 값은 저장소 범위 밖임 |
| `friendships`/`dex_entries` 쓰기가 live production에서 end-to-end로 실제 검증됐는지 여부(코드 경로가 단순히 존재하는 것과 구분) | 확인 불가 — live 동작을 독립적으로 확인할 자동화 테스트 suite가 존재하지 않음 |
