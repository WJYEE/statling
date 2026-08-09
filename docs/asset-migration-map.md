# Asset migration map — 2026-07-29

Reorganization of `public/assets/statling/{characters,eggs,characters/deco}` into a
registry-backed, per-category structure. No image content was redrawn, cropped,
resized, or deleted — every change below is a `git mv` (rename) plus updating the
handful of code files that held a literal path string.

Full machine-readable detail: [`scripts/asset-migration-map.json`](../scripts/asset-migration-map.json)
(1,188 entries: `oldPath`/`newPath`/`category`/`assetId`) and
[`scripts/asset-inventory.json`](../scripts/asset-inventory.json) (same entries plus
measured `width`/`height`/`transparent`/`fileSize` per file, read directly from each
PNG's own header — never estimated).

## What moved

| Category | Count | Old layout | New layout |
|---|---|---|---|
| Characters | 461 | `characters/pet_NNN.png` | `characters/pet_NNN/idle.png` |
| Egg hatch sequence (in use) | 7 | `eggs/{0-6}알.png` | `eggs/hatch-sequence/stage0{0-6}.png` |
| Egg designs (unused inventory) | 480 | `eggs/egg_NNN.png` | `eggs/designs/egg-NNN.png` |
| Deco items (unused inventory) | 240 | `characters/deco/accessory_NNN.png` | `characters/deco/unknown/accessory_NNN.png` |

Untouched: `room/` (already registry-backed via `lib/room-assets.ts`, done by a separate
pass), `characters/deco/sheets/` and `room/sheets/` (raw uncropped multi-item export
sheets, not individual assets), `audio/`.

## Why each set was handled the way it was

- **Characters (all 461, physically moved):** `lib/pets/pet-storage.ts` only ever
  persists a pet's `id` string (e.g. `"pet_001"`) to localStorage, never its image
  path — so this move required zero storage migration. Confirmed via
  `migrateRoomState`-equivalent review before moving anything.
- **Egg hatch sequence (7 files):** These are animation frames of one egg's growth
  (stage 0 → 6), the only egg asset actually wired into a screen
  (`components/brain-bet/egg-image.tsx`), driven by a computed integer stage —
  never a persisted path.
- **Egg designs (480 files):** Per explicit direction, these are standalone designs,
  not animation frames of a shared egg — kept flat under `eggs/designs/` rather than
  given one directory each, since there's no per-design animation state today.
  Cataloged in `EGG_DESIGNS` (`lib/egg-assets.ts`) for a future gacha/rarity pass.
- **Deco items (240 files):** Zero code references anywhere in the project, and
  filenames (`accessory_NNN.png`) carry no recoverable slot information. Rather than
  guess a slot from a sequence number, every item was parked under
  `characters/deco/unknown/` and cataloged with `slot: 'unknown'` in
  `CHARACTER_DECO_ASSETS` (`lib/character-deco-assets.ts`). The sibling slot folders
  (`head/`, `face/`, `eyes/`, `neck/`, `body/`, `back/`, `hand/`, `effect/`) were
  created empty (with a `readme` placeholder, matching the existing
  `audio/*/readme` convention) so reclassifying an item later is just: look at the
  image, `git mv` it into the right slot folder, update its `slot` field.

## Code references updated

| File | Change |
|---|---|
| `lib/pets/pet-profile.ts` | 24 `imageSrc: '/assets/statling/characters/pet_NNN.png'` literals → `imageSrc: characterIdlePath('pet_NNN')` |
| `components/brain-bet/character-image.tsx` | `CHARACTER_IMAGE_SRC` (6 stats) + `BONUS_CHARACTER_IMAGE_SRC` (2 entries) → `characterIdlePath(...)` |
| `components/brain-bet/egg-image.tsx` | `EGG_IMAGE_SRC` now derived from `EGG_HATCH_SEQUENCE` (`lib/egg-assets.ts`) instead of 7 hardcoded `N알.png` literals |

## New registries

- `lib/character-assets.ts` — `CHARACTER_ASSETS` (461 entries: id, displayName,
  directory, `animations: { idle }`, measured `canvasSize`) + `characterIdlePath(id)`
  helper. `CharacterAnimationKey` already includes the states a future sprite pass
  can add (`blink`/`happy`/`sad`/`sleep`/`eat`/`wash`/`play`/`pet`/`talk`) — adding
  one is a new file + a new `animations` key, no shape change.
- `lib/egg-assets.ts` — `EGG_HATCH_SEQUENCE` (7-entry ordered array) and
  `EGG_DESIGNS` (480 entries).
- `lib/character-deco-assets.ts` — `CHARACTER_DECO_ASSETS` (240 entries, all
  `slot: 'unknown'`) and the `DecoSlot` union for future classification.

## localStorage migration

Not needed. Verified before moving anything:

- `lib/pets/pet-storage.ts` persists `petId` (e.g. `"pet_001"`), never `imageSrc`.
- `components/brain-bet/egg-image.tsx` takes a computed integer `stage`, never a path.
- `lib/room/room-storage.ts` persists `assetId` only, and `migrateRoomState` already
  drops any item whose `assetId` no longer resolves — this was already migration-safe
  before this pass and was not touched.

No existing user's saved data references any of the paths that changed.
