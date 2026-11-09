/**
 * Generated-interface runtime seam.
 *
 * The single definition both the settings consumer and a provider plugin use;
 * providers import this type instead of restating its members. Readiness and
 * the accepted preference are observable sources, so a provider that mounts
 * late, unloads, or whose account changes keeps the row current without the
 * consumer reading the service once.
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** Why generated output is blocked even while a provider is mounted. */
export type VisualOutputBlockReason = 'isolation' | 'permission'

/** Provider-reported readiness for generated interfaces. */
export type VisualOutputReadiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly reason: VisualOutputBlockReason }

/**
 * Service a generated-interface provider supplies as `ctx.visualOutput`.
 *
 * The consumer only presents these facts. A provider must keep readiness false
 * until generated code is isolated from the host page and the signed-in
 * account is authorized for it; enabling never bypasses either check.
 */
export interface VisualOutputCapability {
  /** Current readiness; providers replace the source's value, never the source. */
  readonly readiness: ObservableSnapshot<VisualOutputReadiness>
  /** Accepted user preference, independent of readiness. */
  readonly enabled: ObservableSnapshot<boolean>
  /**
   * Persist and apply one preference choice.
   * @param enabled - requested preference
   * @returns whether the provider accepted the choice
   */
  setEnabled(enabled: boolean): Promise<boolean>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Generated-interface runtime provided by a composition that mounts one. */
    visualOutput: VisualOutputCapability
  }
}
