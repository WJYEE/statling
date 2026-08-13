'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AUTONOMOUS_PLAY_ALONE_HAPPINESS_BONUS,
  AUTONOMOUS_SLEEP_ENERGY_BONUS,
  AUTONOMY_DAILY_ENERGY_CAP,
  AUTONOMY_DAILY_HAPPINESS_CAP,
} from '@/lib/config/pet-autonomy.config'
import { GAME_REACTION_DELAY_MAX_MS, GAME_REACTION_DELAY_MIN_MS, GAME_REACTION_HOLD_MS } from '@/lib/config/game-reactions.config'
import {
  consumePendingGameReaction,
  recordCareAction as recordCareActionInMemory,
  recordInitiatedDialogue,
  recordMemoryCommentShown,
  resetAutonomyBonusIfNewDay,
  type PetMemory,
} from '@/lib/pet-care/pet-memory'
import { energyDeltaFor, resolveGameReaction } from '@/lib/pet-care/game-reactions'
import { loadPetMemory, savePetMemory } from '@/lib/pet-care/pet-memory-storage'
import { computeVisitContext, updateVisitMemory, type VisitContext } from '@/lib/pet-care/visit-context'
import type { CareActionId, CareStatId, PetAnimation } from '@/lib/pet-care/types'

export interface GameReactionView {
  active: boolean
  speech: string | null
  animation: PetAnimation | null
}

/**
 * Owns PetMemory end to end: loads + records "entering the Room now" once
 * per mount, surfaces a waiting minigame reaction as a one-shot
 * speech/animation window (consuming it immediately on start so a refresh
 * mid-reaction can never re-grant it), and exposes the recorder functions
 * usePetInitiatedDialogue/usePetAutonomy/room-screen call into.
 */
export function usePetMemory(applyEffect: (deltas: Partial<Record<CareStatId, number>>, expGain: number) => void) {
  // Frozen at mount, from the *pre-update* saved memory — computing
  // `computeVisitContext` from the post-`updateVisitMemory` state below
  // would always see totalVisits/lastVisitDate/lastVisitedAt as already
  // reflecting *this* visit (e.g. isFirstEverVisit would never be true),
  // since updateVisitMemory bumps them immediately. This snapshot is what
  // usePetInitiatedDialogue's entry greeting actually reasons about.
  const [visitContext] = useState<VisitContext>(() => {
    const now = new Date()
    return computeVisitContext(loadPetMemory(now), now)
  })
  const [memory, setMemory] = useState<PetMemory>(() => {
    const now = new Date()
    return resetAutonomyBonusIfNewDay(updateVisitMemory(loadPetMemory(now), now), now)
  })
  const [gameReaction, setGameReaction] = useState<GameReactionView>({ active: false, speech: null, animation: null })
  /** Bumped whenever a new reaction is shown — exposed as `gameReactionId` so room-screen.tsx can build a React key that still changes across (extremely unlikely, but possible) identical-text reactions. */
  const [gameReactionId, setGameReactionId] = useState(0)

  const memoryRef = useRef(memory)
  memoryRef.current = memory
  const timeoutsRef = useRef<number[]>([])
  const gameReactionTimeoutIdRef = useRef<number | null>(null)

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms)
    timeoutsRef.current.push(id)
    return id
  }

  // Persist the mount-time visit update right away.
  useEffect(() => {
    savePetMemory(memoryRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  // Consume a waiting minigame reaction exactly once, after a short "the
  // pet notices" delay — and mark it consumed (saved) immediately, before
  // the delay even elapses, so a refresh during the wait can't re-show it.
  useEffect(() => {
    if (!memoryRef.current.pendingGameReaction) return
    const pending = memoryRef.current.pendingGameReaction

    setMemory((prev) => {
      const next = consumePendingGameReaction(prev, new Date())
      savePetMemory(next)
      return next
    })

    const delay = GAME_REACTION_DELAY_MIN_MS + Math.random() * (GAME_REACTION_DELAY_MAX_MS - GAME_REACTION_DELAY_MIN_MS)
    schedule(() => {
      const resolution = resolveGameReaction(pending)
      applyEffect({ ...resolution.deltas, energy: energyDeltaFor(pending) }, resolution.intimacyExp)
      setGameReaction({ active: true, speech: resolution.dialogue, animation: resolution.animation })
      setGameReactionId((n) => n + 1)
      gameReactionTimeoutIdRef.current = schedule(
        () => setGameReaction({ active: false, speech: null, animation: null }),
        GAME_REACTION_HOLD_MS,
      )
    }, delay)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  useEffect(
    () => () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id))
      timeoutsRef.current = []
    },
    [],
  )

  function recordCareAction(action: CareActionId) {
    setMemory((prev) => {
      const next = recordCareActionInMemory(prev, action, new Date())
      savePetMemory(next)
      return next
    })
  }

  function onInitiatedDialogueShown(id: string, kind: 'general' | 'stateRequest' | 'welcome') {
    setMemory((prev) => {
      const next = recordInitiatedDialogue(prev, id, kind, new Date())
      savePetMemory(next)
      return next
    })
  }

  function onMemoryCommentShown() {
    setMemory((prev) => {
      const next = recordMemoryCommentShown(prev, new Date())
      savePetMemory(next)
      return next
    })
  }

  /** Sleep/playAlone's tiny bonus, gated by the daily cap — returns whether it was actually granted (callers use this to decide whether to still play the "content" version of the animation vs. a capped-out no-op). */
  function onAutonomyBonus(kind: 'sleep' | 'playAlone'): boolean {
    const current = resetAutonomyBonusIfNewDay(memoryRef.current, new Date())
    const cap = kind === 'sleep' ? AUTONOMY_DAILY_ENERGY_CAP : AUTONOMY_DAILY_HAPPINESS_CAP
    const already = kind === 'sleep' ? current.autonomyBonusToday.energyGained : current.autonomyBonusToday.happinessGained
    if (already >= cap) {
      setMemory(current)
      savePetMemory(current)
      return false
    }

    const bonus = kind === 'sleep' ? AUTONOMOUS_SLEEP_ENERGY_BONUS : AUTONOMOUS_PLAY_ALONE_HAPPINESS_BONUS
    applyEffect(kind === 'sleep' ? { energy: bonus } : { happiness: bonus }, 0)

    const next: PetMemory = {
      ...current,
      autonomyBonusToday: {
        ...current.autonomyBonusToday,
        energyGained: current.autonomyBonusToday.energyGained + (kind === 'sleep' ? bonus : 0),
        happinessGained: current.autonomyBonusToday.happinessGained + (kind === 'playAlone' ? bonus : 0),
      },
    }
    setMemory(next)
    savePetMemory(next)
    return true
  }

  return {
    memory,
    visitContext,
    hasPendingGameReaction: memory.pendingGameReaction !== null,
    gameReaction,
    gameReactionId,
    recordCareAction,
    onInitiatedDialogueShown,
    onMemoryCommentShown,
    onAutonomyBonus,
    /** Tap-to-dismiss / preempted-by-a-higher-priority-source support — also cancels the pending auto-hide timeout, not just the visible state (see hooks/use-pet-care.ts's dismissSpeech for the same fix). */
    dismissGameReaction: () => {
      if (gameReactionTimeoutIdRef.current !== null) {
        window.clearTimeout(gameReactionTimeoutIdRef.current)
        gameReactionTimeoutIdRef.current = null
      }
      setGameReaction({ active: false, speech: null, animation: null })
    },
  }
}
