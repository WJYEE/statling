# Statling Analytics Measurement Plan

> **기준**: 현재 HEAD의 실제 구현을 기준으로 작성했다. `lib/analytics/`, GA4/PostHog 초기화 컴포넌트, analytics 호출부, Landing A/B experiment, 주요 product flow, Supabase data 구조를 확인했다.
> **원칙**: 존재하지 않는 이벤트를 있는 것처럼 쓰지 않는다. "현재 측정 가능"과 "향후 권장"을 분리한다. 실제 사용자 성과는 아직 없으므로 결과를 만들지 않고, 검증할 hypothesis와 측정 설계만 제안한다.

---

## 1. Product Measurement Framework

Statling의 제품 여정은 "방문자가 자기 능력을 발견하고, Statling을 확정한 뒤, 반복 플레이/돌봄/랭킹/공유/친구 기능으로 돌아오는가"를 측정하는 구조로 볼 수 있다.

| Stage | 사용자 행동 | 측정 목적 | 현재 측정 가능한 이벤트/데이터 | 관련 데이터 | 주요 KPI | 분석 질문 |
|---|---|---|---|---|---|---|
| Acquisition | 랜딩/공유 링크 방문 | 유입원과 실험 variant별 quality 파악 | GA4 `page_view`, PostHog `$pageview`, PostHog `landing_experiment_viewed` | URL UTM, `$current_url`, `statling.landingVariant.v1` | 방문자, UTM별 activation rate | 어떤 유입원이 assessment 시작까지 이어지는가 |
| Assessment Start | 시작 버튼 또는 restart/post-login auto start | 첫 core action 전환 | GA4 `assessment_start`, PostHog `assessment_started` | `entry_source`, `auth_state`, `release_stage` | Assessment Start Rate | guest/member별 시작률이 다른가 |
| Assessment Completion | 6개 assessment mini game 완료 | 긴 onboarding 완주율과 소요시간 | GA4 `mini_game_*`, `assessment_complete`; PostHog `game_*`, `assessment_completed` | game id, score, duration, top/second stat | Completion Rate, median duration | 어느 게임/단계에서 이탈하는가 |
| Reveal | Statling reveal 화면 도달 | 결과 경험 도달과 share 전 단계 | GA4 `statling_reveal`; PostHog `statling_revealed` | character id, top/second stat | Reveal Reach Rate | 어떤 stat 조합이 확정/공유로 이어지는가 |
| Confirmation/Auth | 저장 선택, signup/login/skip | 계정 전환과 guest 유지 선택 | GA4 `sign_up`, `login`; PostHog `auth_choice_made` only for skip | auth state, Supabase `profiles` | Sign-up Rate, Skip Rate | 저장 화면에서 계정 생성이 충분히 일어나는가 |
| Naming/Birthday | 이름 입력, 생일/프로필 optional 입력 | Room 진입 전 마찰 확인 | PostHog `naming_completed`; birthday/profile custom event 없음 | Supabase `profiles.birth_date/gender`, local pet name length only | Naming Completion, Profile Optional Save Rate | profile 질문이 이탈을 만들지는 않는가 |
| Room Activation | 첫 Room 입장 또는 return room | activation terminal point | GA4 `home_enter`; PostHog `home_entered` | pet id, entry_type | Room Activation Rate | 첫 Room 진입 사용자가 재방문하는가 |
| Free Play | 게임 선택/완료/반복 | 핵심 engagement | GA4 `free_play_start/complete`; PostHog `game_started/completed` | game id, difficulty, score, XP | Free Play Participation, Games per User | 어떤 게임이 반복 플레이를 만든가 |
| Care/XP/Level | feed/shower/play/talk 등 care action | 관계/성장 engagement | GA4 `pet_action`, `xp_earned`, `level_up`; PostHog `care_action_completed`, `level_up` | pet care state, XP/intimacy exp | Care Actions/User, Level-up Rate | 의미 있는 care action이 retention과 관련 있는가 |
| Missions/Achievements | mission/achievement view/claim/unlock | goal loop 작동 여부 | GA4 mission/achievement events; PostHog claim/unlock events | `daily_missions`, `achievements`, `activity_counters` | Claim Rate, Unlock-to-Claim Rate | 보상 loop가 재방문을 만든가 |
| Ranking | global/friend ranking view | competition feature usage | GA4 `ranking_view`, `friend_ranking_viewed`; PostHog `friend_ranking_viewed` | ranking RPC, `player_skill_records`, `xp_totals` | Ranking View Rate | ranking 사용자가 더 자주 플레이하는가 |
| Share | share modal, web share, PNG save | virality/share intent | GA4 `share_click/success/fail`; PostHog `share_started/completed` | share context, action/channel, UTM URL | Share Start/Success Rate | reveal share와 my page share quality가 다른가 |
| Friend Invite | invite link open and connect | social loop conversion | GA4/PostHog `friend_invite_opened`, `friend_connected` | `profiles.friend_code`, `friendships`, invite URL `ref` | Invite Open to Connection | 초대 수락 후 engagement가 증가하는가 |
| Return Visit | 기존 pet으로 Room 재진입 | retention | PostHog `home_entered{entry_type:'returning'}`, GA4/PostHog pageview, Supabase/local activity | local pet, Supabase snapshots, attendance | D1/D7/D30 Return | 무엇이 재방문을 예측하는가 |

