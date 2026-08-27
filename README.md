# Statling

6개의 짧은 미니게임으로 사용자의 인지 능력을 측정하고, 그 결과로 만들어진 나만의 캐릭터 "Statling"을 키워나가는 웹 서비스입니다. 게임 개발 자체가 목표가 아니라, **직접 설계·구현·배포한 서비스에서 실제 사용자 행동 데이터를 수집하고 이를 기반으로 서비스를 개선하는 과정**을 보여주기 위한 Data Analyst 포트폴리오 프로젝트입니다.

이 프로젝트는 GA4 / PostHog / Supabase를 함께 사용해 유입부터 리텐션, 소셜 기능 사용까지 측정할 수 있는 구조를 설계하고 실제 코드로 구현했습니다.

---

## 1. Project Overview

Statling은 방문자가 6가지 미니게임(순발력·기억력·집중력·판단력·공간감각·추리력)을 플레이해 자신의 능력치를 발견하고, 그 결과에 따라 30종의 고정 캐릭터 중 하나와 결정론적으로 매칭되어 자신만의 Statling을 얻는 서비스입니다.

Statling을 얻은 이후에는 Room에서 매일 돌봐주고, 원하는 게임을 자유롭게 다시 플레이해 XP와 능력치를 성장시키며, 랭킹·친구·도감·공유 기능을 통해 다시 찾아올 이유를 만드는 구조로 이어집니다.

동시에 이 프로젝트는 **GA4 + PostHog + Supabase를 함께 설계한 측정 체계**를 갖추고 있으며, 실제 사용자 행동 데이터를 기반으로 퍼널·리텐션·기능 사용률을 분석하고 서비스를 개선하는 것을 최종 목표로 합니다.

## 2. Why Statling

Statling은 "능력을 진단하고 끝나는" 일회성 테스트가 아니라, 아래와 같은 반복 가능한 서비스 구조를 갖추고 있습니다.

```
진단(6개 미니게임) → Statling 생성 → 미니게임 자유 플레이 → 성장/XP → 꾸미기/돌봄 → 친구/랭킹 → 재방문
```

일회성 테스트로 끝나지 않고 **성장 루프와 소셜 루프를 함께 설계**했기 때문에, "사용자가 왜 다시 돌아오는가"를 측정할 수 있는 실제 제품 데이터가 만들어집니다. 이 구조 자체가 Acquisition-Activation-Engagement-Retention-Social 전 구간을 측정하는 근거가 됩니다.

## 3. Core User Flow

```
Landing (A/B 실험)
  → Initial Assessment (6개 미니게임, Normal 난이도 고정)
  → Statling 생성 (능력 상위 2개 조합으로 30종 캐릭터 중 결정론적 매칭)
  → Naming → (로그인 사용자만) 생일/선택 프로필 입력
  → Room (최초 진입점)
      ├─ Free Play (12개 게임, 게임별 4단계 난이도)
      ├─ XP / Ability 성장
      ├─ Achievement / Daily Mission / Attendance
      ├─ Statling & Room 꾸미기(Decoration)
      ├─ Ranking (전체 / 친구 범위)
      ├─ Dex (만난 Statling 도감)
      └─ Share / Friend 연결
  → 재방문 (Room 재진입 + 위 활동 반복)
```

로그인/회원가입은 필수가 아니며, 게스트 상태로도 위 흐름을 모두 경험할 수 있습니다. 계정을 만들면 데이터가 Supabase 계정으로 이동해 기기 간 복원이 가능해집니다.

## 4. Core Features

실제 구현되어 있는 기능만 정리했습니다.

- **Initial Assessment**: 6개 능력(순발력/기억력/집중력/판단력/공간감각/추리력)을 진단하는 게임 6종 연속 플레이
- **Free Play**: 능력당 2개씩, 총 12개 게임을 자유롭게 선택해 재도전
- **Difficulty System**: 게임별 Normal → Hard → Extreme 3단계 난이도, 점수 기준 충족 시 다음 난이도 해금
- **Statling 성장 / XP**: Free Play와 Room 활동을 통한 XP 누적, 레벨업에 따른 코스메틱 해금
- **Room / Care / Dialogue**: feed, shower, clean, play, pet, talk 6종 돌봄 액션과 대화 시스템
- **Decoration**: Statling과 Room을 꾸미는 아이템 보유/배치 시스템
- **Achievement / Daily Mission / Attendance**: 업적 달성, 일일 미션, 출석 기록
- **Ranking**: Overall / 게임별 / XP 3종 랭킹, 각각 전체(Global)와 친구(Friends) 범위 토글
- **Friend Connection**: 128비트 랜덤 코드 기반 초대 링크로 상호 동의형 친구 연결, 삭제 지원
- **Dex**: 만난 Statling 캐릭터를 기록하는 도감
- **Share**: 캐릭터 공개/마이페이지에서 공유 이미지 생성 및 OG 메타데이터 기반 공유
- **Authentication / 기기 간 복원**: Google OAuth + 이메일 인증, 게스트 데이터의 계정 이관 및 다중 기기 복원

