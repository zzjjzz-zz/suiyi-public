/**
 * Typed reads of the injected faces these settings rows register. The slot
 * ledger stores every inject factory type-erased; each helper names the face
 * its own spec registered and performs that assertion once.
 */
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { VisualOutputRowInjected } from '../src/client/VisualOutputRow.tsx'
import type { ReduceMotionRowInjected } from '../src/client/ReduceMotionRow.tsx'

/** Evaluate one entry's inject factory; the spec names the registered face. */
function evaluate(entry: StoredEntry): Record<string, unknown> {
  const inject = entry.inject
  if (inject === undefined) throw new Error('test entry declares no inject face')
  return inject()
}

/**
 * Read the visual-output row's inject face.
 * @param entry - stored `settings.general.item` entry
 * @returns the row's injected readiness, preference, and writer
 */
export function visualOutputRowFace(entry: StoredEntry): VisualOutputRowInjected {
  const hooks = evaluate(entry)['hooks']
  const setEnabled = evaluate(entry)['setEnabled']
  if (typeof hooks !== 'object' || hooks === null || typeof setEnabled !== 'function') {
    throw new Error('visual-output row did not register its injected face')
  }
  return {
    hooks: hooks as VisualOutputRowInjected['hooks'],
    setEnabled: setEnabled as VisualOutputRowInjected['setEnabled'],
  }
}

/**
 * Read the reduced-motion row's inject face.
 * @param entry - stored `settings.general.item` entry
 * @returns the row's injected preference and writer
 */
export function reduceMotionRowFace(entry: StoredEntry): ReduceMotionRowInjected {
  const hooks = evaluate(entry)['hooks']
  const setReduceMotion = evaluate(entry)['setReduceMotion']
  if (typeof hooks !== 'object' || hooks === null || typeof setReduceMotion !== 'function') {
    throw new Error('reduced-motion row did not register its injected face')
  }
  return {
    hooks: hooks as ReduceMotionRowInjected['hooks'],
    setReduceMotion: setReduceMotion as ReduceMotionRowInjected['setReduceMotion'],
  }
}
