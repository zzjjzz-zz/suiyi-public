/**
 * Plugin hub state: the catalog snapshot, its reads, and one in-flight action per
 * plugin. The Controller owns every read and mutation; the tab renders the
 * published state and forwards user gestures here.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { pluginHubRemote, type PluginHubSnapshot } from './contract.ts'
import { instanceOf, isAdded, rowState } from './presentation.ts'

/** Why the last catalog read failed: the first read, or a later refresh/reconcile. */
export interface HubReadFailure {
  readonly kind: 'load' | 'refresh'
  /** Sanitized Host message, shown as diagnostic detail under the localized sentence. */
  readonly message: string
}

/** One lifecycle operation a row runs. */
export type HubActionKind = 'add' | 'remove' | 'enable' | 'disable'

/** The last failed enablement operation of one plugin. */
export interface HubActionFailure {
  readonly kind: HubActionKind
  /** Sanitized Host message, shown as diagnostic detail under the localized sentence. */
  readonly message: string
}

/** Published plugin hub state. */
export interface PluginHubState {
  /** `idle` until the tab first renders. */
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  /** The last usable snapshot; kept while a later read fails. */
  readonly snapshot: PluginHubSnapshot | null
  /** Whether a read other than the first runs; the shown snapshot stays current. */
  readonly refreshing: boolean
  /** The last failed read, cleared when a read starts, replaced when one fails. */
  readonly failure: HubReadFailure | null
  /** Enablement operations in flight, by plugin id. */
  readonly busy: Readonly<Record<string, HubActionKind>>
  /** The last failed enablement operation per plugin, cleared when it retries. */
  readonly actionFailures: Readonly<Record<string, HubActionFailure>>
}

/** What the tab receives through injection. */
export interface PluginHubFace {
  readonly hooks: {
    /** Plugin hub state, bound as `useHub`. */
    readonly hub: SnapshotStore<PluginHubState>
    /** The active locale, bound as `useLocale`. */
    readonly locale: HostObservable<LocaleSnapshot>
  }
  /** Read the catalog once the tab first renders. */
  ensure(): void
  /** Re-run the read that failed, or re-read the catalog when nothing failed. */
  reload(): void
  /** Ask the Host to refresh the published catalog. */
  refresh(): void
  /** Add a catalog plugin to this account's directory without activating it. */
  add(pluginId: string): void
  /** Remove an added plugin and its authorization. */
  remove(pluginId: string): void
  /** Activate an added plugin without adding it again. */
  enable(pluginId: string): void
  /** Deactivate an added plugin while keeping it in the directory. */
  disable(pluginId: string): void
  /** Repeat the last failed operation of a plugin, or enable one whose instance failed. */
  retry(pluginId: string): void
}

const INITIAL: PluginHubState = {
  status: 'idle', snapshot: null, refreshing: false, failure: null, busy: {}, actionFailures: {},
}

/** A copy without one key; a removed record entry never keeps its stale value. */
function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key))
}

/** Owns catalog reads and enablement actions for one Client. */
export class PluginHubController {
  /** Published plugin hub state. */
  readonly store: SnapshotStore<PluginHubState> = createSnapshotStore<PluginHubState>(INITIAL)
  private disposed = false
  /** Bumped when the connection resets, so a settlement from the previous generation is dropped. */
  private generation = 0
  private readSequence = 0

  /** @param ctx - the plugin context whose `remote.pluginHub` namespace answers. */
  constructor(private readonly ctx: ClientContext) {}

  /** Drop every late settlement. */
  dispose(): void {
    this.disposed = true
  }

  /**
   * Build the tab's injected face.
   * @returns the tab's state sources and actions.
   */
  face(): PluginHubFace {
    return {
      hooks: { hub: this.store, locale: this.ctx.locale },
      ensure: () => { this.ensure() },
      reload: () => { this.reload() },
      refresh: () => { this.refresh() },
      add: (pluginId) => { this.add(pluginId) },
      remove: (pluginId) => { this.remove(pluginId) },
      enable: (pluginId) => { this.enable(pluginId) },
      disable: (pluginId) => { this.disable(pluginId) },
      retry: (pluginId) => { this.retry(pluginId) },
    }
  }

  /** Read the catalog once the tab first renders; later renders keep the state. */
  private ensure(): void {
    if (this.state().status === 'idle') void this.read('catalog', 'load')
  }

  /** Re-read after a failed read; a retained snapshot is replaced when the read lands. */
  private reload(): void {
    void this.read('catalog', this.state().snapshot === null ? 'load' : 'refresh')
  }

  /** Ask the Host to reconcile the published catalog; ignored while a read runs. */
  private refresh(): void {
    const state = this.state()
    if (state.refreshing || state.status === 'loading') return
    void this.read(state.snapshot === null ? 'catalog' : 'refresh', state.snapshot === null ? 'load' : 'refresh')
  }

  private add(pluginId: string): void {
    const snapshot = this.state().snapshot
    if (snapshot === null || !snapshot.enabled || this.state().busy[pluginId] !== undefined) return
    if (isAdded(snapshot, pluginId)) return
    void this.act(pluginId, 'add')
  }

