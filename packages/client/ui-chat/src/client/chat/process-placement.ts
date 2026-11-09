/** Suiyi-only placement of a settled Turn's complete process region. */
import type { RenderEntry } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** The role one flow row plays in the settled-process placement decision. */
export type ProcessPlacementRole = 'process' | 'tail' | 'other'

/** Facts from the existing Chat/group sources for one flow entry. */
export interface ProcessPlacementFacts {
  readonly entry: RenderEntry
  readonly turn?: number | undefined
  readonly role: ProcessPlacementRole
  readonly clean: boolean
  readonly hasGroup: boolean
  readonly hasSummary: boolean
  readonly hasInterleavedInput: boolean
}

/** One ordered output row: an existing entry, or the necessary completion announcement. */
export type ProcessPlacementRow =
  | { readonly kind: 'entry'; readonly entry: RenderEntry }
  | { readonly kind: 'announce'; readonly turn: number }

interface TurnFacts {
  clean: boolean
  hasGroup: boolean
  hasSummary: boolean
  hasInterleavedInput: boolean
  hasTail: boolean
}

/**
 * Move each clean settled Turn's complete process region immediately before its
 * turn-tail. The region already owns the summary and process group; moving the
 * entries preserves React keys, disclosure state, and anchors. A clean Turn
 * without a process group drops an empty summary and keeps a hidden completion
 * announcement instead.
 * @param facts - flow entries with only the read-only placement facts.
 * @returns ordered entries and any hidden completion announcements.
 */
export function orderProcessAfterAnswer(
  facts: readonly ProcessPlacementFacts[],
): readonly ProcessPlacementRow[] {
  const turns = new Map<number, TurnFacts>()
  const processByTurn = new Map<number, RenderEntry[]>()
  for (const fact of facts) {
    if (fact.turn === undefined) continue
    const state = turns.get(fact.turn) ?? {
      clean: true, hasGroup: false, hasSummary: false, hasInterleavedInput: false, hasTail: false,
    }
    state.clean = state.clean && fact.clean
    state.hasGroup = state.hasGroup || fact.hasGroup
    state.hasSummary = state.hasSummary || fact.hasSummary
    state.hasInterleavedInput = state.hasInterleavedInput || fact.hasInterleavedInput
    state.hasTail = state.hasTail || fact.role === 'tail'
    turns.set(fact.turn, state)
    if (fact.role === 'process') {
      const rows = processByTurn.get(fact.turn) ?? []
      rows.push(fact.entry)
      processByTurn.set(fact.turn, rows)
    }
  }

  const movable = new Set<number>()
  const announce = new Set<number>()
  for (const [turn, state] of turns) {
    if (!state.clean || state.hasInterleavedInput || !state.hasTail) continue
    if (state.hasGroup) movable.add(turn)
    // The moved summary carries the live completion announcement. Without a
    // group or a moved summary, keep one hidden status and drop the empty bar.
    if (!state.hasSummary || !state.hasGroup) announce.add(turn)
  }

  const ordered: ProcessPlacementRow[] = []
  for (const fact of facts) {
    const state = fact.turn === undefined ? undefined : turns.get(fact.turn)
    const canMove = fact.turn !== undefined && movable.has(fact.turn)
    const dropEmptySummary = fact.role === 'process' && state !== undefined
      && state.clean && state.hasTail && !state.hasInterleavedInput && !state.hasGroup && state.hasSummary
    if (canMove && fact.role === 'process') continue
    if (dropEmptySummary) continue
    if (fact.role === 'tail' && fact.turn !== undefined && canMove) {
      for (const entry of processByTurn.get(fact.turn) ?? []) ordered.push({ kind: 'entry', entry })
    }
    if (fact.role === 'tail' && fact.turn !== undefined && announce.has(fact.turn)) {
      ordered.push({ kind: 'announce', turn: fact.turn })
    }
    ordered.push({ kind: 'entry', entry: fact.entry })
  }
  return ordered
}
