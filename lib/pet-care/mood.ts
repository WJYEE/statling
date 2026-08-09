import { ROOM_ATTENTION_THRESHOLD } from '@/lib/config/pet-care.config'
import {
  DIRTY_THRESHOLD,
  HAPPY_THRESHOLD,
  HUNGRY_THRESHOLD,
  JOYFUL_THRESHOLD,
  LONELY_THRESHOLD,
  SAD_THRESHOLD,
  SLEEPY_THRESHOLD,
} from '@/lib/config/character-state.config'
import type { CareStatId, Mood, SecondaryTag } from '@/lib/pet-care/types'

/**
 * Priority order per spec — exactly one mood wins, evaluated top to bottom.
 * `happiness` is checked last (joyful/happy/sad/calm) so an urgent physical
 * need (hunger/dirt/loneliness/sleep) always outranks the general mood read.
 */
export function computeMood(stats: Record<CareStatId, number>): Mood {
  if (stats.satiety < HUNGRY_THRESHOLD) return 'hungry'
  if (stats.cleanliness < DIRTY_THRESHOLD) return 'dirty'
  if (stats.affection < LONELY_THRESHOLD) return 'lonely'
  if (stats.energy < SLEEPY_THRESHOLD) return 'sleepy'
  if (stats.happiness < SAD_THRESHOLD) return 'sad'
  if (stats.happiness >= JOYFUL_THRESHOLD) return 'joyful'
  if (stats.happiness >= HAPPY_THRESHOLD) return 'happy'
  return 'calm'
}

/** Secondary badges — independent of `Mood`, can show alongside it. */
export function computeSecondaryTags(roomCleanliness: number): SecondaryTag[] {
  const tags: SecondaryTag[] = []
  if (roomCleanliness < ROOM_ATTENTION_THRESHOLD) tags.push('roomMessy')
  return tags
}

export const MOOD_LABEL: Record<Mood, string> = {
  hungry: '배고파요',
  dirty: '더러워요',
  lonely: '외로워요',
  sleepy: '졸려요',
  sad: '기운이 없어요',
  joyful: '신나요',
  happy: '기분 좋아요',
  calm: '편안해요',
}

export const SECONDARY_TAG_LABEL: Record<SecondaryTag, string> = {
  roomMessy: '방이 조금 지저분해요',
}
