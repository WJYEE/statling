/**
 * Catalog of every real PNG under public/assets/statling/room — verified
 * against the actual filesystem (never a guessed path) via a one-off
 * dimension probe read straight from each PNG's IHDR header, so
 * naturalWidth/naturalHeight are measured facts, not estimates. This is the
 * single place that maps a stable `id` to a real file — RoomPreset
 * composition (lib/room-presets.ts) and any future "방 꾸미기" inventory UI
 * should both reference assets by id from here, never re-hardcode a path.
 *
 * Only the PNG's own metadata lives here (never a screen position — that's
 * per-preset placement data, see room-presets.ts, since the same physical
 * asset could appear in more than one preset at a different spot/scale).
 */

export type RoomAssetCategory = 'background' | 'window' | 'rug' | 'furniture' | 'plant' | 'decor'

/**
 * Sub-classification for `category: 'decor'` items only — lets a future
 * inventory screen filter "물건 놓을 자리" (wall/shelf/floor) without having
 * to re-derive it from the filename. Undefined for every other category.
 */
export type RoomDecorSubcategory = 'wallDecor' | 'shelfDecor' | 'floorDecor'

/**
 * `default` (or omitted — see `RoomAsset.unlockSource` below) — usable from
 * the start, same as every item always has been. `achievement` — usable
 * only once the referenced Achievement tier (lib/missions/achievements.config.ts's
 * `AchievementTierDef.id`) has actually been unlocked AND its Room reward
 * claimed into inventory (lib/room-inventory-storage.ts) — see
 * lib/missions/mission-tracker.ts#applyNewlyUnlockedAchievements. Window
 * assets are never locked this way — see the file header's Window note.
 */
export type RoomUnlockSource = { type: 'default' } | { type: 'achievement'; tierId: string }

export interface RoomAsset {
  id: string
  name: string
  category: RoomAssetCategory
  decorSubcategory?: RoomDecorSubcategory
  src: string
  /** Real pixel dimensions of the source PNG, measured directly — used to preserve aspect ratio (object-fit: contain) without ever stretching/cropping the file itself. */
  naturalWidth: number
  naturalHeight: number
  /**
   * Omitted (undefined) means the same thing as `{ type: 'default' }` — kept
   * optional rather than stamped on all 67 entries so only the handful of
   * Achievement-locked ones need to say so explicitly; see
   * `isRoomAssetUnlocked` below for the one place that distinction is read.
   */
  unlockSource?: RoomUnlockSource
}

const ROOM_BASE = '/assets/statling/room'

