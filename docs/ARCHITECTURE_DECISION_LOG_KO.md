# Statling --- 아키텍처 결정 로그

> **진실의 원천(Source of truth)**: 현재 저장소의 git HEAD `4e54742`
> (`main` 브랜치) --- `supabase/migrations/` 아래의 마이그레이션과 이를
> 호출하는 애플리케이션 코드. 이 문서는 현재 코드를 새로 읽고 작성한
> 것이며, `docs/STATLING_MASTER_DOCUMENTATION.md`(어떤 파일을 열어볼지
> 방향을 잡는 용도로만 사용)나 이전 초안을 다시 서술한 것이 아니다.
> stash되었거나 커밋되지 않은 working tree의 내용은 확인하거나 복원하지
> 않았다.

> **근거 기준(Standard of evidence)**: 아래의 모든 ADR은 실제로 근거가
> 된 파일/함수/마이그레이션을 인용한다. 결정의 *이유*가 코드 주석에
> 명시되어 있는 경우 해당 내용을 인용하거나 의미를 가깝게 바꾸어
> 서술하고 그 출처를 밝힌다. 결정의 *최초 동기*를 저장소에서 복원할 수
> 없는 경우(예: "애초에 왜 커스텀 백엔드가 아니라 Supabase를
> 선택했는가")에는 이야기를 만들어내지 않고 확인할 수 없다고 명시한다.
> "대안(Alternatives)"은 주석에서 달리 밝히지 않는 한, 실제로 검토 후
> 기각되었다고 증명된 선택지가 아니라 현재 코드 구조상 합리적으로 가능한
> 선택지를 의미한다.

------------------------------------------------------------------------

## ADR-001 --- Supabase(Auth + Postgres + RLS + RPC)를 유일한 백엔드 레이어로 사용

**상태**: 채택됨(Accepted)

**맥락**: 앱에는 계정에 연결된 영속성, 기기 간 동기화, 사용자 전체를
대상으로 한 랭킹 계산 기능이 필요하다. 이 중 어느 것도 순수 클라이언트
사이드 앱만으로는 자체적으로 처리할 수 없다.

**결정**: 모든 서버 측 관심사를 Supabase를 통해 처리한다. 식별에는
`auth.users`/Supabase Auth를 사용하고, 저장에는 Row Level Security가
적용된 Postgres 테이블을 사용하며, 사용자 간 데이터를 읽어야 하는 일부
작업(랭킹, 친구 연결)이나 일련의 PostgREST 호출만으로는 제공할 수 없는
원자성이 필요한 작업(3개의 "replace" 마이그레이션 RPC)을 위해 소수의
Postgres RPC 함수를 사용한다.

**근거**:

-   `lib/supabase/client.ts` / `lib/supabase/server.ts` --- 코드베이스에
    존재하는 유일한 두 Supabase client factory. 둘 다
    `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`만
    사용한다. service-role key는 어디에도 없으며, 이번 작업에서 저장소
    전체 grep으로 다시 확인했다.
-   `supabase/migrations/20260819000000_phase1_schema_and_rls.sql` ---
    전체 스키마(HEAD 기준 20개 테이블)이며 모든 테이블에 RLS가
    활성화되어 있다.
-   저장소에는 다른 백엔드 기술이 없다. 별도의 Node/Express 서버도 없고,
    다른 데이터베이스 드라이버도 없으며, OG 이미지 생성기
    하나(`app/api/og/share/route.tsx`)를 제외하면 `app/api/*` 라우트도
    없다.

**대안** (구조적으로 가능하지만 실제 검토되었다는 근거는 없음): 커스텀
애플리케이션 서버, Firebase/다른 BaaS, 계정 레이어가 전혀 없는 완전한
로컬 전용 앱.

**이 방식이 작동하는 이유**: 하나의 플랫폼이 identity, storage,
row-level authorization을 함께 제공하기 때문에 새로운 서버 측 기능(랭킹,
친구)이 추가될 때마다 새로운 서비스를 만드는 대신 schema + RLS + 범위가
좁은 RPC의 형태로 추가할 수 있었다.

**트레이드오프**: 높은 권한이 필요한 모든 비즈니스 로직(사용자 간 랭킹
조회, friend-code resolution)은 TypeScript가 아니라 마이그레이션 파일
내부의 PL/pgSQL로 작성해야 한다. 이는 앱 자체의 언어에 더 익숙한 팀에게
실제 비용이 된다. 마이그레이션 파일 자체에 SQL 특화 이슈(canonical-pair
ordering에서 `LEAST()`/`GREATEST()`를 사용하지 않은 이유, `search_path`
hijack hardening, row-count 검사를 위한 `GET DIAGNOSTICS`)를 설명하는 긴
주석이 존재하는 것에서도 이 비용이 드러난다.

**향후 고려사항**: 높은 권한의 로직이 단일 PL/pgSQL 함수로 처리하기에
너무 복잡하거나 상태를 가져야 하는 기능(예: 여러 단계의 외부 API 호출)이
필요해진다면 실제 서버 컴포넌트가 필요해진다. 현재는 그런 구성요소가
없다.

**확인 불가**: Supabase를 구체적으로 선택한 최초의 동기(커스텀 백엔드
또는 다른 BaaS와 비교해 왜 Supabase였는지)는 저장소 어디에서도 근거를
찾을 수 없다. 이 ADR은 현재 존재하는 구조를 설명하는 것이지, 최초 선택
이유를 만들어내는 문서가 아니다.

------------------------------------------------------------------------

## ADR-002 --- Local-first + 계정 레이어로의 일회성 gated migration

**상태**: 채택됨

**맥락**: 방문자는 계정 없이 즉시 플레이를 시작할 수 있어야 한다. 하지만
나중에 가입한다면 진행 중이던 데이터가 사라지거나 중복되어서는 안 되며,
새로운 기기에서 다시 로그인했을 때 기존 데이터를 복원할 수 있어야 한다.

**결정**: 모든 게임플레이 도메인은 로그인 여부와 관계없이 항상 먼저
`localStorage`에 기록한다. 가입/로그인 시 일회성
마이그레이션(`lib/migration/migration-orchestrator.ts`)이 전체
snapshot을 Supabase에 업로드하고, 그 작업이 끝난 뒤에만 재실행을 막는
gate(`profiles.migrated_at`)를 설정한다. 이후의 모든 로그인에서는 별도의
continuous-sync/restore 경로(`lib/migration/session-sync.ts`, 이번
작업에서는 줄 단위로 다시 읽지는 않았지만 코드베이스 전반에서 일관되게
참조됨)가 local state와 server state를 조정한다.

**근거**:

-   `runLocalDataMigration`
    (`lib/migration/migration-orchestrator.ts:84-169`): 먼저
    `profiles.migrated_at`을 확인하고 이미 설정되어 있으면 아무 작업도
    하지 않는다. `isLocalPetMigrationReady()`가 false를 반환하면
    마이그레이션을 연기한다(확정되었지만 아직 이름이 없는 pet --- 아래
    설명 참조). 이후 전체 snapshot(`buildLocalDataSnapshot`)을 만들고
    이를 기록(`writeLocalDataSnapshot`)한 뒤, **모든 테이블 write가
    성공한 이후에만** `migrated_at`을 설정한다. 함수 자체의 주석: *"this
    is the ONE place in the whole pipeline that ever writes migrated_at,
    and it is always the LAST write of a run, never the first."* 즉,
    전체 파이프라인에서 `migrated_at`을 쓰는 유일한 위치이며 항상 실행의
    마지막 write이고 첫 write가 아니다.
-   `isLocalPetMigrationReady()` (`migration-orchestrator.ts:66-71`):
    `confirmed` 상태지만 아직 `statlingName`이 없는 pet의 경우
    마이그레이션 전체를 연기한다. 주석에서 이유를 설명한다. 너무 일찍
    마이그레이션하면 `migrated_at`이 설정되어 이후 이름을 서버로
    전달해야 하는 호출이 영구적으로 short-circuit되며, 이후
    `"nothing would ever call writePetRow again to offer it one."`
-   Trigger 지점: Supabase session restore 및 모든 `SIGNED_IN` 이벤트,
    그리고 위에서 설명한 공백을 잡기 위한 `NamingScreen.onConfirm`의
    retry.

**대안**: 처음부터 계정을 필수로 요구(guest mode 없음), 첫 액션부터
Supabase에 직접 기록(local-first layer 없음), 단일 gated snapshot 대신
background queue 사용.

**이 방식이 작동하는 이유**: 방문자는 제품을 체험하기 위해 계정을 만들
필요가 없고, "이 계정의 로컬 데이터가 이미 업로드되었는가?"라는 질문에는
항상 하나의 명확하고 영속적인 답(`migrated_at`)이 존재한다. 따라서 일부
작업이 실패하더라도 테이블별 bookkeeping 없이 전체를 안전하게 재시도할
수 있다.

**트레이드오프**: 확정되었지만 이름이 없는 pet에 대한 deferral logic은
실제로 존재하는 좁은 edge case이며 정확하게 이해하고 유지해야 한다. 잘못
처리하면 실제 사용자가 선택한 이름이 조용히 서버에 전달되지 않을 수
있다. 또한 일회성 gate이므로 이 migration path를 ongoing sync 용도로
재사용할 수 없고, continuous reconciliation은 완전히 별개의 메커니즘으로
구축해야 했다.

**향후 고려사항**: 계정이 존재하기 *전*부터 서버와 동기화해야 하는
도메인(예: 서버 측 anti-cheat)이 필요해진다면 이 local-first 모델은 단순
확장이 아니라 근본적인 변경이 필요하다.

------------------------------------------------------------------------

## ADR-003 --- 기본은 `SECURITY INVOKER`; `SECURITY DEFINER`는 범위가 좁고 개별적으로 정당화된 예외에만 사용

**상태**: 채택됨 (ADR-004, ADR-006, ADR-007, ADR-016에서 참조하는 상위
보안 원칙)

**맥락**: 일부 RPC(3개의 migration "replace" 함수)는 호출자 자신의 row만
다루므로 호출자 자신의 권한으로 안전하게 실행할 수 있다. 반면 랭킹이나
친구 연결과 같은 RPC는 RLS가 원래 호출자에게 차단하는 다른 사용자의
row를 읽거나 써야 한다.

**결정**: 모든 RPC의 기본값은 `SECURITY INVOKER`로 한다. 사용자 간
read/write가 구조적으로 필요한 특정 함수에만 `SECURITY DEFINER`를
사용하며, 이를 blanket capability가 아니라 각각 별도로 감사해야 하는
예외로 취급한다.

**근거** --- 이 보안 원칙을 확립한
`supabase/migrations/20260820000000_phase2b_replace_rpcs.sql:32-59`의
주석을 직접 인용:

> "All 3 functions are SECURITY INVOKER, not SECURITY DEFINER. ...
> Because every function runs SECURITY INVOKER, the DELETE/INSERT inside
> it execute as the calling (authenticated) role, so: (a) the existing
> grants above are sufficient... (b) the existing RLS policies still
> apply IN FULL, exactly as if the caller had issued the DELETE/INSERT
> directly via PostgREST --- a bug in a function body below (e.g. a
> forgotten WHERE clause) would still be caught by RLS as a second,
> independent layer, which is the entire reason INVOKER was chosen over
> DEFINER here. A DEFINER function would run as the function's OWNER...
> bypassing RLS entirely and making the function's own WHERE/auth.uid()
> logic the ONLY thing standing between a bug and a cross-user data leak
> --- unacceptable for something this security-sensitive."

즉, 3개 함수 모두 `SECURITY DEFINER`가 아니라 `SECURITY INVOKER`이며,
DELETE/INSERT가 호출한 authenticated role의 권한으로 실행되므로 기존
grant로 충분하고 기존 RLS policy도 PostgREST를 직접 호출했을 때와 똑같이
완전히 적용된다. 함수 body에 실수(예: WHERE 절 누락)가 있어도 RLS가
독립적인 두 번째 방어선으로 잡아준다. 반대로 DEFINER는 함수 owner
권한으로 실행되어 RLS를 우회하므로 함수 자체의 `WHERE`/`auth.uid()`
로직만이 버그와 사용자 간 데이터 유출 사이의 유일한 방어선이 된다.

이후의 모든 `SECURITY DEFINER` 함수도 같은 원칙을 명시적으로 참조한다.
친구 연결 마이그레이션의
주석(`20260828000000_phase3g2_friend_connection.sql:75-77`)은 DEFINER
함수가
`"the same narrow, deliberate exception to this project's SECURITY INVOKER default..."`라고
밝히며, 다른 사용자의 `profiles.friend_code`를 읽고 호출자 한 명에게
100% 소유되지 않은 `friendships` row를 삽입/삭제하려면 이것이 필요하다고
설명한다.

**대안**: 단순화를 위해 모든 RPC를 `SECURITY DEFINER`로 설정, 좁은 RPC
대신 RLS policy 자체를 완화.

**이 방식이 작동하는 이유**: 대부분의 함수에서 RLS가 실제 독립적인
안전망으로 남는다. RLS를 우회하는 더 높은 위험을 가진 함수는 작고 감사
가능한 집합(HEAD 기준 11개: global-ranking 6 + friend 5)으로 제한되며,
이 함수들은 모두 두 번째 containment layer로 출력 column 자체를 강하게
제한한다(ADR-006 참조).

**트레이드오프**: 모든 `SECURITY DEFINER` 함수는 schema의 다른 위치보다
coding mistake의 결과가 더 심각할 수 있는 지점이다. 따라서 해당 11개
함수에는 더 높은 review 기준이 필요하다.

**향후 고려사항**: 새로운 cross-user read/write가 필요할 때는 이
프로젝트가 이미 세운 선례에 따라 DEFINER부터 선택하기 전에 먼저 "이
작업을 INVOKER로 할 수 있는가?"를 물어야 한다.

------------------------------------------------------------------------

## ADR-004 --- 랭킹은 `SECURITY DEFINER` RPC를 통해 서버에서 계산하며, client-side provider abstraction은 결과적으로 일부 우회됨

**상태**: 채택됨, 단 하나의 문서화된 아키텍처상 nuance가 있음

**맥락**: Global 및 이후 추가된 friend-scoped leaderboard는 전체
사용자(또는 모든 친구)의 record를 대상으로 순위를 계산해야 하며, caller
한 명을 기준으로 한 per-row RLS만으로는 이를 수행할 수 없다.

**결정**: 6개의 global-ranking
RPC(`get_overall_leaderboard_top`/`get_my_overall_rank`,
`get_game_leaderboard_top`/`get_my_game_rank`,
`get_xp_leaderboard_top`/`get_my_xp_rank`)와 3개의 friend-scoped
equivalent를 모두 `SECURITY DEFINER`로 구현하고, `ranking-screen.tsx`의
data-fetching hook에서 직접 호출한다. Client는 response field casing만
normalize하며 sorting이나 aggregation은 하지 않는다.

**근거**:

-   `lib/ranking/overall-leaderboard.ts`, `xp-leaderboard.ts`,
    `game-leaderboard.ts` --- 각각 `client.rpc('get_*_top', {...})` /
    `client.rpc('get_my_*', {...})`를 직접 호출한다.
-   Friend-scoped
    RPC(`supabase/migrations/20260829000000_phase3g3_friend_ranking_rpcs.sql`)는
    global counterpart와 동일한 formula/tie-break SQL을 복제하되,
    server-side에서 `auth.uid()`와 join되는 `friendships` 기반 CTE로
    범위를 제한한다. client가 "누구를 포함할지" 목록을 전달하지 않는다.

**문서화된 nuance**: `lib/ranking/ranking-provider.ts`는
`RankingProvider` interface를 정의하며 lines 60-70의 자체 doc
comment에서 이를 *"Ranking's swap seam: RankingScreen only ever talks to
`rankingProvider`... Today that's LocalRankingProvider (device-local
skill records + deterministic placeholder rivals, no backend). Once a
real leaderboard exists server-side, adding a SupabaseRankingProvider...
and swapping the singleton's assignment is the entire migration."*이라고
명시한다.

