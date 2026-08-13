/**
 * Catalog of every PNG under public/assets/statling/characters/deco/1supported —
 * generated from a one-off filesystem + dimension probe (same convention as
 * lib/room-assets.ts / lib/character-assets.ts), never guessed. The user curates
 * 1supported/2unsupported by hand; this file is just a snapshot of whatever is
 * currently in 1supported at generation time — re-run the generator script if
 * more items are moved in later (see scratchpad/gen_supported_deco.py in this
 * session, or regenerate an equivalent script). Deliberately NOT slot-classified —
 * see the Deco placement feature's scope notes (character-deco-assets.ts's
 * DecoSlot system is a separate, unrelated catalog, not used here).
 */

/**
 * `default` — usable from the start, same as every item always has been.
 * `level_gift` — usable only after the matching Statling level-gift has
 * actually been claimed (see PetCareState.giftReadyLevel's claim flow in
 * hooks/use-pet-care.ts#claimGift and the inventory in
 * lib/deco-inventory-storage.ts). `level` is the intimacy level
 * (lib/pet-care/leveling.ts's MAX_LEVEL=50) this asset is the reward for.
 * `comment` is the one-line flavor text the reward popup shows underneath
 * the item name (components/brain-bet/gift-reward-popup.tsx) — kept here
 * rather than scattered in UI so the level -> item -> comment mapping has
 * exactly one source of truth.
 */
export type DecoUnlockSource = { type: 'default' } | { type: 'level_gift'; level: number; comment: string }

export interface SupportedDecoAsset {
  id: string
  name: string
  src: string
  /** Real pixel dimensions of the source PNG, measured directly — used to preserve aspect ratio (object-fit: contain) without ever stretching/cropping the file itself. */
  naturalWidth: number
  naturalHeight: number
  unlockSource: DecoUnlockSource
}

const DECO_SUPPORTED_BASE = '/assets/statling/characters/deco/1supported'

