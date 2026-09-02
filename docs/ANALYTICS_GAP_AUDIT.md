# Statling Analytics Gap Audit

> **기준**: 최초 감사는 2026-08-31 기준 저장소 코드(`Brain_Pet`, git `main`, HEAD `3e50494` 시점 기준 조사). 이후 Phase 3J-3(HEAD `d6c9436`)과 Production QA/후속 수정(cross-account 오염, GA4 초기화 race, PostHog anonymous↔identified merge — HEAD `ba0ca45`~`fbcb84e`)이 반영되어, 이 문서는 현재 HEAD `4756253` 기준으로 갱신되었다. `docs/ANALYTICS_MEASUREMENT_PLAN.md` 등 기존 문서의 이벤트 개수/결론은 참고만 하고 신뢰하지 않았으며, `lib/analytics/*`, `components/brain-bet/**`, `supabase/migrations/**`, `lib/migration/**`, `lib/sync/**`, repo 전체의 `localStorage`/`sessionStorage` 사용처를 코드 기준으로 다시 확인했다.
> **목적**: 이벤트 개수 세기가 아니라, "기능은 있는데 운영자가 측정할 수 없는 것", "지금 데이터로 추정 불가능한 사용자 행동", "잘못 해석될 위험이 있는 데이터", "추가하면 가치가 큰 데이터", "저장/동기화/계정 ownership 때문에 유실·오염될 수 있는 데이터"를 찾는 것. 코드/migration은 수정하지 않았다.
> **표기 규칙**: 가능(현재 데이터로 계산 가능) / 부분가능(근사치·간접 추정만 가능, 신뢰도 낮음) / 불가능(현재 데이터로 계산할 방법이 없음).

---

## 1. Executive Summary

Statling은 GA4 + PostHog + Supabase 3계층으로 측정 체계를 구축했고, 핵심 제품 루프(Assessment → Statling 생성 → Free Play → Ranking → Friend/Share)는 이벤트/DB 양쪽에서 상당히 촘촘하게 계측되어 있다. 그러나 전수 감사 결과, 다음 5가지 유형의 구조적 공백이 확인되었다.

1. **핵심 전환 지표 자체가 왜곡될 수 있는 계측 누락** — Google OAuth 로그인/회원가입이 `sign_up`/`login` 이벤트에서 완전히 빠져 있어, 회원가입 전환율이 실제보다 낮게 보인다. 이건 "측정이 없다"가 아니라 "있는데 틀리게 해석될 수 있다"는 점에서 가장 위험한 유형이다. **[RESOLVED — Phase 3J-3]** `supabase-auth-provider.tsx`에 `trackGoogleAuthIfApplicable` 추가. 상세는 §14 P0.
2. **Supabase 테이블이 히스토리처럼 보이지만 실제로는 스냅샷** — `xp_totals`, `pet_care_state`, `activity_counters`, `attendance`, `pets.latest_finals` 등은 "현재값"만 있고 "언제 얼마나 변했는지"는 재구성할 수 없다. 특히 `attendance`는 최초 로그인 마이그레이션 이후 아예 갱신이 끊겨(continuous sync 대상 아님), 재방문/출석 리텐션을 이 테이블로 계산하면 잘못된 결과가 나온다. **[attendance만 RESOLVED — Phase 3J-3]** `attendance`를 `SyncDomain`에 추가해 continuous sync 대상으로 편입(실제 Supabase에 반영되어 재방문 시 `total_days`/`current_streak`가 갱신됨을 실측 확인). 다른 스냅샷 테이블(`xp_totals`/`pet_care_state`/`activity_counters`/`pets.latest_finals`)은 이번 Phase 범위 밖 — 여전히 스냅샷.
3. **중도 이탈(abandonment)이 어디에서도 기록되지 않음** — Assessment 온보딩 중단, Free Play 게임 중도 포기, 화면 이탈 어느 것도 명시적 이벤트가 없다. `start`와 `complete`의 차이로 "추정"은 가능하지만, 재시도/중복 시작과 뒤섞여 신뢰도가 낮다. **[Free Play만 PARTIALLY RESOLVED — Phase 3J-3]** `game_abandoned`(PostHog) 추가 — 명시적 뒤로가기 버튼 클릭 시에만 발화, 신뢰도 높음. Assessment는 애초에 뒤로가기 UI 자체가 없어(각 미니게임이 `mode==='first'`일 때 `FreePlayBadge`를 렌더링하지 않음) 신뢰성 있는 explicit exit 신호가 없다고 판단, 의도적으로 미구현 — start-complete 기반 inferred abandonment 유지 권장(상세는 §14 P1, 완료 보고 §9).
4. **비회원(guest) 피드백이 운영자에게 영구히 보이지 않을 수 있음** — 로그인하지 않은 사용자의 피드백(만족도 + 자유 텍스트)은 로컬에만 저장되고, 그 기기로 회원가입하지 않으면 Supabase에도 GA4/PostHog에도 전달되지 않는다. **[RESOLVED — Phase 3J-1, 이번 Phase 3J-3 이전에 이미 해결]** `feedback` 테이블(`20260901010000_phase3j1_feedback_table.sql`) + `lib/feedback/feedback-storage.ts` 서버 저장 로직 추가. 이번 Phase 3J-3에서는 변경하지 않았고, 이미 해결된 상태를 재확인만 함.
5. **획득 채널(Threads/Instagram/네이버블로그/티스토리) 구분이 운영자의 수작업에 의존** — 앱 내부 공유 버튼은 고정 UTM이 자동으로 붙지만, 운영자가 직접 홍보 글을 올릴 때 쓸 `buildCampaignUrl()`은 어떤 UI에도 연결되어 있지 않아 "잊으면 그냥 안 붙는다." **[PARTIALLY RESOLVED — Phase 3J-3]** 코드/UI 변경 없음(요청에 따라 의도적으로 UI 미구현) — 채널별 권장 UTM 규칙만 문서화(완료 보고 §12).

이 외에도 20여 개의 세부 공백을 §14에 P0~P3로 분류했다. 다행히 **PII 노출은 발견되지 않았다** — GA4/PostHog payload에는 이메일/실명/생일/성별/friend_code/원본 UUID가 들어가지 않도록 명시적으로 설계되어 있음을 코드 레벨에서 확인했다(§12). **Phase 3J-3에서 추가된 모든 이벤트도 동일 기준으로 재검사 완료 — PII 없음.**

**부수적 발견**: 이번 조사에서 Supabase 테이블 수가 기존 문서들이 말하는 "20개"가 아니라 **21개**(Phase 1의 19개 + `friendships` + `feedback`)임을 확인했다. `feedback` 테이블(`20260901010000_phase3j1_feedback_table.sql`)이 가장 최근에 추가되어 기존 문서에 반영되지 않은 것으로 보인다.

> **Phase 3J-3 후속 작업 (2026-08-31)**: 이 감사에서 식별된 P0/P1 항목 중 사용자 테스트 전 필수로 판단된 6개(§14 P0 2개, P1 4개)를 실제 코드/DB 기준으로 재검증 후 수정했다. 각 항목의 RESOLVED/PARTIALLY RESOLVED 표시와 실제 구현 내용은 §14의 해당 행, 그리고 이 작업의 별도 완료 보고를 참고. 감사 당시 기록은 전부 그대로 보존했다.

> **Production Analytics Final QA 및 후속 수정 (2026-09-01~09-02)**: Phase 3J-3가 실제 Production에 배포되기 전 상태에서 전체 사용자 여정을 실제 브라우저로 재현하는 Final QA를 수행했고, 그 과정에서 이 감사에는 없던 **새로운 P0/P1 항목 3개**를 코드 레벨로 직접 발견해 수정했다. 이 문서의 최초 감사 범위(2026-08-31)가 놓친 항목이므로 §1/§14에 새로 추가한다.
>
> 1. **[P0, RESOLVED]** 동일 브라우저에서 계정 A → 로그아웃 → 계정 B 가입 시, A가 남긴 로컬 게임 상태(XP/Lv/업적/미션/Room 등 18개 도메인 중 pets/feedback을 제외한 전부)가 아무 소유권 검증 없이 B의 화면에 노출되고 continuous sync를 통해 B의 실제 Supabase row에까지 기록될 수 있었던 cross-account 오염. `lib/pets/reset-foreign-account-state.ts` 신설 + owner-mismatch 시 전체 도메인 초기화로 수정, guest→최초가입 경로는 그대로 보존됨을 실측 확인. 상세는 §8, ADR-019.
> 2. **[P0, RESOLVED]** `<GoogleAnalytics/>`의 `afterInteractive` 스크립트가 아직 로드되지 않은 시점(post-OAuth 리다이렉트 직후 등)에 `trackEvent()`가 호출되면 `window.gtag`가 아직 함수가 아니라서 이벤트가 조용히 드롭됨 — `profile_setup_view`/`profile_setup_complete`/`home_enter` 등 핵심 퍼널 이벤트 일부 유실. Google 공식 `dataLayer.push(arguments)` shim을 `trackEvent()` 내부에 추가해 gtag.js 로드 전에도 이벤트가 큐잉되도록 수정. 상세는 §10.
> 3. **[P1, RESOLVED]** `person_profiles:'identified_only'` 설정 때문에 로그인 전 익명 방문자의 이벤트(`assessment_started`/`game_started`/`game_completed` 등)는 애초에 PostHog Person이 생성되지 않은 채(`$process_person_profile:false`) 수집되어, 이후 `identify()`가 호출돼도 가입 이전 행동이 가입 후 Person과 영구히 분리되는 문제. Assessment 시작 시점에 `posthog.createPersonProfile()`을 호출하도록 수정(`lib/analytics/posthog.ts`의 `ensurePersonProfileCreated`). 상세는 §11, ADR-020.
>
> 이 세 항목은 완전히 새로 발견된 것이므로 최초 감사 표에는 존재하지 않았다 — 아래 §14 표에 새 행으로 추가했다.

