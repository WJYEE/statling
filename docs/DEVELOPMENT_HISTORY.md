# Statling Development History

> 기준: 현재 repository HEAD `4e54742` (`main`), 2026-07-23부터 2026-08-25까지의 전체 Git history.
> 작성 원칙: `git log --reverse`, migration history, 주요 commit의 `git show --stat`, 현재 코드 파일을 근거로 개발 흐름을 복원했다. 기존 `STATLING_MASTER_DOCUMENTATION*` 및 `ARCHITECTURE_DECISION_LOG.md`는 방향 확인용으로만 참고했고, 내용을 source of truth처럼 복사하지 않았다.
> 확인 불가 표기: commit/diff만으로 원래 의사결정 이유를 복원할 수 없는 경우에는 추정하지 않고 별도 표기했다.

---

## 1. 조사 범위

- 조사 Git 기간: 2026-07-23 `140d85f`부터 2026-08-25 `4e54742`까지.
- 조사 commit 수: `git rev-list --count HEAD` 기준 184개.
- diff/stat까지 확인한 주요 commit 수: 36개.
- Supabase migration 수: 14개.
- 최종 산출물: `docs/DEVELOPMENT_HISTORY.md`.
- 수정 금지 요청 파일: `docs/STATLING_MASTER_DOCUMENTATION.md`, `docs/STATLING_MASTER_DOCUMENTATION_KO.md`, `docs/ARCHITECTURE_DECISION_LOG.md`는 수정하지 않았다.

---

## 2. 개발 Phase 요약

| Phase | 기간 | 핵심 변화 | 근거 commit |
|---|---:|---|---|
| 1. 기획 문서와 초기 앱 골격 | 2026-07-23 ~ 2026-07-24 | 문서 중심 상태에서 Next.js/v0 기반 UI 앱으로 전환 | `140d85f`, `d64df69`, `e7a370b` |
| 2. 진단 게임 6종과 v1 온보딩 흐름 | 2026-07-24 ~ 2026-07-25 | Reaction, Memory, Focus, Judgment, Spatial, Reasoning이 차례로 구현되고 결과/리빌/룸 흐름이 연결 | `a2fd113`, `dc1f5ba`, `b42890f`, `9e15bb6`, `d93beca`, `05b6dad`, `b05a0fa`, `be76067` |
| 3. Statling 캐릭터, 에셋, 공유 초안 | 2026-07-27 ~ 2026-08-01 | pet profile, matching, storage, reveal, image share, 캐릭터/알/액세서리 asset 대량 추가 | `e5b764a`, `197f3dc`, `ffafe88` |
| 4. Room, Pet Care, Deco, Free Play 확장 | 2026-08-02 ~ 2026-08-10 | 12개 게임 pool, 난이도, Room/Deco 직접조작, care/memory/talk/autonomy, BGM/SFX, 모바일 QA | `dde97de`, `83ee7d2`, `0650808`, `4f9dc39`, `9377a5f`, `9400925`, `77c07f7` |
| 5. 랭킹/미션/업적/XP의 localStorage 시대 | 2026-08-06 ~ 2026-08-18 | local auth, local XP ranking, missions/achievements, difficulty season, pre-Supabase QA | `6b8fa8d`, `157c5c7`, `1e28c74`, `51ce3b8`, `1e1ca05`, `8b40e68`, `4a56168`, `72bd208` |
| 6. Supabase Auth, schema, migration, restore/sync | 2026-08-19 ~ 2026-08-22 | 20개 테이블의 RLS schema, Auth 활성화, local snapshot migration, server restore, continuous sync, freshness marker | `8147cf9`, `b397d68`, `eab911f`, `bca7e42`, `8d14fcf`, `e6a2e88`, `c006be4`, `5b1bfe4`, `128de6e`, `e47de4b`, `933cd53` |
| 7. Analytics와 real server ranking | 2026-08-10 ~ 2026-08-23 | GA4, PostHog, nickname, XP/overall/game ranking RPC가 추가되고 Ranking screen이 서버 데이터로 전환 | `9a1a6a5`, `d2998d4`, `cd98b68`, `6e78dc2`, `06a8745`, `5afd7a2`, `2200921` |
| 8. Share/Dex/landing 실험 고도화 | 2026-08-09 ~ 2026-08-25 | PNG 저장, real per-pet OG URL, link-first share, UTM attribution, landing variant B, public slug | `805ecda`, `b72b67b`, `7f7ea5f`, `01c87ca`, `031e249`, `57449d2`, `85af0f8`, `968b87b`, `70237dc`, `4cb8b62`, `b3d9dbb` |
| 9. Friend system과 friend ranking | 2026-08-24 ~ 2026-08-25 | friend_code, friendships, friend invite preview, friend ranking scope, friend analytics, RPC signature follow-up | `6156d42`, `0cc53bc`, `9a581b4`, `8ba0800`, `ba6aaf9` |
| 10. Birthday/Profile onboarding과 feature freeze 직전 상태 | 2026-08-25 | Statling birthday screen, optional `birth_date`/`gender` profile fields | `4e54742` |

---

## 3. Phase별 개발 복원

### Phase 1. 기획 문서와 초기 앱 골격

**기간**: 2026-07-23 ~ 2026-07-24

**시작 상태**: 최초 commit은 실제 앱보다 문서가 중심이었다. `140d85f docs : 초기 기획 문서 작성`은 `DEVELOPMENT_PLAN.md`, `GAME_SPEC.MD`, `MVP_SCOPE.md`, `기획.md`를 대량 추가했다. 이어 `d64df69`에서 README와 `.gitignore`가 정리된다.

**주요 구현**: `e7a370b feat: v0 기반 Statling 초기 UI 추가`에서 Next.js 앱 골격이 생겼다. `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/brain-bet/game-flow.tsx`, `landing-screen.tsx`, `status-screen.tsx`, `complete-screen.tsx`, `radar-chart.tsx`, `statling.tsx`, `lib/brain-bet.ts`가 추가되었다.

**최종 결과**: 문서형 기획에서 실제 브라우저 앱의 첫 화면, game flow, stat/result UI를 가진 MVP 골격으로 이동했다.

**확인 불가**: 왜 Next.js/v0 조합을 선택했는지는 Git diff만으로 확인할 수 없다.

**근거 commit**
- `140d85f` docs : 초기 기획 문서 작성
- `d64df69` docs: README 수정 및 gitignore 위치 수정
- `e7a370b` feat: v0 기반 Statling 초기 UI 추가

### Phase 2. 진단 게임 6종과 v1 온보딩 흐름

**기간**: 2026-07-24 ~ 2026-07-25

**시작 상태**: 초기 UI에는 stat/result 흐름은 있었지만 실제 진단 게임들이 아직 충분히 분리되어 있지 않았다.

**문제 / 필요성**: 제품의 핵심이 "능력 테스트 후 나의 Statling을 발견한다"라면, 단일 placeholder 화면이 아니라 능력별로 독립된 게임, scoring, config가 필요했다.

