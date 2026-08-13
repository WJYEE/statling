import { PET_REACTION_THRESHOLDS } from '@/lib/config/pet-care.config'
import type { AutonomousActionId, CareStatId, PetAnimation, PetZone } from '@/lib/pet-care/types'

/**
 * `idle` weighted noticeably higher than the small look/hop/walk motions
 * (previously 3 vs 2/2/1.5/1.5) so that whenever a tick does fire while the
 * pet is otherwise stable, it's more likely to resolve to plain stillness
 * than to yet another fidget — see PET_AUTONOMY_CONFIG.minIntervalMs/
 * maxIntervalMs (also widened) for the matching change on the *how often a
 * tick fires at all* side. Together these make idle/blink the clearly
 * dominant thing shown on Home when nothing urgent is going on, with
 * autonomous gestures reading as an occasional beat rather than constant
 * fidgeting — mood-driven asks (askFood/askPlay/askAttention/sleep) are
 * untouched here since those already only spike via the `low*`/`highHappiness`
 * multipliers below, not this base pool.
 */
const BASE_WEIGHTS: Record<AutonomousActionId, number> = {
  idle: 4,
  lookLeft: 1.5,
  lookRight: 1.5,
  smallHop: 1.5,
  walkLeft: 1.5,
  walkRight: 1.5,
  sleep: 1,
  askFood: 1,
  askPlay: 1,
  askAttention: 1,
  celebrate: 1,
  playAlone: 1.5,
  /** The 'thinking' art's "가끔 랜덤으로" trigger — a calm musing beat, so it only leans in under `allStable` below, same as idle/look/walk. */
  ponder: 1.2,
}

export interface AutonomousSelectionInput {
  stats: Record<CareStatId, number>
  /** Excluded from candidates outright — spec requires no immediate repeat, not just a lower chance. */
  lastActionId: AutonomousActionId | null
  /** When true, actions that move the pet (smallHop/walkLeft/walkRight) are excluded — spec: "reduced-motion에서는 위치 이동을 최소화하고 정적 반응으로 대체". */
  reducedMotion?: boolean
}

/**
 * Weighted-random pick, state-driven per spec §6: low energy leans toward
 * rest, low satiety/happiness/affection lean toward the matching "ask"
 * action, high happiness leans toward celebratory motion, and an otherwise
 * stable pet leans toward calm idle/look/walk. Multiple conditions can
 * stack (their weight multipliers just compound).
 */
export function pickAutonomousAction(input: AutonomousSelectionInput): AutonomousActionId {
  const { stats } = input
  const weights = { ...BASE_WEIGHTS }

  const lowEnergy = stats.energy <= PET_REACTION_THRESHOLDS.lowEnergy
  const lowHunger = stats.satiety <= PET_REACTION_THRESHOLDS.lowHunger
  const lowHappiness = stats.happiness <= PET_REACTION_THRESHOLDS.lowHappiness
  const lowAffection = stats.affection <= PET_REACTION_THRESHOLDS.lowAffection
  const highHappiness = stats.happiness >= PET_REACTION_THRESHOLDS.highHappiness
  const allStable = !lowEnergy && !lowHunger && !lowHappiness && !lowAffection

  if (lowEnergy) {
    weights.sleep *= 4
    weights.smallHop *= 0.3
    weights.playAlone *= 0.3
  }
  if (lowHunger) weights.askFood *= 4
  if (lowHappiness) weights.askPlay *= 4
  if (lowAffection) weights.askAttention *= 4
  if (highHappiness) {
    weights.celebrate *= 3
    weights.smallHop *= 2
    weights.playAlone *= 2
  }
  if (allStable) {
    weights.idle *= 2
    weights.lookLeft *= 1.5
    weights.lookRight *= 1.5
    weights.walkLeft *= 1.5
    weights.walkRight *= 1.5
    weights.ponder *= 1.5
  }

  const motionHeavy: AutonomousActionId[] = ['smallHop', 'walkLeft', 'walkRight']
  const candidateIds = (Object.keys(weights) as AutonomousActionId[]).filter(
    (id) => id !== input.lastActionId && !(input.reducedMotion && motionHeavy.includes(id)),
  )
  const total = candidateIds.reduce((sum, id) => sum + weights[id], 0)
  let roll = Math.random() * total
  for (const id of candidateIds) {
    roll -= weights[id]
    if (roll <= 0) return id
  }
  return candidateIds[candidateIds.length - 1]
}

/** walkLeft/walkRight step one zone toward that side; every other action leaves the zone unchanged. */
export function zoneAfter(current: PetZone, action: AutonomousActionId): PetZone {
  if (action === 'walkLeft') return current === 'right' ? 'center' : 'left'
  if (action === 'walkRight') return current === 'left' ? 'center' : 'right'
  return current
}

const ANIMATION_BY_AUTONOMOUS_ACTION: Record<AutonomousActionId, PetAnimation> = {
  idle: 'idle',
  lookLeft: 'lookLeft',
  lookRight: 'lookRight',
  smallHop: 'hop',
  walkLeft: 'walk',
  walkRight: 'walk',
  sleep: 'sleep',
  askFood: 'askFood',
  askPlay: 'askPlay',
  askAttention: 'askAttention',
  celebrate: 'celebrate',
  playAlone: 'playAlone',
  ponder: 'ponder',
}

export function animationForAutonomousAction(action: AutonomousActionId): PetAnimation {
  return ANIMATION_BY_AUTONOMOUS_ACTION[action]
}
