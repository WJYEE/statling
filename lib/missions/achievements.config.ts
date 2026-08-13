/**
 * 업적 (achievement) definitions — every family/tier's name, description,
 * condition, and reward lives here, per spec. Adding a new tier to an
 * existing family (e.g. a 4th "미니게임 300판" tier) or a whole new family
 * only ever means editing this file — lib/missions/achievement-evaluator.ts
 * (pure progress math) and lib/missions/mission-tracker.ts /
 * lib/missions/ranking-achievements.ts (storage/reward/SFX orchestration)
 * never change for that.
 *
 * Naming policy: `title` is a light, game-y nickname (never the raw
 * condition), `description` states the actual condition in plain language —
 * see each tier below. `id` is the persisted "unlocked" key
 * (lib/missions/achievement-storage.ts) and MUST stay stable once shipped:
 * renaming `title`/`description` freely is safe (display-only), but an
 * existing tier's `id` must never change, or a real player's already-earned
 * unlock silently resets (and could re-grant its XP). Only ever add new
 * ids for genuinely new tiers/families.
 */
export type AchievementCategory = 'attendance' | 'game' | 'bond' | 'growth' | 'collection' | 'share'

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  attendance: '접속',
  game: '게임',
  bond: '교감',
  growth: '성장',
  collection: '수집/꾸미기',
  share: '공유',
}

/**
 * Which live value a family's tiers compare against `target`. Split into
 * two groups by where the value comes from:
 * - sync metrics: read straight from local storage, no await needed — see
 *   lib/missions/mission-tracker.ts#collectSyncMetricValues, evaluated
 *   after every tracked event.
 * - rank metrics (bestGameRank/overallRank): need an async ranking-provider
 *   call, so they're only evaluated when 업적 tab is actually opened — see
 *   lib/missions/ranking-achievements.ts#collectRankMetricValues.
 */
export type AchievementMetricKey =
  | 'attendanceFirstVisit'
  | 'firstLogin'
  | 'attendanceTotalDays'
  | 'attendanceStreak'
  | 'gamesPlayed'
  | 'personalBestFirst'
  | 'personalBestCount'
  | 'bestGameRank'
  | 'overallRank'
  | 'totalInteractions'
  | 'feedCount'
  | 'washCount'
  | 'playCount'
  | 'talkCount'
  | 'petCount'
  | 'intimacyLevel'
  | 'dexCount'
  | 'roomDecorSaved'
  | 'statlingDecorSaved'
  | 'shareCount'

export const RANK_ACHIEVEMENT_METRICS: readonly AchievementMetricKey[] = ['bestGameRank', 'overallRank']

export interface AchievementTierDef {
  /** Globally unique — also the persisted "unlocked" id, see lib/missions/achievement-storage.ts. */
  id: string
  /** 1-based position within its family, ascending difficulty. */
  tier: number
  title: string
  description: string
  target: number
  rewardXp: number
}

export interface AchievementFamilyDef {
  familyId: string
  category: AchievementCategory
  metric: AchievementMetricKey
  /** 'atLeast': value >= tier.target (most metrics). 'atMost': value <= tier.target (rank metrics — a LOWER rank number is better, so "Top 10" means overallRank <= 10). */
  direction: 'atLeast' | 'atMost'
  /** Ascending difficulty order — tiers[0] is the easiest. */
  tiers: AchievementTierDef[]
}