**주요 구현**
- `a2fd113`에서 v1 전체 흐름이 확장되며 `egg-screen`, `reveal-screen`, `save-screen`, `naming-screen`, `room-screen`, `my-page-screen`, `grow-screen`, `free-play-result-screen`이 추가되었다.
- `dc1f5ba` Reaction: `reaction-game.tsx`, `reaction.config.ts`, `scoring/reaction.ts`, `game/types.ts`.
- `b42890f` Memory: `memory-game.tsx`, `memory-grid.ts`, `scoring/memory.ts`.
- `9e15bb6` Focus: `focus-game.tsx`, `focus-grid.ts`, `focus-rounds.ts`, `scoring/focus.ts`.
- `d93beca` Judgment: `judgment-game.tsx`, `judgment-stimulus.ts`, `scoring/judgment.ts`.
- `05b6dad` Spatial: `spatial-game.tsx`, `spatial-problems.ts`, `spatial-shapes.ts`, `scoring/spatial.ts`.
- `b05a0fa` Reasoning: `reasoning-game.tsx`, `reasoning-problems.ts`, `reasoning-templates.ts`, `scoring/reasoning.ts`. 이 commit에서 `placeholder-result.ts`와 `game-screen.tsx`가 삭제되어 placeholder 기반에서 실제 게임 기반으로 넘어간 것이 보인다.

**시행착오 / Follow-up**
- `be76067`에서 첫 플레이 난이도와 UI가 최적화되었다.
- `b4d4f3a`, `9ef92a8`에서 initial radar chart 오류와 UI가 보정되었다.
- `e9d3b56`은 최초 진단 플로우를 단순화하고 MY STATUS를 제거했다. 초기에는 진단 결과 확인 흐름이 더 복잡했으나, 이후 "진단 -> 알/리빌 -> 방"에 가까운 흐름으로 정리된 것으로 볼 수 있다.

**최종 결과**: 6개 능력치에 대응하는 6개 최초 진단 게임과 scoring/config 구조가 갖춰졌다. 이후 Free Play는 이 구조 위에 게임 pool을 확장하는 방식으로 진화한다.

**근거 commit**
- `a2fd113` feat: Statling v1.0 전체 UI 흐름 및 펫 룸 구현
- `dc1f5ba` feat: Reaction 5회 측정 구현 및 튜토리얼 구분 개선
- `b42890f` feat: Memory 게임 로직 및 플레이 UX 구현
- `9e15bb6` feat: Focus 제작 및 게임난이도, 결과 피드백 UX 개선
- `d93beca` feat: Judgment 구현 완료 및 난이도.조작 수정
- `05b6dad` feat: 미니게임 UX 개선 및 Spatial 버그 수정
- `b05a0fa` feat: 모든 미니 게임 1차 완성

### Phase 3. Statling 캐릭터, 에셋, 공유 초안

**기간**: 2026-07-27 ~ 2026-08-01

**시작 상태**: 게임 결과는 있었지만, 결과가 어떤 캐릭터/펫으로 이어지는지와 asset 기반 표현은 아직 약했다.

**주요 구현**
- `e5b764a`에서 `lib/pets/pet-profile.ts`, `pet-analysis.ts`, `pet-flow.ts`, `pet-storage.ts`, `compatibility.ts`, `mock-finals.ts`가 추가되며 진단 결과가 pet/reveal 구조로 연결되었다.
- 같은 commit에서 캐릭터, 알, 액세서리 asset이 대량 추가되었고 reveal 화면이 개선되었다.
- `197f3dc`에서 결과 공유 기능이 추가되었다. `components/share/statling-share-card.tsx`, `lib/share/build-share-text.ts`, `create-share-image.ts`, `download-share-image.ts`, `share-statling-result.ts` 등이 생겼다.
- `ffafe88`은 캐릭터 asset과 SFX를 추가하는 대형 commit이면서, 이후 구조의 씨앗도 함께 넣었다. 12개 게임 확장, pet-care module, room module, audio module이 이 시점에 대거 등장한다.

**데이터 구조 변화**
- 아직 DB는 없다. pet identity와 결과는 `localStorage` 중심의 `lib/pets/*`, `lib/game/*`, `lib/share/*`로 유지된다.

**최종 결과**: 제품 정체성이 "점수 화면"에서 "나의 Statling 캐릭터를 얻고 공유하는 경험"으로 이동했다.

**근거 commit**
- `e5b764a` feat: 펫·알·액세서리 에셋 추가 및 리빌 화면 개선
- `197f3dc` feat: 스탯링 결과 공유 기능 및 이미지 공유 시스템 구현
- `ffafe88` feat: 캐릭터 에셋 추가중

### Phase 4. Room, Pet Care, Deco, Free Play 확장

**기간**: 2026-08-02 ~ 2026-08-10

**시작 상태**: Statling을 얻는 경험은 생겼지만, 반복 사용을 만드는 Room, 상호작용, 꾸미기, 자유 플레이 구조가 덜 완성되어 있었다.

**주요 구현**
- `dde97de`에서 Intro 이어하기, onboarding, Deco 편집, Dex, `statling-screen`, `theme-screen`, `player-skill-storage`, `intro-progress-storage`가 추가되었다. `lib/pets/matching.ts`는 이 commit에서 삭제되어 pet 선택/분석 구조가 정리된 것으로 보인다.
- `ffafe88`와 `dde97de` 사이에서 `lib/game/game-registry.ts`가 생기고, 현재 HEAD 기준 `GAME_POOL`은 6개 stat마다 2개 게임을 가진다. 최초 진단은 `getClassicGameKey(stat)`로 각 stat의 첫 번째 classic game만 사용하고, Free Play는 전체 pool을 고르게 한다.
- `83ee7d2`에서 `lib/game/difficulty.ts`, `difficulty-unlock.ts`, `difficulty.config.ts`가 추가되어 Easy/Normal/Hard/Extreme 난이도 체계가 도입되었다.
- `4f9dc39`에서 Deco 편집은 anchor 기반 직접조작 방식으로 바뀌었다.
- `9377a5f`, `632cdb0`, `9400925`, `b945919`, `f42c351`, `353d95c`에서 pet state reaction, autonomous movement, 선택지 기반 talk, 말풍선/카드 UX가 반복 보정되었다.
- `0650808`, `8b93089`, `c3bd6b0`, `83f54e6`에서 BGM/SFX와 모바일 오디오 이슈가 정리되었다.

**미니게임 확장**
- 최초 진단 6개: `reaction-classic`, `memory-classic`, `focus-classic`, `judgment-classic`, `spatial-classic`, `reasoning-classic`.
- Free Play 확장 6개: `reaction-dodge-run`, `memory-story-recall`, `focus-color-target`, `decision-best-choice`, `spatial-fit-puzzle`, `reasoning-number-pattern`.
- 현재 `lib/game/difficulty.ts`는 `easy | normal | hard | extreme` 4단계를 정의한다. 주석상 Easy는 practice-only, Normal은 baseline, Hard/Extreme은 하위 tier 기록 기반 unlock이다.

**시행착오 / Follow-up**
- `0f3399f`: 새로고침 시 Landing 복귀, Room 좌표 불일치, touch tap 선택 실패 수정.
- `1b14d29`: tutorial 전환과 결과 대기시간 단축.
- `b777f6f`: 모바일 최초 진단 게임 spacing 축소.
- `ffa2c23`: 모바일 Pet Care 반응 속도 개선.
- `ccf2473`: 자율 이동 범위를 viewport가 아니라 실제 Room width로 계산.