---

## 2. Current Data Architecture

| 계층 | 역할 | 특성 |
|---|---|---|
| **Supabase (Postgres)** | 계정/게임/성장/소셜 상태의 source of truth (로그인 사용자) | 21개 테이블, 전 테이블 RLS. 대부분 "현재 상태 upsert" 구조이며 히스토리 보존 테이블은 소수(`room_inventory`, `deco_inventory`, `dex_entries`, `user_notes`, `friendships.created_at`)뿐 |
| **localStorage** | Guest-first 로컬 상태, 로그인 후에도 병행 사용 | 약 29개 파일에서 30개 내외의 key 사용. 일부는 Supabase와 지속 동기화, 일부는 최초 1회만 이관, 일부는 영구히 로컬 전용 |
| **GA4** | Acquisition/전환 중심 custom event (`lib/analytics/ga.ts`) | 표준 `gtag.js` — GA4 자체 UTM/referrer 자동 파싱 활성. 이벤트는 "landing_view"류를 GA4 자동 page_view에 위임하고 나머지는 custom |
| **PostHog** | 제품 행동/퍼널 중심 custom event (`lib/analytics/analytics.ts`) | `capture_pageview:false`, 수동 `$pageview`만 route 변경 시 발화. `person_profiles:'identified_only'`, session recording `maskAllInputs:true` |

GA4와 PostHog는 **의도적으로 이름/파라미터가 다른 두 개의 독립된 taxonomy**다. 같은 행동이 GA4에서는 `mini_game_start`, PostHog에서는 `game_started`처럼 이름과 파라미터 shape가 다르게 설계되어 있어, 두 시스템의 데이터를 조인하려면 코드 레벨의 매핑표가 필요하다(본 문서 §9, §10 참고).

---

## 3. Full User Journey Measurement Map

실제 코드 기준 phase 흐름(`components/brain-bet/game-flow.tsx`의 18개 `Phase` 값)을 따라 정리했다. "이탈 추정"은 view/CTA 이벤트가 없어도 start→complete 비율로 근사할 수 있는지를 뜻한다.

| 단계 | 화면 진입 추적 | CTA 클릭 추적 | 완료 추적 | 실패 추적 | 이탈 추정 | 비고 |
|---|---|---|---|---|---|---|
| Landing | 부분 — `landing_experiment_viewed`(PostHog)는 **신규 방문자에만** 발화, 재방문/재개 방문자는 view 이벤트 자체가 없음 | 가능 — 시작 버튼이 `assessment_start`/`assessment_started`를 발화 | N/A | N/A | 부분가능 — GA4 자동 `page_view` 총량과 시작 이벤트 수를 비교하는 정도 | 재방문자의 Landing 노출은 사실상 블라인드 |
| Assessment(6게임) | 게임별 진입은 `mini_game_start`/`game_started`로 간접 추적 | 게임 내 CTA는 게임별 완료/재시도로만 확인 | 가능 — `mini_game_complete`/`game_completed` | 불가능 — 게임 자체 실패 개념 없음(완료 시 항상 점수 산출) | **불가능** — 6게임 도중 이탈(어느 스탯에서 그만뒀는지)은 `introProgress`가 Supabase/analytics 어디에도 전달되지 않아 재구성 불가 | §4, §9 참고 |
| Reveal | 가능 — `statling_reveal`/`statling_revealed` | 불가능 — "이 Statling과 함께하기" 확정 클릭 자체는 미추적 | 간접(다음 단계 진입으로 추정) | N/A | 부분가능 | |
| Auth(Save) | 불가능 — Save 화면 노출 이벤트 없음 | 부분 — "나중에 하기"만 `auth_choice_made{skip}`로 추적, "계속하기"(가입 유도) 클릭은 미추적 | 부분 — 이메일/비밀번호 가입만 `sign_up`/`login` 추적, **Google OAuth는 미추적** | 미추적 | **불가능(핵심 문제)** — Save 화면 도달 대비 가입/스킵 분모 자체가 없음 | §1, §14 P0 참고 |
| Naming | 불가능 | 가능 — `naming_completed`(이름 길이만) | 가능 | 미추적(비속어 필터 실패 등) | 부분가능 | |
| Profile Setup(생일/선택 프로필) | **불가능** — birthday-screen.tsx에 추적 코드 전무 | 불가능 | 불가능 | 불가능 | **불가능** | 로그인 사용자에게만 노출되는 화면인데 완전히 블라인드 |
| Home(Room 최초/재진입) | 가능 — `home_enter`/`home_entered{first_time|returning}` | N/A | N/A | N/A | 가능 | 가장 잘 계측된 지점 중 하나 |
| Care(돌봄) | N/A | 가능 — `pet_action`(GA4, 모든 유효 클릭), `care_action_completed`(PostHog, 애니메이션 완료 시에만) | 가능 | N/A | 가능 | 대화(talk) 답변 자체는 미추적(의도적 설계) |
| Free Play 선택(Grow/Grow-game) | **불가능** — grow-screen.tsx, grow-game-screen.tsx 모두 추적 코드 없음 | 불가능(뒤로가기 등) | 게임 확정 시점에 `free_play_start`로 간접 확인 | N/A | 불가능 | 스탯 선택→게임 선택 단계의 이탈은 완전히 블라인드 |
| Free Play 진행/재시도 | 간접 | N/A | 가능 — `free_play_complete`/`game_completed{completion_result}` | 미추적(중도 이탈) | **불가능** — 중도 포기(quit)는 아무 것도 기록되지 않음(`exitFreePlayGame`이 의도적으로 no-op) | §4 참고 |
| Ranking | 가능 — 탭/스코프 전환마다 `ranking_view`/`friend_ranking_viewed` | 가능(탭 전환 자체가 곧 이벤트) | N/A | N/A | N/A | 가장 잘 계측 |
| Mission(일일미션/업적) | 가능 — 탭 단위 `daily_mission_view`/`achievement_view` | 개별 항목 클릭(상세보기)은 미추적, claim만 추적 | 가능 — claim 이벤트 | N/A | 부분가능 | 항목별 상세는 UI 자체가 없어 N/A에 가까움 |
| Collection(Dex) | 가능 — `collection_view`, `collection_statling_view` | 가능 | N/A | N/A | 가능 | GA4 전용, PostHog 대응 이벤트 없음 |
| Customization/Room 꾸미기 | 가능 — `customization_open` | 가능 — apply/remove | 가능 — `customization_save`/`room_saved`/`decoration_saved` | N/A | 가능 | 전 구간 계측 완료 |
| Friend/Share | 수신자 open은 가능(`friend_invite_opened`), **발신자의 "초대 생성" 자체는 별도 이벤트 없음**(일반 공유 이벤트에 얹혀감) | 가능 — connect 시 `friend_connected` | 가능 | 미추적(연결 실패 사유) | 부분가능 | §6, §14 참고 |
| Feedback | 가능 — `feedback_open` | 가능 — `feedback_submit`/`feedback_fail` | 가능 | 가능 | 가능 | 단, 비회원 피드백 내용 자체는 §9 참고 — 다른 문제 |
| Return Visit(재방문) | 가능 — `home_entered{returning}` | N/A | N/A | N/A | 가능 | 단, `attendance` 테이블은 재방문을 반영하지 않음(§8) |
| Logout | 가능 — `logout` | 가능 | N/A | N/A | N/A | |

**퍼널 관점 결론**: Landing→Assessment 시작, Room 진입 이후 구간(Care/Ranking/Mission/Customization/Friend)은 비교적 신뢰할 수 있는 퍼널 계산이 가능하다. 반면 **Assessment 진행 중 이탈, Save 화면(가입 전환), Profile Setup, Free Play 게임 선택 단계, Free Play 게임 중도 포기**는 현재 구조로 퍼널 전환율을 계산할 수 없거나 신뢰도가 낮다.

