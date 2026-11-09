/**
 * Motion-reduction preference: the Host-backed flag, its observable, and the
 * document attribute the global motion rule keys off.
 *
 * The flag is an explicit override. System `prefers-reduced-motion` handling
 * stays with the component styles that already declare it; this preference
 * additionally quiets motion for readers whose system cannot express it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import './reduced-motion.css'

/** Settings namespace owned by the settings shell. */
export const GENERAL_SETTINGS_NAMESPACE = 'ui-settings-general'

/** Root attribute the global motion rule selects. */
export const REDUCED_MOTION_ATTRIBUTE = 'data-dsh-reduce-motion'

/** Fields this feature reads from the General settings namespace. */
export interface MotionSettings {
  /** Whether the reader asked for reduced motion. */
  reduceMotion: boolean
}

/**
 * Owns the reduction preference and its document presentation.
 *
 * `start` follows the accepted Host value; the shell registers it for the
 * plugin lifetime. The attribute is presentation state, so it is removed on
 * disposal rather than persisted.
 */
export class ReducedMotionPreference {
  /** Accepted preference observable for the settings row. */
  readonly enabled: ObservableSnapshot<boolean>

  private following: (() => void) | undefined

  /**
   * @param form - shared form for the General settings namespace
   */
  constructor(private readonly form: ConfigForm<MotionSettings>) {
    this.enabled = {
      getSnapshot: () => form.getSnapshot().value?.reduceMotion ?? false,
      subscribe: (listener) => {
        let previous = this.enabled.getSnapshot()
        return form.subscribe(() => {
          const next = this.enabled.getSnapshot()
          if (next === previous) return
          previous = next
          listener()
        })
      },
    }
  }

  /** Follow the accepted Host value and apply it to the document (idempotent). */
  start(): void {
    if (this.following !== undefined) return
    this.apply()
    this.following = this.form.subscribe(() => { this.apply() })
  }

  /** Stop following the Host value and remove the document attribute. */
  dispose(): void {
    this.following?.()
    this.following = undefined
    document.documentElement.removeAttribute(REDUCED_MOTION_ATTRIBUTE)
  }

  /**
   * Persist one choice through the shared ordered write queue.
   * @param reduceMotion - requested preference
   * @returns settlement after Host acceptance
   * @throws when the Host refuses the write
   */
  async setReduceMotion(reduceMotion: boolean): Promise<void> {
    if (!await this.form.set('reduceMotion', reduceMotion)) {
      throw new Error('Reduce-motion preference was not saved')
    }
  }

  private apply(): void {
    if (this.enabled.getSnapshot()) document.documentElement.setAttribute(REDUCED_MOTION_ATTRIBUTE, 'true')
    else document.documentElement.removeAttribute(REDUCED_MOTION_ATTRIBUTE)
  }
}

/**
 * Bind the preference to a client context's effect lifetime.
 * @param ctx - owning client context
 * @param preference - preference controller to follow and dispose
 */
export function installReducedMotionPreference(ctx: ClientContext, preference: ReducedMotionPreference): void {
  ctx.effect(() => {
    preference.start()
    return () => { preference.dispose() }
  }, 'ui-settings-general: reduced-motion preference')
}