**최종 결과**: Statling은 단발 진단 결과가 아니라 Room에서 돌보고, 꾸미고, 말 걸고, 자유 플레이를 반복하는 캐릭터형 서비스가 되었다.

**근거 commit**
- `dde97de` feat: Intro 이어하기 및 온보딩 추가, Deco 편집 기능과 스탯 시스템 개선...
- `83ee7d2` feat : Intro UX, 모바일 UI, 피드백, Deco 랜더링 및 난이도 시스템 개선
- `4f9dc39` feat: Deco 편집을 앵커 기반 직접조작 방식으로 개편
- `9377a5f` feat: Character state reactions 캐릭터 상태 트리거 및 자율 이동 방향 개선
- `9400925` Add choice-based talk system
- `77c07f7` feat: Add a back button to Free Play mini-games

### Phase 5. 랭킹/미션/업적/XP의 localStorage 시대

**기간**: 2026-08-06 ~ 2026-08-18

**시작 상태**: 반복 플레이는 있었지만, 계정/랭킹/미션/업적이 아직 서버 없이 local device 중심이었다.

**주요 구현**
- `6b8fa8d`에서 localStorage 기반 login이 추가되며 `auth-context`, `local-auth-provider`, `local-auth-store`, `supabase-auth-provider`가 분리되었다. Supabase로 갈 수 있는 interface를 먼저 잡아둔 형태다.
- `157c5c7`에서 localStorage 기반 XP ranking이 추가되었다. `ranking-screen.tsx`, `ranking-provider.ts`, `xp-ledger.ts`가 생겼다.
- `e2893c5`, `555d1c3`, `d955479`에서 overall/game/xp ranking, sticky rank card, raw metric per-game ranking, Hard/Extreme 분리가 붙었다.
- `1e28c74`에서 mission screen shell이 생기고, `51ce3b8`에서 daily mission과 category achievement가 본격 구현되었다.
- `2577343`은 미션 도입 이전의 기존 mini-game play 기록도 games-played achievement에 반영하도록 수정했다.
- `4533d38`, `02a71b6`, `8b40e68`에서 achievement system, room reward, manual claim/progress UX가 보강되었다.

**데이터 구조 변화**
- 이 시기 persistence는 여전히 localStorage다. `lib/ranking/xp-ledger.ts`, `lib/game/player-skill-storage.ts`, `lib/missions/*storage.ts`, `lib/pet-care/*storage.ts` 같은 client storage 파일들이 중심이다.
- `ranking-provider.ts`의 주석은 visible Ranking screen이 provider singleton만 바라보게 할 의도였다고 설명하지만, 현재 HEAD에서는 visible Ranking screen이 서버 RPC wrapper를 직접 호출한다. 이 provider는 현재 `ranking-achievements.ts`에서 rank-based achievement 계산에 남아 있다.

**시행착오 / Follow-up**
- `94f7218`: mission commit에 잘못 포함된 `finals` prop 제거.
- `ecd7913`: Initial Assessment 중 achievement toast를 지연하고 첫 Home entry에서 순차 flush.
- `1e1ca05`, `f11243d`, `e34fd25`, `fde243a`, `f636013`, `31675cd`, `0afb013`, `a7eeee8`: 난이도, season record, collision, spatial puzzle, browser QA를 집중 보정.

**최종 결과**: 서버 없는 상태에서도 반복 사용 지표(XP), 동기 부여 루프(미션/업적), ranking UI가 먼저 완성되었다. 이후 Supabase 도입은 이 local state들을 계정 persistence로 옮기는 문제로 이어진다.

**근거 commit**
- `6b8fa8d` feat: localStorage 기반 로그인 구현 및 Supabase 교체 가능한 구조로 분리
- `157c5c7` feat: localStorage 기반 XP 랭킹 시스템 추가
- `51ce3b8` feat: Add daily missions and category-based achievements
- `1e1ca05` feat: 미니게임 난이도 및 랭킹 시즌 시스템 개편
- `8b40e68` feat: Add manual achievement rewards and progress UX

### Phase 6. Supabase Auth, schema, migration, restore/sync

**기간**: 2026-08-19 ~ 2026-08-22

**시작 상태**: 앱은 localStorage-first로 작동했지만 cross-device sync, real leaderboard, account persistence를 처리할 backend layer가 없었다.

**주요 구현**
- `8147cf9`에서 `20260819000000_phase1_schema_and_rls.sql`이 추가되었다. `profiles`, `pets`, `player_skill_records`, `xp_totals`, `achievements`, `daily_missions`, `attendance`, `activity_counters`, `pet_care_state`, `room_state`, `room_items`, `room_inventory`, `room_care_state`, `deco_placement_items`, `deco_inventory`, `pet_memory`, `dialogue_memory`, `user_notes`, `dex_entries` 등 현재 schema의 기반 테이블이 생겼고 RLS가 켜졌다.
- `b397d68`에서 Supabase authentication이 실제 provider로 활성화되었다.
- `eab911f`에서 local data snapshot builder, `bca7e42`에서 Supabase write helpers가 추가되었다.
- `8d14fcf`에서 `replace_room_items`, `replace_deco_placement_items`, `replace_user_notes` RPC가 추가되었다. 여러 row를 갈아끼워야 하는 domain은 plain upsert만으로 원자성이 부족해서 replace RPC가 추가된 구조다.
- `e6a2e88`에서 migration orchestrator가 생겼고, `3c91a90`에서 login flow에 연결되었다.
- `c006be4`에서 confirmed-but-unnamed pet edge case가 발견되어 migration을 Naming 완료 이후로 defer하도록 수정했다.
- `5b1bfe4`, `128de6e`에서 Supabase -> local restore foundation과 실제 login flow 연결, conflict screen, session sync가 추가되었다.
- `e47de4b`, `a7a6ab1`, `386583a`에서 continuous sync foundation, game records/XP sync, care/mission sync가 연결되었다.
- `933cd53`에서 `sync_updated_at` freshness marker와 multi-device resolution이 들어갔다.

**데이터 구조 변화**
- local-only에서 hybrid local/server로 이동했다.
- `profiles.migrated_at`은 one-time migration gate가 되었고, `sync_updated_at`은 이후 multi-device freshness 비교에 쓰인다.
- replace RPC 3개는 `SECURITY INVOKER`로 만들어져 RLS가 계속 안전망으로 작동한다.

**시행착오 / Follow-up**
- `0834770`: Supabase email validation에 맞춰 signup validation 보완.
- `b7469db`: logout 시 preference를 바꾸지 않고 BGM만 정지.
- `c006be4`: 이름 없는 pet을 서버에 먼저 올리고 `migrated_at`을 찍어버리는 문제를 막기 위해 migration defer.
- `901031f`: missing migration snapshot exports 포함.

**최종 결과**: Statling은 guest-first UX를 유지하면서도, 로그인 이후 local data를 서버로 올리고, 이후에는 restore/sync를 통해 multi-device 사용을 처리하는 구조가 되었다.