---

## 4. Analytics Blind Spots

Screen/Modal 단위와 Click/Interaction 단위로 나눠 정리한다.

### 4.1 완전히 블라인드인 화면 (view 이벤트도, 대리 이벤트도 없음)

| 화면 | 파일 | 비고 |
|---|---|---|
| Birthday/Profile Setup | `birthday-screen.tsx` | 로그인 사용자에게만 노출, 이탈률/입력률 완전 블라인드 |
| Save 화면(가입 유도) 전체 노출 및 "계속하기" 클릭 | `save-screen.tsx` | 스킵만 추적, 이 화면이 전환에 미치는 효과 전체를 알 수 없음 |
| Grow(스탯 선택) | `grow-screen.tsx` | 어떤 스탯을 고려하다 포기했는지 알 수 없음 |
| Grow-game(게임/난이도 선택) | `grow-game-screen.tsx` | 뒤로가기율, 노출 대비 선택률 불가 |
| Login 화면 | `login-screen.tsx` | 뒤로가기 등 이탈 행동 불가 |
| Restore-conflict(기기 간 충돌 해결) | `restore-conflict-screen.tsx` | "서버 데이터 사용" vs "로컬 유지" 선택 비율을 전혀 알 수 없음 — 데이터 유실/오염 리스크가 있는 화면인데 계측이 없다는 게 특히 아쉬움 |
| Room의 Mission 아이콘 / "성장시키기" CTA 클릭 | `room-screen.tsx:579-586, 715-719` | Room에서 어떤 도입부로 Mission/Free Play에 진입하는지 불명 |
| Reveal 화면의 "함께하기" 확정 클릭 | `reveal-screen.tsx` | 노출은 추적되나 확정 자체는 미추적 |
| Egg 화면 자체 인터랙션 | `egg-screen.tsx` | 진입 전 이벤트만 있고 화면 내 행동은 없음 |

### 4.2 State/Modal 전환이라 page_view로 안 잡히는 구조적 이유

이 앱은 5개 URL 라우트 외 전부가 `GameFlow` 컴포넌트의 `phase` state 전환이며, PostHog는 `capture_pageview:false`로 실제 route 변경에만 `$pageview`를 수동 발화한다(`components/analytics/posthog-analytics.tsx`). 즉 위 §4.1에서 언급한 화면들은 URL이 바뀌지 않으므로 **PostHog 자동 pageview로도 GA4 자동 page_view로도 절대 잡히지 않는다** — 반드시 명시적 `trackEvent`/`trackProductEvent` 호출이 있어야만 보이는 구조다. 이는 설계상 자연스러운 트레이드오프이지만, §4.1의 공백들이 "구현을 깜빡한 것"이 아니라 "이 아키텍처에서는 명시적으로 붙이지 않으면 원천적으로 안 보인다"는 점을 분명히 해둘 필요가 있다.

### 4.3 Click/Interaction 블라인드 스팟 (제품 의사결정에 영향 있는 것만 선별)

| Interaction | 현재 상태 | 왜 의사결정에 도움이 되는가 |
|---|---|---|
| Assessment 게임 중도 이탈(뒤로가기/탭 닫기) | 미추적 | 어느 게임/스탯에서 온보딩을 포기하는지 알아야 게임 난이도/설명을 개선할 수 있음 |
| Free Play 게임 중도 포기(quit) | 미추적(`exitFreePlayGame`이 의도적으로 no-op) | 난이도 밸런싱의 핵심 지표(§5) |
| Hard/Extreme 난이도 해금 순간 | 미추적 | "해금이 재방문을 유도하는가"를 검증할 유일한 anchor 이벤트가 없음 |
| Save 화면 "계속하기"(가입 유도) 클릭 | 미추적 | 가입 전환율의 분자/분모 중 분모(노출) 자체가 없음 |
| Restore-conflict 선택("서버 사용"/"로컬 유지") | 미추적 | 기기 간 데이터 충돌이 실제로 얼마나 발생하고 사용자가 어느 쪽을 선택하는지 모르면 UX 개선 우선순위를 정할 수 없음 |
| 친구 초대 링크 "생성/발신" (수신측 open과 별개로) | 간접적(일반 공유 이벤트에 통합) | 초대 발신 대비 수신 오픈율, 오픈 대비 연결률의 온전한 3단 퍼널이 불가능 |
| Google OAuth 가입/로그인 | 미추적 | §1, §14 참고 — 가장 중요한 항목 |

이하 CTA들은 이미 잘 계측되어 있으므로 추가 제안하지 않는다: 돌봄 액션 6종, Ranking 탭/스코프 전환, Customization apply/remove/save, Mission/Achievement claim, Feedback 제출, 오디오 설정 변경, 로그아웃.

---

## 5. Game Analytics Audit

12개 Free Play 게임(6개 능력 × 2개) 모두 `game_id`/`ability`/`difficulty`/`normalized_score`가 GA4·PostHog 양쪽에 기록된다. 그러나 다음 필드는 이벤트에 실려 있지 않다: raw 지표값(ms/정확도 등), 세션 소요시간(12개 중 2개 게임만 시간 지표 보유), 개인 최고기록 갱신 여부(`is_personal_best`), round/문항 수.

| 질문 | 판정 | 이유 |
|---|---|---|
| 어떤 게임이 가장 많이 플레이되는가? | **가능** | PostHog `game_started`/GA4 `mini_game_start`·`free_play_start`가 game_id를 포함 |
| 어떤 게임에서 가장 많이 이탈하는가? | **불가능** | 중도 포기 이벤트가 없어 start 대비 complete 차이가 이탈과 중복 시작을 구분 못함 |
| 어떤 게임이 가장 많이 재도전되는가? | **부분가능** | "같은 세션 내 재시도"는 `completion_result:'retry'`로 확인되나, "며칠 뒤 다시 플레이"는 Supabase에 기록이 없고 PostHog 원시 이벤트를 사람 단위로 재구성해야 함 |
| 난이도별 completion rate는? | **부분가능** | start/complete 비율로 근사 가능하나 이탈 미추적으로 분모 오염 |
| Hard/Extreme unlock이 재방문을 유도하는가? | **불가능** | 해금 시점 이벤트가 없고, `player_skill_records`는 현재 최고기록만 저장해 "언제 해금됐는지" 사후 재구성 불가 |
| 어떤 게임이 지나치게 쉽거나 어려운가? | **가능** | `normalized_score` 분포로 판정 가능(단, 완료된 시도만 반영되는 생존자 편향 있음) |
| 사용자가 약한 스탯 게임을 더 플레이하는가? | **불가능** | 이벤트에 그 시점의 스탯 순위가 실려있지 않고, 스탯 기록도 스냅샷이라 사후 재구성 불가 |
| 게임 성적이 반복 플레이로 향상되는가? | **불가능(Supabase 기준)** / **부분가능(PostHog 원시 이벤트 기준, identified user에 한함)** | `player_skill_records`가 (user, game, difficulty)당 최고기록 1행만 유지 — 시도 이력 자체가 없음 |

**핵심 원인**: `player_skill_records`가 히스토리가 아닌 "현재 최고 기록"만 저장하도록 설계되어 있어(§8), 이벤트 스트림(PostHog)만이 유일한 시계열 데이터 소스다. PostHog가 비활성화되거나(키 미설정 시 조용히 no-op) 사용자가 식별되지 않은 세션이면 이 분석 경로 자체가 사라진다.

---

## 6. Retention Audit

| 지표 | 판정 | 권장 소스 |
|---|---|---|
| D1/D3/D7 retention | **가능(PostHog 기준)** | `home_entered{entry_type:'first_time'|'returning'}` 코호트로 계산 |
| Returning user rate | **가능(PostHog)** | 동일 |
| 첫 Assessment 이후 재방문 | **가능(PostHog)** | `assessment_completed` → 이후 `home_entered{returning}` 조인 |
| 첫 Free Play 이후 재방문 | **가능(PostHog)** | `game_completed{mode:'free_play'}` → 이후 재방문 조인 |
| 누적 플레이 일수 / 마지막 활동일 | **부분가능(Supabase)** | `attendance.total_days`/`last_visit_date`는 존재하나 **최초 로그인 마이그레이션 이후 갱신되지 않음**(§8) — 신뢰 불가. PostHog 이벤트 기반 계산이 정답에 가까움 |
| 세션당 게임 수 | **가능(PostHog)** | 세션 windowing만 정의하면 계산 가능 |
| 신규/기존 사용자 구분 | **가능** | `home_entered{entry_type}`와 계정 생성 시각으로 구분 |

