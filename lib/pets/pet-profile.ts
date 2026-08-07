import { PLAY_ORDER, type StatId } from '@/lib/brain-bet'
import { buildCharacterStateFolder } from '@/lib/character-state-assets'

/**
 * A pet's 6-stat affinity vector. Each value is normalized 0-1, primaryStat
 * always the highest (1.0) and secondaryStat second (0.75) — see
 * buildStatVector. Kept only for the flavor systems that rank a pet's own
 * stats (lib/pets/compatibility.ts, lib/pets/pet-analysis.ts); character
 * *selection* itself uses primaryStat/secondaryStat directly, never the
 * vector (see lib/pets/pet-profile.ts#findCharacterByStats).
 */
export type StatVector = Record<StatId, number>

export interface PetProfile {
  /** Real directory name under public/assets/statling/characters, e.g. '01_치즈털실냥이' — doubles as the catalog id and the CharacterStateFolder folderId. */
  id: string
  /** Display name shown on the reveal screen (folder name without the numeric prefix). */
  name: string
  /** Real file path under public/assets/statling/characters — the folder's 01_idle.png, resolved through buildCharacterStateFolder. */
  imageSrc: string
  /** The stat combination this character represents (see public/assets/statling/characters/00_match/00_match.md) — every one of the 30 characters covers a distinct (primary, secondary) pair out of the 6x5=30 possible combinations. */
  primaryStat: StatId
  secondaryStat: StatId
  /** Stat affinity vector derived from primaryStat/secondaryStat — used for the compatibility/analysis flavor text, never for selection. */
  vector: StatVector
  /** Short flavor line describing the pet itself (not the match reason). */
  tagline: string
}

/**
 * primaryStat always 1.0, secondaryStat always 0.75, the remaining 4 stats
 * get distinct, strictly decreasing filler values (in PLAY_ORDER order) so
 * rankStatsByVector (lib/pets/pet-analysis.ts) always resolves ties the same
 * way — this is flavor-only data, the exact filler values don't carry
 * meaning beyond "clearly below secondaryStat, clearly distinct from each other".
 */
function buildStatVector(primaryStat: StatId, secondaryStat: StatId): StatVector {
  const vector = { [primaryStat]: 1, [secondaryStat]: 0.75 } as StatVector
  const fillerValues = [0.55, 0.4, 0.25, 0.1]
  let i = 0
  for (const id of PLAY_ORDER) {
    if (id === primaryStat || id === secondaryStat) continue
    vector[id] = fillerValues[i]
    i += 1
  }
  return vector
}

interface CharacterDef {
  id: string
  name: string
  primaryStat: StatId
  secondaryStat: StatId
  tagline: string
}

/**
 * The 30-character roster — matched to (primary, secondary) stat pairs per
 * public/assets/statling/characters/00_match/00_match.md. Every one of the
 * 6x5=30 possible (primary != secondary) combinations out of the 6 stats is
 * covered exactly once, so findCharacterByStats always resolves.
 */