**근거 commit**
- `8147cf9` chore: Add Supabase Phase 1 schema migration
- `b397d68` feat: Activate Supabase authentication
- `eab911f` feat: Add local data snapshot builder
- `8d14fcf` feat: Add transactional migration replace RPCs
- `c006be4` fix: Defer migration until Statling naming completes
- `933cd53` feat: add multi-device sync freshness resolution

### Phase 7. Analytics와 real server ranking

**기간**: 2026-08-10 ~ 2026-08-23

**시작 상태**: ranking은 local placeholder 기반이고, analytics는 없거나 GA4 일부 수준이었다.

**주요 구현**
- `9a1a6a5`에서 GA4 initialization과 pageview tracking이 추가되었다.
- `d2998d4`에서 GA4 custom event taxonomy가 크게 확장되었다.
- `cd98b68`에서 PostHog foundation이 추가되었다.
- `6e78dc2`에서 PostHog product analytics event tracking이 실제 call site에 붙었다.
- `06a8745`에서 nickname onboarding과 real XP leaderboard RPC wrapper가 추가되었다. migration은 `profiles.nickname`, `get_xp_leaderboard_top`, `get_my_xp_rank`.
- `5afd7a2`에서 real per-game/overall ranking이 추가되었다. `overall-leaderboard.ts`, `game-leaderboard.ts`와 overall/game ranking RPC migration들이 생겼다.
- `2200921`에서 real ranking system이 마무리되며 reaction metrics 등 ranking metric 보정이 들어갔다.

**데이터 구조 변화**
- `profiles.nickname`이 추가되고, ranking RPC는 RLS를 넘는 cross-user read가 필요해 `SECURITY DEFINER`로 작성되었다.
- visible `ranking-screen.tsx`는 현재 `lib/ranking/xp-leaderboard.ts`, `overall-leaderboard.ts`, `game-leaderboard.ts` 및 friend ranking wrapper를 직접 호출한다.

**시행착오 / Follow-up**
- `20260826000000_phase3b5_followup_fix_ambiguous_column.sql`이 overall leaderboard RPC의 ambiguous column 문제를 고친다.
- local provider abstraction은 원래 server ranking 교체 seam으로 설계되었지만, 최종 구현은 screen에서 RPC wrapper를 직접 부르는 방식이 되었다. 따라서 provider는 visible ranking의 architecture가 아니라 achievement 계산의 보조 구조로 남아 있다.

**최종 결과**: ranking은 placeholder/local에서 Supabase RPC 기반의 real leaderboard로 바뀌었고, analytics는 GA4와 PostHog가 병렬로 동작하는 구조가 되었다.

**근거 commit**
- `9a1a6a5` feat: GA4 초기화 및 페이지뷰 추적 추가
- `d2998d4` feat: Add product analytics event tracking
- `cd98b68` feat: Add PostHog analytics foundation
- `6e78dc2` feat: add PostHog product analytics event tracking
- `06a8745` feat: add real XP leaderboard and nickname onboarding
- `5afd7a2` feat: add real per-game rankings and nickname reuse
- `2200921` feat: complete real ranking system

### Phase 8. Share/Dex/landing 실험 고도화

**기간**: 2026-08-09 ~ 2026-08-25

**시작 상태**: image share는 있었지만, 실제 share URL, OG preview, attribution, landing experiment, public slug는 아직 덜 갖춰져 있었다.

**주요 구현**
- `805ecda`: PC/모바일 PNG 저장 UX 개선. 모바일은 native share sheet를 우선한다.
- `b72b67b`: Character Reveal와 MyPage share card를 목적별로 분리했다. `share-card-common`, `statling-friend-card`가 추가되었다.
- `7f7ea5f`: `/share/[petId]/[[...stats]]` 구조와 `app/api/og/share/route.tsx`를 추가해 real per-pet share URL과 OG/Twitter Card metadata를 만들었다.
- `01c87ca`: link-first sharing과 share preview modal이 추가되며 공유 UX가 이미지 저장 중심에서 링크 중심으로 재정렬되었다.
- `031e249`: UTM attribution과 landing experiment foundation이 추가되었다.
- `57449d2`: production URL resolution hardening으로 `lib/env/site-url.ts`가 추가되었다.
- `85af0f8`, `968b87b`, `70237dc`, `4cb8b62`: curiosity-first landing variant와 mystery egg animation이 추가되고 hydration/toast overlap 문제가 보정되었다.
- `b3d9dbb`: public slug가 추가되어 share URL은 internal Korean id 대신 `cheese-cat` 같은 ASCII slug를 사용할 수 있게 되었다. 현재 코드는 slug-first, legacy id fallback으로 해석한다.

**데이터 구조 변화**
- slug는 DB column이 아니다. `lib/pets/pet-profile.ts`의 static catalog field로만 존재한다.
- Dex는 여전히 internal `petId`를 사용한다. share URL만 public slug를 사용한다.

**시행착오 / Follow-up**
- `57449d2`: 환경별 URL resolution 문제.
- `70237dc`: landing hydration mismatch와 nav-blocking toast overlap.
- `b3d9dbb`: legacy URL을 깨지 않기 위해 redirect가 아니라 fallback resolver를 사용.

**최종 결과**: share는 단순 이미지 저장에서 link/preview/OG/UTM/slug/legacy compatibility를 가진 acquisition surface로 발전했다.

**근거 commit**
- `7f7ea5f` feat: add real per-pet share URLs with Open Graph/Twitter Card metadata
- `01c87ca` feat: add link-first sharing and redesign Statling share card
- `031e249` feat: add UTM attribution and landing experiment foundation
- `57449d2` fix: harden production URL resolution
- `b3d9dbb` feat: add public slugs for Statling share URLs

### Phase 9. Friend system과 friend ranking

**기간**: 2026-08-24 ~ 2026-08-25

**시작 상태**: global ranking과 share는 있었지만, 사용자가 서로 연결되어 friend-only ranking을 볼 수 있는 social graph는 없었다.

**주요 구현**
- `6156d42`: friend connection backend foundation. `profiles.friend_code`, `friendships` table, `get_or_create_my_friend_code`, `create_friendship`, `remove_friendship`, `pending-friend-code.ts`, `friend-connection.ts`가 추가되었다.
- 같은 commit에서 `20260828010000_phase3g2_followup_gen_random_bytes_search_path.sql`이 추가되어 `gen_random_bytes` search_path/schema 문제를 follow-up으로 고쳤다.
- `0cc53bc`: friend ranking scope. `get_friend_overall_ranking`, `get_friend_xp_ranking`, `get_friend_game_ranking` RPC와 client wrapper 3개가 추가되었다.
- `9a581b4`: friend invites가 share와 ranking UI에 통합되었다. `friend-invite-cta.tsx`, `friend-invite-preview.ts`, `get_friend_invite_preview` migration이 추가되었다.
- `8ba0800`: friend analytics가 GA4/PostHog에 추가되었고 `create_friendship` return에 `is_new_connection`을 추가하려는 follow-up migration이 생겼다.
- `ba6aaf9`: Postgres가 existing function의 return type 변경을 `CREATE OR REPLACE`로 허용하지 않아, `DROP FUNCTION` + `CREATE FUNCTION` 방식으로 follow-up migration을 수정했다.