**잘못 계산될 위험**: `attendance` 테이블을 리텐션 소스로 쓰면 **로그인 이후 재방문한 사용자도 마치 한 번도 재방문하지 않은 것처럼 과소평가**된다(테이블이 최초 마이그레이션 시점에 멈춰 있으므로). 리텐션 대시보드는 반드시 PostHog `home_entered` 이벤트를 1차 소스로 삼아야 한다.

---

## 7. Acquisition / UTM / Device Audit

- **앱 내부 공유(캐릭터 공개 공유, MyPage 공유, 친구 초대)**: 고정 UTM(`utm_source=statling_share&utm_medium=referral&utm_campaign=user_share`, `utm_content`만 2종 가변)이 자동으로 붙는다 — **가능**, 어떤 소셜 채널에서 최종 클릭되든 "앱 내부 공유발" 트래픽으로는 식별 가능.
- **운영자가 직접 게시하는 홍보 링크(Threads/Instagram/네이버블로그/티스토리)**: `buildCampaignUrl()`이라는 헬퍼가 존재하지만 **어떤 UI에도 연결되어 있지 않다** — 운영자가 수동으로 이 함수를 써서 링크를 만들지 않으면 UTM이 전혀 붙지 않는다. UTM 없이 게시하면 GA4는 referrer 기반 자동 채널 그룹핑에 의존하는데, Threads/Instagram/카카오톡 인앱 브라우저는 흔히 Referer를 누락해 `(direct)/(none)`로 잡힌다 — **채널 간 구분이 사실상 불가능**해진다.
- **친구 초대 `?ref=` 파라미터**: UTM과 함께 살아남지만, `ref` 자체는 어떤 analytics 이벤트에도 실리지 않는다 — "누가 공유해서 누가 가입했는지"는 Supabase의 `friendships` 관계로만 알 수 있고 analytics 퍼널에서는 재구성 불가.
- **기기/브라우저/OS**: GA4·PostHog SDK의 자동 수집으로 충분 — 별도 커스텀 구현은 게임플레이용(터치 지연 보정 등)이지 acquisition 분석용이 아니다.
- **Device id**: 순수 게스트 로컬 상태 키잉용이며 analytics 이벤트에 붙지 않는다 — attribution과 무관.
- **Landing A/B 실험 변형**: PostHog에만 존재(`landing_experiment_viewed`), GA4에는 대응 이벤트 없음 — "채널별로 실험 변형 성과가 다른가"는 PostHog에서만 답할 수 있다.

**결론**: 앱 내부 공유 흐름의 acquisition 품질은 측정 가능하다. 그러나 **운영자가 직접 SNS에 올리는 홍보 게시물에 대해서는 코드가 아무것도 강제하지 않으므로, UTM을 빠뜨리면 채널 비교가 통째로 불가능해진다.**

> **Phase 3J-3 — 권장 UTM 규칙 (코드/UI 변경 없음, `buildCampaignUrl()` 그대로 사용)**: 앱 내부 공유(`utm_source=statling_share`)와 절대 겹치지 않도록 운영자 채널별로 아래 값을 수동으로 지정해 `buildCampaignUrl({source, medium, campaign, content})`를 직접 호출해 링크를 생성한다.
>
> | 채널 | utm_source | utm_medium | utm_campaign | utm_content |
> |---|---|---|---|---|
> | Threads | `threads` | `social` | 홍보 시점별 캠페인명(예: `beta_launch_202609`) | 게시물별 식별자(예: `post1`, `profile_link`) |
> | Instagram | `instagram` | `social` | 위와 동일 캠페인명 | `bio_link`, `story`, `post1` 등 |
> | 네이버 블로그 | `naver_blog` | `referral` | 위와 동일 캠페인명 | 포스트 슬러그/식별자 |
> | 티스토리 | `tistory` | `referral` | 위와 동일 캠페인명 | 포스트 슬러그/식별자 |
> | 지인 공유(카카오톡/디스코드 등 운영자 개인 공유) | `personal_share`(또는 실제 채널명, 예: `kakaotalk`) | `referral` | 위와 동일 캠페인명 | `direct_share` |
>
> `utm_medium`은 GA4 기본 채널 그룹핑과 맞춰 소셜 플랫폼은 `social`, 블로그/메신저 등 링크형 유입은 `referral`로 통일했다. `utm_campaign`은 채널과 무관하게 "언제/어떤 홍보 활동인지"를 나타내는 값으로 채널 간 동일하게 사용해야 캠페인 단위 비교가 가능하다.

---

## 8. Supabase Data Quality Audit

전체 21개 테이블 중 스냅샷/히스토리 분류:

| 유형 | 테이블 | 못하는 것 |
|---|---|---|
| **순수 스냅샷(덮어쓰기)** | `profiles`, `pets`, `xp_totals`, ~~`attendance`~~(**RESOLVED — Phase 3J-3, continuous sync 대상으로 편입, 값 변화는 여전히 재구성 불가하지만 "최신값"은 정확함**), `activity_counters`, `pet_care_state`, `room_state`, `room_care_state`, `pet_memory`, `dialogue_memory`, `feedback` | 값이 언제/얼마나 변했는지 전혀 재구성 불가 |
| **최고기록 스냅샷** | `player_skill_records` | 시도 이력, 세션 수, 향상 곡선 계산 불가 |
| **히스토리처럼 보이나 사실상 아님** | `daily_missions`(오늘 것만 업로드), `achievements`(unlock/claim 시각이 마이그레이션 이전 데이터는 합성값) | 과거 특정 일자의 미션 상태, 정확한 업적 달성 시각 |
| **전체 교체(destructive replace)** | `room_items`, `deco_placement_items`, `user_notes` | 이전 방/장식 배치 이력 |
| **진짜 append-only** | `room_inventory`, `deco_inventory`, `dex_entries`(단, `met_at`은 초기 마이그레이션 데이터의 경우 합성값) | 없음(단 마이그레이션 이전 계정은 시점 왜곡 있음) |
| **생성 이력만 있고 삭제 이력 없음** | `friendships`(`created_at` 有, 삭제는 hard delete로 흔적 0) | 친구 관계 해제/이탈률 분석 불가 |

**가장 심각한 개별 이슈였던 것 — [RESOLVED — Phase 3J-3]**: ~~`attendance`가 `lib/sync/sync-dispatcher.ts`의 continuous sync 대상(`SyncDomain`)에 포함되어 있지 않다 — 최초 로그인 마이그레이션 때 한 번 쓰이고 이후 다시는 갱신되지 않는다. 재방문·출석 스트릭 분석에 이 테이블을 쓰면 활성 사용자를 과소평가하게 된다.~~ `attendance`를 `SyncDomain`에 추가해 매 방문마다 continuous sync되도록 수정, 재방문 시나리오 실측으로 `total_days`/`current_streak` 정상 갱신 확인(§14 P0).

**Snapshot 데이터가 필요한 영역 vs Event/History 데이터가 필요한 영역**:
- XP/능력치 성장 곡선, 스킬 향상 추이, 업적 달성 타임라인, 방/꾸미기 변경 이력, 친구 관계 해제 이력 → **모두 History 테이블 없이는 답할 수 없는 영역**. 지금은 이런 분석이 필요할 때마다 PostHog 원시 이벤트에 의존해야 하며, PostHog 리텐션 기간이나 식별 여부에 따라 데이터가 사라질 수 있다.

---

## 9. localStorage-only Data Audit

repo 전체에서 약 30개의 storage key를 확인했다. 대부분은 Supabase와 지속 동기화되지만, 다음은 **운영자가 절대 볼 수 없거나 볼 수 있는 창구가 매우 좁은** 데이터다.

| Key | 내용 | 문제 |
|---|---|---|
| `statling:feedback:{deviceId}` | 비회원 피드백(만족도 + 자유 텍스트 코멘트) | **최고 위험** — 그 기기로 나중에 회원가입해야만 Supabase `feedback` 테이블로 1회성 마이그레이션됨. 가입하지 않으면 영구히 그 브라우저에만 존재. GA4에도 코멘트 내용은 전송되지 않음(의도적 PII 최소화지만, 그 결과 운영자는 코멘트 자체를 절대 못 봄) |
| `statling.introProgress.v1` | Assessment 6게임 진행 체크포인트(어느 스탯까지 했는지) | Supabase 미동기화, analytics로는 완료 시 `duration_ms` 하나만 파생되어 전달됨 — 온보딩 중단 지점 분석 불가 |
| `statling.onboardingSeen.v1` | 최초 방문 온보딩 카드 "다시 보지 않기" 여부 | Supabase/analytics 어디에도 없음 — activation 지표로서 가치가 있는데 완전 블라인드 |
| `statling:audio:bgmSettings` | BGM 트랙 선택/볼륨 | on/off 토글만 GA4 이벤트로 감, 실제 어떤 트랙이 선택되는지는 완전 로컬 |
| `statling.attendance.v1` | 출석 | **[RESOLVED — Phase 3J-3]** ~~Supabase에 있긴 하나 최초 마이그레이션 이후 갱신 끊김~~ → continuous sync 대상으로 편입됨(§8) |
| `statling.userNotes.v1` | 노트 | Supabase에 있긴 하나 최초 마이그레이션 이후 갱신 끊김(continuous sync 대상 아님, `attendance`와 달리 이번 Phase에서도 변경하지 않음) |

