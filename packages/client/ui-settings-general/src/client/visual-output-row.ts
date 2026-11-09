/**
 * Visual-output row registration: one always-present row reports the
 * not-installed state, and a provider that mounts later contributes the same
 * row at a lower priority with live readiness and preference sources.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { VisualOutputRow, type VisualOutputRowInjected } from './VisualOutputRow.tsx'
import {
  VISUAL_OUTPUT_DISABLED_SOURCE, VISUAL_OUTPUT_NOT_INSTALLED_SOURCE,
} from './visual-output.ts'

/** Settings dictionary namespace owned by the settings shell. */
const NS = 'settings'

/** Row position shared by both contributions; the prototype places Output first. */
const ROW_ORDER = 5

/**
 * Install the fallback row and follow a provider for as long as it is mounted.
 * @param ctx - context whose slot ledger receives the row
 */
export function installVisualOutputRow(ctx: ClientContext): void {
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'visual-output', order: ROW_ORDER, priority: 10, locale: NS,
    inject: (): VisualOutputRowInjected => ({
      hooks: {
        readiness: VISUAL_OUTPUT_NOT_INSTALLED_SOURCE,
        visualOutput: VISUAL_OUTPUT_DISABLED_SOURCE,
      },
      setEnabled: () => Promise.resolve(false),
    }),
  }, VisualOutputRow))
  // The nested inject starts with the provider and disposes with it, so a
  // withdrawn or replaced service restores the not-installed row rather than
  // leaving a stale registration bound to the old provider.
  ctx.inject(['visualOutput'], (scoped) => {
    scoped.effect(() => scoped.slots.inject('settings.general.item', () => scoped.slots.register({
      name: 'settings.general.item', id: 'visual-output', order: ROW_ORDER, priority: 0, locale: NS,
      inject: (): VisualOutputRowInjected => ({
        hooks: {
          readiness: scoped.visualOutput.readiness,
          visualOutput: scoped.visualOutput.enabled,
        },
        setEnabled: enabled => scoped.visualOutput.setEnabled(enabled),
      }),
    }, VisualOutputRow)))
  })
}