---

## 2. North Star Metric 후보

### 후보 A: Activated Relationship Days

| 항목 | 내용 |
|---|---|
| 정의 | 특정 날짜에 Room에 재진입하고, Free Play 완료 또는 care action 완료 또는 mission/achievement claim 중 하나 이상을 수행한 사용자 수 |
| 계산 | distinct users where `home_entered` and (`game_completed{mode:'free_play'}` or `care_action_completed` or `daily_mission_claimed` or `achievement_claimed`) on same day |
| 장점 | Statling의 핵심 가치인 "관계 형성과 반복 상호작용"을 단순 방문보다 잘 반영한다. |
| 한계 | PostHog 식별 전 guest는 anonymous distinct_id로 잡히며, GA4와 합치려면 identity stitching 기준이 필요하다. |
| 현재 계산 가능성 | PostHog 기준 대부분 가능. 단, Room 재진입과 action의 같은 사용자 연결은 PostHog identity/anonymous id에 의존한다. |

### 후보 B: Weekly Meaningful Statling Sessions

| 항목 | 내용 |
|---|---|
| 정의 | 주간 단위로 Room 진입 후 의미 있는 action을 2회 이상 수행한 사용자 수 |
| 계산 | weekly distinct users with count(`game_completed free_play` + `care_action_completed` + claim events) >= 2 |
| 장점 | 반복성을 반영하고, 단발 reveal/share보다 제품 habit에 가깝다. |
| 한계 | "2회" threshold는 제품 데이터가 쌓인 뒤 조정해야 한다. |
| 현재 계산 가능성 | PostHog event 기반 가능. Supabase `activity_counters`, `player_skill_records`, `xp_totals`로 보조 검증 가능. |

### 후보 C: First-Day Discovery to Room Completion Rate

| 항목 | 내용 |
|---|---|
| 정의 | 랜딩 방문자 중 같은 세션/첫날에 assessment complete, reveal, naming, Room entry까지 도달한 비율 |
| 계산 | `page_view/$pageview` -> `assessment_started` -> `assessment_completed` -> `statling_revealed` -> `naming_completed` -> `home_entered{first_time}` |
| 장점 | early activation funnel quality를 매우 직접적으로 보여준다. |
| 한계 | 반복 가치보다는 activation만 본다. North Star보다는 leading indicator 성격이 강하다. |
| 현재 계산 가능성 | PostHog funnel로 가능. GA4도 일부 가능하지만 naming/home_entered는 PostHog 중심이다. |

### 후보 D: Socially Engaged Active Users

| 항목 | 내용 |
|---|---|
| 정의 | 주간 active user 중 share, friend connection, friend ranking 중 하나 이상을 수행한 사용자 수/비율 |
| 계산 | weekly users with `share_started` or `friend_connected` or `friend_ranking_viewed` |
| 장점 | 친구/공유 loop가 제품 성장에 기여하는지 보기 좋다. |
| 한계 | Statling의 전체 core value보다 social feature adoption에 치우친다. |
| 현재 계산 가능성 | 현재 이벤트로 가능. invite sent와 invite open의 발신자-수신자 연결은 제한적이다. |

**Primary 추천**: `Activated Relationship Days`

이유: 단순 방문이 아니라 Room과 의미 있는 상호작용을 함께 요구한다. Statling의 제품 가치는 "능력 발견"에서 끝나지 않고, Statling을 키우고 다시 만나고 행동하는 데 있으므로 North Star로 가장 적합하다. 현재 코드 기준으로 PostHog 이벤트만으로도 초안 계산이 가능하고, Supabase의 `player_skill_records`, `xp_totals`, `achievements`, `daily_missions`, `activity_counters`가 사후 검증 source가 된다.

---

## 3. KPI Framework

### Acquisition

| KPI | 정의 | Numerator | Denominator | 필요 데이터 | 현재 계산 |
|---|---|---|---|---|---|
| Visitors | 방문 사용자/세션 | GA4 users/sessions, PostHog distinct `$pageview` | n/a | GA4 page_view, PostHog `$pageview` | 가능 |
| UTM Traffic Mix | source/medium/campaign 비중 | UTM별 sessions | 전체 sessions | URL query, GA4 acquisition, PostHog `$current_url` | 가능 |
| New Visitor Rate | 신규 방문 비율 | new users | total users | GA4 user acquisition | 가능, GA4 중심 |
| Landing Variant Exposure | A/B 노출 분포 | variant별 `landing_experiment_viewed` | total eligible exposure | PostHog event, local variant | 가능 |

### Activation