**공통 패턴**: "서비스는 정상 작동하지만 운영자는 데이터를 볼 수 없는" 사례는 예외 없이 (1) 비회원 상태이거나 (2) 애초에 sync 대상 domain 목록에서 빠진 경우다.

---

## 10. GA4 Audit

- 총 38개 custom event(`lib/analytics/ga.ts`) 확인, GA4 자동 `page_view`는 랜딩 계측을 대체.
- **명명 규칙 불일치**: `_view`(achievement_view, collection_view, ranking_view 등) / `_start`·`_complete`(assessment, mini_game, free_play, egg_hatch) / 단발성 명사형(`pet_action`, `xp_earned`, `level_up`)이 혼재.
- **의미가 겹치는 이벤트**: `daily_mission_view`와 `achievement_view`는 사실상 같은 컴포넌트의 같은 effect에서 탭 값만 다르게 분기된 것 — `ranking_view`처럼 하나의 이벤트에 `type` 파라미터를 두는 패턴과 설계가 다르다.
- **필요한데 없던 이벤트, 전부 [RESOLVED — Phase 3J-3, §14 참고]**: ~~Google OAuth 가입/로그인, Save 화면 노출/계속하기 클릭, Free Play 게임 중도 이탈, 난이도 해금 시점~~.
- **파라미터 누락**: `mini_game_complete`/`free_play_complete`에 `is_personal_best`, raw 지표값, 세션 소요시간이 없음.
- GA4 전용이고 PostHog 대응이 없는 것: `collection_view`, `collection_statling_view`, `ranking_view`, `xp_earned`, `level_reward_received`, `audio_setting_change`, `bgm_play_mode_change`, `bgm_track_change`, `feedback_*`, `my_status_view`.

---

## 11. PostHog Audit

- 총 21개 custom event(`lib/analytics/analytics.ts`) + 수동 `$pageview`.
- GA4에는 있는데 PostHog에는 없는 것: Collection/Dex 조회, `ranking_view`(글로벌 랭킹 — 친구 랭킹은 양쪽에 있음), XP 획득량, 레벨업 보상, 오디오 설정 변경, 피드백 전체, `my_status_view`.
- PostHog에는 있는데 GA4에는 없는 것: `landing_experiment_viewed`(A/B 실험 노출 — PostHog의 person-property 기반 UTM 자동 결합을 활용하기 위한 의도적 설계).
- **제안하지 않는 것**: GA4 이벤트 전체를 PostHog에 복제하는 방향은 배제. GA4는 acquisition/트래픽/퍼널, PostHog는 제품 행동/세션 분석이라는 역할 분리가 이미 잘 지켜지고 있음 — Collection/오디오 설정처럼 "제품 행동이지만 PostHog에 없는" 항목만 필요시 보완 대상으로 검토(§15).

---

## 12. Privacy / PII Audit

코드 레벨에서 확인한 결과, **GA4/PostHog 이벤트 payload에서 PII가 발견되지 않았다**.

| 항목 | Supabase 저장 여부 | Analytics 전송 여부 |
|---|---|---|
| email | Y(`auth.users`) | **N** |
| password | Y(해시, auth 시스템) | **N** |
| birth_date/gender | Y(`profiles`) | **N** |
| nickname/펫 이름 | Y | **N** — `naming_completed`는 길이(정수)만 전송 |
| feedback 자유 텍스트 | Y(회원) / 로컬만(비회원) | **N** — `feedback_submit`은 정형 필드(rating/사유 enum)만 전송 |
| friend_code | Y(`profiles.friend_code`) | **N** — 문서 주석에 명시적으로 배제 |
| 원본 UUID(user_id) | PK로 사용 | PostHog `identify()`의 distinct_id로만 사용(이벤트 payload 필드 아님) |
| 초대/ref 쿼리 파라미터 | N/A | 이벤트 파라미터로는 전송되지 않으나, **URL 자체(page_view URL)에는 남아있어 GA4/PostHog의 URL 자동 수집 경로로 간접 노출될 가능성 있음**(친구 코드 자체가 비식별 랜덤 토큰이라 위험도는 낮음) |

**간접 노출 경로**: `?ref={friendCode}`가 붙은 URL을 GA4/PostHog가 자동으로 페이지 URL로 수집할 경우, 그 값 자체가 사용자를 특정하진 않지만(비식별 128비트 토큰) 초대 관계를 유추하는 데 쓰일 수 있다는 점은 인지해둘 필요가 있다(위험도 낮음, 즉각 조치 불필요).

GA4 Consent Mode는 구현되어 있지 않다 — 동의 배너/consent gating 없이 GA4가 무조건 발화한다(§14 P0).

---

## 13. Questions We Cannot Answer Today

| 영역 | 질문 | 판정 |
|---|---|---|
| Acquisition | 어느 홍보 채널의 사용자가 assessment completion rate가 가장 높은가? | 부분가능 — 앱 내부 공유발 트래픽만 채널 구분 가능, 운영자 직접 게시 링크는 UTM 누락 시 불가능 |
| Acquisition | 지인 공유(친구 초대) 대비 일반 공유의 전환율 차이는? | 가능 — `utm_content`로 구분 가능 |
| Activation | 첫날 어떤 행동을 한 사용자가 D7 retention이 높은가? | 부분가능 — PostHog 이벤트로 가능하나 identified user에 한함, 게스트 이탈은 반영 안 됨 |
| Activation | Save 화면(가입 유도)이 실제로 이탈을 만드는가? | **[RESOLVED — Phase 3J-3]** 가능 — `save_screen_viewed`/`auth_continue_clicked` 추가됨 |
| Activation | Google 로그인 사용자의 가입 전환율은? | **[RESOLVED — Phase 3J-3]** 가능 — `trackGoogleAuthIfApplicable`로 `sign_up`/`login`에 포함됨 |
| Engagement | 어떤 게임이 retry율은 높지만 completion rate도 높은가? | 부분가능 — retry는 계측되나 completion rate 분모가 이탈 미계측으로 오염 |
| Game Balance | 어떤 게임이 지나치게 쉽거나 어려운가? | 가능(§5) |
| Retention | 레벨업이 다음날 재방문에 영향을 주는가? | 가능 — `level_up`과 `home_entered{returning}` 조인 |
| Retention | 정확한 출석/스트릭 기반 리텐션은? | **[Supabase 기준 RESOLVED — Phase 3J-3]** 가능(Supabase `attendance` continuous sync 편입) / 가능(PostHog 기준, §6) — 단 "언제 스트릭이 끊겼는지"의 히스토리는 여전히 재구성 불가(최신값만 정확) |
| Pet/Care | 방 꾸미기를 사용하는 사용자가 더 오래 남는가? | 가능 — `customization_save`/`room_saved`와 retention 조인 가능 |
| Pet/Care | 돌봄 행동 빈도가 리텐션과 상관관계가 있는가? | 가능 |
| Progression | 어떤 시점에 XP 성장이 정체되는가? | **불가능** — `xp_totals`가 스냅샷이라 성장 곡선 자체가 없음, PostHog `game_completed`의 `xp_earned`(GA4 전용) 이벤트로 근사만 가능 |
| Progression | Hard/Extreme 해금이 재방문을 유도하는가? | 불가능(§5) |
| Social | 친구 연결 후 참여도가 증가하는가? | 가능 — `friend_connected` 시점과 이후 행동 이벤트 비교 가능 |
| Social | 친구 관계 해제(이탈) 비율은? | **불가능** — hard delete, 흔적 없음 |
| Customization | 어떤 아이템이 가장 인기 있는가? | 가능 — `customization_apply{item_id}` |
| Feedback | 비회원 피드백의 전반적 만족도는? | **불가능** — 가입 전환된 기기의 피드백만 서버에 도달, 표본이 편향됨 |

---

## 14. P0 / P1 / P2 / P3 Issues

### P0 — 데이터 유실 / 계정 오염 / 개인정보 / 잘못된 데이터