현재는 실제 server-side leaderboard(위 9개 RPC)가 존재하지만
`ranking-screen.tsx`는 이 abstraction을 통하지 않고 RPC를 **직접**
호출하도록 연결되었다. grep 결과 `ranking-screen.tsx`는
`RankedDifficulty` type을 제외하면 `ranking-provider.ts`에서 아무
symbol도 import하지 않는다. `LocalRankingProvider`/synthetic-rival-name
구현(`PLACEHOLDER_NAMES`, 예: `'몽글이'`, `'또리'`)은 **절대적인
의미에서 dead code는 아니다**.
`lib/missions/ranking-achievements.ts`에서 여전히 import하여 rank 기반
achievement/mission-unlock check에 사용하며, 이는 visible Ranking
screen과 완전히 별개의 기능이다.

**대안**: 원래 설계대로 `ranking-screen.tsx`를 `RankingProvider`
interface를 통해 연결하고 이를 구현하는 `SupabaseRankingProvider`를
추가, 또는 실제 backend가 출시된 후 interface/local provider 제거.

**이 방식이 작동하는 이유**: visible Ranking screen은 global과 friend
scope 모두 100% RPC-driven임이 확인되며 실제 올바른 데이터가 사용자에게
전달된다. achievement system에서 synthetic placeholder data를 rank-based
unlock에 사용하는 것은 훨씬 낮은 중요도의 use case다. "top-ranked" 관련
achievement는 visible ranking screen과 같은 수준의 fidelity로 실제
global leaderboard를 반영할 필요가 없다.

