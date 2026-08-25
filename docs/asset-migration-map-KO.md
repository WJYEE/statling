# Asset 마이그레이션 맵 — 2026-07-29

`public/assets/statling/{characters,eggs,characters/deco}`를 레지스트리 기반의 카테고리별 구조로 재구성했다.

이미지 콘텐츠 자체는 다시 그리거나, 자르거나, 크기를 조정하거나, 삭제하지 않았다. 아래의 모든 변경 사항은 `git mv`(이름 변경/이동)와 함께, 리터럴 경로 문자열을 가지고 있던 일부 코드 파일을 업데이트한 것이다.

전체 머신 리더블 상세 정보: [`scripts/asset-migration-map.json`](../scripts/asset-migration-map.json)

(1,188개 항목: `oldPath`/`newPath`/`category`/`assetId`) 및

[`scripts/asset-inventory.json`](../scripts/asset-inventory.json)

(동일한 항목에 더해 각 파일별로 측정된 `width`/`height`/`transparent`/`fileSize` 포함. 각 PNG 자체의 헤더에서 직접 읽었으며, 추정하지 않았다.)

## 이동된 항목

| 카테고리 | 개수 | 기존 구조 | 새로운 구조 |
|---|---:|---|---|
| 캐릭터 | 461 | `characters/pet_NNN.png` | `characters/pet_NNN/idle.png` |
| 알 부화 시퀀스 (사용 중) | 7 | `eggs/{0-6}알.png` | `eggs/hatch-sequence/stage0{0-6}.png` |
| 알 디자인 (미사용 인벤토리) | 480 | `eggs/egg_NNN.png` | `eggs/designs/egg-NNN.png` |
| 데코 아이템 (미사용 인벤토리) | 240 | `characters/deco/accessory_NNN.png` | `characters/deco/unknown/accessory_NNN.png` |

변경하지 않은 항목: `room/` (이미 `lib/room-assets.ts`를 통해 레지스트리 기반으로 구성되어 있으며 별도의 작업에서 처리됨), `characters/deco/sheets/` 및 `room/sheets/` (개별 에셋이 아니라 잘리지 않은 원본 멀티 아이템 export sheet), `audio/`.

## 각 에셋 세트를 해당 방식으로 처리한 이유

- **캐릭터 (전체 461개, 실제 파일 이동):** `lib/pets/pet-storage.ts`는 pet의 `id` 문자열(예: `"pet_001"`)만 localStorage에 저장하며, 이미지 경로는 저장하지 않는다. 따라서 이번 이동에는 별도의 스토리지 마이그레이션이 필요하지 않았다. 파일을 이동하기 전에 `migrateRoomState`에 준하는 검토를 통해 이를 확인했다.

- **알 부화 시퀀스 (7개 파일):** 하나의 알이 성장하는 과정(stage 0 → 6)의 애니메이션 프레임이다. 실제 화면에 연결되어 사용 중인 유일한 알 에셋이며 (`components/brain-bet/egg-image.tsx`), 계산된 정수형 stage 값에 의해 제어된다. 경로 자체는 저장되지 않는다.

- **알 디자인 (480개 파일):** 명시된 방향에 따라, 이 파일들은 하나의 공통 알에 대한 애니메이션 프레임이 아니라 각각 독립된 디자인이다. 현재는 디자인별 애니메이션 상태가 존재하지 않으므로 각 디자인마다 별도의 디렉터리를 만드는 대신 `eggs/designs/` 아래에 flat 구조로 유지했다. 향후 gacha/rarity 작업을 위해 `EGG_DESIGNS` (`lib/egg-assets.ts`)에 카탈로그화했다.

- **데코 아이템 (240개 파일):** 프로젝트 전체에서 코드 참조가 하나도 없으며, 파일명(`accessory_NNN.png`)만으로는 슬롯 정보를 복원할 수 없다. 순번을 보고 슬롯을 추측하는 대신, 모든 아이템을 `characters/deco/unknown/` 아래에 배치하고 `CHARACTER_DECO_ASSETS` (`lib/character-deco-assets.ts`)에 `slot: 'unknown'`으로 등록했다. 인접한 슬롯 폴더 (`head/`, `face/`, `eyes/`, `neck/`, `body/`, `back/`, `hand/`, `effect/`)는 비어 있는 상태로 생성했다 (`audio/*/readme`의 기존 규칙과 동일하게 `readme` placeholder 사용). 따라서 추후 아이템을 재분류할 때는 이미지를 확인하고, `git mv`로 올바른 슬롯 폴더로 이동한 다음, 해당 아이템의 `slot` 필드를 업데이트하기만 하면 된다.

## 업데이트된 코드 참조

| 파일 | 변경 사항 |
|---|---|
| `lib/pets/pet-profile.ts` | 24개의 `imageSrc: '/assets/statling/characters/pet_NNN.png'` 리터럴 → `imageSrc: characterIdlePath('pet_NNN')` |
| `components/brain-bet/character-image.tsx` | `CHARACTER_IMAGE_SRC` (6개 stats) + `BONUS_CHARACTER_IMAGE_SRC` (2개 항목) → `characterIdlePath(...)` |
| `components/brain-bet/egg-image.tsx` | `EGG_IMAGE_SRC`가 하드코딩된 7개의 `N알.png` 리터럴 대신 `EGG_HATCH_SEQUENCE` (`lib/egg-assets.ts`)에서 파생되도록 변경 |

## 새로 추가된 레지스트리

- `lib/character-assets.ts` — `CHARACTER_ASSETS` (461개 항목: id, displayName, directory, `animations: { idle }`, 측정된 `canvasSize`) + `characterIdlePath(id)` helper. `CharacterAnimationKey`에는 향후 sprite 작업에서 추가할 수 있는 상태 (`blink`/`happy`/`sad`/`sleep`/`eat`/`wash`/`play`/`pet`/`talk`)가 이미 포함되어 있다. 하나를 추가하려면 새 파일 + 새로운 `animations` key만 추가하면 되며, 구조 자체를 변경할 필요는 없다.

- `lib/egg-assets.ts` — `EGG_HATCH_SEQUENCE` (순서가 있는 7개 항목의 배열) 및 `EGG_DESIGNS` (480개 항목).

- `lib/character-deco-assets.ts` — `CHARACTER_DECO_ASSETS` (240개 항목, 모두 `slot: 'unknown'`) 및 향후 분류를 위한 `DecoSlot` union.

## localStorage 마이그레이션

필요하지 않다. 파일을 이동하기 전에 다음 사항을 확인했다.

- `lib/pets/pet-storage.ts`는 `imageSrc`가 아니라 `petId`(예: `"pet_001"`)를 저장한다.
- `components/brain-bet/egg-image.tsx`는 경로가 아니라 계산된 정수형 `stage`를 입력으로 받는다.
- `lib/room/room-storage.ts`는 `assetId`만 저장하며, `migrateRoomState`는 더 이상 해석할 수 없는 `assetId`를 가진 아이템을 이미 제거하도록 되어 있다. 따라서 이번 작업 이전부터 마이그레이션에 안전한 상태였으며 이번 작업에서는 수정하지 않았다.

기존 사용자의 저장 데이터 중 이번에 변경된 경로를 참조하는 데이터는 없다.