| KPI | 정의 | Numerator | Denominator | 필요 데이터 | 현재 계산 |
|---|---|---|---|---|---|
| Assessment Start Rate | 랜딩 방문 후 assessment 시작 | `assessment_started` | eligible `$pageview` or landing exposure | PostHog, GA4 | 가능 |
| Assessment Completion Rate | 시작자 중 완료 | `assessment_completed` | `assessment_started` | PostHog | 가능 |
| Reveal Reach Rate | 시작자/완료자 중 reveal 도달 | `statling_revealed` | `assessment_started` 또는 `assessment_completed` | GA4/PostHog | 가능 |
| Statling Confirmation Proxy | reveal 후 naming 완료 | `naming_completed` | `statling_revealed` | PostHog | 가능 |
| Room Activation Rate | first Room 진입 | `home_entered{first_time}` | `assessment_started` | PostHog | 가능 |
| Auth Conversion Rate | signup/login 선택 | GA4 `sign_up`/`login` | save screen 도달자 | GA4 + gap | 부분 가능, save screen impression 없음 |

### Engagement

| KPI | 정의 | Numerator | Denominator | 필요 데이터 | 현재 계산 |
|---|---|---|---|---|---|
| Free Play Participation | Room user 중 free play 시작/완료 | `game_started{mode:'free_play'}` or `game_completed` | `home_entered` users | PostHog | 가능 |
| Games per Active User | active user당 완료 게임 수 | count `game_completed` | active users | PostHog | 가능 |
| Difficulty Progression | normal/hard/expert 이용 분포 | difficulty별 game events | free play users | PostHog, `player_skill_records` | 가능 |
| XP Accumulation | XP 획득량/누적 | `free_play_complete.xp_earned`, `xp_totals` | active users | GA4, Supabase | 가능 |
| Ranking Engagement | ranking view users | `ranking_view`, `friend_ranking_viewed` | active users | GA4/PostHog | 부분 가능, global ranking은 GA4만 |
| Mission Engagement | mission view/claim | mission events | active users | GA4/PostHog, Supabase | 가능 |
| Achievement Engagement | unlock/claim/view | achievement events | active users | GA4/PostHog, Supabase | 가능 |
| Pet Care Interaction | care action 완료 | `care_action_completed` | Room users | PostHog | 가능 |

### Retention

| KPI | 정의 | Numerator | Denominator | 필요 데이터 | 현재 계산 |
|---|---|---|---|---|---|
| D1 Room Retention | 첫 Room 다음날 Room 재진입 | users with `home_entered{returning}` D+1 | first `home_entered{first_time}` cohort | PostHog | 가능 |
| D7/D30 Room Retention | 7/30일 후 Room 재진입 | returning home events | first Room cohort | PostHog | 가능 |
| Repeat Free Play Rate | 첫 free play 후 재완료 | later `game_completed{free_play}` | first free play users | PostHog | 가능 |
| Meaningful Interaction Retention | 재방문일에 game/care/claim 수행 | meaningful action users | first Room cohort | PostHog | 가능 |
| Supabase Activity Retention Proxy | 서버 row updated/attendance | updated rows/attendance | account users | Supabase | 부분 가능, guest 제외 |

### Social / Virality

| KPI | 정의 | Numerator | Denominator | 필요 데이터 | 현재 계산 |
|---|---|---|---|---|---|
| Share Start Rate | share 시작 | `share_started` | reveal or my page users | PostHog | 가능 |
| Share Completion Rate | share 성공 | `share_completed` | `share_started` | PostHog | 가능 |
| Friend Invite Open Rate | valid ref invite page open | `friend_invite_opened` | invite shares | GA4/PostHog | 부분 가능, invite share sent와 recipient open 연결 gap |
| Friend Connection Conversion | invite open 후 connection | `friend_connected` | `friend_invite_opened` | GA4/PostHog | 가능, 발신자 attribution 제한 |
| Friend Ranking Usage | 친구 ranking view | `friend_ranking_viewed` | connected users | GA4/PostHog + Supabase `friendships` | 가능 |

### Experimentation

| KPI | 정의 | Numerator | Denominator | 필요 데이터 | 현재 계산 |
|---|---|---|---|---|---|
| Variant Assignment Balance | A/B 50:50 확인 | variant count | total `landing_experiment_viewed` | PostHog | 가능 |
| Variant Start Rate | variant별 assessment start | `assessment_started` | `landing_experiment_viewed` by variant | PostHog | 가능 |
| Variant Activation Rate | variant별 first Room | `home_entered{first_time}` | `landing_experiment_viewed` | PostHog | 가능 |
| Variant Share/Friend Lift | variant별 social action | share/friend events | variant cohort | PostHog | 가능, identity/cohort 설정 필요 |

---

## 4. Funnel Definition

### Funnel A: Core Activation

| Step | 현재 이벤트 | Platform | Measurement Gap |
|---|---|---|---|
| Landing | GA4 `page_view`, PostHog `$pageview`, `landing_experiment_viewed` | GA4/PostHog | ineligible landing/resume state는 experiment event 없음 |
| Assessment Start | `assessment_start`, `assessment_started` | GA4/PostHog | 없음 |
| Assessment Complete | `assessment_complete`, `assessment_completed` | GA4/PostHog | 없음 |
| Reveal | `statling_reveal`, `statling_revealed` | GA4/PostHog | 없음 |
| Statling Confirm | `egg_hatch_start`, `naming_completed` | GA4/PostHog | "confirm click" 자체의 PostHog event는 없고 naming 완료가 강한 proxy |
| Room | `home_enter`, `home_entered{first_time}` | GA4/PostHog | birthday/profile screen impression 없음 |