| 문제 | 현재 상태 | 왜 문제인가 | 불가능해지는 분석 | 수정 방향 | 난이도 |
|---|---|---|---|---|---|
| **[RESOLVED — Phase 3J-3]** Google OAuth 가입/로그인 미계측 | ~~`sign_up`/`login`은 이메일/비밀번호 경로에서만 발화~~ → `lib/auth/supabase-auth-provider.tsx`의 `trackGoogleAuthIfApplicable`이 `getSession()` 리로드 경로에서 발화(OAuth 리다이렉트 완료 후 최초 로드 시점 — `onAuthStateChange`의 `SIGNED_IN`이 아님, 실측으로 확인). `created_at`/`last_sign_in_at` 비교(10초 tolerance)로 신규/기존 판별, `sessionStorage` 마커(`statling.pendingGoogleOAuth.v1`)로 "방금 이 탭에서 Google OAuth를 시도했는지"만 판별해 무관한 재방문에서 오발화하지 않도록 함. GA4는 기존 `sign_up`/`login{method:'google'}` 그대로, PostHog는 신규 `signed_up`/`logged_in{method:'google'}` 추가. 실제 Google 계정으로 E2E 완주는 로컬 환경 제약(테스트 Google 계정 없음)으로 못 했음 — 메커니즘 자체(마커 설정/소비, provider 게이팅)는 실측 검증 완료. | Google 로그인 비중이 크면 가입 전환율이 실제보다 크게 낮아 보여 **완전히 잘못된 결론**(예: "가입 전환이 낮다"→실은 안 세고 있을 뿐)으로 이어질 수 있음 | Auth Conversion Rate 전체 | ~~`app/auth/callback/route.ts`에 이벤트 발화 추가~~ → 실제로는 서버 라우트가 아니라 클라이언트의 `getSession()` 리로드 경로에 추가(라우트 핸들러는 analytics를 발화할 수 없음) | Low |
| **[RESOLVED — Phase 3J-3]** `attendance` 테이블이 최초 마이그레이션 이후 갱신 안 됨 | ~~continuous sync 대상 아님~~ → `lib/sync/sync-dispatcher.ts`의 `SyncDomain`에 `attendance` 추가, `lib/missions/mission-tracker.ts`의 `trackDailyVisit()`가 (기존에 이미 있던) "오늘 처음 방문했는지" 순수 reducer 가드 안에서 `scheduleSync('attendance')` 호출. 실제 Supabase에 새 계정으로 재방문 시나리오 3회(최초+reload 2회) 실행해 `total_days=1`(중복 증가 없음), `current_streak=1`, `last_visit_date` 정확히 반영됨을 REST로 직접 확인. | 이 테이블을 리텐션/출석 지표 소스로 쓰면 활성 사용자를 과소평가하는 **잘못된 데이터** | D1/D7/D30, 출석 스트릭 기반 모든 분석 | `attendance`를 sync-dispatcher의 지속 동기화 대상에 포함 | Medium |
| **[RESOLVED — Phase 3J-1, 이번 Phase 이전]** 비회원 피드백이 회원가입 없이는 영구 소실 | localStorage에만 존재, 마이그레이션은 계정 생성 시 1회성 best-effort → `20260901010000_phase3j1_feedback_table.sql` + `lib/feedback/feedback-storage.ts`로 서버 저장 경로 추가됨(Phase 3J-3 시작 시점에 이미 완료된 상태, 이번 Phase에서는 변경하지 않음) | 서비스 만족도의 상당 부분(비회원)이 표본에서 원천 배제되어 **생존자 편향된 피드백 데이터**가 됨 | Feedback 전체 대표성 | 비회원도 익명 feedback을 서버로 보내는 경로 검토(추가 인프라 필요, 별도 논의 필요) | Medium~High |
| GA4 Consent Mode 부재 | 동의 배너/consent gating 코드 없음 | 실사용자 홍보 전 개인정보 처리 관련 컴플라이언스 리스크(국내 서비스는 PIPA 고려 필요) — 이는 "잘못된 데이터"라기보다 서비스 운영 리스크이나 데이터 수집의 적법성 자체에 영향 | 없음(법적/신뢰 리스크) | 최소한의 쿠키/추적 고지 및 동의 UX 검토 | Medium |
| `daily_missions`가 히스토리 테이블처럼 보이지만 오늘 데이터만 업로드 | `date_key` 컬럼이 있어 이력 테이블로 오인하기 쉬움 | 분석가가 이 테이블로 "과거 특정일 미션 달성률"을 조회하면 **결측을 0으로 오인**할 위험 | 일자별 미션 히스토리 | 문서화(테이블 코멘트/데이터 사전에 "오늘자만 유효" 명시) — 코드 변경 없이도 즉시 가능 | Low |
| **[RESOLVED — Production QA 후속, 2026-09-02]** 동일 브라우저 계정 간 로컬 게임 상태 오염(cross-account contamination) | `lib/pets/local-data-owner.ts`의 owner-guard는 pet profile/최초 마이그레이션/feedback 3곳에만 적용되어 있었고, XP/Lv/업적/미션/Room 등 나머지 15개 로컬 도메인은 계정 소유권 검증이 전혀 없어 로그아웃 후 다른 계정이 가입하면 이전 계정 값을 그대로 물려받고 continuous sync로 실제 Supabase row에까지 기록될 수 있었음(실측: A의 XP 999/Lv.5 상당이 B의 로컬 화면과 Supabase `xp_totals`/`pet_care_state`에 반영되는 것을 직접 재현) → `lib/pets/reset-foreign-account-state.ts` 신설, owner-mismatch 시 18개 도메인 전체 초기화 + owner marker를 unclaimed로 리셋해 이후 정상 마이그레이션이 새 계정을 claim하도록 수정. guest→최초가입 경로(owner가 애초에 null인 경우)는 분기 자체가 타지 않아 그대로 보존됨을 실측 확인(로컬 dev 서버 + 실제 Supabase, 두 시나리오 모두 REST로 직접 조회). | 신규 가입자가 이미 성장한 상태로 시작하는 것처럼 보여 XP/Level 기반 랭킹·리텐션·활동 지표가 **실제로 오염**되며, "신규 사용자"라는 세그먼트 자체의 정의가 깨짐 | 전체 활동/랭킹/리텐션 분석(오염된 계정이 섞이면 세그먼트 신뢰 불가) | `lib/pets/reset-foreign-account-state.ts` + `components/brain-bet/game-flow.tsx`의 owner-mismatch 분기 확장 | Medium |
| **[RESOLVED — Production QA 후속, 2026-09-02]** GA4 초기화 race로 인한 이벤트 유실 | `lib/analytics/ga.ts`의 `trackEvent()`가 `window.gtag`가 아직 함수가 아니면(`<GoogleAnalytics/>`의 `afterInteractive` 스크립트 로드 전 — 예: OAuth 리다이렉트 직후 첫 렌더처럼 페이지가 매우 이른 시점에 마운트되는 화면) 이벤트를 조용히 버렸음 | `profile_setup_view`/`profile_setup_complete`/`home_enter` 등 핵심 온보딩 퍼널 이벤트가 타이밍에 따라 간헐적으로 유실 — 재현이 어려운 산발적 결측이라 원인 파악이 특히 어려운 유형 | 회원가입 이후 온보딩 퍼널 전체 | Google 공식 `dataLayer.push(arguments)` shim을 `trackEvent()`에 추가, gtag.js 로드 전 호출도 큐잉되어 유실 없이 처리 | Low |

### P1 — 핵심 퍼널/핵심 KPI 계산 불가