**데이터 구조 변화**
- `friend_code`는 raw user id가 아니라 128-bit opaque token이다.
- `friendships`는 directional row 두 개가 아니라 ordered UUID pair 한 row다.
- `friendships` RLS는 SELECT만 허용하고 mutation은 RPC로만 한다.
- `get_friend_invite_preview`는 schema에서 `anon`에게 execute가 열린 유일한 RPC다.

**시행착오 / Follow-up**
- `gen_random_bytes` schema/search_path 문제: `20260828010000` follow-up.
- `create_friendship` return type 변경 문제: `8ba0800`에서 migration이 추가되고 `ba6aaf9`에서 DROP+CREATE로 고쳤다.

**최종 결과**: Statling은 public share와 global ranking을 넘어, friend invite, friend graph, friend ranking, friend-specific analytics를 가진 social comparison 구조로 확장되었다.

**근거 commit**
- `6156d42` feat: add friend connection backend foundation
- `0cc53bc` feat: add friend ranking scope
- `9a581b4` feat: integrate friend invites with sharing and ranking
- `8ba0800` feat: add friend feature analytics
- `ba6aaf9` fix: use DROP+CREATE for create_friendship return-type change

### Phase 10. Birthday/Profile onboarding과 feature freeze 직전 상태

**기간**: 2026-08-25

**시작 상태**: onboarding에는 Statling reveal/name/room entry가 있었지만, Statling birthday를 별도 beat로 보여주거나 사용자 profile의 optional birth date/gender를 받는 흐름은 없었다.

**주요 구현**
- `4e54742`에서 `birthday-screen.tsx`, `lib/profile/birthday.ts`, `20260901000000_phase3i1_profile_birthday.sql`이 추가되었다.
- profile에는 `birth_date date`, `gender text`가 nullable로 추가되었다.
- 현재 code 주석상 이 field들은 migration/sync domain이 아니고 localStorage mirror가 없다. signed-out guest에게는 입력 UI도 보이지 않는다.
- Statling birthday는 별도 column이 아니라 pet confirmation timestamp인 `pets.confirmed_at`/client `confirmedAt`을 사용한다.

**최종 결과**: 최신 HEAD는 social/ranking/share까지 붙은 반복 사용 구조 위에, profile onboarding을 얹은 상태다.

**근거 commit**
- `4e54742` feat: add birthday and optional profile onboarding

---

## 4. 특정 영역별 추적

### A. Product Identity

초기 product는 문서상 "Brain Pet" 성격의 능력 테스트 앱에서 출발했다. `e7a370b` 이후 실제 UI는 `components/brain-bet/*` namespace를 쓰지만, `923bdbf chore: Statling 브랜드명 및 배포 설정 업데이트`에서 README와 배포 설정의 브랜드명이 Statling으로 정리되었다. 이후 commit message도 계속 Statling을 사용한다.

제품 관점의 변화는 다음 흐름이다.

1. 2026-07-24: 능력 테스트 UI.
2. 2026-07-27: 진단 결과가 pet profile/reveal/share로 연결.
3. 2026-08-02: Room, Dex, Deco, care로 반복 방문 구조 추가.
4. 2026-08-06 ~ 08-18: ranking, mission, achievement, XP로 progression loop 추가.
5. 2026-08-19 이후: Supabase account/sync/server ranking으로 서비스형 구조 전환.
6. 2026-08-24 이후: friend graph와 friend ranking으로 social layer 추가.

### B. Assessment

Assessment는 `dc1f5ba`부터 `b05a0fa`까지 6개 stat/game/scoring 구조로 만들어졌다. 초기에는 placeholder result가 있었으나 `b05a0fa`에서 `placeholder-result.ts`가 삭제되며 실제 game result 기반으로 정리된다. `e9d3b56`에서는 최초 진단 플로우가 단순화되고 MY STATUS가 제거되었다. `2051654`, `577c200`에서 각 최초 진단 game result screen에 1회 retry가 붙고 최신 점수 반영 정책이 들어갔다.

현재 구조는 최초 진단이 각 stat의 classic game을 사용하고, score/scoring 결과가 reveal 및 Statling 결정 구조로 이어지는 형태다. commit만으로 "왜 6개 stat인지"의 원래 의사결정 이유는 확인할 수 없다.

### C. Mini Games

게임은 두 번에 걸쳐 완성되었다.

- 1차: 2026-07-24의 6개 assessment game.
- 2차: 2026-08-01의 6개 Free Play 확장 game.

현재 `GAME_POOL`은 stat별 2개 game을 가진다. `difficulty.ts` 기준 난이도는 `easy`, `normal`, `hard`, `extreme`이다. `83ee7d2`에서 난이도 config와 unlock 구조가 생겼고, `1e1ca05`에서 ranking season과 difficulty/record 체계가 크게 개편되었다. `aff6a62`는 Free Play difficulty UX를 통일한다.

### D. Statling / Pet

`e5b764a`에서 pet catalog와 matching/storage가 추가되며 진단 결과가 캐릭터로 연결되었다. `ffafe88`와 이후 asset commit들은 캐릭터 상태별 frame, egg, room, deco, SFX/BGM asset을 크게 확장했다. `dde97de`에서 Dex와 Statling customization screen이 생겼고, `9377a5f` 이후 care action, mood, autonomous movement, memory, talk가 반복적으로 보강되었다.

현재 Pet domain은 `lib/pets/*`, `lib/pet-care/*`, `hooks/use-pet-*`, `components/brain-bet/screens/room-screen.tsx`, `statling-screen.tsx`, `dex-screen.tsx`로 나뉜다.

### E. Persistence

Persistence는 가장 큰 architecture 변화다.

1. 초기: localStorage 중심. pet, care, missions, XP, game records, room/deco가 local file별 storage로 저장된다.
2. 2026-08-06: localStorage 기반 auth abstraction이 생겨 Supabase 교체 여지를 만든다.
3. 2026-08-19: Supabase schema/RLS가 추가된다.
4. 2026-08-20: local snapshot builder/write helper/orchestrator가 생긴다.
5. 2026-08-20 follow-up: confirmed-but-unnamed pet은 migration을 defer한다.
6. 2026-08-21: server snapshot restore와 conflict screen이 붙는다.
7. 2026-08-21 ~ 08-22: continuous sync와 multi-device freshness resolution이 붙는다.

현재 구조는 guest-first localStorage와 account-backed Supabase sync가 함께 있는 hybrid다.

### F. Ranking

Ranking은 `157c5c7`의 local XP ranking에서 출발했다. `e2893c5`, `555d1c3`, `d955479`에서 overall/game/xp ranking UI와 raw metric ranking, Hard/Extreme 분리가 추가되었다. `06a8745`, `5afd7a2`, `2200921` 이후 visible ranking은 Supabase RPC 기반으로 바뀌었다. friend ranking은 `0cc53bc`에서 별도 wrapper/RPC로 추가된다.

Dead/legacy 성격의 구조: `ranking-provider.ts`의 `LocalRankingProvider`는 visible Ranking screen의 live path가 아니다. 다만 `lib/missions/ranking-achievements.ts`에서 achievement 계산에 사용되므로 완전히 죽은 코드는 아니다.