### Funnel B: Game Engagement

| Step | 현재 이벤트 | Platform | Measurement Gap |
|---|---|---|---|
| Room | `home_entered` | PostHog | GA4 returning room event 없음 |
| Free Play 선택 | `free_play_start`, `game_started{mode:'free_play'}` | GA4/PostHog | free play menu impression 없음 |
| Game Start | `game_started` | PostHog | 있음 |
| Game Complete | `free_play_complete`, `game_completed` | GA4/PostHog | invalid/abandoned attempt 이벤트 없음 |
| Repeat Game | repeated `game_completed` | PostHog | explicit repeat CTA event 없음 |

### Funnel C: Social

| Step | 현재 이벤트 | Platform | Measurement Gap |
|---|---|---|---|
| Share/Friend Invite | `share_started`, `share_completed`; friend invite URL 생성 자체 event 없음 | GA4/PostHog | friend invite sent/generated event 없음 |
| Invite Open | `friend_invite_opened` only when ref resolves | GA4/PostHog | invalid ref opens 별도 이벤트 없음 |
| Login | GA4 `login`, `sign_up`; PostHog identify side effect | GA4/PostHog | OAuth method별 GA event 확인 제한 |
| Friend Connection | `friend_connected` gated by `isNewConnection` | GA4/PostHog | failed connection reason event 없음 |
| Friend Ranking | `friend_ranking_viewed` | GA4/PostHog | connected user denominator는 Supabase 필요 |

### Funnel D: Retention

| Step | 현재 이벤트 | Platform | Measurement Gap |
|---|---|---|---|
| First Room Entry | `home_entered{first_time}` | PostHog | 없음 |
| Return Visit | `home_entered{returning}`, pageview | PostHog/GA4 | restored vs same-device returning 구분 없음 |
| Free Play | `game_completed{mode:'free_play'}` | PostHog | 없음 |
| Repeat Visit | repeated returning `home_entered` | PostHog | calendar-day retention 기준은 dashboard에서 정의 필요 |

---

## 5. Analytics Event Catalog

현재 타입 정의 기준 GA4 custom event는 42개, PostHog product event는 21개다. 동일한 이름으로 양쪽 모두 있는 이벤트는 4개이고, 이름은 다르지만 같은 measurement point에 인접해서 발화되는 paired event가 별도로 있다.

### GA4 Events

| Event | Trigger | Properties | Funnel Stage | Purpose |
|---|---|---|---|---|
| `assessment_start` | intro 시작 | `release_stage` | Activation | assessment 시작 |
| `mini_game_start` | assessment game 시작/재시도 | ability, game_name, game_index, attempt | Activation | assessment game start |
| `mini_game_complete` | assessment valid completion | ability, game_name, game_index, attempt, score | Activation | assessment game complete |
| `mini_game_retry` | assessment retry | ability, game_name, game_index, previous_score | Activation | retry intent |
| `assessment_complete` | 6번째 result 이후 | top_ability, second_ability | Activation | assessment 완료 |
| `egg_hatch_start` | confirm 후 egg phase | top_ability, second_ability | Activation | Statling 확정 proxy |
| `statling_reveal` | reveal screen mount | statling_type, top_ability, second_ability | Activation/Share | reveal 도달 |
| `home_enter` | 첫 Room 진입 | statling_type | Activation | first home entry |
| `free_play_start` | free play 시작 | game_name, ability, difficulty | Engagement | game start |
| `free_play_complete` | free play 완료 | game_name, ability, difficulty, score, xp_earned | Engagement | game outcome |
| `pet_action` | care action button tap | action_type | Engagement | care intent |
| `collection_view` | Dex 보기 | none | Engagement | collection entry |
| `collection_statling_view` | Dex pet tap | statling_type, is_unlocked | Engagement | collection detail interest |
| `customization_open` | room/statling customize mount | customization_type | Engagement | decoration editor entry |
| `customization_apply` | item/background apply | customization_type, item_id, item_type | Engagement | item trial |
| `customization_remove` | item remove | customization_type, item_id, item_type | Engagement | item removal |
| `customization_save` | decoration save | customization_type, item_count | Engagement | decoration commit |
| `xp_earned` | pet-care intimacy EXP gain | xp_amount, xp_source | Engagement | care EXP |
| `level_up` | intimacy level up | previous_level, new_level | Engagement | growth |
| `level_reward_received` | level gift receive | level, reward_type, item_id | Engagement | reward |
| `ranking_view` | ranking tab view/change | ranking_type, period | Engagement | ranking interest |
| `daily_mission_view` | mission tab | none | Engagement | mission view |
| `daily_mission_complete` | mission claim success | mission_id, mission_type, reward_type, reward_amount | Engagement | mission reward |
| `achievement_view` | achievement tab | none | Engagement | achievement view |
| `achievement_unlock` | newly unlocked tier | achievement_id, achievement_type | Engagement | achievement moment |
| `achievement_reward_claim` | achievement claim success | achievement_id, achievement_type, reward_type, reward_amount, optional room_reward_id | Engagement | reward claim |
| `share_click` | share/save click | action_type, share_context | Social | share intent |
| `share_success` | share/save success or copied/downloaded | action_type, share_context | Social | share success |
| `share_fail` | share/save failure | action_type, share_context, error_type | Social | share failure |
| `feedback_open` | feedback form open | feedback_context | Feedback | feedback intent |
| `feedback_submit` | feedback submit success | feedback_context, rating, satisfaction_reason, reuse_intent | Feedback | qualitative signal |
| `feedback_fail` | feedback submit failure | feedback_context, error_type | Feedback | failure |
| `sign_up` | password signup success | method | Auth | signup |
| `login` | password login success | method | Auth | login |
| `logout` | sign out | none | Auth | logout |
| `audio_setting_change` | SFX/BGM toggle | audio_type, enabled | Preference | audio setting |
| `bgm_play_mode_change` | BGM mode change | play_mode | Preference | music preference |
| `bgm_track_change` | BGM track selection | track_id | Preference | music preference |
| `my_status_view` | status screen view | view_context | Engagement | status interest |
| `friend_invite_opened` | valid invite ref preview ready | pet_id | Social | invite open |
| `friend_connected` | genuinely new friendship | source | Social | connection conversion |
| `friend_ranking_viewed` | friend ranking scope selected | ranking_type, optional game_id/difficulty | Social/Engagement | friend ranking usage |

