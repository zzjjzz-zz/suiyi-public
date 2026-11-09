/** Welcome acknowledgement stored in the plugin configuration. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile, Context } from '@deepseek-ai/cordis'

import z from '@deepseek-ai/schemastery'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Last acknowledged welcome notice version. */
  welcomeNoticeVersion: Volatile<string | undefined>
  /** Whether the reader asked for reduced motion beyond the system preference. */
  reduceMotion: Volatile<boolean>
  /** Whether a completed turn raises a system notification; default off. */
  turnCompleteNotification: Volatile<boolean>
}

/** Live welcome and motion preferences. */
export const Config = z.object({
  welcomeNoticeVersion: z.string().volatile(),
  reduceMotion: z.boolean().default(false).volatile(),
  turnCompleteNotification: z.boolean().default(false).volatile(),
})

/** The browser consumes the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