export const SUPPORTED_DECO_ASSETS: SupportedDecoAsset[] = [
  { id: '검정리본', name: '검정리본', src: `${DECO_SUPPORTED_BASE}/검정리본.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '고글', name: '고글', src: `${DECO_SUPPORTED_BASE}/고글.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '고글모자', name: '고글모자', src: `${DECO_SUPPORTED_BASE}/고글모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '날개', name: '날개', src: `${DECO_SUPPORTED_BASE}/날개.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '노랑떙땡이리본', name: '노랑떙땡이리본', src: `${DECO_SUPPORTED_BASE}/노랑떙땡이리본.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '단안경', name: '단안경', src: `${DECO_SUPPORTED_BASE}/단안경.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '도토리', name: '도토리', src: `${DECO_SUPPORTED_BASE}/도토리.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  // Lv.20 level-gift reward (see getLevelGiftDecoAsset below for the full level->reward lookup) — image untouched by the asset pass that added the other 9 gift items, dimensions unchanged.
  { id: '마법사모자', name: '마법사모자', src: `${DECO_SUPPORTED_BASE}/마법사모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'level_gift', level: 20, comment: '한층 성장한 Statling에게 신비로운 힘을 더해줘요.' } },
  { id: '마법지팡이', name: '마법지팡이', src: `${DECO_SUPPORTED_BASE}/마법지팡이.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  // Lv.15 level-gift reward — image was replaced by a larger asset in the same pass that added the new gift PNGs; dimensions re-measured from the current file (was stale 197x198).
  { id: '마술모자', name: '마술모자', src: `${DECO_SUPPORTED_BASE}/마술모자.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 15, comment: '새로운 도전을 시작한 Statling을 위한 마술모자예요.' } },
  { id: '방울빨간리본', name: '방울빨간리본', src: `${DECO_SUPPORTED_BASE}/방울빨간리본.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '버섯모자', name: '버섯모자', src: `${DECO_SUPPORTED_BASE}/버섯모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  // Lv.30 level-gift reward.
  { id: '벚꽃머리핀', name: '벚꽃머리핀', src: `${DECO_SUPPORTED_BASE}/벚꽃머리핀.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 30, comment: '함께한 시간을 닮은 화사한 벚꽃 장식이에요.' } },
  // Lv.35 level-gift reward — filename keeps its own space ("별 머리핀.png"), id matches the real file exactly per this catalog's existing id===filename convention.
  { id: '별 머리핀', name: '별 머리핀', src: `${DECO_SUPPORTED_BASE}/별 머리핀.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 35, comment: '더 높이 성장한 Statling에게 작은 별을 달아주세요.' } },
  // Lv.45 level-gift reward.
  { id: '별빛머플러', name: '별빛머플러', src: `${DECO_SUPPORTED_BASE}/별빛머플러.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 45, comment: 'MAX 레벨을 앞둔 Statling에게 별빛을 둘러주세요.' } },
  { id: '별지팡이', name: '별지팡이', src: `${DECO_SUPPORTED_BASE}/별지팡이.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '사슴머리띠', name: '사슴머리띠', src: `${DECO_SUPPORTED_BASE}/사슴머리띠.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  // Lv.5 level-gift reward.
  { id: '새싹', name: '새싹', src: `${DECO_SUPPORTED_BASE}/새싹.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 5, comment: 'Statling의 첫 성장을 기념하는 작은 새싹이에요.' } },
  { id: '세일러모자', name: '세일러모자', src: `${DECO_SUPPORTED_BASE}/세일러모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '수영고글', name: '수영고글', src: `${DECO_SUPPORTED_BASE}/수영고글.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '안경', name: '안경', src: `${DECO_SUPPORTED_BASE}/안경.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  // Lv.25 level-gift reward.
  { id: '작은티아라', name: '작은티아라', src: `${DECO_SUPPORTED_BASE}/작은티아라.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 25, comment: '반짝이는 순간을 기념하는 작은 티아라예요.' } },
  // Lv.50 (MAX) level-gift reward — filename keeps its own space ("여섯빛 브로치.png"), same id===filename convention as 별 머리핀 above.
  { id: '여섯빛 브로치', name: '여섯빛 브로치', src: `${DECO_SUPPORTED_BASE}/여섯빛 브로치.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 50, comment: '여섯 가지 능력과 함께한 모든 성장을 담은 특별한 브로치예요.' } },
  { id: '여우가면', name: '여우가면', src: `${DECO_SUPPORTED_BASE}/여우가면.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '왕관', name: '왕관', src: `${DECO_SUPPORTED_BASE}/왕관.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '요리사모자', name: '요리사모자', src: `${DECO_SUPPORTED_BASE}/요리사모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '우유', name: '우유', src: `${DECO_SUPPORTED_BASE}/우유.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '종이학', name: '종이학', src: `${DECO_SUPPORTED_BASE}/종이학.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  // Lv.40 level-gift reward — image was replaced by a non-square asset in the same pass that added the new gift PNGs; dimensions re-measured from the current file (was stale 197x198).
  { id: '천사링과날개', name: '천사링과날개', src: `${DECO_SUPPORTED_BASE}/천사링과날개.png`, naturalWidth: 1536, naturalHeight: 1024, unlockSource: { type: 'level_gift', level: 40, comment: '오랜 시간 함께 성장한 Statling을 위한 특별한 날개예요.' } },
  { id: '체크빨강리본', name: '체크빨강리본', src: `${DECO_SUPPORTED_BASE}/체크빨강리본.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '초록체크리본', name: '초록체크리본', src: `${DECO_SUPPORTED_BASE}/초록체크리본.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '탐험가모자1', name: '탐험가모자1', src: `${DECO_SUPPORTED_BASE}/탐험가모자1.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  // Lv.10 level-gift reward — the on-disk file was previously misspelled 파랑귀존리본.png (존 instead of 족) and briefly renamed away entirely; both are now resolved to the correct 파랑귀족리본.png, dimensions re-measured (was stale 197x198).
  { id: '파랑귀족리본', name: '파랑귀족리본', src: `${DECO_SUPPORTED_BASE}/파랑귀족리본.png`, naturalWidth: 1254, naturalHeight: 1254, unlockSource: { type: 'level_gift', level: 10, comment: '조금 더 특별해진 Statling에게 잘 어울리는 리본이에요.' } },
  { id: '파랑리본피크닉모자', name: '파랑리본피크닉모자', src: `${DECO_SUPPORTED_BASE}/파랑리본피크닉모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '파랑우산', name: '파랑우산', src: `${DECO_SUPPORTED_BASE}/파랑우산.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '파티모자', name: '파티모자', src: `${DECO_SUPPORTED_BASE}/파티모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '푸른리본', name: '푸른리본', src: `${DECO_SUPPORTED_BASE}/푸른리본.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '피크닉모자', name: '피크닉모자', src: `${DECO_SUPPORTED_BASE}/피크닉모자.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '해적안대', name: '해적안대', src: `${DECO_SUPPORTED_BASE}/해적안대.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
  { id: '화관', name: '화관', src: `${DECO_SUPPORTED_BASE}/화관.png`, naturalWidth: 197, naturalHeight: 198, unlockSource: { type: 'default' } },
]

export function getSupportedDecoAssetById(id: string): SupportedDecoAsset | undefined {
  return SUPPORTED_DECO_ASSETS.find((asset) => asset.id === id)
}

/** True once `asset` can actually be placed — `default` always, `level_gift` only once its id is in the claimed-gift inventory (lib/deco-inventory-storage.ts's `unlockedIds`). */
export function isDecoUnlocked(asset: SupportedDecoAsset, unlockedLevelGiftIds: readonly string[]): boolean {
  return asset.unlockSource.type === 'default' || unlockedLevelGiftIds.includes(asset.id)
}

/** The Statling Decoration granted for reaching `level`, or undefined if that level has no gift (see hooks/use-pet-care.ts#claimGift). */
export function getLevelGiftDecoAsset(level: number): SupportedDecoAsset | undefined {
  return SUPPORTED_DECO_ASSETS.find((asset) => asset.unlockSource.type === 'level_gift' && asset.unlockSource.level === level)
}

/**
 * Display order for the Statling 꾸미기 grid (statling-screen.tsx): every
 * `default` item first, in the same relative order SUPPORTED_DECO_ASSETS
 * already lists them in (Array.prototype.sort is stable), then every
 * `level_gift` item grouped at the end sorted by level ascending (Lv.5 ->
 * Lv.50). Claiming a gift only lifts its lock (see `isDecoUnlocked`) — it
 * never moves the item out of this group, so the grid's overall layout
 * never shifts just because something got unlocked. Computed once at
 * module load since SUPPORTED_DECO_ASSETS itself never changes at runtime.
 */
export const SUPPORTED_DECO_ASSETS_DISPLAY_ORDER: SupportedDecoAsset[] = [...SUPPORTED_DECO_ASSETS].sort((a, b) => {
  const rank = (asset: SupportedDecoAsset) => (asset.unlockSource.type === 'level_gift' ? 1 : 0)
  const rankDiff = rank(a) - rank(b)
  if (rankDiff !== 0) return rankDiff
  return a.unlockSource.type === 'level_gift' && b.unlockSource.type === 'level_gift' ? a.unlockSource.level - b.unlockSource.level : 0
})

/** Every level with a Statling Decoration gift, ascending (Lv.5, 10, ..., 50) — the single source of truth for both the QA gift trigger (gift-qa-menu.tsx) and the level_gift ordering above. */
export const LEVEL_GIFT_LEVELS: number[] = SUPPORTED_DECO_ASSETS_DISPLAY_ORDER.filter(
  (asset): asset is SupportedDecoAsset & { unlockSource: { type: 'level_gift'; level: number } } => asset.unlockSource.type === 'level_gift',
).map((asset) => asset.unlockSource.level)