### PostHog Events

| Event | Trigger | Properties | Funnel Stage | Purpose |
|---|---|---|---|---|
| `assessment_started` | intro 시작 | entry_source, auth_state | Activation | start source/auth split |
| `assessment_completed` | 6번째 result 이후 | completed_games, duration_ms, top_stat, second_stat | Activation | completion and duration |
| `statling_revealed` | reveal mount | character_id, top_stat, second_stat | Activation | reveal |
| `auth_choice_made` | save screen skip | choice | Activation/Auth | guest choice |
| `naming_completed` | naming confirm | name_length | Activation | naming completion without name string |
| `home_entered` | first/returning Room entry | entry_type | Activation/Retention | room activation/return |
| `game_started` | assessment/free play game start | game_id, difficulty, mode | Activation/Engagement | unified game start |
| `game_completed` | valid game completion | game_id, difficulty, mode, normalized_score, completion_result | Activation/Engagement | unified game result |
| `care_action_completed` | non-idle care action result | action | Engagement | meaningful care action |
| `level_up` | level up | level | Engagement | growth |
| `achievement_unlocked` | new achievement tier | achievement_id, achievement_type | Engagement | achievement |
| `achievement_claimed` | achievement reward claim | achievement_id, reward_type, xp_reward | Engagement | claim |
| `daily_mission_claimed` | daily mission claim | mission_id, reward_type, xp_reward | Engagement | mission claim |
| `room_saved` | room decoration save | item_count | Engagement | room customization commit |
| `decoration_saved` | Statling decoration save | item_count | Engagement | character customization commit |
| `share_started` | share/save click | channel, share_context | Social | share intent |
| `share_completed` | share/save success | channel, share_context | Social | share success |
| `landing_experiment_viewed` | eligible landing mount | variant | Experiment | A/B exposure |
| `friend_invite_opened` | valid invite ref preview ready | pet_id | Social | invite open |
| `friend_connected` | genuinely new friendship | source | Social | connection |
| `friend_ranking_viewed` | friend ranking scope selected | ranking_type, optional game_id/difficulty | Social/Engagement | friend ranking |

### 공통/단독 구분

| 구분 | 이벤트 |
|---|---|
| 양쪽 동일 이름 | `friend_invite_opened`, `friend_connected`, `friend_ranking_viewed`, `level_up` |
| 양쪽 paired measurement point | assessment start/complete, game start/complete, reveal, home entry, achievement unlock/claim, daily mission claim, customization save, share start/complete |
| GA4 only | acquisition/traffic 성격, detailed UI/customization/audio/feedback/auth, global ranking view |
| PostHog only | landing experiment exposure, naming completion, auth skip choice, meaningful care action completed, unified product game events |

### PII / 민감정보 확인

| 값 | custom event payload 포함 여부 | 비고 |
|---|---|---|
| `birth_date` | 없음 | birthday/profile save code에 analytics call 없음 |
| `gender` | 없음 | 동일 |
| nickname/name string | 없음 | Statling 이름은 `name_length`만 전송 |
| friend_code/ref | custom payload 없음 | invite URL query에는 존재 |
| raw user UUID | GA4 custom payload 없음; PostHog identify는 Supabase user id | PostHog distinct_id로 user id 사용, email은 안 보냄 |
| email/password/feedback text | custom payload 없음 | PostHog session recording `maskAllInputs: true` |

---

## 6. GA4 vs PostHog 역할

### 현재 구현

| Platform | 현재 역할 | 근거 |
|---|---|---|
| GA4 | page_view, acquisition, UTM/channel, broad custom events | `components/analytics/google-analytics.tsx`, `lib/analytics/ga.ts` |
| PostHog | product behavior, funnel, retention, experiment exposure, manual SPA pageview | `lib/analytics/posthog.ts`, `components/analytics/posthog-analytics.tsx`, `lib/analytics/analytics.ts` |
| Supabase | product DB/source of truth, account-linked records, ranking/friend graph | migrations, `lib/migration/*`, `lib/ranking/*`, `lib/friends/*` |