### G. Mission / Achievement / XP

`157c5c7`에서 XP ledger가 먼저 생기고, `1e28c74`에서 mission screen shell, `51ce3b8`에서 daily mission/category achievement가 추가되었다. `2577343`은 기존 game play 기록을 업적 판수에 반영한다. `4533d38`은 achievement system 자체를 개편했고, `02a71b6`은 room reward를 업적에 붙였다. `8b40e68`은 manual achievement rewards와 progress UX를 추가했다.

현재 XP는 pet-care intimacy EXP와 Free Play/ranking ledger가 구분된다. GA4 주석도 두 XP event path를 합치지 않는다고 명시한다.

### H. Analytics

GA4는 `9a1a6a5`에서 pageview 추적으로 시작하고 `d2998d4`에서 custom event taxonomy가 붙었다. PostHog는 `cd98b68`에서 foundation, `6e78dc2`에서 product event tracking이 붙었다. 현재 `lib/analytics/ga.ts`와 `lib/analytics/analytics.ts`는 의도적으로 분리되어 있으며, 같은 사용자 행동도 GA4 event와 PostHog product event를 별도 call로 보낸다.

Friend event는 `8ba0800`에서 두 analytics layer 모두에 추가되었다. `birth_date`/`gender`는 현재 analytics send path가 없다.

### I. Share / Dex

Share는 `197f3dc`의 image share에서 시작해, `dde97de`에서 share page와 Dex가 추가되었다. `7f7ea5f`에서 real per-pet share URL과 OG/Twitter card가 들어왔고, `01c87ca`에서 link-first UX로 바뀌었다. `031e249`에서 UTM attribution이 추가되고 `b3d9dbb`에서 public slug가 붙었다.

Dex는 internal `petId`를 사용한다. public slug는 share URL용 representation이다.

### J. Friend System

Friend system은 2026-08-24부터 2026-08-25까지 매우 짧은 기간에 backend, ranking, invite, analytics, follow-up migration 순서로 확장되었다.

- Backend foundation: `6156d42`
- `gen_random_bytes` search_path/schema follow-up: `6156d42`에 함께 추가된 `20260828010000`
- Friend ranking: `0cc53bc`
- Invite preview + UI integration: `9a581b4`
- Analytics + `is_new_connection`: `8ba0800`
- RPC return type migration 방식 수정: `ba6aaf9`

현재 friend graph는 canonical ordered pair row이며, client는 friend_code를 통해 RPC를 호출한다. raw user id는 invite/share analytics에 실리지 않는다.

### K. Profile / Birthday

`4e54742`에서 Birthday/Profile onboarding이 추가되었다. Statling birthday는 기존 pet confirmation timestamp를 재사용하고, user profile data는 nullable `profiles.birth_date`/`profiles.gender`로 들어간다. guest에게는 입력을 받지 않고, local mirror도 없다.

---

## 5. Bug / Regression / Production QA History

| 이슈 | 발견/맥락 | 원인/구조 | 수정 | 근거 |
|---|---|---|---|---|
| MY STATUS에서 만나러가기 클릭 시 stat 초기화 | 초기 share/result flow 이후 | flow transition에서 stat state가 리셋됨 | game-flow 1줄 수정 | `a8fed67` |
| 펫 확정 후 새로고침 시 Landing 복귀, Room 좌표 불일치, touch tap 실패 | Room/pet persistence QA | confirmed pet/room coordinate/touch handling 불일치 | pet storage와 room screen/handle 수정 | `0f3399f` |
| 모바일 SFX 다중 재생, BGM 기본값 OFF 미적용 | 모바일 audio QA | audio manager/player와 setting migration 문제 | audio manager/player/storage 수정 | `c3bd6b0`, `83f54e6` |
| 카카오톡 인앱 브라우저 가로 스크롤/잘림 | 모바일/in-app browser QA | viewport/layout overflow | global CSS/layout 보정 | `e5d9beb` |
| Ranking/achievement 도입 이전 play 기록 미반영 | Mission 도입 후 data compatibility | 새 업적이 과거 local record를 집계하지 않음 | mission tracker에서 기존 기록 포함 | `2577343` |
| Reaction 마지막 tap handler에서 다음 화면 mount | gameplay event timing QA | onComplete가 tap handler 내부에서 즉시 다음 화면 mount | final onComplete defer | `69411d1` |
| Hard/Extreme unlock hint가 normalizedScore 중심 | user-facing copy 문제 | 내부 점수 개념이 사용자에게 노출 | raw record/natural language로 변경 | `f60ff0d` |
| 모바일 최초 진단 game UI가 스크롤 필요 | mobile layout regression | mobile spacing 과다 | mobile-only spacing 축소 | `b777f6f` |
| Pet Care 모바일 반응 지연 | mobile asset/performance QA | visual asset load와 후속 bookkeeping이 즉시 반응을 막음 | character art preload, non-visual work defer | `ffa2c23` |
| Fit puzzle tray layout tie-break 오류 | puzzle layout QA | min scale floor에서 더 넓은 trayCols 선택 | tie-break 수정 | `dee435c` |
| Supabase signup email validation 불일치 | Auth 활성화 직후 | client validation이 Supabase rule과 어긋남 | auth form validation 보완 | `0834770` |
| Migration이 이름 없는 pet을 먼저 업로드할 위험 | local -> server migration edge case | SaveScreen signup 후 NamingScreen 전 `migrated_at`이 먼저 찍힐 수 있음 | confirmed-but-unnamed pet migration defer + naming 후 retry | `c006be4` |
| Missing migration snapshot exports | migration/sync integration QA | snapshot exports 누락 | build-local-snapshot export 보완 | `901031f` |
| Overall leaderboard ambiguous column | ranking RPC follow-up | SQL column ambiguity | follow-up migration으로 RPC body 수정 | `20260826000000_phase3b5_followup_fix_ambiguous_column.sql`, `5afd7a2` |
| Landing hydration mismatch, toast overlap | landing experiment QA | client/server render mismatch와 toast/nav overlap | experiment/toast provider 수정 | `70237dc` |
| Production URL resolution | share/OG/UTM production QA | env/origin fallback이 production에서 취약 | `lib/env/site-url.ts` 도입 | `57449d2` |
| Friend code generation schema/search_path | friend backend migration QA | `gen_random_bytes` resolution/search_path hardening | follow-up migration | `20260828010000_phase3g2_followup_gen_random_bytes_search_path.sql` |
| `create_friendship` return type 변경 실패 | migration apply 문제 | Postgres `CREATE OR REPLACE FUNCTION`은 OUT parameter return shape 변경 불가 | `DROP FUNCTION` + `CREATE FUNCTION`, grant 재발급 | `8ba0800`, `ba6aaf9` |

발견 경위가 commit message/diff에 명확하지 않은 경우에는 "Production에서 발견"처럼 쓰지 않았다. 위 표의 "맥락"은 commit message와 변경 파일로 확인 가능한 범위다.

---

## 6. Database Evolution Timeline

