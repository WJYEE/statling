/**
 * 업적 (achievement) definitions — every family/tier's name, description,
 * condition, and reward lives here, per spec. Adding a new tier to an
 * existing family (e.g. a 4th "미니게임 300판" tier) or a whole new family
 * only ever means editing this file — lib/missions/achievement-evaluator.ts
 * (pure progress math) and lib/missions/achievement-tracker.ts
 * (storage/reward/SFX orchestration) never change for that.
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
 *   lib/missions/achievement-tracker.ts#collectSyncMetricValues, evaluated
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
  | 'playCount'
  | 'talkCount'
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
    tiers: [{ id: 'attendance-first-visit-1', tier: 1, title: '첫 출석', description: 'Statling을 처음 만나러 왔어요.', target: 1, rewardXp: 10 }],
  },
  {
    familyId: 'first-login',
    category: 'attendance',
    metric: 'firstLogin',
    direction: 'atLeast',
    tiers: [{ id: 'first-login-1', tier: 1, title: '첫 로그인', description: '계정으로 처음 로그인했어요.', target: 1, rewardXp: 10 }],
  },
  {
    familyId: 'attendance-total-days',
    category: 'attendance',
    metric: 'attendanceTotalDays',
    direction: 'atLeast',
    tiers: [
      { id: 'attendance-total-days-7', tier: 1, title: '누적 7일 접속', description: '누적 7일 동안 Statling을 만나러 왔어요.', target: 7, rewardXp: 30 },
      { id: 'attendance-total-days-30', tier: 2, title: '누적 30일 접속', description: '누적 30일 동안 Statling을 만나러 왔어요.', target: 30, rewardXp: 100 },
    ],
  },
  {
    familyId: 'attendance-streak',
    category: 'attendance',
    metric: 'attendanceStreak',
    direction: 'atLeast',
    tiers: [
      { id: 'attendance-streak-3', tier: 1, title: '연속 3일 접속', description: '3일 연속으로 Statling을 만나러 왔어요.', target: 3, rewardXp: 30 },
      { id: 'attendance-streak-7', tier: 2, title: '연속 7일 접속', description: '7일 연속으로 Statling을 만나러 왔어요.', target: 7, rewardXp: 80 },
    ],
  },

  // 게임
  {
    familyId: 'games-played',
    category: 'game',
    metric: 'gamesPlayed',
    direction: 'atLeast',
    tiers: [
      { id: 'games-played-10', tier: 1, title: '미니게임 10판', description: '미니게임을 10판 플레이했어요.', target: 10, rewardXp: 30 },
      { id: 'games-played-50', tier: 2, title: '미니게임 50판', description: '미니게임을 50판 플레이했어요.', target: 50, rewardXp: 100 },
      { id: 'games-played-100', tier: 3, title: '미니게임 100판', description: '미니게임을 100판 플레이했어요.', target: 100, rewardXp: 250 },
    ],
  },
  {
    familyId: 'personal-best-first',
    category: 'game',
    metric: 'personalBestFirst',
    direction: 'atLeast',
    tiers: [{ id: 'personal-best-first-1', tier: 1, title: '첫 신기록', description: '처음으로 개인 최고 기록을 세웠어요.', target: 1, rewardXp: 20 }],
  },
  {
    familyId: 'personal-best-count',
    category: 'game',
    metric: 'personalBestCount',
    direction: 'atLeast',
    tiers: [{ id: 'personal-best-count-10', tier: 1, title: '신기록 10회', description: '개인 최고 기록을 10번 경신했어요.', target: 10, rewardXp: 80 }],
  },
  {
    familyId: 'best-game-rank',
    category: 'game',
    metric: 'bestGameRank',
    direction: 'atMost',
    tiers: [
      { id: 'best-game-rank-10', tier: 1, title: '특정 게임 Top 10', description: '한 게임에서 Top 10 안에 들었어요.', target: 10, rewardXp: 50 },
      { id: 'best-game-rank-3', tier: 2, title: '특정 게임 Top 3', description: '한 게임에서 Top 3 안에 들었어요.', target: 3, rewardXp: 120 },
      { id: 'best-game-rank-1', tier: 3, title: '특정 게임 1위', description: '한 게임에서 1위를 차지했어요.', target: 1, rewardXp: 300 },
    ],
  },
  {
    familyId: 'overall-rank',
    category: 'game',
    metric: 'overallRank',
    direction: 'atMost',
    tiers: [
      { id: 'overall-rank-100', tier: 1, title: '종합 랭킹 Top 100', description: '종합 랭킹 Top 100 안에 들었어요.', target: 100, rewardXp: 60 },
      { id: 'overall-rank-10', tier: 2, title: '종합 랭킹 Top 10', description: '종합 랭킹 Top 10 안에 들었어요.', target: 10, rewardXp: 150 },
      { id: 'overall-rank-1', tier: 3, title: '종합 랭킹 1위', description: '종합 랭킹 1위를 차지했어요.', target: 1, rewardXp: 400 },
    ],
  },

  // 교감
  {
    familyId: 'total-interactions',
    category: 'bond',
    metric: 'totalInteractions',
    direction: 'atLeast',
    tiers: [
      { id: 'total-interactions-10', tier: 1, title: '상호작용 10회', description: 'Statling과 10번 상호작용했어요.', target: 10, rewardXp: 20 },
      { id: 'total-interactions-100', tier: 2, title: '상호작용 100회', description: 'Statling과 100번 상호작용했어요.', target: 100, rewardXp: 80 },
      { id: 'total-interactions-500', tier: 3, title: '상호작용 500회', description: 'Statling과 500번 상호작용했어요.', target: 500, rewardXp: 250 },
    ],
  },
  {
    familyId: 'feed-count',
    category: 'bond',
    metric: 'feedCount',
    direction: 'atLeast',
    tiers: [{ id: 'feed-count-20', tier: 1, title: '먹이주기 20회', description: 'Statling에게 20번 먹이를 줬어요.', target: 20, rewardXp: 40 }],
  },
  {
    familyId: 'play-count',
    category: 'bond',
    metric: 'playCount',
    direction: 'atLeast',
    tiers: [{ id: 'play-count-20', tier: 1, title: '놀기 20회', description: 'Statling과 20번 놀아줬어요.', target: 20, rewardXp: 40 }],
  },
  {
    familyId: 'talk-count',
    category: 'bond',
    metric: 'talkCount',
    direction: 'atLeast',
    tiers: [{ id: 'talk-count-20', tier: 1, title: '대화 20회', description: 'Statling과 20번 대화했어요.', target: 20, rewardXp: 40 }],
  },

  // 성장
  {
    familyId: 'intimacy-level',
    category: 'growth',
    metric: 'intimacyLevel',
    direction: 'atLeast',
    tiers: [
      { id: 'intimacy-level-10', tier: 1, title: 'Statling Lv.10 달성', description: '친밀도 레벨 10을 달성했어요.', target: 10, rewardXp: 60 },
      { id: 'intimacy-level-20', tier: 2, title: 'Statling Lv.20 달성', description: '친밀도 레벨 20을 달성했어요.', target: 20, rewardXp: 150 },
      { id: 'intimacy-level-30', tier: 3, title: 'Statling Lv.30 달성', description: '친밀도 레벨 30을 달성했어요.', target: 30, rewardXp: 350 },
    ],
  },

  // 수집/꾸미기
  {
    familyId: 'dex-count',
    category: 'collection',
    metric: 'dexCount',
    direction: 'atLeast',
    tiers: [
      { id: 'dex-count-5', tier: 1, title: '도감 5종 수집', description: '도감에 5종의 Statling을 기록했어요.', target: 5, rewardXp: 40 },
      { id: 'dex-count-10', tier: 2, title: '도감 10종 수집', description: '도감에 10종의 Statling을 기록했어요.', target: 10, rewardXp: 90 },
      { id: 'dex-count-30', tier: 3, title: '도감 30종 수집', description: '도감에 30종의 Statling을 모두 기록했어요.', target: 30, rewardXp: 300 },
    ],
  },
  {
    familyId: 'room-decor-first-save',
    category: 'collection',
    metric: 'roomDecorSaved',
    direction: 'atLeast',
    tiers: [{ id: 'room-decor-first-save-1', tier: 1, title: '방 꾸미기 첫 저장', description: '방 꾸미기를 처음 저장했어요.', target: 1, rewardXp: 20 }],
  },
  {
    familyId: 'statling-decor-first-save',
    category: 'collection',
    metric: 'statlingDecorSaved',
    direction: 'atLeast',
    tiers: [{ id: 'statling-decor-first-save-1', tier: 1, title: 'Statling 꾸미기 첫 저장', description: 'Statling 꾸미기를 처음 저장했어요.', target: 1, rewardXp: 20 }],
  },

  // 공유
  {
    familyId: 'share-count',
    category: 'share',
    metric: 'shareCount',
    direction: 'atLeast',
    tiers: [
      { id: 'share-count-1', tier: 1, title: '첫 공유', description: 'Statling을 처음 공유했어요.', target: 1, rewardXp: 20 },
      { id: 'share-count-10', tier: 2, title: '공유 10회', description: 'Statling을 10번 공유했어요.', target: 10, rewardXp: 80 },
    ],
  },
]