GA4는 `gtag('config')`의 자동 page_view를 사용한다. PostHog는 `capture_pageview: false`이고 `PostHogPageview`가 route/path/query 변화마다 `$pageview`를 수동 전송한다. App 내부의 Landing -> Game -> Reveal -> Room 전환은 URL route change가 아니라 React state change이므로 custom event가 funnel의 실질 측정 단위다.

### 향후 권장 역할

| Platform | 권장 역할 |
|---|---|
| GA4 | 유입 채널, 캠페인, SEO/share landing traffic, top-level conversion trend |
| PostHog | event-level funnel, cohort retention, A/B experiment breakdown, feature adoption |
| Supabase | verified product state, account-level joins, data quality reconciliation, ranking/friend denominator |

GA4와 PostHog를 억지로 같은 taxonomy로 만들 필요는 없다. 현재 코드도 일부 이벤트는 서로 다른 이름/shape로 보낸다. 다만 핵심 funnel 단계는 mapping table을 유지해야 한다.

---

## 7. Retention Definition

Statling의 retention은 단순 page revisit보다 Room과 의미 있는 상호작용 중심으로 정의하는 편이 적합하다.

| Retention 종류 | 정의 | 현재 계산 |
|---|---|---|
| App Revisit | 첫 방문 후 D1/D7/D30에 `$pageview` 또는 GA4 page_view 발생 | 가능, 가장 넓은 정의 |
| Room Revisit | first `home_entered{first_time}` 후 D1/D7/D30에 `home_entered{returning}` | 가능, 추천 기본 retention |
| Free Play Revisit | 첫 free play 완료 후 D1/D7/D30에 `game_completed{mode:'free_play'}` | 가능 |
| Meaningful Interaction Retention | Room revisit일에 free play/care/claim 중 하나 수행 | 가능, North Star 후보와 연결 |
| XP Earning Retention | 재방문일에 XP 관련 event 또는 `xp_totals` 증가 | 부분 가능, GA4/PostHog/Supabase 조합 필요 |
| Pet Interaction Retention | 재방문일에 `care_action_completed` 수행 | 가능 |

추천 정의:

| 기간 | 추천 기준 |
|---|---|
| D1 | first Room entry 다음 calendar day에 `home_entered{returning}` |
| D7 | first Room cohort 중 7일 이내 또는 7일차 window에 Room revisit |
| D30 | first Room cohort 중 30일 이내 또는 30일차 window에 Room revisit |

Dashboard에서는 "strict D7"과 "rolling 7-day return"을 분리하는 것이 좋다. 초기 제품에서는 rolling retention이 표본 부족에 덜 민감하다.

---

## 8. Segmentation Plan

| Segment | 기준 | 현재 가능성 | 주의 |
|---|---|---|---|
| new / returning | first `$pageview`, `home_entered` entry_type | 가능 | GA4와 PostHog 기준 다를 수 있음 |
| guest / authenticated | `assessment_started.auth_state`, PostHog identify 여부 | 가능 | identify 전 guest 행동 stitching 주의 |
| acquisition source | UTM/source/medium/campaign | 가능 | App internal state transition에는 UTM property 직접 중복 없음 |
| Landing experiment variant | `landing_experiment_viewed.variant` | 가능 | eligible visitor만 포함 |
| Statling type | `statling_revealed.character_id`, GA `statling_type` | 가능 | internal catalog id |
| dominant ability | top_stat/top_ability | 가능 | assessment completion 이후만 가능 |
| game preference | repeated `game_completed.game_id` | 가능 | assessment/free_play mode 분리 필요 |
| difficulty progression | `difficulty` in free play events | 가능 | assessment는 normal |
| friend user / non-friend user | `friend_connected`, Supabase `friendships` | 가능 | Supabase join 필요 |
| sharer / non-sharer | `share_started/completed` | 가능 | share success와 actual inbound traffic은 별도 |
| retention cohort | first Room date / first game date | 가능 | cohort anchor 명확히 해야 함 |
| birth_date / gender | Supabase optional fields | 가능하지만 신중 | missing-value bias, consent/context, 민감정보 최소화 필요 |

`birth_date`와 `gender`는 optional이고 guest에게는 수집되지 않는다. 따라서 이 값으로 세그먼트를 만들면 "답변한 사람"과 "답변하지 않은 사람"의 선택 편향이 크다. 분석 목적이 명확하고 privacy review가 된 경우에만 aggregate 수준으로 사용해야 한다.

---

## 9. User Analysis Questions

