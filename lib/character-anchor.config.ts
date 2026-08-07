import type { CharacterStateKey } from '@/lib/character-state-assets'

/**
 * Where a Deco sticker can attach on the Statling — see
 * lib/deco-placement-layout.ts. Kept to exactly these three per the Deco
 * placement spec ("최소한 head, face, body anchor").
 */
export type CharacterAnchorKey = 'head' | 'face' | 'body'

export interface AnchorPoint {
  x: number
  y: number
}

export type CharacterAnchorSet = Record<CharacterAnchorKey, AnchorPoint>

/**
 * Generic fallback — where head/face/body typically sit (as a fraction of
 * the character's own square render box) for this app's centered chibi art
 * style. Sanity-checked against a few finished characters (01_치즈털실냥이,
 * 02_플로봇, 08_바다고래) rather than guessed, but real per-character art doesn't
 * agree closely (e.g. 02_플로봇's long antenna and extra bottom padding reads
 * very differently from a compact whale) — this is a starting point for any
 * character/state with no curated override below, not a promise of a pixel-
 * perfect fit for all 30 characters. Add entries to
 * CHARACTER_ANCHOR_OVERRIDES as better per-character data is authored.
 */
export const DEFAULT_CHARACTER_ANCHORS: CharacterAnchorSet = {
  head: { x: 0.5, y: 0.26 },
  face: { x: 0.5, y: 0.38 },
  body: { x: 0.5, y: 0.68 },
}

type PartialAnchorSet = Partial<Record<CharacterAnchorKey, AnchorPoint>>

/**
 * Sparse per-character, per-state overrides, keyed by
 * lib/character-state-assets.ts's CharacterStateFolder.folderId (= PetProfile.id,
 * e.g. '01_치즈털실냥이'). Most characters/states have no entry at all —
 * resolveCharacterAnchors falls back to that character's own 'idle' entry
 * (if any), then to DEFAULT_CHARACTER_ANCHORS above, independently per anchor
 * key (so a character with only a curated `head` for 'idle' still gets the
 * generic default `face`/`body`).
 */
const CHARACTER_ANCHOR_OVERRIDES: Partial<Record<string, Partial<Record<CharacterStateKey, PartialAnchorSet>>>> = {
  '01_치즈털실냥이': {
    idle: { head: { x: 0.5, y: 0.22 }, face: { x: 0.5, y: 0.34 }, body: { x: 0.48, y: 0.72 } },
  },
  '02_플로봇': {
    idle: { head: { x: 0.5, y: 0.12 }, face: { x: 0.5, y: 0.47 }, body: { x: 0.5, y: 0.85 } },
  },
  '08_바다고래': {
    idle: { head: { x: 0.5, y: 0.28 }, face: { x: 0.44, y: 0.48 }, body: { x: 0.5, y: 0.68 } },
  },
}

/**
 * Resolves the (head, face, body) anchor points for one character folder at
 * one expression/action state. Fallback chain per anchor key: this exact
 * state's curated override -> this character's own 'idle' override -> the
 * generic DEFAULT_CHARACTER_ANCHORS. `folderId: null` (no real petProfile,
 * e.g. the generic per-stat CharacterImage fallback) always resolves to the
 * generic default.
 */
export function resolveCharacterAnchors(folderId: string | null, state: CharacterStateKey): CharacterAnchorSet {
  const forCharacter = folderId ? CHARACTER_ANCHOR_OVERRIDES[folderId] : undefined
  const stateOverride = forCharacter?.[state]
  const idleOverride = forCharacter?.idle
  return {
    head: stateOverride?.head ?? idleOverride?.head ?? DEFAULT_CHARACTER_ANCHORS.head,
    face: stateOverride?.face ?? idleOverride?.face ?? DEFAULT_CHARACTER_ANCHORS.face,
    body: stateOverride?.body ?? idleOverride?.body ?? DEFAULT_CHARACTER_ANCHORS.body,
  }
}