| 문제 | 현재 상태 | 왜 문제인가 | 불가능해지는 분석 | 수정 방향 | 난이도 |
|---|---|---|---|---|---|
| **[NOT RESOLVED — 의도적 보류, Phase 3J-3에서 재검토함]** Assessment 온보딩 중도 이탈 미계측 | `introProgress`가 Supabase/analytics 어디에도 전달 안 됨. Phase 3J-3에서 실제 코드(각 미니게임 컴포넌트, 예 `reaction-game.tsx`)를 조사한 결과, Assessment(`mode==='first'`)는 애초에 뒤로가기/exit UI 자체가 렌더링되지 않음(`mode==='first' ? <ProgressTrack .../> : <FreePlayBadge onBack={onBack} />` — Free Play에서만 `FreePlayBadge`가 렌더링됨). 신뢰성 있게 판별 가능한 explicit exit 신호가 구조적으로 없어, 무리한 이벤트 추가(beforeunload 등) 대신 미구현 유지 결정. | 6게임 온보딩이 가장 긴 첫 경험인데 어디서 이탈하는지 전혀 모름 | Activation Funnel 세부 단계 | **권장**: start-complete 기반 inferred abandonment 사용이 더 안전함(단, 재시도와 혼동될 수 있음을 유의). 향후 Assessment에도 명시적 exit UI가 추가되면 그때 이벤트도 추가 가능. | Medium |
| **[RESOLVED — Phase 3J-3]** Free Play 게임 중도 포기 미계측 | ~~`exitFreePlayGame`이 의도적으로 no-op~~ → 분석 계측만 추가(게임 데이터 자체는 여전히 no-op, 의도된 설계 유지). `game-flow.tsx`의 `exitFreePlayGame`(Free Play 전용 명시적 뒤로가기 버튼)에서 PostHog `game_abandoned{game_id, ability, difficulty, mode:'free_play'}` 발화. 재시도(retry)는 별도 경로(`recordSkillCompletion`)라 혼동 없음. 실제 브라우저로 Grow→Free Play 시작→뒤로가기→난이도 화면 복귀까지 흐름 검증 완료(8/8 통과, console 에러 0건). | 게임 밸런스/난이도 조정의 핵심 신호 부재 | 게임별 completion rate, 이탈률 | `game_abandoned`류 이벤트 추가(unmount/뒤로가기 훅) | Medium |
| **[RESOLVED — Phase 3J-3]** Save 화면 노출/계속하기 클릭 미계측 | ~~스킵만 추적~~ → `save-screen.tsx`에 mount 시 PostHog `save_screen_viewed` 추가, `AuthForm`에 신규 `onContinueAttempt` prop(Google 클릭 또는 클라이언트 검증 통과한 비밀번호 제출 시점, 네트워크 응답 전)을 SaveScreen에서만 연결해 `auth_continue_clicked{method}` 발화 — MyPage의 게스트 계정 연결 카드(같은 AuthForm 재사용)는 prop을 넘기지 않아 영향 없음. | 가입 전환 퍼널의 분모(노출) 자체가 없어 전환율 계산 불가 | Auth Conversion Rate | 화면 mount 시 view 이벤트, 계속하기 클릭 이벤트 추가 | Low |
| **[RESOLVED — Phase 3J-3]** Grow/Grow-game 단계 전부 미계측 | ~~두 화면 모두 추적 코드 없음~~ → `grow-screen.tsx` mount 시 PostHog `grow_screen_viewed`, `game-flow.tsx`의 `selectFreePlayGame`(스탯 선택 시점)에서 `grow_stat_selected{ability}` 추가. Grow-game(게임/난이도 선택) 자체의 별도 view 이벤트는 추가하지 않음 — `grow_stat_selected`가 곧 그 화면 진입을 의미하고, 게임/난이도 확정 후 실제 시작은 기존 `game_started`/`free_play_start`로 이미 충분히 커버되어 중복 계측을 피함(요청받은 대로). | Free Play 진입 전 단계의 이탈/선택 패턴을 알 수 없음 | Free Play Participation Funnel 세부 단계 | 화면 진입/선택 이벤트 추가 | Low |
| **[RESOLVED — Phase 3J-3]** Hard/Extreme 해금 시점 이벤트 없음 | ~~해금은 클라이언트에서 조용히 계산될 뿐 이벤트화 안 됨~~ → `game-flow.tsx`의 `recordSkillCompletion`에서 게임 완료로 `player_skill_records`를 쓰기 직전(before)과 직후(after) 상태로 `isDifficultyUnlocked()`를 비교, `false→true`로 전환되는 유일한 순간에만 PostHog `tier_unlocked{game_id, ability, tier}` 발화. 별도 "이미 알림함" 플래그 없이 기존 최고기록 persistence 구조(단조 증가)만으로 정확히 1회만 발화함을 코드 레벨로 보장(요청받은 대로 임시 flag 추가 없이 기존 구조 검토 후 구현) — 실제 임계값을 넘는 완료를 재현하는 라이브 테스트는 이번 QA에서 수행하지 않음(시간 제약), 로직은 코드 리뷰로 검증. | "해금이 재방문을 유도하는가"라는 핵심 성장 가설 검증 불가 | 난이도 시스템의 재방문 기여도 | `tier_unlocked{game_id, tier}` 이벤트 추가 | Low |
| **[PARTIALLY RESOLVED — Phase 3J-3]** 운영자 직접 홍보 링크에 UTM 강제 없음 | `buildCampaignUrl()`이 UI에 미연결 — 요청에 따라 이번 Phase에서도 UI는 만들지 않음. 대신 Threads/Instagram/네이버블로그/티스토리/지인 공유 채널별 권장 `utm_source`/`utm_medium`/`utm_campaign`/`utm_content` 값을 문서화(완료 보고 §12 참고). | Threads/Instagram/블로그 등 채널 비교가 통째로 불가능해질 위험 | Acquisition 채널 비교 | 프로세스 문서화 + 필요시 내부용 링크 생성 UI 추가 | Low |
| **[의도적으로 이력 테이블화하지 않기로 결정 — 별도 조사 완료]** `player_skill_records`가 시도 이력을 보존하지 않음 | (user, game, difficulty)당 최고기록 1행만 upsert(`lib/game/player-skill-storage.ts`의 `recordMiniGameCompletion` — `isBetterByGameScore`일 때만 교체). 별도 조사(1→2→3→10회 플레이 시나리오, 100/1,000/10,000명 규모 데이터량 추정 포함)에서 A(현행 유지)/B(전체 history 테이블)/C(부분 history) 세 옵션을 비교한 결과 **C(현재는 만들지 않고 실사용자 데이터 확보 후 재검토)**로 결론 — 실사용자도 없는 상태에서 `game_attempts` 같은 append 테이블을 미리 만드는 것은 과도한 schema 확장으로 판단. `game_completed`(PostHog, 재시도 포함 매 유효 시도마다 발화, `completion_result:'first_attempt'\|'retry'`)가 현재 이 역할의 1차 대체 수단 — 단, Free Play는 재시도 개념 자체가 없어(전용 재도전 버튼 없음, 재입장만 가능) `completion_result`가 Free Play에서는 항상 `'first_attempt'`로 고정되는 한계가 있음(Assessment의 1회 한정 재도전과는 다름). 상세는 ADR-018/ADR-019. | "반복 플레이로 실력이 느는가" 같은 핵심 게임 분석 질문은 Supabase로는 여전히 답 불가하지만, PostHog 원시 이벤트로 부분적으로 근사 가능(Free Play 재시도 구분 제외) | 스킬 향상 곡선, 세션 빈도(Free Play 재시도 단위 분석은 여전히 불가) | 실사용자 데이터로 실제 반복 플레이 분석 수요가 확인되면 그때 재검토(ADR-018) | Medium~High |
| **[RESOLVED — Production QA 후속, 2026-09-02]** PostHog anonymous→identified Person merge 미연결 | `person_profiles:'identified_only'` 설정에서는 `identify()` 호출 전 익명 이벤트가 `$process_person_profile:false`로 수집되어 애초에 Person이 생성되지 않음(실제 배포 SDK `posthog-js@1.418.10`의 `_hasPersonProcessing()` 로직으로 확인) → 이후 `identify()`가 정확한 인자로 호출돼도(코드 레벨/`$anon_distinct_id` 모두 정상) merge할 익명 Person 자체가 없어 가입 전 Assessment 행동(`assessment_started`/`game_started`/`game_completed`)이 가입 후 Person Activity에 영구히 나타나지 않음 — Production 실제 브라우저로 재현 확인(가입 전/후 두 Person id를 직접 비교). `posthog.identify()`/`reset()` 호출 자체는 처음부터 문제 없었음(오탐 아님을 코드 재검토로 확인) — 원인은 person-profile 생성 시점 자체였음. `lib/analytics/posthog.ts`의 `ensurePersonProfileCreated()`를 Assessment 시작 시점(`start`/`resumeIntro`)에 호출해 그 시점부터 익명 이벤트도 Person에 귀속되도록 수정. **Funnel/Insight 레벨(Person Activity 탭이 아닌)에서 실제로 연결되는지는 PostHog 프로젝트 직접 접근 없이는 검증 못 함 — Production 대시보드에서 재확인 필요.** 상세는 §11, ADR-020. | Assessment 완주 여부·소요시간·top_stat 같은 가입 **전** 행동과 가입 **후** 리텐션/전환을 Person 단위로 묶어 분석하는 것이 불가능했음(가입 전환에 영향을 주는 요인 분석의 핵심 데이터) | "어떤 Assessment 행동이 실제 전환/리텐션과 상관관계가 있는가" 전체 | `posthog.createPersonProfile()`을 Assessment 시작 시점에 호출 | Medium |

### P2 — 분석 가치는 높지만 당장 서비스 운영에는 지장 없음

