import type { PetMemory } from '@/lib/pet-care/pet-memory'

/**
 * Days since the representative pet was confirmed (StoredPetProfile.confirmedAt)
 * — simple date math over a real stored timestamp, not a new tracked field.
 * `undefined`/unparseable input (never confirmed yet, or corrupt storage)
 * reads as "just met today" rather than throwing or going negative.
 */
export function daysTogether(confirmedAt: string | undefined, now: Date = new Date()): number {
  if (!confirmedAt) return 0
  const confirmedMs = new Date(confirmedAt).getTime()
  if (Number.isNaN(confirmedMs)) return 0
  const diffMs = now.getTime() - confirmedMs
  if (diffMs <= 0) return 0
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}

/** Total mini-game plays across all 6 stats — same ad-hoc sum lib/pet-care/pet-memory.ts#isConsistentPlayer already does over PetMemory.gamePlayCountsByStat, just exposed as its own reusable number. */
export function totalMiniGamePlays(memory: Pick<PetMemory, 'gamePlayCountsByStat'>): number {
  return Object.values(memory.gamePlayCountsByStat).reduce((sum: number, count) => sum + (count ?? 0), 0)
}