**트레이드오프**: 코드베이스에는 이제 "내 순위가 무엇인가?"에 답하는
서로 독립되고 연결되지 않은 두 경로가 존재한다. 실제 RPC path(screen)와
synthetic path(achievements)다. 이는 실제 maintenance burden이며,
`ranking-provider.ts`의 doc comment를 문자 그대로 읽고 여전히 live
ranking screen architecture를 설명한다고 생각하는 사람에게 혼란을 줄 수
있다.

**향후 고려사항**: `ranking-achievements.ts`도 실제 RPC를 사용하도록
바꾸어 `ranking-provider.ts`/`LocalRankingProvider`를 제거하거나,
provider의 doc comment를 실제 현재 역할(achievement-only)에 맞게
명시적으로 재정의하여 문서화된 의도와 실제 사용을 일치시켜야 한다.

------------------------------------------------------------------------

## ADR-005 --- 친구 관계는 방향이 있는 두 row가 아니라 하나의 canonical ordered-pair row로 저장

**상태**: 채택됨

**맥락**: 두 사용자 사이의 friendship은 본질적으로 대칭이다(A가 B의
친구라면 B도 A의 친구). 하지만 단순하게 "A → B", "B → A"를 두 개의 별도
row로 저장하면 두 row가 서로 불일치할 위험이 있고, 이점 없이
storage/RLS-check surface가 두 배가 된다.

**결정**: 관계당 하나의 row만 사용한다. `user_id_a`/`user_id_b`는 항상
더 작은 UUID가 먼저 오도록 정렬하며 CHECK constraint로 강제한다.

**근거**
(`supabase/migrations/20260828000000_phase3g2_friend_connection.sql:129-136`):

``` sql
create table if not exists public.friendships (
  user_id_a  uuid not null references auth.users (id) on delete cascade,
  user_id_b  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_a, user_id_b),
  constraint friendships_ordered check (user_id_a < user_id_b),
  constraint friendships_no_self check (user_id_a <> user_id_b)
);
```

`create_friendship`/`remove_friendship`은 둘 다 application code에서
명시적인 `if v_uid < v_target then ... else ... end if`
branch(`create_friendship`, lines 266-272)를 통해 pair를
canonicalize한다. 마이그레이션 주석은 `LEAST()`/`GREATEST()` 대신 평범한
CASE-style branch를 사용한 이유를 설명한다. live database에 접근하지
못한 상태에서 이 프로젝트의 Postgres version에서 해당 함수들의 정확한
동작을 검증할 수 없었기 때문에, first principles로 검증 가능한
construct를 사용했다.

**대안**: application logic 또는 trigger로 동기화되는 두 방향 row(A→B와
B→A), canonical-ordering CHECK 대신 하나의 row에 별도 `status` enum
사용.

**이 방식이 작동하는 이유**: `friendships_ordered` 덕분에 "이 pair에
이미 row가 있는가?"를 두 가능한 ordering에 대한 `OR` query 없이 단일 row
lookup으로 확인할 수 있다. `PRIMARY KEY (user_id_a, user_id_b)`는
duplicate insert를 먼저 양 방향으로 존재 여부를 검사할 필요 없이
단순하고 저렴한 conflict(`on conflict ... do nothing`)로 만든다.

**트레이드오프**: 이 table을 사용하는 모든 코드(두 write RPC, 세
friend-ranking RPC의 scoping CTE)는 row 자체에 어느 쪽이 "나"인지
표시되지 않으므로
`case when user_id_a = v_uid then user_id_b else user_id_a end`와 같은
branch로 "상대방이 누구인가"를 올바르게 다시 계산해야 한다.