export const ACHIEVEMENT_FAMILIES: AchievementFamilyDef[] = [
  // 접속
  {
    familyId: 'attendance-first-visit',
    category: 'attendance',
    metric: 'attendanceFirstVisit',
    direction: 'atLeast',
    tiers: [{ id: 'attendance-first-visit-1', tier: 1, title: '첫 만남', description: 'Statling을 처음 만나러 왔어요.', target: 1, rewardXp: 10 }],
  },
  {
    familyId: 'first-login',
    category: 'attendance',
    metric: 'firstLogin',
    direction: 'atLeast',
    tiers: [{ id: 'first-login-1', tier: 1, title: '우리 이제 친구!', description: '계정으로 처음 로그인했어요.', target: 1, rewardXp: 10 }],
  },
  {
    familyId: 'attendance-total-days',
    category: 'attendance',
    metric: 'attendanceTotalDays',
    direction: 'atLeast',
    tiers: [
      { id: 'attendance-total-days-7', tier: 1, title: '일주일의 동행', description: '누적 7일 동안 Statling을 만나러 왔어요.', target: 7, rewardXp: 30 },
      { id: 'attendance-total-days-30', tier: 2, title: '한 달의 동행', description: '누적 30일 동안 Statling을 만나러 왔어요.', target: 30, rewardXp: 100 },
    ],
  },
  {
    familyId: 'attendance-streak',
    category: 'attendance',
    metric: 'attendanceStreak',
    direction: 'atLeast',
    // Deliberately caps at 7 (no 30-day-streak tier) — a long unbroken streak
    // shouldn't be forced; the cumulative attendance-total-days family above
    // already rewards long-term play without penalizing a missed day.
    tiers: [
      { id: 'attendance-streak-3', tier: 1, title: '삼일 연속 출석!', description: '3일 연속으로 Statling을 만나러 왔어요.', target: 3, rewardXp: 30 },
      { id: 'attendance-streak-7', tier: 2, title: '개근상', description: '7일 연속으로 Statling을 만나러 왔어요.', target: 7, rewardXp: 80 },
    ],
  },

  // 게임
  {
    familyId: 'games-played',
    category: 'game',
    metric: 'gamesPlayed',
    direction: 'atLeast',
    tiers: [
      { id: 'games-played-10', tier: 1, title: '워밍업 완료', description: '미니게임을 10판 플레이했어요.', target: 10, rewardXp: 30 },
      { id: 'games-played-50', tier: 2, title: '게임 마니아', description: '미니게임을 50판 플레이했어요.', target: 50, rewardXp: 100 },
      { id: 'games-played-100', tier: 3, title: '미니게임 달인', description: '미니게임을 100판 플레이했어요.', target: 100, rewardXp: 250 },
    ],
  },
  {
    familyId: 'personal-best-first',
    category: 'game',
    metric: 'personalBestFirst',
    direction: 'atLeast',
    tiers: [{ id: 'personal-best-first-1', tier: 1, title: '기록 경신!', description: '처음으로 개인 최고 기록을 세웠어요.', target: 1, rewardXp: 20 }],
  },
  {
    familyId: 'personal-best-count',
    category: 'game',
    metric: 'personalBestCount',
    direction: 'atLeast',
    tiers: [{ id: 'personal-best-count-10', tier: 1, title: '나를 넘어서는 중', description: '개인 최고 기록을 10번 경신했어요.', target: 10, rewardXp: 80 }],
  },
  {
    familyId: 'best-game-rank',
    category: 'game',
    metric: 'bestGameRank',
    direction: 'atMost',
    // Wording is deliberately stat-flavored ("한 스탯 게임에서") rather than
    // naming the specific game — Statling frames every mini-game as one of
    // 6 Ability/Stat categories, so this reads as "you excelled at some
    // ability" rather than surfacing an internal gameId. The underlying
    // metric (bestGameRank — best rank across every Hard-tier game, see
    // lib/missions/ranking-achievements.ts#collectRankMetricValues) is
    // unchanged; it doesn't currently carry which specific game/stat earned
    // that rank through to here, so the description can't yet say e.g.
    // "공간감각에서 Top 10" — doing that would mean collectRankMetricValues
    // additionally tracking + returning which stat produced the best rank,
    // and AchievementTierProgress carrying that through to the UI. Left as
    // a static description for now per this task's explicit scope (no
    // Ranking-system changes) — see the investigation report for what a
    // follow-up would need to touch.
    tiers: [
      { id: 'best-game-rank-10', tier: 1, title: '두각을 나타내다', description: '한 스탯 게임에서 Top 10 안에 들었어요.', target: 10, rewardXp: 50 },
      { id: 'best-game-rank-3', tier: 2, title: '포디움 입성', description: '한 스탯 게임에서 Top 3 안에 들었어요.', target: 3, rewardXp: 120 },
      { id: 'best-game-rank-1', tier: 3, title: '스탯 최강자', description: '한 스탯 게임에서 1위를 차지했어요.', target: 1, rewardXp: 300 },
    ],
  },
  {
    familyId: 'overall-rank',
    category: 'game',
    metric: 'overallRank',
    direction: 'atMost',
    tiers: [
      { id: 'overall-rank-100', tier: 1, title: '랭커의 시작', description: '종합 랭킹 Top 100 안에 들었어요.', target: 100, rewardXp: 60 },
      { id: 'overall-rank-10', tier: 2, title: '상위 10인의 Statling', description: '종합 랭킹 Top 10 안에 들었어요.', target: 10, rewardXp: 150 },
      { id: 'overall-rank-1', tier: 3, title: 'Statling 챔피언', description: '종합 랭킹 1위를 차지했어요.', target: 1, rewardXp: 400 },
    ],
  },

  // 교감
  {
    familyId: 'total-interactions',
    category: 'bond',
    metric: 'totalInteractions',
    direction: 'atLeast',
    tiers: [
      { id: 'total-interactions-10', tier: 1, title: '조금 가까워졌어', description: 'Statling과 10번 상호작용했어요.', target: 10, rewardXp: 20 },
      { id: 'total-interactions-100', tier: 2, title: '우리 꽤 친해졌지?', description: 'Statling과 100번 상호작용했어요.', target: 100, rewardXp: 80 },
      { id: 'total-interactions-500', tier: 3, title: '최고의 단짝', description: 'Statling과 500번 상호작용했어요.', target: 500, rewardXp: 250 },
    ],
  },
  {
    familyId: 'feed-count',
    category: 'bond',
    metric: 'feedCount',
    direction: 'atLeast',
    tiers: [{ id: 'feed-count-20', tier: 1, title: '잘 먹고 잘 크자', description: 'Statling에게 20번 먹이를 줬어요.', target: 20, rewardXp: 40 }],
  },
  {
    familyId: 'wash-count',
    category: 'bond',
    metric: 'washCount',
    direction: 'atLeast',
    tiers: [{ id: 'wash-count-20', tier: 1, title: '깨끗하게 반짝!', description: 'Statling을 20번 씻겨줬어요.', target: 20, rewardXp: 40 }],
  },
  {
    familyId: 'play-count',
    category: 'bond',
    metric: 'playCount',
    direction: 'atLeast',
    tiers: [{ id: 'play-count-20', tier: 1, title: '놀이는 내가 책임질게', description: 'Statling과 20번 놀아줬어요.', target: 20, rewardXp: 40 }],
  },
  {
    familyId: 'talk-count',
    category: 'bond',
    metric: 'talkCount',
    direction: 'atLeast',
    tiers: [{ id: 'talk-count-20', tier: 1, title: '수다 친구', description: 'Statling과 20번 대화했어요.', target: 20, rewardXp: 40 }],
  },
  {
    familyId: 'pet-count',
    category: 'bond',
    metric: 'petCount',
    direction: 'atLeast',
    tiers: [{ id: 'pet-count-20', tier: 1, title: '쓰담쓰담 전문가', description: 'Statling을 20번 쓰다듬어줬어요.', target: 20, rewardXp: 40 }],
  },

  // 성장
  {
    familyId: 'intimacy-level',
    category: 'growth',
    metric: 'intimacyLevel',
    direction: 'atLeast',
    // Lv.10/20/30/40 mirror the 5-level-interval Statling Decoration level
    // gifts (lib/deco-supported-assets.ts) at those SAME levels, but are a
    // completely separate reward (XP here, a Decoration there) — Lv.5/15/25/
    // 35/45 have a Decoration gift but deliberately no achievement tier, and
    // Lv.50 gets both a Decoration (MAX gift) and this family's own MAX-level
    // capstone tier below.
    tiers: [
      { id: 'intimacy-level-10', tier: 1, title: '성장의 시작', description: 'Statling Lv.10을 달성했어요.', target: 10, rewardXp: 60 },
      { id: 'intimacy-level-20', tier: 2, title: '함께한 시간', description: 'Statling Lv.20을 달성했어요.', target: 20, rewardXp: 150 },
      { id: 'intimacy-level-30', tier: 3, title: '제법 든든한 친구', description: 'Statling Lv.30을 달성했어요.', target: 30, rewardXp: 350 },
      // Lv.50 is the MAX_LEVEL (lib/pet-care/leveling.ts) capstone tier —
      // 60 -> 150 -> 350 -> 500 -> 800 confirmed.
      { id: 'intimacy-level-40', tier: 4, title: '오래 함께했네', description: 'Statling Lv.40을 달성했어요.', target: 40, rewardXp: 500 },
      { id: 'intimacy-level-50', tier: 5, title: '최고의 동반자', description: 'Statling Lv.50을 달성했어요.', target: 50, rewardXp: 800 },
    ],
  },

  // 수집/꾸미기
  {
    familyId: 'dex-count',
    category: 'collection',
    metric: 'dexCount',
    direction: 'atLeast',
    tiers: [
      { id: 'dex-count-5', tier: 1, title: '새로운 친구들', description: '도감에 5종의 Statling을 기록했어요.', target: 5, rewardXp: 40 },
      { id: 'dex-count-10', tier: 2, title: 'Statling 수집가', description: '도감에 10종의 Statling을 기록했어요.', target: 10, rewardXp: 90 },
      { id: 'dex-count-30', tier: 3, title: '도감 마스터', description: '도감에 30종의 Statling을 모두 기록했어요.', target: 30, rewardXp: 300 },
    ],
  },
  {
    familyId: 'room-decor-first-save',
    category: 'collection',
    metric: 'roomDecorSaved',
    direction: 'atLeast',
    tiers: [{ id: 'room-decor-first-save-1', tier: 1, title: '우리 집 완성!', description: '방 꾸미기를 처음 저장했어요.', target: 1, rewardXp: 20 }],
  },
  {
    familyId: 'statling-decor-first-save',
    category: 'collection',
    metric: 'statlingDecorSaved',
    direction: 'atLeast',
    tiers: [{ id: 'statling-decor-first-save-1', tier: 1, title: '오늘 좀 꾸몄어', description: 'Statling 꾸미기를 처음 저장했어요.', target: 1, rewardXp: 20 }],
  },

  // 공유
  {
    familyId: 'share-count',
    category: 'share',
    metric: 'shareCount',
    direction: 'atLeast',
    tiers: [
      { id: 'share-count-1', tier: 1, title: '친구에게 자랑하기', description: 'Statling을 처음 공유했어요.', target: 1, rewardXp: 20 },
      { id: 'share-count-10', tier: 2, title: 'Statling 전도사', description: 'Statling을 10번 공유했어요.', target: 10, rewardXp: 80 },
    ],
  },
]