## 5. Data & Analytics

이 프로젝트의 핵심은 서비스 데이터를 세 계층으로 분리해 설계한 것입니다.

| 계층 | 역할 |
|---|---|
| **Supabase (PostgreSQL)** | 서비스/사용자 상태를 저장하는 persistent data — 계정, Statling, 게임 기록, XP, 미션/업적, 방 꾸미기, 친구 관계 등 |
| **GA4** | 유입(acquisition), 트래픽, 주요 전환 이벤트(assessment 시작/완료, 회원가입, 공유, 친구 연결 등) 측정 |
| **PostHog** | 제품 행동(product behavior) 측정 — 화면/게임 단위 이벤트, 퍼널, 세션 식별(`identify`/`reset`), Landing A/B 실험 노출 |

분석 목적은 다음과 같습니다.

- **Funnel**: Landing → Assessment 시작/완료 → Reveal → Naming → Room 진입까지의 전환율과 이탈 지점
- **Retention**: 첫 Room 진입 이후 D1/D7/D30 재방문
- **Engagement**: Free Play 참여율, 게임당 플레이 수, 돌봄 액션, 미션/업적 참여
- **Game Behavior**: 게임/난이도별 시작·완료율, 점수 분포
- **Social Feature Usage**: 공유 시작/완료율, 친구 초대 열람 대비 연결 전환율, 친구 랭킹 사용률

**중요**: 이 프로젝트는 아직 실제 사용자 트래픽으로부터 분석 결과를 도출한 단계가 아닙니다. 위 항목들은 코드에 실제로 구현되어 있는 "측정 가능한 이벤트/지표 설계"이며, 실제 성과 수치(전환율, 리텐션 개선율 등)는 아직 존재하지 않습니다.

## 6. Data Architecture

Supabase 스키마를 도메인별로 정리하면 다음과 같습니다(20개 테이블, RLS 전 테이블 적용).

```
User
  - profiles                 계정 프로필, nickname, friend_code, birth_date, gender

Statling
  - pets                     확정된 Statling identity, 능력 결과
  - pet_care_state           Statling 돌봄 수치
  - pet_memory               관계/방문/반응 메모리
  - dialogue_memory          대화 질문/답변 메모리

Game / Growth
  - player_skill_records     게임 × 난이도별 최고 기록
  - xp_totals                누적/주간 XP
  - achievements             업적 unlock/claim 상태
  - daily_missions           일일 미션 진행
  - attendance               출석 기록
  - activity_counters        누적 행동 카운터

Social
  - friendships              상호 동의형 친구 연결(양방향 RLS SELECT, 변경은 RPC 전용)
  - dex_entries               만난 Statling 캐릭터 도감

Decoration / Room
  - deco_inventory           Statling 꾸미기 아이템 보유
  - deco_placement_items     Statling 꾸미기 아이템 배치
  - room_inventory           Room 아이템 보유
  - room_items               Room 아이템 배치
  - room_state                Room 배경 등 상태
  - room_care_state          Room 청결 상태

기타
  - user_notes                자유 메모
```

랭킹과 친구 관계는 클라이언트가 직접 집계하지 않고, `SECURITY DEFINER` RPC(예: `get_overall_leaderboard_top`, `get_friend_xp_ranking`, `create_friendship`)를 통해 서버에서 계산·검증됩니다.

## 7. Measurement / DA Workflow

이 프로젝트가 따르는 분석 워크플로우입니다. 아직 수행하지 않은 단계는 완료로 표시하지 않았습니다.