| 문제 | 현재 상태 | 수정 방향 | 난이도 |
|---|---|---|---|
| 친구 초대 "생성/발신" 이벤트가 일반 공유 이벤트에 통합됨 | `share_context='my_page'`만으로는 일반 공유와 초대 공유 구분 어려움 | `friend_invite_created` 같은 전용 이벤트 또는 기존 이벤트에 `is_invite` 플래그 추가 | Low |
| `is_personal_best` 플래그가 이벤트에 없음 | 클라이언트에서 계산은 되지만 전송 안 됨 | `game_completed`에 boolean 필드 추가 | Low |
| 게임 완료 이벤트에 raw 지표/소요시간 없음 | `normalized_score`만 전송 | 필요한 게임에 한해 duration/핵심 raw metric 추가 | Medium |
| 온보딩 카드 노출/닫기 미계측 | `onboardingSeen` 로컬 전용 | 노출/닫기 이벤트 추가 | Low |
| BGM 트랙 선택/오디오 세부 설정 미계측 | on/off 토글만 GA4 전송 | 트랙 변경 이벤트 추가(우선순위 낮음) | Low |
| 친구 관계 해제 이력 없음(hard delete) | `remove_friendship`이 흔적 없이 삭제 | soft-delete 컬럼 또는 별도 로그 테이블 검토(schema 변경 필요, 신중히) | Medium |
| Restore-conflict 선택 미계측 | 어느 쪽을 택하는지 모름 | 선택 이벤트 추가 | Low |
| `bgm_track_change`가 서로 다른 두 UI 동작(단일 반복곡 지정 vs 셔플 풀 토글)을 같은 이벤트명으로 전송 | 파라미터로 구분 불가 | 이벤트에 `action:'set_repeat'|'toggle_shuffle'` 등 구분 필드 추가 | Low |

### P3 — Nice to have

| 문제 | 현재 상태 | 수정 방향 | 난이도 |
|---|---|---|---|
| `daily_mission_view`/`achievement_view`가 사실상 같은 이벤트를 이름만 다르게 분리 | 명명 일관성 이슈 | `mission_screen_view{tab}` 형태로 통합 검토(하위 호환 고려) | Low |
| `coming-soon-screen.tsx`가 어디서도 참조되지 않는 죽은 코드 | 미사용 컴포넌트 | 삭제 또는 실제 연결 여부 팀 확인(analytics와 직접 관련 없음, 청소 항목) | Low |
| GA4 Preview/Production 환경 분리가 코드가 아닌 운영 관례에 의존 | `debug_mode`만 NODE_ENV로 자동 전환 | Vercel 환경별 GA_MEASUREMENT_ID 분리 운영 가이드 문서화 | Low |
| Talk(대화) 답변 선택 자체 미계측 | 의도적 설계 | 필요성 낮음, 현행 유지 권장 | — |

---

## 15. Recommended Additional Data

"있으면 좋다" 수준은 배제하고, 실제 의사결정에 쓰일 것만 선별했다.

| 제안 | 어떤 의사결정을 위해 필요한가 | 만들 수 있는 metric | 적절한 플랫폼 | 개인정보 위험 | 구현 비용 |
|---|---|---|---|---|---|
| Google OAuth 가입/로그인 이벤트 | 가입 채널(이메일 vs Google)별 전환율 비교, 정확한 전체 전환율 | Auth Conversion Rate(정확치) | GA4 + PostHog | 낮음(method만 전송) | Low |
| Save 화면 view + 계속하기 클릭 이벤트 | 가입 유도 화면 자체의 효과 측정 | Save Screen → Sign-up Conversion | PostHog | 낮음 | Low |
| Assessment 이탈/재개 이벤트(스탯 단위) | 온보딩 중단 지점 파악, 어느 게임이 이탈을 유발하는지 | Assessment Step Drop-off Rate | PostHog | 낮음 | Medium |
| Free Play `game_abandoned` 이벤트 | 게임 난이도/UX 개선 우선순위 결정 | Game Abandonment Rate | PostHog | 낮음 | Medium |
| `tier_unlocked` 이벤트(게임/난이도) | 난이도 해금 시스템이 재방문에 기여하는지 검증 | Unlock → Return Visit Rate | GA4 + PostHog | 낮음 | Low |
| `attendance` 지속 동기화로 전환 | 정확한 서버 사이드 리텐션/스트릭 데이터 확보 | D1/D7/D30(Supabase 검증용) | Supabase | 없음 | Medium |
| 친구 초대 "생성" 이벤트 분리 | 초대 발신→오픈→연결 3단 퍼널 완성 | Invite Funnel Conversion | GA4 + PostHog | 낮음(신원 미포함) | Low |
| `game_completed`에 `is_personal_best` 추가 | 개인 기록 갱신이 참여/리텐션에 미치는 영향 분석 | Personal-Best Rate | PostHog | 낮음 | Low |

**의도적으로 제안하지 않은 것**: 모든 버튼에 클릭 이벤트 붙이기, GA4/PostHog 이벤트 전체 상호 복제, 친구 관계 해제 이력을 위한 별도 로그 테이블(현 시점에는 P2로 충분, schema 변경 부담 대비 가치가 낮음), 원시 게임 지표(ms 단위 등) 전 종목 확대(일부 게임의 밸런스 이슈가 실제로 확인된 이후 필요한 게임에만 추가하는 것이 합리적).

---

## 16. Minimum Measurement Plan Before Real User Promotion

과도한 계측 확장 없이, **실사용자 홍보 전 최소한으로 갖춰야 할 것**만 선별했다.

### MUST HAVE
- [x] **RESOLVED (Phase 3J-3)** Google OAuth 가입/로그인 이벤트 추가(§14 P0) — 안 하면 홍보 이후 가장 중요한 KPI인 가입 전환율 자체가 왜곡된다.
- [x] **RESOLVED (Phase 3J-3)** `attendance` 지속 동기화 반영. (구현 완료 — 더 이상 "PostHog `home_entered` 기준으로만 집계" 원칙에 의존하지 않아도 됨. 단, Phase 3J-3 이전에 마이그레이션된 기존 계정의 과거 공백 기간 자체는 소급 채워지지 않음 — 이 시점 이후 재방문부터 정확.)
- [x] **RESOLVED (Production QA 후속, 2026-09-02)** 동일 브라우저 계정 간 로컬 게임 상태 오염(cross-account contamination) 수정(§14 P0) — 실사용자 홍보 전 반드시 막아야 했던 데이터 무결성 문제. `lib/pets/reset-foreign-account-state.ts`.
- [x] **RESOLVED (Production QA 후속, 2026-09-02)** GA4 초기화 race로 인한 핵심 온보딩 이벤트 산발적 유실 수정(§14 P0) — `dataLayer` shim 추가.
- [x] **RESOLVED (Production QA 후속, 2026-09-02)** PostHog anonymous→identified Person merge 연결(§14 P1) — 가입 전 Assessment 행동이 가입 후 분석과 분리되던 문제. `ensurePersonProfileCreated()`. Person Activity 탭 기준 코드 레벨 수정 완료, Funnel/Insight 레벨 최종 검증은 Production PostHog 대시보드에서 별도 확인 필요.
- [ ] **NOT RESOLVED** 운영자가 SNS에 직접 게시할 모든 홍보 링크는 `buildCampaignUrl()` 또는 수동 UTM 부착을 거친다는 프로세스 확정(코드 없이도 즉시 가능) — 이번 Phase 3J-3에서는 권장 UTM 값만 문서화(완료 보고 §12), 프로세스 확정/UI는 여전히 미비.
- [ ] **NOT RESOLVED** 개인정보 처리/추적 관련 최소 고지 검토(현재 GA4가 동의 없이 무조건 발화) — 실사용자 대상 홍보 전 법무/컴플라이언스 확인 권장. 이번 Phase 범위 밖.
- [ ] **NOT RESOLVED** `daily_missions`/`achievements`의 스냅샷·부분 히스토리 한계를 데이터 분석 문서에 명시해, 향후 분석가가 이 테이블을 오독하지 않도록 한다. 이번 Phase 범위 밖.

### SHOULD HAVE
- [x] **RESOLVED (Phase 3J-3)** Save 화면 view/계속하기 클릭 이벤트.
- [x] **Free Play만 RESOLVED (Phase 3J-3)** / Assessment는 **의도적 미구현** — Assessment 이탈, Free Play 게임 abandon 이벤트. (Assessment는 신뢰성 있는 explicit exit 신호가 구조적으로 없어 미구현 — §14 P1 참고)
- [x] **RESOLVED (Phase 3J-3)** `tier_unlocked` 이벤트.
- [x] **RESOLVED (Phase 3J-3)** Grow/Grow-game 화면 최소 view 이벤트.

### LATER
- `player_skill_records` 시도 이력 별도 테이블화 — 별도 조사 결과 **지금은 만들지 않기로 결정**(옵션 C, ADR-018/ADR-019). 실사용자 데이터로 반복 플레이 분석 수요가 실제로 확인되면 재검토.
- 친구 초대 생성 이벤트 분리, 친구 해제 이력.
- BGM/오디오 세부 설정 계측, 온보딩 카드 노출/닫기 계측.
- 게임별 raw 지표/소요시간 확대(문제가 확인된 게임부터).

Statling의 목적은 모든 행동을 수집하는 것이 아니라, **실제 사용자 행동을 기반으로 제품을 분석·개선할 수 있을 만큼 정확하고 충분한 데이터**를 확보하는 것이다. 위 MUST HAVE만 충족되어도 핵심 퍼널(Acquisition→Activation→Retention)에 대한 왜곡 없는 1차 분석은 가능하다.