const CHARACTER_DEFS: CharacterDef[] = [
  { id: '01_치즈털실냥이', name: '치즈털실냥이', primaryStat: 'reaction', secondaryStat: 'spatial', tagline: '실뭉치를 쫓아다니는 민첩한 몸놀림과 균형감각을 가졌어요.' },
  { id: '02_플로봇', name: '플로봇', primaryStat: 'judgment', secondaryStat: 'reasoning', tagline: '기계적인 연산으로 논리정연하게 결론을 내려요.' },
  { id: '03_잎사귀양', name: '잎사귀양', primaryStat: 'focus', secondaryStat: 'memory', tagline: '무리를 따라가며 익힌 습관을 오래오래 기억해요.' },
  { id: '04_상처도치', name: '상처도치', primaryStat: 'judgment', secondaryStat: 'focus', tagline: '위협 앞에서는 신중하게 방어 태세부터 갖춰요.' },
  { id: '05_알삐약이', name: '알삐약이', primaryStat: 'memory', secondaryStat: 'reaction', tagline: '갓 부화한 순간의 기억과 반사반응이 또렷해요.' },
  { id: '06_초록스카프수달', name: '초록스카프수달', primaryStat: 'reaction', secondaryStat: 'focus', tagline: '도구를 다루는 손놀림이 재빠르고 몰입도 잘해요.' },
  { id: '07_별사막여우', name: '별사막여우', primaryStat: 'reasoning', secondaryStat: 'judgment', tagline: '별빛을 읽어 상황을 추론하고 결정을 내려요.' },
  { id: '08_바다고래', name: '바다고래', primaryStat: 'spatial', secondaryStat: 'memory', tagline: '긴 이동 경로를 기억하며 넓은 바다를 항해해요.' },
  { id: '09_동글이유령', name: '동글이유령', primaryStat: 'reasoning', secondaryStat: 'memory', tagline: '과거의 기억을 단서로 삼아 추리를 즐겨요.' },
  { id: '10_반짝벌', name: '반짝벌', primaryStat: 'spatial', secondaryStat: 'focus', tagline: '꽃의 위치를 파악하며 집중해서 날아다녀요.' },
  { id: '11_하트덕', name: '하트덕', primaryStat: 'reaction', secondaryStat: 'memory', tagline: '재빠르게 자맥질하면서도 귀소본능은 잊지 않아요.' },
  { id: '12_분홍학', name: '분홍학', primaryStat: 'spatial', secondaryStat: 'reaction', tagline: '외다리로 균형을 잡으며 순간적으로 반응해요.' },
  { id: '13_나뭇잎여우', name: '나뭇잎여우', primaryStat: 'judgment', secondaryStat: 'spatial', tagline: '은신처를 고르고 지형을 파악하는 눈썰미가 있어요.' },
  { id: '14_새싹코알라', name: '새싹코알라', primaryStat: 'focus', secondaryStat: 'spatial', tagline: '나뭇가지 위에서 균형을 잡으며 느긋하게 집중해요.' },
  { id: '15_물끄럼개미핥기', name: '물끄럼개미핥기', primaryStat: 'focus', secondaryStat: 'judgment', tagline: '굴 팔 위치를 판단하며 끈질기게 집중해요.' },
  { id: '16_균형다람쥐', name: '균형다람쥐', primaryStat: 'spatial', secondaryStat: 'judgment', tagline: '저울처럼 균형을 잡으며 신중하게 판단해요.' },
  { id: '17_포동동곰', name: '포동동곰', primaryStat: 'memory', secondaryStat: 'judgment', tagline: '경험이 쌓여야 비로소 판단을 내리는 편이에요.' },
  { id: '18_지식토끼', name: '지식토끼', primaryStat: 'reasoning', secondaryStat: 'focus', tagline: '책을 읽으며 추론력과 몰입을 함께 다져요.' },
  { id: '19_우주멍멍이', name: '우주멍멍이', primaryStat: 'memory', secondaryStat: 'reasoning', tagline: '지식을 기억하고 추론하는 높은 지능을 가졌어요.' },
  { id: '20_스카프강쥐', name: '스카프강쥐', primaryStat: 'reaction', secondaryStat: 'judgment', tagline: '활발하게 반응하면서도 눈치가 빨라요.' },
  { id: '21_동글거북', name: '동글거북', primaryStat: 'memory', secondaryStat: 'focus', tagline: '오래 살아온 만큼 지혜롭고, 책을 읽을 땐 차분해요.' },
  { id: '22_붕어빵아홀로틀', name: '붕어빵아홀로틀', primaryStat: 'memory', secondaryStat: 'spatial', tagline: '서식지를 기억하고 물속 방향감각도 뛰어나요.' },
  { id: '23_잎라쿤', name: '잎라쿤', primaryStat: 'judgment', secondaryStat: 'memory', tagline: '먹이 저장 장소를 기억해뒀다가 판단에 활용해요.' },
  { id: '24_꽃사막여우', name: '꽃사막여우', primaryStat: 'reasoning', secondaryStat: 'spatial', tagline: '사막에서 길을 추론해가며 찾아내요.' },
  { id: '25_치즈생쥐', name: '치즈생쥐', primaryStat: 'reaction', secondaryStat: 'reasoning', tagline: '재빠른 몸놀림으로 보물찾기하듯 추리해요.' },
  { id: '26_눈송이늑대', name: '눈송이늑대', primaryStat: 'judgment', secondaryStat: 'reaction', tagline: '무리 사냥 중에도 순간적으로 판단하고 반응해요.' },
  { id: '27_겨울펭귄', name: '겨울펭귄', primaryStat: 'focus', secondaryStat: 'reasoning', tagline: '낚시에 몰입하며 전략적으로 생각해요.' },
  { id: '28_귤카피바라', name: '귤카피바라', primaryStat: 'focus', secondaryStat: 'reaction', tagline: '평온해 보여도 위협 앞에선 순식간에 움직여요.' },
  { id: '29_무지개유니콘', name: '무지개유니콘', primaryStat: 'reasoning', secondaryStat: 'reaction', tagline: '마법 같은 직관과 순간적인 반응을 지녔어요.' },
  { id: '30_꽃다발공룡', name: '꽃다발공룡', primaryStat: 'spatial', secondaryStat: 'reasoning', tagline: '계절과 방향을 읽어 개화 시기를 추론해요.' },
]

export const CHARACTER_CATALOG: PetProfile[] = CHARACTER_DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  imageSrc: buildCharacterStateFolder(def.id, def.name).assets.idle,
  primaryStat: def.primaryStat,
  secondaryStat: def.secondaryStat,
  vector: buildStatVector(def.primaryStat, def.secondaryStat),
  tagline: def.tagline,
}))

export function getPetProfileById(id: string): PetProfile | undefined {
  return CHARACTER_CATALOG.find((pet) => pet.id === id)
}

/** The one character whose (primaryStat, secondaryStat) exactly matches the given pair — always resolves, since the 30-character roster covers all 6x5 combinations. Falls back to the catalog's first entry only as a defensive guard against a corrupt/incomplete roster, never expected to trigger in practice. */
export function findCharacterByStats(primaryStat: StatId, secondaryStat: StatId): PetProfile {
  return (
    CHARACTER_CATALOG.find((pet) => pet.primaryStat === primaryStat && pet.secondaryStat === secondaryStat) ??
    CHARACTER_CATALOG[0]
  )
}

/**
 * The lowest-numbered roster entry whose primaryStat is the given stat — one
 * fixed "face" per stat for flavor UI that only has a single StatId to work
 * with (not a full primary+secondary pair), e.g. the 궁합 compatibility
 * cards. Same resolution rule character-image.tsx's CHARACTER_IMAGE_SRC
 * fallback map already hand-picks per stat (reaction -> 01_치즈털실냥이,
 * memory -> 05_알삐약이, focus -> 03_잎사귀양, judgment -> 02_플로봇, spatial ->
 * 08_바다고래, reasoning -> 07_별사막여우) — expressed generically here instead
 * of duplicating that lookup table.
 */
export function getRepresentativeCharacterForStat(stat: StatId): PetProfile {
  return CHARACTER_CATALOG.find((pet) => pet.primaryStat === stat) ?? CHARACTER_CATALOG[0]
}