| Migration | 주요 변경 | 제품 기능 |
|---|---|---|
| `20260819000000_phase1_schema_and_rls.sql` | Supabase base schema. profiles, pets, skill records, XP, missions, care, room, deco, memory, notes, dex. 모든 주요 table RLS. | account persistence, future sync 기반 |
| `20260820000000_phase2b_replace_rpcs.sql` | `replace_room_items`, `replace_deco_placement_items`, `replace_user_notes` RPC. `SECURITY INVOKER`. | local snapshot migration의 atomic replace |
| `20260822000000_phase2d6_followup_sync_updated_at.sql` | `profiles.sync_updated_at` 추가. | multi-device freshness comparison |
| `20260823000000_phase3b2_profile_nickname.sql` | `profiles.nickname` 추가. | real ranking display name |
| `20260824000000_phase3b3_xp_leaderboard_rpcs.sql` | `get_xp_leaderboard_top`, `get_my_xp_rank`. | server XP leaderboard |
| `20260825000000_phase3b5_overall_leaderboard_rpcs.sql` | `get_overall_leaderboard_top`, `get_my_overall_rank`. | server overall leaderboard |
| `20260826000000_phase3b5_followup_fix_ambiguous_column.sql` | overall leaderboard RPC ambiguous column fix. | ranking SQL follow-up |
| `20260827000000_phase3b7_game_leaderboard_rpcs.sql` | `get_game_leaderboard_top`, `get_my_game_rank`. | server per-game leaderboard |
| `20260828000000_phase3g2_friend_connection.sql` | `profiles.friend_code`, `friendships`, friend code/create/remove RPC. | friend connection backend |
| `20260828010000_phase3g2_followup_gen_random_bytes_search_path.sql` | friend code generation function hardening/fix. | friend code migration follow-up |
| `20260829000000_phase3g3_friend_ranking_rpcs.sql` | friend overall/xp/game ranking RPCs. | friend ranking |
| `20260830000000_phase3g4_friend_invite_preview.sql` | `get_friend_invite_preview`, anon/auth execute grant. | logged-out invite preview |
| `20260831000000_phase3g5_followup_create_friendship_is_new.sql` | `create_friendship` return에 `is_new_connection` 추가. | friend analytics idempotency 구분 |
| `20260901000000_phase3i1_profile_birthday.sql` | `profiles.birth_date`, `profiles.gender` nullable fields/check constraints. | optional profile onboarding |

전체 DB evolution은 client-only에서 account persistence로, 다시 server-side ranking과 friend graph로 확장된 흐름이다. 마지막에는 optional profile field가 붙었다. DB가 처음부터 모든 기능을 지배한 것이 아니라, localStorage로 제품 루프를 먼저 만든 뒤 account/sync/social 기능이 필요해지는 시점에 Supabase schema가 들어온 순서다.

---

## 7. Architecture Evolution

### 초기: client-heavy / localStorage

초기 앱은 Next.js frontend 안에서 game flow, scoring, pet selection, storage를 처리했다. 서버 component는 사실상 없었고, share image generation/OG 정도가 나중에 붙었다.

### 중기: localStorage-first product loop

Room, care, Deco, Free Play, XP, mission, achievement가 모두 localStorage 기반으로 먼저 완성되었다. 이는 account 없이도 즉시 시작하는 UX와 맞지만, cross-device와 real ranking은 풀 수 없었다.

### 전환기: Supabase Auth + RLS persistence

`8147cf9` 이후 Supabase가 identity, storage, RLS, RPC layer가 되었다. 그러나 localStorage를 폐기하지 않고, migration/restore/sync로 연결했다. 이 선택 때문에 guest-first UX와 account persistence가 동시에 유지된다.

### 후기: server RPC ranking + social layer

Ranking과 friend system은 RLS만으로 해결하기 어려운 cross-user read/write를 RPC로 처리한다. 대부분의 migration replace RPC는 `SECURITY INVOKER`지만, ranking/friend cross-user 기능은 `SECURITY DEFINER` 예외가 되었다.

### 현재: hybrid client/server architecture

현재 HEAD는 다음 층으로 구성된다.

- Client: game execution, local-first state, Room/care/Deco UI.
- Supabase: Auth, Postgres persistence, RLS, server ranking/friend RPC.
- Sync layer: one-time migration, restore, continuous sync, freshness resolution.
- Analytics: GA4 acquisition/traffic, PostHog product/funnel/retention.
- Social/share: public share URL, OG image, UTM, friend invite, friend ranking.

---

## 8. 제품 관점의 변화

초기 제품은 "능력 테스트를 하고 결과를 보는 앱"에 가까웠다. 7/24의 흐름은 stat, radar chart, result screen이 중심이다.

7/27 이후에는 "내 능력 조합에서 나온 Statling을 발견한다"가 제품의 중심이 되었다. pet profile, reveal, naming, compatibility, share가 붙으면서 결과가 캐릭터로 바뀌었다.

8/2 이후에는 "Statling을 계속 키우고 꾸미는 앱"이 되었다. Room, care, talk, memory, Deco, Dex가 반복 방문 이유를 만든다.

8/6~8/18에는 "반복 플레이 progression"이 붙었다. XP, ranking, mission, achievement, reward가 Free Play와 연결되었다.

8/19 이후에는 "계정 기반 서비스"가 되었다. localStorage는 사라지지 않고 guest-first layer로 남았으며, Supabase는 migration/restore/sync와 real ranking을 맡았다.

8/24 이후에는 "친구와 비교하고 초대하는 social layer"가 붙었다. friend invite와 friend ranking은 share/leaderboard를 단순 홍보 기능에서 관계 기반 재방문 기능으로 바꾸었다.

---

## 9. Current State at HEAD

### 완료된 주요 시스템

- 6 stat 기반 initial assessment.
- 12개 mini-game pool과 Easy/Normal/Hard/Extreme difficulty.
- Statling catalog, reveal, naming, Room, care, mood, autonomous movement, talk, memory.
- Room/Statling decoration and reward.
- Dex.
- Free Play, XP, missions, achievements.
- GA4 and PostHog analytics.
- Supabase Auth, RLS schema, local-to-server migration, restore, continuous sync, multi-device freshness.
- Real global XP/overall/game ranking.
- Friend code, friendship graph, friend invite, friend ranking.
- Public share URLs, OG/Twitter Card, UTM, slug + legacy URL fallback.
- Birthday/Profile onboarding with optional profile fields.

### 최근 추가된 시스템

- Friend system and friend ranking: `6156d42` ~ `ba6aaf9`.
- Public share slug: `b3d9dbb`.
- Birthday/Profile onboarding: `4e54742`.

### 현재 알려진 미해결/주의 지점

- `ranking-provider.ts`의 문서화된 의도와 visible Ranking screen의 실제 구현이 다르다. provider는 visible screen이 아니라 achievement path에 남아 있다.
- `birth_date`/`gender`는 guest local mirror가 없다. guest가 입력할 수 없는 구조라 의도된 trade-off지만, guest personalization이 필요해지면 재설계가 필요하다.
- `friend_code`는 capability token 성격이다. rotation/revocation 기능은 현재 migration/code에 없다.
- public slug는 static catalog field다. 이미 공유된 slug 변경을 막는 DB-level mechanism은 없다.