export const ROOM_ASSETS: Record<string, RoomAsset> = {
  // -- backgrounds ------------------------------------------------------
  // All 7 entries below share one normalization pass so switching between
  // any of them never shifts or resizes the room: each source's room
  // illustration (border/transparent-margin cropped off first) is uniformly
  // scaled to the same 660x611 content box — aspect ratio preserved per
  // source, only a few % of anisotropic scale where a source's native ratio
  // didn't already match the shared average (worst case ~7%, on
  // green-background, imperceptible on flat vector art) — then re-padded
  // into an identical 724x724 canvas at an identical (32, 56) offset. Every
  // *-normalized.png is a generated file; the untouched raw source
  // (wood_back-Photoroom.png / green_back.png / *_back.png /
  // bubblewhiteblue.png / lightwhite.png) is what's still in the backgrounds
  // folder for reference. Never hand-edit a -normalized.png directly —
  // regenerate from source instead.
  'wood-background': {
    id: 'wood-background',
    name: '우드 배경',
    category: 'background',
    src: `${ROOM_BASE}/backgrounds/wood_back-normalized.png`,
    naturalWidth: 724,
    naturalHeight: 724,
  },
  'green-background': {
    id: 'green-background',
    name: '그린 배경',
    category: 'background',
    src: `${ROOM_BASE}/backgrounds/green_back-normalized.png`,
    naturalWidth: 724,
    naturalHeight: 724,
  },
  'bluegrey-background': {
    id: 'bluegrey-background',
    name: '블루그레이 배경',
    category: 'background',
    src: `${ROOM_BASE}/backgrounds/bluegrey_back-normalized.png`,
    naturalWidth: 724,
    naturalHeight: 724,
    unlockSource: { type: 'achievement', tierId: 'attendance-streak-7' }, // 개근상
  },
  'blue-background': {
    id: 'blue-background',
    name: '블루 배경',
    category: 'background',
    src: `${ROOM_BASE}/backgrounds/bubblewhiteblue-normalized.png`,
    naturalWidth: 724,
    naturalHeight: 724,
    unlockSource: { type: 'achievement', tierId: 'games-played-100' }, // 미니게임 달인
  },
  'ivory-background': {
    id: 'ivory-background',
    name: '아이보리 배경',
    category: 'background',
    src: `${ROOM_BASE}/backgrounds/lightwhite-normalized.png`,
    naturalWidth: 724,
    naturalHeight: 724,
    unlockSource: { type: 'achievement', tierId: 'wash-count-20' }, // 깨끗하게 반짝!
  },
  'pink-background': {
    id: 'pink-background',
    name: '핑크 배경',
    category: 'background',
    src: `${ROOM_BASE}/backgrounds/pink_back-normalized.png`,
    naturalWidth: 724,
    naturalHeight: 724,
    unlockSource: { type: 'achievement', tierId: 'dex-count-30' }, // 도감 마스터
  },
  'purple-background': {
    id: 'purple-background',
    name: '퍼플 배경',
    category: 'background',
    src: `${ROOM_BASE}/backgrounds/puple_back-normalized.png`,
    naturalWidth: 724,
    naturalHeight: 724,
    unlockSource: { type: 'achievement', tierId: 'overall-rank-10' }, // 상위 10인의 Statling
  },

  // -- windows ------------------------------------------------------
  // NOTE: both backgrounds above already draw their own window baked into
  // the wall art, so these standalone window assets are cataloged for
  // completeness/future use but intentionally NOT layered on top of either
  // background in the current presets (see room-presets.ts) — doing so
  // would show two windows at once. Kept here in case a future windowless
  // background variant is added.
  'wood-window': {
    id: 'wood-window',
    name: '우드 창문',
    category: 'window',
    src: `${ROOM_BASE}/windows/wood_window.png`,
    naturalWidth: 298,
    naturalHeight: 313,
  },
  'green-window': {
    id: 'green-window',
    name: '그린 창문',
    category: 'window',
    src: `${ROOM_BASE}/windows/green_window.png`,
    naturalWidth: 277,
    naturalHeight: 264,
  },
  'pink-window': {
    id: 'pink-window',
    name: '핑크 창문',
    category: 'window',
    src: `${ROOM_BASE}/windows/pink_window.png`,
    naturalWidth: 451,
    naturalHeight: 376,
  },

  // -- rugs ------------------------------------------------------
  'wood-rug': { id: 'wood-rug', name: '우드 러그', category: 'rug', src: `${ROOM_BASE}/rugs/wood_rug.png`, naturalWidth: 355, naturalHeight: 166 },
  'green-rug': { id: 'green-rug', name: '그린 러그', category: 'rug', src: `${ROOM_BASE}/rugs/green_rug.png`, naturalWidth: 340, naturalHeight: 154 },
  'pink-rug': { id: 'pink-rug', name: '핑크 러그', category: 'rug', src: `${ROOM_BASE}/rugs/pink_rug.png`, naturalWidth: 334, naturalHeight: 145 },

  // -- furniture ------------------------------------------------------
  'wood-drawer': { id: 'wood-drawer', name: '우드 서랍장', category: 'furniture', src: `${ROOM_BASE}/furniture/wood_drawer.png`, naturalWidth: 223, naturalHeight: 222 },
  'green-drawer': { id: 'green-drawer', name: '그린 서랍장', category: 'furniture', src: `${ROOM_BASE}/furniture/green_drawer.png`, naturalWidth: 189, naturalHeight: 205 },
  'pink-drawer': { id: 'pink-drawer', name: '핑크 서랍장', category: 'furniture', src: `${ROOM_BASE}/furniture/pink_drawer.png`, naturalWidth: 175, naturalHeight: 192 },
  'wood-bigchair': { id: 'wood-bigchair', name: '우드 포근한 의자', category: 'furniture', src: `${ROOM_BASE}/furniture/wood_bigchair.png`, naturalWidth: 277, naturalHeight: 172 },
  'green-bigchair': { id: 'green-bigchair', name: '그린 포근한 의자', category: 'furniture', src: `${ROOM_BASE}/furniture/green_bigchair.png`, naturalWidth: 195, naturalHeight: 172 },
  'pink-bigchair': { id: 'pink-bigchair', name: '핑크 포근한 의자', category: 'furniture', src: `${ROOM_BASE}/furniture/pink_bigchair.png`, naturalWidth: 202, naturalHeight: 178 },
  'wood-chair': { id: 'wood-chair', name: '우드 의자', category: 'furniture', src: `${ROOM_BASE}/furniture/wood_chair.png`, naturalWidth: 175, naturalHeight: 195 },
  'green-chair': { id: 'green-chair', name: '그린 의자', category: 'furniture', src: `${ROOM_BASE}/furniture/green_chair.png`, naturalWidth: 162, naturalHeight: 193 },
  'pink-chair': { id: 'pink-chair', name: '핑크 의자', category: 'furniture', src: `${ROOM_BASE}/furniture/pink_chair.png`, naturalWidth: 163, naturalHeight: 195 },
  // wood-lantern.png is a real, existing file, but its actual pixel content
  // is a duplicate of plants/wood_plant.png (a potted plant), not a lamp —
  // almost certainly a mislabeled/misexported source asset. Cataloged
  // honestly (so nothing here is guessed) but NOT used in any preset, since
  // rendering it as "the lantern" would visibly duplicate the plant. Only
  // green-lantern actually renders as a lamp; flagged for the asset owner
  // to replace in the final report.
  'wood-lantern': { id: 'wood-lantern', name: '우드 조명 (원본 파일 오류 — 화분 이미지로 대체되어 있음)', category: 'furniture', src: `${ROOM_BASE}/furniture/wood_lantern.png`, naturalWidth: 154, naturalHeight: 222 },
  'green-lantern': { id: 'green-lantern', name: '그린 조명', category: 'furniture', src: `${ROOM_BASE}/furniture/green_lantern.png`, naturalWidth: 151, naturalHeight: 220 },
  'shelf-1': { id: 'shelf-1', name: '선반 (책+화분)', category: 'furniture', src: `${ROOM_BASE}/furniture/shelf1.png`, naturalWidth: 263, naturalHeight: 82 },
  'shelf-2': { id: 'shelf-2', name: '선반 (책 5권)', category: 'furniture', src: `${ROOM_BASE}/furniture/shelf2.png`, naturalWidth: 275, naturalHeight: 155 },
  'shelf-3': { id: 'shelf-3', name: '선반 (화분+액자)', category: 'furniture', src: `${ROOM_BASE}/furniture/shelf3.png`, naturalWidth: 226, naturalHeight: 115 },
  'shelf-4': { id: 'shelf-4', name: '선반 (책+늘어진 화분)', category: 'furniture', src: `${ROOM_BASE}/furniture/shelf4.png`, naturalWidth: 236, naturalHeight: 151 },
  'shelf-5': { id: 'shelf-5', name: '선반 (넓은 형)', category: 'furniture', src: `${ROOM_BASE}/furniture/shelf5.png`, naturalWidth: 329, naturalHeight: 182, unlockSource: { type: 'achievement', tierId: 'dex-count-10' } }, // Statling 수집가

  // -- plants ------------------------------------------------------
  'wood-plant': { id: 'wood-plant', name: '우드 화분', category: 'plant', src: `${ROOM_BASE}/plants/wood_plant.png`, naturalWidth: 154, naturalHeight: 222 },
  'pink-plant': { id: 'pink-plant', name: '핑크 화분', category: 'plant', src: `${ROOM_BASE}/plants/pink_plant.png`, naturalWidth: 123, naturalHeight: 184 },
  'plant-1': { id: 'plant-1', name: '화분 1', category: 'plant', src: `${ROOM_BASE}/plants/plant1.png`, naturalWidth: 114, naturalHeight: 162 },
  'plant-2': { id: 'plant-2', name: '화분 2', category: 'plant', src: `${ROOM_BASE}/plants/plant2.png`, naturalWidth: 106, naturalHeight: 184 },
  'plant-3': { id: 'plant-3', name: '화분 3', category: 'plant', src: `${ROOM_BASE}/plants/plant3.png`, naturalWidth: 122, naturalHeight: 173 },
  'plant-4': { id: 'plant-4', name: '화분 4', category: 'plant', src: `${ROOM_BASE}/plants/plant4.png`, naturalWidth: 154, naturalHeight: 166 },
  'plant-5': { id: 'plant-5', name: '화분 5', category: 'plant', src: `${ROOM_BASE}/plants/plant5.png`, naturalWidth: 143, naturalHeight: 189 },
  'plant-6': { id: 'plant-6', name: '화분 6', category: 'plant', src: `${ROOM_BASE}/plants/plant6.png`, naturalWidth: 134, naturalHeight: 148 },
  'plant-7': { id: 'plant-7', name: '화분 7', category: 'plant', src: `${ROOM_BASE}/plants/plant7.png`, naturalWidth: 129, naturalHeight: 180, unlockSource: { type: 'achievement', tierId: 'attendance-total-days-30' } }, // 한 달의 동행
  'plant-8': { id: 'plant-8', name: '화분 8', category: 'plant', src: `${ROOM_BASE}/plants/plant8.png`, naturalWidth: 116, naturalHeight: 162, unlockSource: { type: 'achievement', tierId: 'feed-count-20' } }, // 잘 먹고 잘 크자
  'plant-9': { id: 'plant-9', name: '화분 9', category: 'plant', src: `${ROOM_BASE}/plants/plant9.png`, naturalWidth: 128, naturalHeight: 187 },

  // -- decor: wallDecor (frames + flag) ------------------------------------------------------
  'clover-frame': { id: 'clover-frame', name: '클로버 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/clover_frame.png`, naturalWidth: 109, naturalHeight: 106, unlockSource: { type: 'achievement', tierId: 'room-decor-first-save-1' } }, // 우리 집 완성!
  'green-frame': { id: 'green-frame', name: '그린 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/green_frame.png`, naturalWidth: 125, naturalHeight: 177 },
  // NOTE: `src` is expected to be swapped for a new PNG later — Achievement
  // code (achievements.config.ts's share-count-10 tier, mission-tracker.ts,
  // room-inventory-storage.ts) only ever references the stable id
  // 'house-frame', never this file path or its pixel content, so replacing
  // just this one src string is the entire migration when that happens.
  'house-frame': { id: 'house-frame', name: '하우스 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/house_frame.png`, naturalWidth: 172, naturalHeight: 191, unlockSource: { type: 'achievement', tierId: 'share-count-10' } }, // Statling 전도사
  'moon-frame': { id: 'moon-frame', name: '달 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/moon_frame.png`, naturalWidth: 109, naturalHeight: 102 },
  'mountain-frame': { id: 'mountain-frame', name: '산 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/mountain_frame.png`, naturalWidth: 107, naturalHeight: 131, unlockSource: { type: 'achievement', tierId: 'games-played-50' } }, // 게임 마니아
  'rabbit-frame': { id: 'rabbit-frame', name: '토끼 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/rabbit_frame.png`, naturalWidth: 132, naturalHeight: 154 },
  'red-frame': { id: 'red-frame', name: '레드 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/red_frame.png`, naturalWidth: 108, naturalHeight: 131 },
  'tree-frame': { id: 'tree-frame', name: '나뭇잎 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/tree_frame.png`, naturalWidth: 108, naturalHeight: 152 },
  'yellow-frame': { id: 'yellow-frame', name: '옐로우 액자', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/yellow_frame.png`, naturalWidth: 124, naturalHeight: 149 },
  'wood-flag': { id: 'wood-flag', name: '우드 깃발', category: 'decor', decorSubcategory: 'wallDecor', src: `${ROOM_BASE}/decor/wood_flag.png`, naturalWidth: 217, naturalHeight: 303, unlockSource: { type: 'achievement', tierId: 'best-game-rank-3' } }, // 포디움 입성

  // -- decor: shelfDecor (books) ------------------------------------------------------
  'book-1': { id: 'book-1', name: '책 1', category: 'decor', decorSubcategory: 'shelfDecor', src: `${ROOM_BASE}/decor/book1.png`, naturalWidth: 169, naturalHeight: 98 },
  'book-2': { id: 'book-2', name: '책 2', category: 'decor', decorSubcategory: 'shelfDecor', src: `${ROOM_BASE}/decor/book2.png`, naturalWidth: 124, naturalHeight: 120 },
  'book-3': { id: 'book-3', name: '책 3', category: 'decor', decorSubcategory: 'shelfDecor', src: `${ROOM_BASE}/decor/book3.png`, naturalWidth: 132, naturalHeight: 122 },
  'book-4': { id: 'book-4', name: '책 4', category: 'decor', decorSubcategory: 'shelfDecor', src: `${ROOM_BASE}/decor/book4.png`, naturalWidth: 123, naturalHeight: 108, unlockSource: { type: 'achievement', tierId: 'talk-count-20' } }, // 수다 친구
  'book-5': { id: 'book-5', name: '책 5', category: 'decor', decorSubcategory: 'shelfDecor', src: `${ROOM_BASE}/decor/book5.png`, naturalWidth: 126, naturalHeight: 108 },
  'book-6': { id: 'book-6', name: '책 6', category: 'decor', decorSubcategory: 'shelfDecor', src: `${ROOM_BASE}/decor/book6.png`, naturalWidth: 150, naturalHeight: 98 },
  'book-7': { id: 'book-7', name: '책 7', category: 'decor', decorSubcategory: 'shelfDecor', src: `${ROOM_BASE}/decor/book7.png`, naturalWidth: 224, naturalHeight: 126 },

  // -- decor: floorDecor (toys) ------------------------------------------------------
  'ball-1': { id: 'ball-1', name: '공 1', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/ball1.png`, naturalWidth: 113, naturalHeight: 119 },
  'ball-2': { id: 'ball-2', name: '공 2', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/ball2.png`, naturalWidth: 110, naturalHeight: 110 },
  'ball-3': { id: 'ball-3', name: '공 3', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/ball3.png`, naturalWidth: 107, naturalHeight: 107, unlockSource: { type: 'achievement', tierId: 'play-count-20' } }, // 놀이는 내가 책임질게
  duck: { id: 'duck', name: '오리 인형', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/duck.png`, naturalWidth: 108, naturalHeight: 110 },
  horsetoy: { id: 'horsetoy', name: '목마 장난감', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/horsetoy.png`, naturalWidth: 156, naturalHeight: 136 },
  jumprope: { id: 'jumprope', name: '줄넘기', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/jumprope.png`, naturalWidth: 133, naturalHeight: 158 },
  pegtop: { id: 'pegtop', name: '팽이', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/pegtop.png`, naturalWidth: 92, naturalHeight: 113, unlockSource: { type: 'achievement', tierId: 'personal-best-count-10' } }, // 나를 넘어서는 중
  teddybear: { id: 'teddybear', name: '곰인형', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/teddybear.png`, naturalWidth: 104, naturalHeight: 144, unlockSource: { type: 'achievement', tierId: 'total-interactions-500' } }, // 최고의 단짝
  toyblock: { id: 'toyblock', name: '장난감 블록', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/toyblock.png`, naturalWidth: 149, naturalHeight: 142 },
  traintoy: { id: 'traintoy', name: '기차 장난감', category: 'decor', decorSubcategory: 'floorDecor', src: `${ROOM_BASE}/decor/traintoy.png`, naturalWidth: 200, naturalHeight: 108 },
}

/** True once `asset` can actually be placed — `default`/omitted `unlockSource` always, `achievement` only once its id is in the Achievement-reward inventory (lib/room-inventory-storage.ts's `unlockedIds`). Mirrors lib/deco-supported-assets.ts's `isDecoUnlocked` exactly. */
export function isRoomAssetUnlocked(asset: RoomAsset, unlockedAchievementRewardIds: readonly string[]): boolean {
  return asset.unlockSource === undefined || asset.unlockSource.type === 'default' || unlockedAchievementRewardIds.includes(asset.id)
}