| Priority | 질문 | 필요 데이터 | 현재 가능 |
|---|---|---|---|
| P0 | 어떤 유입원/variant가 assessment start rate를 높이는가 | UTM, `landing_experiment_viewed`, `assessment_started` | 가능 |
| P0 | assessment 시작자 중 어디서 가장 많이 이탈하는가 | `game_started/completed`, `assessment_completed` | 가능 |
| P0 | Reveal까지 도달한 사용자는 실제로 naming/Room까지 가는가 | `statling_revealed`, `naming_completed`, `home_entered` | 가능 |
| P0 | 첫날 Free Play 완료가 D1 Room retention과 관련 있는가 | `game_completed`, `home_entered` cohort | 가능 |
| P0 | care action 완료 사용자가 비사용자보다 재방문하는가 | `care_action_completed`, retention | 가능 |
| P0 | Landing A/B variant에 따라 Room activation rate가 달라지는가 | variant, activation funnel | 가능 |
| P1 | 어떤 mini game이 반복 플레이를 가장 많이 만든가 | `game_completed.game_id`, repeat count | 가능 |
| P1 | difficulty progression이 retention과 관련 있는가 | difficulty, retention cohort | 가능 |
| P1 | XP accumulation이 ranking usage로 이어지는가 | `free_play_complete.xp_earned`, `ranking_view`, `xp_totals` | 가능 |
| P1 | ranking을 본 사용자가 이후 free play를 더 많이 하는가 | `ranking_view`, `game_completed` | 가능 |
| P1 | mission/achievement claim이 다음날 재방문과 관련 있는가 | claim events, retention | 가능 |
| P1 | share_started와 share_completed 사이 이탈/실패는 어느 channel에서 큰가 | share events | 가능 |
| P1 | friend invite open 후 connection conversion은 어느 source에서 높은가 | invite/connection events | 부분 가능 |
| P1 | friend connection 이후 friend ranking 사용률이 증가하는가 | `friend_connected`, `friend_ranking_viewed` | 가능 |
| P2 | audio/customization 설정 변경 사용자는 engagement가 높은가 | GA4 preference/customization events | 가능 |
| P2 | Dex viewed users가 collection completion에 더 가까운가 | collection events, `dex_entries` | 가능 |
| P2 | feedback rating/reuse intent와 실제 retention이 일치하는가 | feedback events, retention | 가능 |
| P2 | optional profile 응답 여부가 engagement와 관련 있는가 | Supabase profiles + events | 가능하지만 privacy/bias 주의 |

---

## 10. Measurement Gaps

| Gap | 보고 싶은 것 | 현재 왜 정확히 못 재는가 | 필요한 event/property/data | 추가 가치 | Priority |
|---|---|---|---|---|---|
| Save screen impression | 저장/가입 선택 화면 도달 대비 signup/skip | skip과 signup/login은 있지만 화면 impression event 없음 | `save_screen_viewed` | auth conversion denominator 정교화 | P0 |
| Friend invite generated/sent | 발신자가 invite를 만들고 공유했는지 | `friend_invite_opened`는 수신자가 valid ref를 연 시점 | `friend_invite_created` or share context friend_invite | invite -> open attribution | P0 |
| Invalid invite open | 잘못된/만료/미지 ref traffic | preview 성공 시에만 opened event | `friend_invite_invalid_opened` | 링크 품질/남용 감지 | P1 |
| Connection failure reason | connect 실패 원인 | 실패 시 custom analytics 없음 | failure event with reason category | conversion debugging | P1 |
| Game abandonment | game start 후 complete 전 이탈 | start/complete만 있음 | `game_abandoned` or duration heartbeat | game difficulty/UX 개선 | P1 |
| Free play menu impression | Room user 중 game menu 노출 | start만 있고 menu view 없음 | `free_play_viewed` | participation denominator | P1 |
| Birthday/profile screen impact | birthday/profile beat의 이탈/저장률 | profile save event/impression 없음 | `profile_onboarding_viewed/saved/skipped` | PII 수집 UX 평가 | P1 |
| Global ranking PostHog event | product funnel에서 global ranking usage | GA4 `ranking_view`만 있음 | PostHog `ranking_viewed` | retention/cohort 분석 | P1 |
| Restore vs same-device return | returning Room의 원인 구분 | `home_entered{returning}` 하나로 합쳐짐 | `entry_type: restored` 등 | multi-device sync 가치 측정 | P2 |
| Share inbound attribution | 누가 공유했고 누가 들어왔는지 | share URL UTM은 있으나 발신자 id/token 없음 | privacy-safe share instance id | virality coefficient | P2 |

이번 작업에서는 gap을 메우는 코드를 추가하지 않았다.

---

## 11. Dashboard Plan

| Page | Charts / KPI |
|---|---|
| Executive Overview | North Star, DAU/WAU, Room Activation, D1/D7 retention, Free Play users, Share/Friend conversion |
| Acquisition | Sessions/users by source/medium/campaign, landing page traffic, variant exposure balance, source -> assessment start |
| Activation Funnel | Landing -> assessment start -> complete -> reveal -> naming -> Room, drop-off by variant/auth_state/top_stat |
| Engagement | active users, games/user, care actions/user, XP earned, level-up rate, mission/achievement claim |
| Retention | D1/D7/D30 cohort table, Room retention vs meaningful interaction retention, first-day action cohort comparison |
| Mini Game Performance | starts/completes by game_id/difficulty, completion rate, score distribution, repeat rate |
| Social / Friend | share start/completion, invite opened, connection conversion, friend ranking usage, connected vs non-connected engagement |
| Experiment | A/B exposure, start/activation/retention/share metrics by variant, guardrail metrics such as duration and failure |

