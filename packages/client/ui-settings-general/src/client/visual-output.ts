/**
 * Row-level presentation of the generated-interface capability.
 *
 * The service itself is declared once by `@deepseek-ai/dsh-client-ui-settings`;
 * this module only adds the absent-provider state the General section renders
 * and the constant sources that state reads through.
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { VisualOutputReadiness } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Row-level availability, including a composition that mounts no provider. */
export type VisualOutputAvailability =
  | VisualOutputReadiness
  | { readonly ready: false; readonly reason: 'not-installed' }

/** Reason shown while no provider is mounted. */
export const VISUAL_OUTPUT_NOT_INSTALLED = Object.freeze({ ready: false, reason: 'not-installed' } as const)

/** Constant readiness source for the absent-provider row. */
export const VISUAL_OUTPUT_NOT_INSTALLED_SOURCE: ObservableSnapshot<VisualOutputAvailability> = Object.freeze({
  getSnapshot: () => VISUAL_OUTPUT_NOT_INSTALLED,
  subscribe: () => () => {},
})

/** Constant preference source for the absent-provider row. */
export const VISUAL_OUTPUT_DISABLED_SOURCE: ObservableSnapshot<boolean> = Object.freeze({
  getSnapshot: () => false,
  subscribe: () => () => {},
})
