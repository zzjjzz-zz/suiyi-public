/**
 * Suiyi identity consumer: follows the Desktop preload bridge when it exists
 * and otherwise reports an unavailable identity center. The bridge is the only
 * identity source here; no DeepSeek model-account state is substituted.
 */
import { createSnapshotStore, type ObservableSnapshot, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopSuiyiIdentityBridge, DesktopSuiyiIdentityView } from '../types.ts'

/** In-flight account action; null when idle. */
export type SuiyiIdentityPending = 'signIn' | 'signOut' | null

/** One account surface state: the safe view plus this consumer's progress. */
export interface SuiyiIdentityState {
  view: DesktopSuiyiIdentityView
  pending: SuiyiIdentityPending
  failed: boolean
}

/** View when no Suiyi bridge was injected (Web, official Desktop, or early boot). */
export const SUIYI_IDENTITY_UNAVAILABLE: DesktopSuiyiIdentityView = Object.freeze({ state: 'unavailable' })

/** Observable account state and the two real Keycloak actions. */
export class SuiyiIdentityController {
  /** uSES-safe state source the sidebar row subscribes through its hook. */
  readonly store: ObservableSnapshot<SuiyiIdentityState>
  private readonly source: SnapshotStore<SuiyiIdentityState>
  private readonly bridge: DesktopSuiyiIdentityBridge | undefined
  private stop: (() => void) | undefined
  private disposed = false
  /** Incremented by every bridge event; a late initial read at an older revision is ignored. */
  private revision = 0

  /**
   * @param bridge - Suiyi preload bridge, or undefined when the environment has none
   */
  constructor(bridge: DesktopSuiyiIdentityBridge | undefined) {
    this.bridge = bridge
    this.source = createSnapshotStore<SuiyiIdentityState>({
      view: SUIYI_IDENTITY_UNAVAILABLE,
      pending: null,
      failed: false,
    })
    this.store = this.source
  }

  /** Read the initial view and follow bridge changes (idempotent). */
  start(): void {
    if (this.stop !== undefined || this.bridge === undefined) return
    const issued = this.revision
    this.stop = this.bridge.subscribe((view) => {
      this.revision += 1
      if (!this.disposed) this.source.update((draft) => { draft.view = view })
    })
    void this.bridge.view().then(
      (view) => {
        // A subscription event newer than this read already owns the state.
        if (!this.closed() && this.revision === issued) this.source.update((draft) => { draft.view = view })
      },
      () => {
        if (!this.closed() && this.revision === issued) {
          this.source.update((draft) => { draft.view = SUIYI_IDENTITY_UNAVAILABLE })
        }
      },
    )
  }

  /** Open the real Keycloak page and settle the row on the result. */
  async signIn(): Promise<void> {
    if (this.closed() || this.bridge === undefined) return
    if (this.source.getSnapshot().pending !== null) return
    if (this.source.getSnapshot().view.state === 'signed-in') return
    this.source.update((draft) => { draft.pending = 'signIn'; draft.failed = false })
    try {
      const result = await this.bridge.signIn()
      // A cancelled or unavailable attempt is not a failure; only a real
      // rejection shows the error line.
      if (!this.closed()) this.source.update((draft) => { draft.failed = !result.ok && result.reason === 'failed' })
    } catch {
      if (!this.closed()) this.source.update((draft) => { draft.failed = true })
    } finally {
      if (!this.closed()) this.source.update((draft) => { draft.pending = null })
    }
  }

  /** Clear the Suiyi identity; the Desktop window may be destroyed afterwards. */
  async signOut(): Promise<void> {
    if (this.closed() || this.bridge === undefined) return
    if (this.source.getSnapshot().pending !== null) return
    this.source.update((draft) => { draft.pending = 'signOut'; draft.failed = false })
    try {
      await this.bridge.signOut()
    } catch {
      if (!this.closed()) this.source.update((draft) => { draft.failed = true })
    } finally {
      if (!this.closed()) this.source.update((draft) => { draft.pending = null })
    }
  }

  /** Stop following the bridge. */
  dispose(): void {
    this.disposed = true
    this.stop?.()
    this.stop = undefined
  }

  /** Read the disposed flag through a call so async continuation checks stay honest. */
  private closed(): boolean {
    return this.disposed
  }
}