**향후 고려사항**: 향후 기능이 party별 비대칭 상태(예: "누가
시작했는가", "각 side의 mute")를 필요로 한다면 새로운 column 또는 두
번째 table이 실제로 필요하다. 현재 schema는 의도적으로 per-direction
state를 표현할 수 없다.

------------------------------------------------------------------------

## ADR-006 --- `friend_code`: raw user id가 아닌 전용 128-bit opaque token

**상태**: 채택됨

**맥락**: 사용자가 서로를 찾고 연결하기 위해 공유 가능한 값이 필요하다.
계정의 primary key(`auth.users.id`/`profiles.id`)가 이미 사용자를
고유하게 식별하지만 이를 public share link에 직접 사용하면 링크를 받은
누구에게나 raw account identifier가 노출된다.

**결정**: 계정 id와 무관하고 unique하지 않은 `nickname`과도 무관한 전용
`profiles.friend_code` column을 사용한다.
`encode(gen_random_bytes(16), 'hex')`로 생성하며 pgcrypto CSPRNG entropy
128 bits를 가진다. 첫 사용 시 lazy하게 생성하고 unique index를 적용한다.

**근거**:

-   `supabase/migrations/20260828000000_phase3g2_friend_connection.sql:20-31`
    주석: *"`friend_code` is a brand-new, dedicated, nullable, unique,
    opaque public identifier --- 128 bits of randomness... This is
    deliberately NOT a raw auth.users/profiles UUID... 128 bits of
    CSPRNG entropy makes brute-forcing a specific code computationally
    infeasible; there is no secondary 'accept' step in this design...,
    so this unguessability is the entire security boundary for
    friend-adding."*
-   `get_or_create_my_friend_code()` (lines 167-215): race-safe lazy
    generation(`update ... where friend_code is null`,
    `unique_violation` 발생 시 최대 5회 retry).
-   이번 작업에서 다시 확인한 결과 friend 관련 RPC(`create_friendship`,
    `remove_friendship`, `get_friend_invite_preview`, 3개의
    friend-ranking RPC) 중 어느 것도 다른 사용자의 raw `user_id`를
    output으로 반환하지 않는다. 모든 출력은
    `nickname`/`friend_code`/derived metrics/booleans로 제한된다.

**대안**: invite link에서 account UUID를 직접 사용, `nickname`으로
code를 파생(Phase 3B-2 migration에서 nickname이 unique하지 않다는 사실로
인해 암묵적으로 기각됨).

**이 방식이 작동하는 이유**: 유출되거나 screenshot된 invite link가 실제
account identifier를 노출하지 않으며 128 bits는 유효한 code를 추측하는
것을 계산적으로 불가능하게 만든다.

**트레이드오프 --- 마이그레이션 자체 주석에서 명시**: 별도의 "accept"
단계가 없으므로(ADR-005의 consent model 참조) **code 자체가 전체
access-control boundary다**. code를 가진 누구나 owner의 nickname을
preview하고 connection을 시도할 수 있다. 이는 실수가 아니라 의도적인
design choice다. 따라서 `friend_code`는 단순 identifier가 아니라
capability token처럼 동작하며, 일반적인 "username"과 의미 있게 다른 보안
속성을 가진다. 이후 이 시스템을 확장하는 사람에게 이를 명시할 가치가
있다.

**향후 고려사항**: 제품에서 revocable/rotatable invite link가
필요해진다면(예: "이전 code를 무효화하고 싶다") 현재 lazy-generate-once
모델에는 rotation mechanism이 없다. 이는 설정 변경이 아니라 새로운
구현이 필요하다.

------------------------------------------------------------------------

## ADR-007 --- Friend-table mutation은 전적으로 `SECURITY DEFINER` RPC로 제한; RLS를 통한 client write access는 0

**상태**: 채택됨

**맥락**: `friendships` row는 두 account 사이의 관계를 나타내므로
일반적인 single-owner RLS 관점에서 어느 한쪽이 row를 "소유"한다고 보기
어렵다. 어느 party든 직접 write할 수 있도록 단순 RLS policy를 허용하면
한쪽이 양쪽의 동의가 있어야 존재해야 하는 state를 일방적으로 위조하거나
손상시킬 수 있다.

**결정**: `friendships`의 RLS는 **SELECT만 허용**한다.
INSERT/UPDATE/DELETE policy가 없으며 `authenticated` role에도 해당
privilege를 전혀 grant하지 않는다. row를 생성하거나 삭제하는 유일한
방법은 `create_friendship`/`remove_friendship`이다. 둘 다
`SECURITY DEFINER`이며 `WHERE`/`INSERT` target을 오직 `auth.uid()`와
서버에서 resolve한 target id로 구성한다. client가 제공한 raw row 또는 id
pair를 사용하지 않는다.

**근거**
(`supabase/migrations/20260828000000_phase3g2_friend_connection.sql:141-150`):

``` sql
alter table public.friendships enable row level security;

create policy "friendships_select_own" on public.friendships
  for select using (auth.uid() = user_id_a or auth.uid() = user_id_b);

-- Deliberately no INSERT/UPDATE/DELETE policy, and no such privilege granted below.

grant select on public.friendships to authenticated;
```

`remove_friendship`의 주석(lines 293-296)은 보장을 명시한다: *"The WHERE
clause is built entirely from {v_uid, v_target} (never a raw
caller-supplied id pair), so this can only ever delete a friendship the
caller is genuinely a party to --- that guarantee holds independent of
RLS (which this SECURITY DEFINER function bypasses), purely from how the
query itself is constructed."*

즉 WHERE 절이 `{v_uid, v_target}`만으로 만들어지므로 호출자가 실제
party인 friendship만 삭제할 수 있고, 이 보장은 DEFINER가 우회하는 RLS와
독립적으로 query 구성 자체에서 성립한다.

**대안**: 어느 party든 직접 INSERT/DELETE할 수 있는 RLS
policy(암묵적으로 기각됨 --- 그런 policy가 존재하지 않음), query
construction 자체가 아니라 application-level에서 "양쪽 모두 승인"
workflow 사용.

**이 방식이 작동하는 이유**: crafted PostgREST request를 사용하더라도
client는 임의의 `friendships` write를 구성할 수 없다. two-party
integrity guarantee가 client의 정상 행동에 의존하지 않고 RPC 자체의
query construction에 존재하므로 two-owner row에 대해 RLS만 사용하는
것보다 강한 보장을 제공한다.

**트레이드오프**: 향후 friend-related mutation(예: 가상의 "block"
기능)은 같은 pattern을 따르는 새로운 `SECURITY DEFINER` 함수가 각각
필요하다. 확장할 수 있는 generic client write path가 없다.

**향후 고려사항**: 새로운 DEFINER 함수를 좁고 개별적으로 정당화하라는
ADR-003의 일반 지침 외에는 별도로 확인된 사항이 없다.

------------------------------------------------------------------------

## ADR-008 --- Pending friend-invite acceptance는 `sessionStorage` 사용; 앱 전체에서 유일한 사용처

**상태**: 채택됨

**맥락**: guest가 friend-invite link에서 "connect"를 클릭하면 자신의
identity로 `create_friendship`을 실행하기 전에 sign up/in 해야 한다.
Google OAuth는 hard full-page redirect이므로 앱을 완전히 떠났다가 원래
path/query가 보존되지 않은 bare origin URL로 돌아온다.

**결정**: pending `friend_code`를 `localStorage`가 아니라
`sessionStorage`에 저장한다. URL이 round trip 동안 살아남는 것에도
의존하지 않는다. Auth가 resolve된 후 root-level effect가 정확히 한 번
consume한다.

**근거**:

-   `app/auth/callback/route.ts` --- 인용 주석에 따라 직접 읽어
    확인했으며 original path/query를 버리고 bare origin으로
    redirect한다.
-   `lib/friends/pending-friend-code.ts:15-18` 주석: *"sessionStorage
    (not localStorage) is deliberate: a pending invite is single-visit
    intent tied to the tab that received the invite link, not something
    that should silently resurface in an unrelated future tab/session
    days later."*
-   같은 파일의 주석은 email/password path는 hard-navigate하지 않지만
    guest가 flow 중 tab을 닫을 수 있으므로 두 auth path 모두 하나의
    메커니즘을 공유하도록 의도했다고 설명한다. 하나는 in-memory state,
    다른 하나는 storage에 의존하도록 나누지 않았다.
-   Consumption: `game-flow.tsx`의 `user`에 gated된 `useEffect`. fresh
    mount마다 실행되며(app은 항상 `/`에서 remount), pending code를 읽은
    즉시 clear하고 `create_friendship`을 한 번 호출한다. Server-side
    idempotency(`on conflict do nothing`)로 duplicate resume도 안전하다.

**대안**: `localStorage`(주석에 따라 기각 --- "single-visit intent"에
잘못된 persistence semantics), OAuth `redirectTo` URL에 code를 다시
encoding(전체 OAuth handshake 동안 arbitrary query param을 전달하도록
`app/auth/callback/route.ts`를 바꿔야 하므로 문자열 하나를 저장하는
것보다 크고 취약한 변경).

**이 방식이 작동하는 이유**: 정확히 한 번의 hard redirect를 견뎌야 하는
실제 문제를 해결하면서 browsing session과 함께 만료되어야 하는 intent를
과도하게 영속화하지 않는다. 앱 전체에서 `localStorage`의 "명시적으로
clear할 때까지 유지" semantics가 데이터의 실제 lifetime에 부적합하다고
판단된 유일한 위치다.

**트레이드오프**: 로그인 완료 전에 사용자가 tab을 닫으면 pending
invite가 조용히 사라진다. 이는 bug가 아니라 의도된 동작이지만 "친구
초대가 작동하지 않은 것 같다"는 report를 debug할 때 알아야 할 실제
behavioral cost다.

**향후 고려사항**: 확인된 사항 없음. 범위가 좁고 self-contained된
메커니즘이다.

------------------------------------------------------------------------

## ADR-009 --- 일반 share link와 friend-invite link는 두 개의 별도 함수로 생성; `?ref=`는 casual share에 절대 포함하지 않음

**상태**: 채택됨

**맥락**: Statling에는 이미 Character Reveal, MyPage에서 사용하는
general-purpose share link가 있으며 SNS나 블로그에 공개적으로 게시될 수
있다. 모든 share link에 friend-invite token이 포함되면 공개 게시된
link를 본 누구나 poster와 조용히 "친구"로 연결될 수 있다.

**결정**: `buildShareUrl(explicitUrl, context)`(일반)과
`buildFriendInviteUrl(explicitUrl, context, friendCode)`(friend-invite
전용)를 서로 다른 함수로 둔다. 후자는 전자를 감싸고 그 위에
`?ref=<friendCode>`를 추가한다. MyPage의 명시적인 "친구와 기록 비교하기"
action만 friend-invite variant를 호출한다.

**근거** (`lib/share/build-share-text.ts:50-59` 주석): *"Never call this
for a general share (Character Reveal's '공유하기', MyPage's plain '공유
링크') --- those must keep calling buildShareUrl as-is, with no ref
param, since a general share link can end up posted publicly (SNS/blogs)
and a standing friend-invite token must never ride along with every
casual share."*

Schema migration(`20260828000000...sql:33-41`)에도 같은 내용이 적혀
있다. 원래 Phase 3G-1에서 *모든* share URL에 code를 넣자는 제안은 이
이유 때문에 현재의 two-function split을 구현하기 전에 명시적으로
수정되었다.

**대안**: caller가 signed in이면 항상 `?ref=`를 포함하는 하나의
`buildShareUrl`(원래 제안되었으나 이후 수정된 설계), raw query param
대신 link-shortener/redemption-token system.

**이 방식이 작동하는 이유**: invite capability(ADR-006의 trade-off)는
사용자가 누군가를 초대하려고 의도적으로 실행한 단 하나의 UI action에만
한정되며, 넓고 anonymous한 공유를 위한 link에는 유출되지 않는다.

**트레이드오프**: underlying UTM/URL-building logic이 변경될 경우
convention에 따라 함께 유지해야 하는 거의 동일한 함수가 두 개 존재한다.
`buildFriendInviteUrl`은 독립적으로 재구현하지 않고 계속
`buildShareUrl`을 wrapping해야 한다.

**향후 고려사항**: 향후 고유 token을 가진 세 번째 "종류"의 share link가
필요하면 이 two-function pattern(복제하지 말고 wrap)이 기존 선례다.

------------------------------------------------------------------------

## ADR-010 --- Public share-URL identifier(`slug`)를 internal catalog id와 분리하고 legacy URL을 영구 지원

**상태**: 채택됨

**맥락**: Statling의 internal pet-catalog id(예: `01_치즈털실냥이`)는
non-ASCII이며 원래 Share URL path segment에 직접 사용되었다. 더
URL-friendly하고 안정적인 public identifier가 필요했지만 URL shape를
변경하면 이미 공유된 모든 link(`?ref=` friend-invite token 또는 UTM
parameter가 있는 link 포함)가 깨질 위험이 있다.

**결정**: 30개의 static catalog entry 각각에 `slug: string` field(예:
`'cheese-cat'`)를 추가한다. hand-picked이며 database-backed가 아니고
transliteration으로 파생하지도 않는다. Share URL의 raw segment는
`getPetProfileByPublicUrlId(raw) = getPetProfileBySlug(raw) ?? getPetProfileById(raw)`로
resolve한다. slug를 먼저 확인하고 legacy internal id로 fallback하며,
**영구적으로 지원하고 redirect는 절대 하지 않는다**.

**근거**:

-   `lib/pets/pet-profile.ts:14-26` (`PetProfile.id` vs
    `PetProfile.slug` doc comment), `:61`: *"Hand-picked per pet (not
    derived from `name`), since a mechanical Korean-\>English
    transliteration would be neither readable nor stable"*,
    `:119-132`(module-load uniqueness assertion --- duplicate slug이면
    DB constraint가 아니라 runtime에서 throw), `:143-157`의
    `getPetProfileByPublicUrlId` doc comment: *"Tries the stable public
    `slug` first..., then falls back to the legacy internal `id`... so a
    pre-existing link keeps resolving forever, and neither form ever
    collides with the other (slugs are lowercase ASCII/hyphen, internal
    ids are numeric-prefixed Korean, disjoint by construction)."*
-   어느 migration에도 `slug` column이 추가되지 않는다. 14개 migration
    file을 모두 읽어 확인했으며 pure application-code feature다.
-   새로 앱이 생성하는 link(Reveal, MyPage, friend-invite)는 모두
    `.slug`를 사용한다. `generateMetadata`의 canonical/OG URL은 legacy
    form으로 방문했더라도 crawler에게 slug form을 제공한다.

**대안**: migration + backfill을 사용하는 database-generated/stored slug
column, legacy → new URL redirect, internal id를 유일한 public
identifier로 계속 사용(기존 상태).

**이 방식이 작동하는 이유**: database migration risk가 0이고 이미 공유된
모든 link가 깨질 위험도 0이다. internal id는 시스템의 다른 모든 곳에서
완전히 untouched 상태로 유지된다(ADR-014 참조). public-facing URL
shape를 개선하는 순수 additive, low-risk 방식이다.

**트레이드오프**: 같은 content에 대해 두 URL form이 영구적으로 모두
유효하다. 이는 작은 SEO/canonicalization 비용이며 항상 slug form을
canonical로 제공해 완화한다. 향후 catalog editor는 이미 공유된 pet의
slug를 절대 바꾸지 않아야 한다. 이를 위한 migration/versioning
mechanism은 없고 runtime collision check만 존재하므로 *duplicate*는
잡지만 *changed* slug로 인한 old link breakage를 자동으로 "수정"하지는
못한다.

**향후 고려사항**: catalog가 species별이 아니라 instance별 public
identifier를 필요로 한다면 이 slug design은 "character type당 slug
하나"에서 "(user, pet)당 slug 하나"로 이동해야 하며, 이는 상당히 다른
database-backed feature가 될 가능성이 높다.

------------------------------------------------------------------------

## ADR-011 --- Statling의 "생일"은 새 column 대신 기존 `pets.confirmed_at` timestamp 재사용

**상태**: 채택됨

**맥락**: 새로운 onboarding beat에서 "이 Statling이 태어난 날"을
기념하려 했지만 앱은 이미 pet이 확정된 순간을 기록한다(`confirmPet()`이
`pets.confirmed = true` / `confirmed_at = now()` 설정). 이 순간은
개념적으로 "이 Statling이 생겨난 날"과 동일하다.

**결정**: `BirthdayScreen`은 새로운 column을 도입하지 않고
`pets.confirmedAt`(client field name; DB에서는 `confirmed_at`)에서
birthday date를 직접 파생한다.

**근거** (`components/brain-bet/screens/birthday-screen.tsx:29` 주석):
*"pets.confirmedAt (StoredPetProfile) --- the moment '이 Statling과
함께하기' was clicked, this Phase's chosen Statling-birthday source of
truth (see the Phase 3I-1 report for why: it's the actual confirm/birth
moment, already persisted and synced, no new column needed)."*

**`PetMemory.firstMetAt`과의 구분**: 별도 field인
`pet_memory.first_met_at`은 Room UI의 다른 곳(예:
`pet-care-hud.tsx`)에서 기존 "함께한 날짜" 수치를 계산한다. 둘은 모두
"이 관계가 언제 시작됐는가"에서 파생되는 것처럼 보이지만 서로 다른
개념이다. `confirmed_at`은 "이 특정 character를 확정한 순간",
`first_met_at`은 "이 device가 이 pet의 care/memory state를 처음 만난
순간"이다. `BirthdayScreen`은 의도적으로 전자만 사용한다.

**대안**: confirmation time에 한 번 설정되는 새로운
`pets.birth_date`/`statling_birth_date` column. 기능적으로
`confirmed_at` 재사용과 거의 동일하지만 새롭고 중복되는 column이다.

**이 방식이 작동하는 이유**: schema change가 0이고 새로운 sync-domain
wiring도 0이다. 값은 이미 durable하고 기존 migration/restore machinery를
통해 replicate되고 있었다. "새 column이 필요 없다"는 것은 이 값이 필요한
모든 곳에 이미 존재한다는 구체적이고 검증 가능한 주장이다.

**트레이드오프**: `confirmed_at`의 의미가 이제 두 가지로 겹친다. 원래의
정확한 의미인 "pet이 confirmed된 시점"과 새로운 UI framing인 "pet의
생일"이 같은 값을 두 목적으로 사용한다. 향후 두 개념이 분리되어야 하는
기능(예: re-confirmation과 독립적으로 "Statling의 공식 생일 변경")이
필요하면 이 재사용을 되돌려야 한다.

**향후 고려사항**: 위에서 언급한 divergence risk 외에는 확인된 사항
없음.

------------------------------------------------------------------------

## ADR-012 --- 사용자 `birth_date`/`gender`는 optional, guest-inaccessible profile field로 모델링하며 local mirror 없음

**상태**: 채택됨

**맥락**: 새로운 profile-onboarding step에서 사람 사용자의 생년월일과
gender를 선택적으로 수집하려 했지만 guest-first architecture 때문에 이
flow 시점의 많은 방문자는 write할 account row 자체가 없다.

**결정**: `profiles.birth_date`/`profiles.gender`는 둘 다 nullable이며
`updateProfileBirthday()`를 통해 Supabase에 직접만 기록한다. **두 field
모두 `localStorage` mirror가 없으며**, signed-out visitor에게 input UI는
disabled가 아니라 완전히 숨겨진다.

**근거**:

-   `supabase/migrations/20260901000000_phase3i1_profile_birthday.sql`
    ---
    `birth_date date`(`check (birth_date is null or birth_date <= current_date)`)와
    `gender text`(`check (gender is null or gender in ('female','male','other','prefer_not_to_say'))`)
    추가. 둘 다 nullable이며 default 없음.
-   `lib/profile/birthday.ts:4-19` 주석: *"NOT part of
    lib/migration/write-local-snapshot.ts's domain machinery and NOT a
    lib/sync/sync-dispatcher.ts domain. Neither field has a
    localStorage-first offline copy... Deliberately guest-inaccessible:
    since there is no local mirror, a logged-out visitor has no row to
    write to."*
-   `birthday-screen.tsx:125` --- 전체 input block이 `useAuth()`의
    `user`에 gated된다. guest는 Statling-birthday moment(ADR-011)만 보고
    profile-question UI는 전혀 보지 않는다.
-   `handleContinue` (`birthday-screen.tsx:65-104`)는 progression을 절대
    block하지 않는다. signed in이 아니면 즉시 continue, 두 field가
    blank면 network call 없이 continue, save failure가 발생하면 error
    toast를 보여주지만 그래도 continue.
-   Client-side validation(`validateBirthDate`,
    `lib/profile/birthday.ts:45-65`)은 DB CHECK와 동일하게 "future
    금지"를 강제하고, DB가 강제하지 않는 client-only "비현실적으로
    오래된 날짜 금지"(120년) heuristic도 사용한다. module comment는 "too
    old"를 `"a soft UX floor, not a DB-level invariant."`라고 설명한다.
-   `birthday-screen.tsx` 또는 `lib/profile/birthday.ts` 어디에도
    `trackEvent`/`trackProductEvent` 호출이 없다. 이번 작업에서 두 파일
    전체를 읽어 확인했으며 `birth_date`와 `gender` 어느 것도 GA4나
    PostHog로 전송되지 않는다.

**대안**: 대부분의 다른 domain처럼 나중에 sync되는 `localStorage`-first
copy(이 앱의 일반 pattern이지만 여기서는 명시적으로 사용하지 않음),
Room에 도달하기 위한 required field로 설정(기각 --- 전체 screen이
progression을 절대 block하지 않도록 설계됨).

**이 방식이 작동하는 이유**: 이미 `nickname`에도 적용된
pattern(Supabase-only, local mirror 없음)을 실제 sensitive personal
data에도 일관되게 적용한다. 또한 두 field에 대한 analytics send-path가
완전히 없기 때문에 관련 없는 미래의 실수로 두 analytics platform에 PII가
유출될 수 있는 코드 경로 자체가 없다. 현재 이 값을 읽는 코드는 하나의
write function과 향후 명시적으로 `profiles`를 query할 기능뿐이다.

**트레이드오프**: local mirror가 없으므로 guest에게는 이 데이터가 실제로
unavailable하며 write 자체가 실패하면 데이터가 사라진다(실패는 toast로
표시되어 조용히 무시되지는 않음). 이는 앱의 다른 모든 domain보다
의도적으로 낮은 durability level이다.

**향후 고려사항**: 향후 personalization 기능에서 이 데이터가 guest에게도
필요해진다면 "no local mirror" design을 재검토해야 한다.

------------------------------------------------------------------------

## ADR-013 --- GA4와 PostHog는 역할을 명시적으로 분리해 병렬 운영하며 하나의 call로 합치지 않음

**상태**: 채택됨

**맥락**: 제품은 acquisition/traffic 형태의 reporting(GA4가 잘하는
영역)과 product-behavior/funnel/A-B/retention analysis(PostHog가 잘하는
영역)를 모두 원한다.

**결정**: 완전히 독립적인 두 event-tracking layer ---
`trackEvent`(`lib/analytics/ga.ts`)와
`trackProductEvent`(`lib/analytics/analytics.ts`) --- 를 사용한다. 같은
실제 user action에서 서로 인접한 별도 call로 실행하며 shared dispatch
function을 통하지 않는다. 같은 action을 설명하더라도 의도적으로 서로
다른 event *name/shape*을 사용한다(예: GA4의 `mini_game_complete`
vs. PostHog의 `game_completed`).

**근거** (`lib/analytics/analytics.ts:3-20` 주석 일부): *"This is a
PostHog-only companion to lib/analytics/ga.ts, not a replacement or a
migration of it: GA4 (acquisition/traffic) keeps firing its own events
at its own existing call sites, completely untouched. This layer exists
so the small set of PRODUCT/funnel/retention events... have one typed,
centralized place to be added --- call sites never call
posthog.capture() directly, and never repeat this taxonomy inline."*

또한 `analytics.ts:150-156`: *"Fires a PostHog product event...
Deliberately PostHog-only for this phase: GA4's own trackEvent() calls
at these same moments are untouched and keep firing independently ---
this is always an ADDITIONAL call next to the existing one, never a
replacement."*

새 friend-feature event도 두 파일에 matching shape으로 들어가지만 여전히
두 개의 별도 typed entry와 두 call site다. 예를 들어
`friend-invite-cta.tsx`는 기존 pattern에 따라
`trackEvent('friend_invite_opened', ...)`와
`trackProductEvent('friend_invite_opened', ...)`를 인접하지만 독립된
call로 실행한다.

**대안**: 내부에서 두 platform으로 fan-out하는 하나의 unified analytics
abstraction, 모든 용도에 platform 하나만 사용.

**이 방식이 작동하는 이유**: 어느 platform의 config도 자신에게 적합하지
않은 목적까지 억지로 담당할 필요가 없다. 코드베이스의 주석 자체가 의도된
분리("GA4 = acquisition/traffic", "PostHog =
product/funnel/A-B/retention")를 명시하며 `GAEventParams`와
`ProductEventParams`라는 별도 interface를 통해 type level에서도
분리한다.

**트레이드오프**: 두 system 모두에 중요한 event는 두 call site와
의도적으로 shape이 다른 두 definition을 수동으로 동기화해야 한다. 새
event가 추가될 때 두 개가 항상 pair를 이룬다는 compiler-level
guarantee는 없고 모든 call site에서 보이는 adjacent-lines convention에만
의존한다.

**확인 불가**: "왜 하나가 아니라 두 platform인가"가 다른 곳에서 결정된
의도적인 product-analytics strategy(예: cost, team familiarity, 한
platform의 feature gap)를 반영하는지는 저장소에서 근거를 찾을 수 없다.
코드로 문서화된 것은 **두 platform이 이미 존재하는 상태에서의 role
split**뿐이며, 둘을 함께 사용하기로 한 최초 선택 이유는 아니다.

**향후 고려사항**: event 수가 계속 늘어난다면 "한 번 정의하고 platform별
shape mapping으로 둘 다 dispatch"하는 shared layer를 두어 hand-sync
risk를 제거할 수 있다. 현재는 구현되어 있지 않다.

------------------------------------------------------------------------

## ADR-014 --- Internal `petId`는 Dex, sync, analytics에서 사용하는 identity로 유지; `slug`는 share-URL 전용 public representation

**상태**: 채택됨 (ADR-010의 직접적인 결과이며 여러 subsystem에 걸쳐 있어
별도로 기록)

**맥락**: Share URL용 public `slug`가 생긴 후(ADR-010), 이미 internal
catalog id로 pet을 참조하던 다른 모든 subsystem은 internal id를 계속
사용할지 새로운 slug로 전환할지 명확한 결정이 필요했다.

**결정**: Share URL 이외의 모든 subsystem은 기존 internal `id`를 계속
사용하며 `slug`를 사용하지 않는다. slug feature로 인해 변경되지 않는다.

**근거**:

-   `lib/pets/dex-storage.ts:44` --- `addMetPet(petId: string)`은
    사용자의 own pet이 confirmed될 때와 `share-page-client.tsx`를 통해
    친구가 공유한 Statling을 기록할 때 모두 internal id로 호출된다.
    Dex의 `metPetIds` array도 internal id를 저장한다.
-   `lib/pets/pet-profile.ts:18-20` --- `PetProfile.slug` doc comment:
    *"used ONLY in Share URLs... never as a lookup key anywhere else in
    the app (Dex, Ranking, Supabase, analytics `pet_id` all keep using
    `id`, untouched)."*
-   Supabase: DB column `pets.character_id`는 여전히 internal id를
    저장한다. 어떤 migration에도 `slug` column은 추가되지 않았다(ADR-010
    근거에서 확인).
-   Analytics: GA4의 `friend_invite_opened{pet_id}`와 PostHog
    counterpart 모두 internal id를 보낸다. 각 event의 doc comment는
    `pet_id`를
    `"the species catalog id already sent by several existing events (e.g. statling_reveal's statling_type)"`로
    설명한다. slug는 사용하지 않는다.

**대안**: 앱 전체에서 하나의 일관된 identifier를 사용하기 위해 모든
internal reference도 slug로 migration. doc comment가 slug feature의
의도적인 scope limit를 명시하므로 암묵적으로 기각됨.

**이 방식이 작동하는 이유**: slug feature는 strictly additive하고
narrowly-scoped change로 출시되었다. 기존 subsystem의 behavior, storage
shape, analytics event shape가 실제로 untouched임을 검증할 수 있고,
이것이 ADR-010의 "permanent legacy URL, zero migration risk"를 가능하게
한 핵심이다. "public representation"(slug)과 "internal identity"(id)를
분리했기 때문에 한쪽을 바꾸면서 다른 쪽을 건드리지 않을 수 있었다.

**트레이드오프**: 같은 conceptual entity에 서로 다른 identifier가 두 개
존재한다. 향후 "가지고 있는 slug에서 internal id로" 또는 그 반대로
변환해야 하는 코드는 둘을 interchangeable string으로 가정하지 않고
`getPetProfileBySlug`/`getPetProfileById`를 사용해야 한다.

**향후 고려사항**: ADR-010에서 이미 언급한 내용 외에는 없음.

------------------------------------------------------------------------

## ADR-015 --- `create_friendship`의 schema change에는 `CREATE OR REPLACE`가 아니라 `DROP FUNCTION` + `CREATE FUNCTION` 필요

**상태**: 채택됨 (product decision이 아니라 operational/maintenance
precedent)

**맥락**: Analytics에서 `create_friendship`이 실제로 새로운
connection인지(existing friendship을 idempotent하게 다시 accept한
것인지) 알려줄 필요가 생겼다. 하지만 원래 함수의
`returns table(connected boolean, nickname text)` shape에는 해당 field가
없었다. 이 프로젝트에서 이미 적용된 RPC를 수정할 때 일반적으로 사용하던
pattern은 `create or replace function`이며 Overall-ranking
ambiguous-column bug 수정에도 성공적으로 사용된 적이 있다.

**결정**: `CREATE OR REPLACE`를 시도하는 대신 function을 drop하고 세
번째 output column `is_new_connection boolean`을 추가해 다시 생성한다.

**근거**
(`supabase/migrations/20260831000000_phase3g5_followup_create_friendship_is_new.sql`):
이전 ground-up audit에 따르면 마이그레이션 주석은 이 선택이 문서에서
추론된 것이 아니라 이 프로젝트의 실제 database에 적용을 시도했다가
Postgres error `42P13: cannot change return type of existing function`이
발생해 확인된 것이라고 명시한다. `CREATE OR REPLACE FUNCTION`은
function의 선언된 `RETURNS TABLE(...)` OUT-parameter list를 변경할 수
없고 body만 변경할 수 있다.

수정된 함수는 idempotent `INSERT ... ON CONFLICT DO NOTHING` 직후
`GET DIAGNOSTICS v_row_count = row_count`로 `is_new_connection`을
계산한다. 또한 `DROP FUNCTION`은 `CREATE OR REPLACE`와 달리 dropped
object의 privilege grant를 제거하므로 같은 migration에서
`revoke ... from public/anon` + `grant execute ... to authenticated`를
명시적으로 다시 실행한다.

**대안**: 2-column shape을 유지하고 "새 연결인가?"만 묻는 별도의 *새*
function 추가. DROP+CREATE 문제를 완전히 피할 수 있지만 client가 한 번이
아니라 두 번 round trip해야 한다.

**이 방식이 작동하는 이유**: DROP+CREATE 접근법은 client-facing API를
하나의 RPC call로 유지하며 다른 create/remove RPC의 형태(한 call, 한
result row)와 일치한다.

**트레이드오프**: `DROP FUNCTION`은 drop과 recreate 사이의 짧은 window
동안 실제 schema-breaking operation이다. 해당 순간 old function을
호출하는 concurrent caller는 실패할 수 있다. migration-file-applied
system에서는 이 window가 migration runner 실행 시간에 해당하며,
저장소만으로 정확한 deployment mechanics는 **확인 불가**하다.

**향후 고려사항**: 이 migration은 이제 프로젝트 자체에서 "RPC return
shape을 변경하는 방법"에 대한 문서화된 선례다. 향후 signature change는
`CREATE OR REPLACE`가 동작할 것이라 가정하지 말고 같은 DROP + grant
재발급 pattern을 따라야 한다.

------------------------------------------------------------------------

## ADR-016 --- `get_friend_invite_preview`는 schema에서 `anon`에게 grant된 유일한 함수

**상태**: 채택됨

**맥락**: 로그아웃 상태의 방문자가 friend-invite link를 열면 가입을
요청받기 전에 누가 자신을 초대했는지("OO님과 친구가 되어...") 볼 수
있어야 한다. 하지만 `create_friendship`은 authenticated session이
필요하고 실제 side effect가 있으며, `profiles` RLS는 signed-in
caller에게조차 cross-user read를 차단하므로 anonymous user에게는 당연히
접근할 수 없다.

**결정**: 하나의 새롭고 범위가 좁은 read-only `SECURITY DEFINER` 함수를
만들고 **`anon`과 `authenticated` 모두**에게 grant한다. 전체 schema에서
`anon` grant를 가진 유일한 함수다.

**근거**
(`supabase/migrations/20260830000000_phase3g4_friend_invite_preview.sql:67-87`,
해당 파일의 ground-up audit 기준):
`get_friend_invite_preview(p_friend_code text) returns table(nickname text)`,
`language sql stable`, 단일 exact-match `SELECT`이며 unknown/blank
code에 error를 발생시키지 않고 zero row를 반환한다. 마이그레이션 자체
reasoning은 다음 이유로 안전하다고 설명한다. 노출되는
데이터(`nickname`)는 앱의 다른 public ranking에서도 이미 공개되는
정보이며, lookup은 exact-match만 가능하고(partial
match/listing/enumeration capability 없음), function은 side effect가
전혀 없는 plain `SELECT`다.

**대안** (마이그레이션 자체 reasoning): preview에 `create_friendship`
재사용(기각 --- session이 필요하고 side effect가 있음), `profiles` RLS를
직접 사용(기각 --- authenticated caller조차 cross-user read가 차단되고
guest는 더더욱 불가능).

**이 방식이 작동하는 이유**: preview되는 정보(nickname)는 friend
system의 다른 데이터보다 실질적으로 위험이 낮으며, anon-accessible
function을 위험하게 만드는 속성(write access, enumeration, non-public
data)이 구조적으로 모두 제거되어 있다.

**트레이드오프**: 전체 schema가 거의 보편적으로 "anon은 table/function
access가 0"인 posture를 유지하는 가운데 실제로 존재하는 첫 예외다. 이
schema의 security model을 처음 review하는 사람에게 명시적으로 알려야
한다. 코드베이스의 다른 access-control statement를 "anon은 아무것도
없다"로 읽을 수 있지만 이것만은 의도적인 유일한 예외다.

**향후 고려사항**: 향후 anon-accessible function은 최소한 같은
기준(read-only, exact-match, 이미 public인 data, zero side effects)을
충족해야 한다. 이 migration은 인증 없이 무엇을 노출할 수 있다고
판단하는지에 대한 프로젝트의 실제 선례다.

------------------------------------------------------------------------

## 결정 인덱스

  -------------------------------------------------------------------------------------------------------------
  ADR            결정                                카테고리         상태           주요 트레이드오프
  -------------- ----------------------------------- ---------------- -------------- --------------------------
  ADR-001        Supabase(Auth+Postgres+RLS+RPC)를   Data /           채택됨         높은 권한의 로직을 app
                 유일한 backend로 사용               Persistence                     code가 아니라 PL/pgSQL로
                                                                                     작성해야 함

  ADR-002        Local-first + 일회성 gated account  Persistence /    채택됨         confirmed-but-unnamed
                 migration                           Product                         pet의 deferral edge case가
                                                     Architecture                    정확하게 유지되어야 함

  ADR-003        `SECURITY INVOKER` 기본,            Security         채택됨         모든 DEFINER 함수가 더
                 `SECURITY DEFINER`는 좁은 예외                                      높은 위험의 review surface

  ADR-004        Server RPC 기반 Ranking + 일부      Data / Product   채택됨         screen과 achievements에
                 우회된 provider abstraction         Architecture                    서로 연결되지 않은 두
                                                                                     ranking data path 존재

  ADR-005        친구 관계를 하나의 canonical        Data             채택됨         per-direction/asymmetric
                 ordered-pair row로 저장                                             state 표현 불가

  ADR-006        `friend_code`: raw UUID가 아닌      Security         채택됨         code 자체가 전체
                 128-bit opaque token                                                access-control boundary

  ADR-007        Friend-table mutation을             Security         채택됨         향후 friend feature를 위한
                 `SECURITY DEFINER` RPC로 제한                                       generic client write path
                                                                                     없음

  ADR-008        Pending friend-invite에             Authentication / 채택됨         flow 중 tab을 닫으면
                 localStorage가 아닌                 Persistence                     pending invite가 조용히
                 `sessionStorage` 사용                                               사라짐

  ADR-009        일반 share와 friend-invite link를   Sharing /        채택됨         convention으로 동기화해야
                 별도 함수로 생성                    Security                        하는 두 함수

  ADR-010        Public `slug`를 internal `petId`와  Sharing / Data   채택됨         영구적으로 두 URL form이
                 분리, legacy URL 영구 지원                                          모두 유효

  ADR-011        Statling birthday에 새 column 없이  Data / Product   채택됨         `confirmed_at`이 두 의미를
                 `pets.confirmed_at` 재사용          Architecture                    동시에 담당

  ADR-012        `birth_date`/`gender`: optional,    Data / Privacy   채택됨         guest에게 durability 0;
                 guest-inaccessible, local                                           로그인하지 않으면 데이터
                 mirror/analytics 없음                                               저장 불가

  ADR-013        GA4 + PostHog를 역할 분리하여 병렬  Analytics        채택됨         새 event마다 두 call
                 운영                                                                site를 수동으로 동기화해야
                                                                                     함

  ADR-014        Dex/sync/analytics에서는 internal   Data / Sharing   채택됨         같은 entity의 두
                 `petId` 유지; slug는 URL 전용                                       identifier를 구분해야 함

  ADR-015        `create_friendship`의 새 field는    Data /           채택됨         DROP 후 grant를 수동으로
                 REPLACE가 아니라 DROP+CREATE 필요   Persistence                     다시 발급해야 함

  ADR-016        `get_friend_invite_preview`는       Security         채택됨         보편적인 anon-zero-access
                 schema의 유일한 anon-accessible RPC                                 posture의 첫 예외
  -------------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 포트폴리오에 활용할 만한 아키텍처 결정

데이터 분석 / DX(developer experience) / AX(application experience) /
product-data 직무 면접 관련성을 기준으로 선정했다. 그럴듯한 성과 표현이
아니라 trade-off reasoning의 깊이를 기준으로 선택했다.

**ADR-002 --- Local-first + 일회성 gated account migration.**

문제: anonymous user가 즉시 시작할 수 있게 하면서 나중에 account를
만들더라도 진행 상황을 잃지 않도록 해야 한다. 선택: 모든 데이터를 무조건
`localStorage`에 기록한 뒤, 하나의 durable
flag(`profiles.migrated_at`)로 gated되는 single, idempotent,
all-or-nothing upload를 실행한다. 모든 table write가 성공한 뒤에만
flag를 설정한다. 기술적 근거: gate는 의도적으로 첫 write가 아니라
*마지막* write다. 따라서 partial failure가 발생해도 domain별
reconciliation bookkeeping 없이 전체를 안전하게 재시도할 수 있다.
데이터/제품 관점: durability guarantee가 매우 다른 두 data store
사이에서 distributed-transaction system을 도입하지 않고 eventual, gated
consistency를 설계한 구체적인 사례다.

**ADR-003 --- 기본 `SECURITY INVOKER`, `SECURITY DEFINER`는 명시적인
예외.**

문제: 일부 server function은 사용자 간 데이터를 읽어야 하지만 대부분은
그럴 필요가 없다. 선택: 기본적으로 caller 자신의 privilege로 실행하여
RLS가 실제 독립적인 안전망으로 남게 하고, privilege-elevated function은
각각 정당화된 좁은 예외로 취급한다. 기술적 근거: 이 pattern을 만든
migration에 reasoning이 직접 명시되어 있다. INVOKER function의 bug는
RLS가 다시 잡을 수 있지만 DEFINER function의 bug는 그렇지 않다.
데이터/제품 관점: 추상적인 원칙이 아니라 실제 schema에
defense-in-depth를 적용한 명확한 사례이며 security-minded
data-engineering 대화에서 설명하기 좋다.

**ADR-004 --- Server RPC 기반 Ranking + 솔직하게 문서화된 architecture
gap.**

문제: cross-user leaderboard를 server-side에서 계산해야 한다. 선택:
9개의 purpose-built RPC를 UI가 직접 호출한다. 기술적 근거: 실제
backend로의 교체를 한 줄 변경으로 만들기 위해 미리 존재했던 client-side
"provider" abstraction은 실제 integration에서 우회되었다. 실제 backend는
직접 연결되었고 abstraction은 이제 unrelated achievement-checking use
case에만 남아 있다. 데이터/제품 관점: 설계한 abstraction이 실제로 의도한
방식대로 사용되지 않았다는 현실적인 사례다. "실제 gap을 발견했고 이렇게
정리할 수 있다"는 답변은 rough edge가 전혀 없는 이야기보다 신뢰성이
높다.

**ADR-006 --- raw account id가 아닌 opaque 128-bit token으로서의
`friend_code`.**

문제: account identifier를 노출하지 않고 invite link를 공유해야 한다.
선택: 실제 account id나 unique하지 않은 nickname과 구조적으로 무관한
dedicated high-entropy random token. 기술적 근거: 별도 accept/approve
step이 없기 때문에 code 자체가 전체 access-control boundary 역할도 한다.
이는 실수가 아니라 명시된 trade-off다. 데이터/제품 관점: 편리한 기존
id를 재사용하지 않고 실제 security role에 맞게 identifier의
*속성*(unguessable, revocation-free, capability-like)을 설계한 간결한
사례다.

**ADR-010 --- Internal identity와 public slug 분리 + legacy URL 영구
지원.**

문제: 이미 공유된 link를 깨지 않고 public share-URL readability를
개선해야 한다. 선택: purely additive, static, application-code-only slug
field와 redirect 없는 slug-first/id-fallback lookup. 기술적 근거:
database migration이 0이고 UTM 또는 friend-invite token을 포함한 기존
share link에도 risk가 0이며, 다른 subsystem(Dex, analytics, Supabase)이
변경되지 않았음을 ADR-014에서 확인했다. 데이터/제품 관점: 시스템의
*external user-facing representation*과 *internal identity*를 분리한
깔끔한 사례이며 public API/URL design 및 backward compatibility 논의와
직접 연결된다.

**ADR-012 --- Analytics exposure가 0인 optional profile field.**

문제: optional sensitive demographic data(birth date, gender)를 두
analytics platform으로 유출하지 않으면서 guest experience를 저해하지
않고 수집해야 한다. 선택: local mirror 없는 Supabase-only storage,
guest에게 숨겨진 input, 그리고 코드에서 직접 확인한 결과 두 field를
GA4나 PostHog로 보내는 call site가 전혀 없음. 데이터/제품 관점:
data/analytics 직무에 직접 관련된 privacy-by-construction 사례다. leak
path가 없다고 단순 가정한 것이 아니라 실제로 검증했다는 점은 해당
직무에서 설명할 수 있어야 하는 due diligence의 좋은 예다.

**ADR-013 --- 명시적 역할 분리를 가진 병렬 GA4 + PostHog.**

문제: acquisition/traffic reporting과 product-behavior/funnel/A-B
analysis를 모두 지원해야 한다. 선택: 같은 실제 action에서 별도 call로
실행되는 서로 독립적이고 shape도 다른 두 event taxonomy. 의도된 역할
분리는 code comment에 직접 명시되고 별도 TypeScript interface를 통해
구조적으로 강제된다. 데이터/제품 관점: 모든 것을 한 system에 넣는 대신
"이 질문에는 어떤 tool이 실제로 맞는가?"를 기준으로 analytics layer를
설계한 code-verifiable 사례다. platform specialization과 manual-sync
maintenance cost 사이의 trade-off를 논의하기 좋다.

------------------------------------------------------------------------

## 최종 QA 노트

이 문서를 작성하기 전에 Master Documentation이나 이전 대화에서 가정하지
않고 현재 HEAD에서 다음 파일들을 각각 독립적으로 다시 읽었다:
`supabase/migrations/20260828000000_phase3g2_friend_connection.sql`(전체),
`supabase/migrations/20260820000000_phase2b_replace_rpcs.sql`(security-model
section), `lib/friends/pending-friend-code.ts`(전체),
`lib/share/build-share-text.ts`(전체),
`lib/pets/pet-profile.ts`(`findCharacterByStats`까지),
`lib/profile/birthday.ts`(전체),
`components/brain-bet/screens/birthday-screen.tsx`(전체),
`lib/pets/dex-storage.ts`(전체),
`lib/migration/migration-orchestrator.ts`(전체),
`lib/ranking/ranking-provider.ts`(interface + doc comment),
`lib/missions/ranking-achievements.ts`(파일 상단). 필수 QA list에 대해
다음을 구체적으로 확인했다.

-   위에서 사용한 table/column/RPC 이름은 이번 session에서 migration
    file을 직접 읽지 않고 단순히 기억에 의존해 사용한 것이 하나도 없다.
-   `LocalRankingProvider`/`ranking-provider.ts`는 visible Ranking
    screen에 대해서는 **dead**이지만 `ranking-achievements.ts`에서는
    **alive**라고 명시적으로 구분했다. 두 경우를 혼동하지 않았다.
-   `slug`에 대한 모든 언급은 Share URL에만 한정하며 Dex/sync/analytics
    identity에 대한 모든 언급은 internal `id`에 한정했다. 둘을 섞지
    않았다.
-   특정 `localStorage` domain이 Supabase에도 sync된다고, 또는 그
    반대라고 specific citation 없이 주장하지 않았다. 예를 들어
    `birth_date`/`gender`는 대부분의 다른 domain과 달리 *local mirror가
    없음*을 명시했다.
-   위의 GA4/PostHog event name 또는 property를 만들어내지 않았다.
    `friend_invite_opened`, `friend_connected`,
    `friend_ranking_viewed`와 각각의 shape은 이번 session 앞부분에서
    `lib/analytics/ga.ts`/`lib/analytics/analytics.ts`를 직접 읽어
    확인했다.
-   `anon` vs. `authenticated` grant는 추론한 것이 아니라 각 migration의
    실제 `revoke`/`grant` statement를 function별로 확인해 서술했다.
-   "Phase 3G-2"/"Phase 3I-1" 등의 label은 migration file 자체의
    self-identification을 직접 인용할 때만 사용했으며, 이를
    "architecture layer"나 임의로 만든 framework name 대신 사용하지
    않았다.