| 단계 | 상태 |
|---|---|
| Problem Definition | 완료 — "단순 진단이 아니라 반복 가능한 관계형 서비스"라는 문제 정의 |
| Measurement Design | 완료 — Acquisition/Activation/Engagement/Retention/Social 구간별 KPI·퍼널 설계 |
| Data Collection | 완료(구조) — GA4/PostHog 커스텀 이벤트, Supabase 테이블에 실제 코드로 구현 |
| Data Quality Validation | 진행 예정 — 실사용 트래픽 기준 이벤트 정합성 검증 필요 |
| KPI / Funnel / Retention Analysis | 진행 예정 — 사용자 데이터 축적 이후 수행 |
| User Behavior Analysis | 진행 예정 |
| Insight | 진행 예정 |
| Service Improvement | 진행 예정 |
| Post-improvement Measurement | 진행 예정 |

즉, 측정 설계와 구현까지는 완료되어 있으나, 실제 데이터 기반 분석·개선 사이클은 아직 시작 전 단계입니다.

## 8. Tech Stack

**Frontend**
- Next.js 16 (App Router, Turbopack)
- TypeScript
- React 19
- Tailwind CSS 4, shadcn 기반 UI 컴포넌트

**Backend & DB**
- Supabase (PostgreSQL, Auth, Row Level Security, RPC)
- Google OAuth + 이메일 인증

**Analytics**
- GA4 (`NEXT_PUBLIC_GA_MEASUREMENT_ID`)
- PostHog (`NEXT_PUBLIC_POSTHOG_KEY`) — product event, session identify

**Deployment**
- Vercel
- Vercel Analytics / Speed Insights

**Development**
- pnpm
- ESLint(설정만 존재)

## 9. Project Structure

```
Brain_Pet/
├─ app/                     # Next.js App Router (라우트 5개: /, /auth/callback, /share/[petId], OG 이미지)
├─ components/
│  └─ brain-bet/
│     ├─ screens/           # Landing, Assessment, Room, Ranking, Mission 등 화면 컴포넌트
│     └─ game-flow.tsx      # 전체 phase 상태 머신을 구동하는 단일 페이지 앱 컨트롤러
├─ lib/
│  ├─ game/                 # 게임 레지스트리, 난이도/점수 설정
│  ├─ pets/                 # Statling 매칭/프로필 로직
│  ├─ ranking/               # 랭킹/XP 계산 및 RPC 호출
│  ├─ friends/               # 친구 연결 로직
│  ├─ migration/, sync/      # 게스트 → 계정 데이터 이관, 기기 간 동기화
│  └─ analytics/             # GA4 / PostHog 이벤트 정의
├─ supabase/
│  └─ migrations/            # 스키마/RLS/RPC migration 이력
└─ docs/                     # 아키텍처, 데이터, 분석, 보안 문서
```

## 10. Current Status

**구현 / Production QA**
- 위에 정리한 핵심 기능(Assessment, Free Play, Room, Ranking, Friend, Dex, Share 등)은 프로덕션 코드로 구현되어 있습니다.
- 자동화 테스트 스위트와 CI/CD 파이프라인은 아직 구성되어 있지 않습니다.

**데이터 수집 / 분석**
- GA4·PostHog·Supabase 기반 측정 체계는 설계 및 구현이 완료되었습니다.
- 실제 사용자 트래픽을 기반으로 한 데이터 수집·분석·서비스 개선 단계는 아직 진행 전입니다.

## 11. Privacy / Data Safety

- **인증**: Supabase Auth(Google OAuth + 이메일)를 사용하며, 게스트 세션은 별도 계정 없이 브라우저 로컬 저장소만 사용합니다.
- **RLS / RPC**: 전체 테이블에 Row Level Security가 적용되어 있으며, 기본 원칙은 "자기 row만 접근"입니다. 랭킹·친구처럼 다른 사용자 데이터를 참조해야 하는 기능만 범위를 좁힌 `SECURITY DEFINER` RPC로 처리합니다.
- **친구 코드**: 다른 사용자를 식별하는 raw UUID를 노출하지 않기 위해, 128비트 랜덤 값인 `friend_code`를 초대에 사용합니다.
- **공유 URL**: 공개 공유 링크는 내부 데이터베이스 id 대신 수동 지정된 slug를 사용해 내부 식별자 노출을 줄입니다.
- **Analytics 개인정보 최소화**: GA4/PostHog 이벤트 payload에는 이메일, 실명, 생일, 성별, 친구 코드 등 민감 정보를 포함하지 않도록 설계되어 있습니다.

---

이 저장소의 `docs/` 폴더에는 데이터 아키텍처, 분석 측정 계획, 보안/개인정보, 게임 스코어링 등 더 상세한 내부 문서가 포함되어 있습니다.