### Feature Freeze 상태

Git message에 명시적인 "feature freeze" commit은 확인되지 않았다. 다만 2026-08-18 전후에 `pre-Supabase QA`, 2026-08-24~25에 friend/profile follow-up과 slug/birthday가 이어진다. 따라서 Git만으로는 "공식 feature freeze 선언"은 확인할 수 없고, HEAD는 feature freeze 직전 또는 최신 기능 반영 직후의 상태로만 말할 수 있다.

---

## 10. Portfolio Highlights

### 1. Local -> Server 데이터 마이그레이션

문제: guest-first localStorage 데이터를 로그인 이후 account에 보존해야 했다.

선택: snapshot builder + write helper + migration orchestrator + `profiles.migrated_at` gate. `migrated_at`은 모든 table write 성공 후 마지막에 쓴다.

구현: `eab911f`, `bca7e42`, `8d14fcf`, `e6a2e88`, `3c91a90`, `c006be4`.

결과: local-first UX를 유지하면서 server persistence를 붙였다.

보여주는 역량: 기존 사용자 데이터 보존, migration idempotency, edge-case handling.

### 2. Multi-device restore/sync

문제: 로그인한 사용자가 다른 device에서 들어오면 local과 server 중 무엇을 믿을지 정해야 했다.

선택: server snapshot restore, conflict screen, continuous sync, `sync_updated_at` freshness marker.

구현: `5b1bfe4`, `128de6e`, `e47de4b`, `a7a6ab1`, `386583a`, `933cd53`.

결과: localStorage 앱이 account-backed sync 앱으로 확장되었다.

보여주는 역량: offline/local state와 server state의 reconciliation 설계.

### 3. Server-side ranking RPC

문제: local placeholder ranking으로는 real cross-user leaderboard를 만들 수 없었다.

선택: Supabase RPC에서 XP/overall/game ranking을 계산하고 client는 wrapper를 통해 표시한다.

구현: `06a8745`, `5afd7a2`, `2200921`.

결과: visible Ranking screen은 real Supabase data 기반이 되었다.

보여주는 역량: RLS 환경에서 cross-user read를 제한된 RPC로 모델링.

### 4. Friend graph design

문제: 친구 관계는 symmetric하지만 직접 table write를 열면 integrity/security risk가 크다.

선택: ordered UUID pair 한 row, SELECT-only RLS, mutation은 `SECURITY DEFINER` RPC로 제한.

구현: `6156d42`, `0cc53bc`, `9a581b4`.

결과: friend invite, friend ranking, friend analytics가 가능한 social layer가 생겼다.

보여주는 역량: social graph schema와 RLS/RPC boundary 설계.

### 5. Public share URL slug와 legacy compatibility

문제: Korean internal id를 public URL에 그대로 쓰면 readability가 낮지만, 기존 link를 깨면 안 된다.

선택: static catalog slug를 추가하고 slug-first/id-fallback resolver를 사용한다. redirect는 하지 않는다.

구현: `b3d9dbb`.

결과: 새 link는 읽기 쉬워지고, 기존 share URL은 계속 동작한다.

보여주는 역량: public representation과 internal identity 분리, backward compatibility.

### 6. Analytics split: GA4 + PostHog

문제: acquisition/traffic 분석과 product behavior/funnel 분석은 질문의 성격이 다르다.

선택: GA4 `trackEvent`와 PostHog `trackProductEvent`를 병렬로 유지하고 taxonomy를 분리한다.

구현: `9a1a6a5`, `d2998d4`, `cd98b68`, `6e78dc2`, `8ba0800`.

결과: traffic attribution, funnel, product events가 각각의 도구에 맞게 들어간다.

보여주는 역량: analytics taxonomy, privacy-conscious event design.

### 7. Mini-game difficulty/ranking season

문제: 게임 룰과 난이도가 바뀌면 과거 기록과 현재 leaderboard가 비교 가능하지 않을 수 있다.

선택: difficulty tier와 ranking season/record version을 도입한다.

구현: `83ee7d2`, `1e1ca05`, `f11243d`, `aff6a62`.

결과: Easy practice, Normal baseline, Hard/Extreme ranking tier를 구분한다.

보여주는 역량: game metric comparability와 progression 설계.

### 8. Optional profile data with no analytics path

문제: birth date/gender는 민감하고 guest에게는 저장할 account row가 없다.

선택: Supabase profile nullable field로만 저장하고, local mirror와 analytics send path를 만들지 않는다.

구현: `4e54742`.

결과: profile onboarding은 account user에게만 저장되고, guest flow를 막지 않는다.

보여주는 역량: privacy-by-construction, optional data modeling.

---

## 11. Git만으로 확인 불가한 내용

- Supabase를 선택한 최초 이유. Git은 Supabase가 도입된 시점과 구조는 보여주지만, Firebase/custom backend와 비교한 의사결정 근거는 보여주지 않는다.
- GA4와 PostHog를 함께 쓰기로 한 business-level 이유. 코드 주석은 역할 분리를 설명하지만, 예산/조직/운영 이유는 Git에 없다.
- "Feature Freeze"의 공식 선언 여부. 관련 QA/follow-up commit은 있으나 freeze 선언 commit은 없다.
- 각 캐릭터 asset의 디자인 의도와 선정 과정. Git은 asset 추가/수정 시점은 보여주지만, 왜 해당 캐릭터/표정을 선택했는지는 보여주지 않는다.
- Production에서 실제 사용자 리포트로 발견되었는지 여부. commit message에 production이 명시된 일부 URL/QA성 commit 외에는 발견 경위를 만들지 않았다.

---

## 12. 최종 보고용 요약

1. 조사한 전체 Git 기간: 2026-07-23 ~ 2026-08-25.
2. 조사한 commit 총 개수: 184개.
3. 실제 diff/stat까지 확인한 주요 commit 수: 36개.
4. 최종 Development Phase 개수: 10개.
5. Phase 이름: 기획/초기 앱 골격, 진단 게임, 캐릭터/공유 초안, Room/Pet Care/Free Play, local ranking/mission/XP, Supabase migration/sync, analytics/server ranking, share/Dex/landing, friend system, birthday/profile onboarding.
6. 생성 문서 경로: `docs/DEVELOPMENT_HISTORY.md`.
7. Database migration timeline 개수: 14개.
8. 주요 시행착오/Follow-up: migration defer, sync export 누락, ranking SQL ambiguous column, production URL hardening, landing hydration mismatch, friend code generation hardening, `create_friendship` DROP+CREATE.
9. Portfolio Highlight: 8개 선정.
10. Git만으로 확인 불가한 내용: Supabase 최초 선택 이유, analytics tool 병행의 business-level 이유, 공식 feature freeze 선언, asset 선정 의도, 일부 bug의 발견 경위.
11. 기존 문서와 실제 Git 기록의 차이/주의점: `ranking-provider.ts`는 원래 visible ranking swap seam처럼 문서화되어 있지만 현재 visible ranking은 RPC wrapper를 직접 호출한다. 또한 `birth_date`/`gender`는 일반 local-first domain이 아니라 Supabase-only field다.
12. 최종 `git status`는 작성 직후 별도 확인 대상이다.