  private remove(pluginId: string): void {
    const snapshot = this.state().snapshot
    if (snapshot === null || !snapshot.enabled || this.state().busy[pluginId] !== undefined) return
    if (!isAdded(snapshot, pluginId)) return
    void this.act(pluginId, 'remove')
  }

  private enable(pluginId: string): void {
    const snapshot = this.state().snapshot
    if (snapshot === null || !snapshot.enabled || this.state().busy[pluginId] !== undefined) return
    if (!isAdded(snapshot, pluginId)) return
    const state = rowState(instanceOf(snapshot, pluginId))
    if (state !== 'disabled') return
    void this.act(pluginId, 'enable')
  }

  private disable(pluginId: string): void {
    const snapshot = this.state().snapshot
    if (snapshot === null || !snapshot.enabled || this.state().busy[pluginId] !== undefined) return
    if (!isAdded(snapshot, pluginId)) return
    const state = rowState(instanceOf(snapshot, pluginId))
    if (state !== 'enabled' && state !== 'connecting') return
    void this.act(pluginId, 'disable')
  }

  private retry(pluginId: string): void {
    const snapshot = this.state().snapshot
    if (snapshot === null || !snapshot.enabled || this.state().busy[pluginId] !== undefined) return
    const failure = this.state().actionFailures[pluginId]
    if (failure !== undefined) {
      void this.act(pluginId, failure.kind)
      return
    }
    if (rowState(instanceOf(snapshot, pluginId)) !== 'error') return
    void this.act(pluginId, isAdded(snapshot, pluginId) ? 'enable' : 'add')
  }

  /**
   * Re-read after the connection reset: a restarted Host no longer serves the
   * previous generation, so the snapshot is read afresh and in-flight actions
   * never publish their answer. An unrendered tab stays idle.
   */
  connectionReset(): void {
    this.generation += 1
    const state = this.state()
    this.readSequence += 1
    this.patch({ snapshot: null, refreshing: false, failure: null, busy: {}, actionFailures: {} })
    if (state.status === 'idle') return
    void this.read('catalog', state.snapshot === null ? 'load' : 'refresh')
  }

  /**
   * Commit a live Host snapshot; an older in-flight read cannot replace it.
   * @param snapshot - the catalog and instance view published by the Host stream.
   */
  acceptSnapshot(snapshot: PluginHubSnapshot): void {
    if (this.disposed) return
    this.readSequence += 1
    this.patch({ status: 'ready', snapshot, refreshing: false, failure: null })
  }

  /** Withdraw cached identity-scoped rows while the carrier is unavailable. */
  connectionUnavailable(): void {
    if (this.disposed) return
    this.generation += 1
    this.readSequence += 1
    this.patch({ status: 'error', snapshot: null, refreshing: false, busy: {}, actionFailures: {},
      failure: { kind: 'load', message: 'The plugin hub connection is unavailable.' } })
  }

  private state(): PluginHubState {
    return this.store.getSnapshot()
  }

  private patch(next: Partial<PluginHubState>): void {
    this.store.set({ ...this.state(), ...next })
  }

  /**
   * Run one catalog read and publish its settlement. Only the latest read of the
   * current connection generation publishes; earlier answers are dropped.
   */
  private async read(source: 'catalog' | 'refresh', kind: HubReadFailure['kind']): Promise<void> {
    const sequence = ++this.readSequence
    if (this.state().snapshot === null) this.patch({ status: 'loading', failure: null })
    else this.patch({ refreshing: true, failure: null })
    const remote = pluginHubRemote(this.ctx.remote)
    const answer = await (source === 'refresh' ? remote.refresh() : remote.catalog())
    if (this.disposed || sequence !== this.readSequence) return
    if (answer.ok) {
      this.patch({ status: 'ready', snapshot: answer.value, refreshing: false, failure: null })
      return
    }
    this.patch({
      status: this.state().snapshot === null ? 'error' : 'ready',
      refreshing: false,
      failure: { kind, message: answer.error.message },
    })
  }

  /**
   * Run one typed lifecycle operation and re-read the catalog after it
   * succeeds. A failure keeps the row and its current state, and offers the
   * same operation again through {@link retry}.
   */
  private async act(pluginId: string, kind: HubActionKind): Promise<void> {
    const generation = this.generation
    this.patch({
      busy: { ...this.state().busy, [pluginId]: kind },
      actionFailures: without(this.state().actionFailures, pluginId),
    })
    const remote = pluginHubRemote(this.ctx.remote)
    const answer = await (
      kind === 'add' ? remote.add(pluginId)
        : kind === 'remove' ? remote.removeInstance(pluginId)
          : kind === 'enable' ? remote.enable(pluginId)
            : remote.disable(pluginId)
    )
    if (this.disposed || generation !== this.generation) return
    const busy = without(this.state().busy, pluginId)
    if (!answer.ok) {
      this.patch({ busy, actionFailures: { ...this.state().actionFailures, [pluginId]: { kind, message: answer.error.message } } })
      return
    }
    this.patch({ busy })
    // The Host may still be connecting the instance; this read publishes that state.
    void this.read('catalog', 'refresh')
  }
}