GA4 dashboard는 Acquisition과 top-level trend에 두고, PostHog는 funnel/cohort/feature adoption에 둔다. Tableau나 별도 BI를 쓰는 경우 Supabase product tables를 join해 account-level verified metrics를 보강한다.

---

## 12. Data Analyst Portfolio Story

| 단계 | 설명 |
|---|---|
| Problem | Statling은 단순 테스트 앱이 아니라, 사용자가 자기 능력을 발견하고 Statling과 반복 관계를 만드는 제품이다. 그래서 방문 수보다 activation, meaningful interaction, retention을 봐야 한다. |
| Measurement Design | user journey를 Acquisition -> Activation -> Engagement -> Retention -> Social로 나누고, GA4/PostHog/Supabase의 역할을 분리했다. |
| Data Collection | 현재 구현은 GA4 42개 custom event, PostHog 21개 product event, Supabase product tables/RPC를 사용한다. sensitive profile fields와 friend_code는 custom event payload에 넣지 않는다. |
| User Behavior Analysis | 먼저 funnel drop-off, first-day free play와 D1 retention, landing variant lift, friend connection 후 engagement 변화를 검증한다. |
| Insight | 실제 데이터가 쌓이면 "어떤 첫날 행동이 재방문을 예측하는가"를 중심으로 feature priority를 조정한다. |
| Product Improvement | 예를 들어 특정 mini game에서 abandonment가 높으면 난이도/설명을 개선하고, friend invite open 대비 connection이 낮으면 auth/accept flow를 줄인다. |
| Re-measurement | 개선 전후 동일 funnel/KPI를 비교하고, PostHog cohort와 Supabase verified state로 event-only 해석을 검증한다. |

아직 실제 사용자 데이터가 없으므로 "성과가 있었다"고 말하지 않는다. 이 문서는 향후 검증할 hypothesis와 측정 체계를 보여주는 포트폴리오 산출물이다.

---

## 13. 조사 요약

| 항목 | 결과 |
|---|---:|
| 조사한 analytics 주요 파일/영역 | 18 |
| GA4 custom event | 42 |
| PostHog product event | 21 |
| 동일 이름으로 양쪽 공통 event | 4 |
| 이름은 다르지만 같은 measurement point에 매핑되는 주요 paired event group | 12 |
| 정의한 funnel | 4 |
| 정의한 KPI | 31 |
| North Star Metric 후보 | 4 |
| 최종 추천 North Star Metric | Activated Relationship Days |
| Measurement Gap | 10 |
| P0/P1/P2 분석 질문 | 18 |
| Dashboard page | 8 |

조사한 주요 파일:

- `lib/analytics/ga.ts`
- `lib/analytics/analytics.ts`
- `lib/analytics/posthog.ts`
- `components/analytics/google-analytics.tsx`
- `components/analytics/posthog-analytics.tsx`
- `components/analytics/posthog-identify.tsx`
- `components/brain-bet/game-flow.tsx`
- `components/brain-bet/screens/landing-experiment.tsx`
- `components/brain-bet/screens/reveal-screen.tsx`
- `components/brain-bet/screens/save-screen.tsx`
- `components/brain-bet/auth/auth-form.tsx`
- `components/brain-bet/screens/room-screen.tsx`
- `components/brain-bet/screens/ranking-screen.tsx`
- `components/brain-bet/screens/mission-screen.tsx`
- `lib/missions/mission-tracker.ts`
- `lib/share/use-share-preview.ts`
- `components/share/friend-invite-cta.tsx`
- Supabase 관련 데이터 구조: `docs/DATA_ARCHITECTURE.md` 및 `lib/ranking/*`, `lib/friends/*`, migration 기반 schema

Privacy 관련 발견:

- `birth_date`, `gender`는 custom analytics event로 전송되는 경로가 확인되지 않았다.
- Statling 이름/nickname string은 custom event payload로 보내지 않고, naming은 length만 보낸다.
- `friend_code`는 custom event payload에 없다. 다만 invite URL의 `ref` query는 자동 pageview URL 수집에 포함될 수 있다.
- PostHog identify는 Supabase `user.id`를 distinct id로 쓰며 email은 보내지 않는다.
- PostHog session recording은 `maskAllInputs: true`로 input value를 마스킹한다.

코드와 기존 문서가 어긋나거나 주의가 필요한 부분:

- GA4와 PostHog 이벤트는 1:1 rename 구조가 아니다. 같은 행동도 서로 다른 이름/shape로 보내는 경우가 있다.
- App 내부 screen 전환은 route pageview가 아니므로, funnel은 pageview가 아니라 custom event 중심으로 봐야 한다.
- global ranking은 GA4 `ranking_view`가 있으나 PostHog counterpart는 현재 없다. friend ranking은 양쪽 모두 있다.
- friend invite "생성/발신" 이벤트는 현재 없다. 현재 이벤트는 valid invite ref가 열린 시점과 실제 connection 시점이다.

생성 파일: `docs/ANALYTICS_MEASUREMENT_PLAN.md`
