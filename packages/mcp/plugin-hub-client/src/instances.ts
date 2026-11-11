/**
 * Per-plugin MCP instance ownership.
 *
 * Each authorized catalog row gets its own child Cordis plugin whose only work
 * is to register that row with `ctx.mcpManager`. Disposing the child waits for
 * the manager's registration effect to unwind, which awaits the MCP instance
 * unmount, so a disable reports completion only after its tools are gone. The
 * mcp-client instance itself stays owned by mcp-manager; this module never
 * mounts a second transport or copies the MCP client.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/instances
 */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import type { McpManagedServerStatus } from '@deepseek-ai/dsh-mcp-manager/types'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ValidatedPlugin } from './client.ts'
import { guardToolCall, type GuardedInstance } from './guard.ts'
import type { PluginInstanceView } from './types.ts'
import { namespaceForPlugin } from './names.ts'

/** Per-instance configuration for the shared native Cordis adapter type. */
interface NativeInstanceConfig {
  namespace: string
  url: string
  authorization: string
}

/** Every MCP uses this same plugin type; each fiber has its own registration effect. */
const NativeMcpInstance = {
  name: 'plugin-hub-mcp-instance',
  inject: ['mcpManager'],
  apply(child: Context, config: NativeInstanceConfig): void {
    child.mcpManager.register(config.namespace, {
      transport: 'streamable-http',
      url: config.url,
      headers: { Authorization: config.authorization },
    })
  },
}

/** One mounted instance and the release it was authorized from. */
interface InstanceRecord {
  readonly pluginId: string
  readonly releaseVersion: string
  readonly namespace: string
  readonly fiber: Fiber
  readonly publicToolNames: ReadonlySet<string>
  state: 'connecting' | 'enabled' | 'error'
  error?: string
}

/** A retained mount or cleanup failure, visible to the UI without a live instance. */
interface InstanceFailure {
  readonly pluginId: string
  readonly releaseVersion: string
  readonly error: string
}

/** A child instance could not be disposed to quiescence. */
export class InstanceCleanupError extends Error {
  /**
   * @param pluginId - plugin whose tools survived disposal.
   * @param tools - public tool names still registered after the child fiber settled.
   */
  constructor(readonly pluginId: string, readonly tools: readonly string[]) {
    super(`plugin hub instance "${pluginId}" left registered tools after disposal`)
    this.name = 'InstanceCleanupError'
  }
}

/** Model-facing text for one managed status; raw upstream diagnostics stay in Host logs. */
function statusError(status: McpManagedServerStatus): { state: 'connecting' | 'enabled' | 'error'; error?: string } {
  switch (status.state) {
    case 'connected':
      return { state: 'enabled' }
    case 'connecting':
    case 'reconnecting':
      return { state: 'connecting' }
    case 'waiting-credentials':
      return { state: 'error', error: 'The plugin credential is not available.' }
    case 'closed':
      return { state: 'error', error: 'The plugin connection is closed.' }
    case 'failed':
      switch (status.reason) {
        case 'gave-up':
          return { state: 'error', error: 'The plugin connection stopped retrying.' }
        case 'reconnect-disabled':
          return { state: 'error', error: 'The plugin connection was lost.' }
        case 'unclosed-generation':
          return { state: 'error', error: 'The previous plugin connection did not close cleanly. Restart DSH before enabling it again.' }
        case 'load':
          return { state: 'error', error: 'The plugin failed to load.' }
        case 'cleanup':
          return { state: 'error', error: 'The previous plugin connection did not close cleanly. Restart DSH before enabling it again.' }
          /* v8 ignore next 2 -- the manager declares no other failure reason */
        default:
          return { state: 'error', error: 'The plugin failed.' }
      }
    case 'disabled':
      return { state: 'error', error: 'The plugin instance is not running.' }
      /* v8 ignore next 2 -- the managed status union is closed */
    default:
      return { state: 'error', error: 'The plugin failed.' }
  }
}

/**
 * Owns the live per-plugin child fibers, their status, and their guard view.
 * Every mutating method is called from the service's serialized lifecycle
 * queue except `observeStatus`, which follows the manager's status event.
 */
export class PluginInstances {
  private readonly records = new Map<string, InstanceRecord>()
  private readonly failures = new Map<string, InstanceFailure>()
  /** Live namespace owners, used to refuse a hash collision instead of sharing a namespace. */
  private readonly namespaceOwners = new Map<string, string>()
  /** Namespaces that must keep denying calls after their instance is gone. */
  private readonly revokedNamespaces = new Map<string, string>()

  /**
   * @param owner - the service's plugin context; child fibers mount under it.
   */
  constructor(private readonly owner: Context) {}

  /**
   * Mount one authorized plugin as a child plugin using the manager's registration path.
   * @param validated - catalog row, same-origin MCP URL, and its allowed public tool names.
   * @param authorization - current user Authorization value for the MCP endpoint.
   * @throws when a namespace collision is detected or the child registration fails.
   */
  async mount(validated: ValidatedPlugin, authorization: string): Promise<void> {
    const plugin = validated.plugin
    const namespace = namespaceForPlugin(plugin.pluginId)
    const owner = this.namespaceOwners.get(namespace)
    if (owner !== undefined && owner !== plugin.pluginId) {
      throw new Error(`plugin hub namespace "${namespace}" is already owned by another plugin`)
    }
    if (this.records.has(plugin.pluginId)) throw new Error(`plugin hub instance "${plugin.pluginId}" is already mounted`)
    const surviving = this.owner.tools.definitions().filter(tool => tool.name.startsWith(`mcp__${namespace}__`))
    if (surviving.length > 0) {
      this.revokedNamespaces.set(namespace, plugin.pluginId)
      throw new InstanceCleanupError(plugin.pluginId, surviving.map(tool => tool.name))
    }
    this.namespaceOwners.set(namespace, plugin.pluginId)
    const fiber = this.owner.plugin(NativeMcpInstance, {
      namespace,
      url: validated.mcpUrl,
      authorization,
    })
    const record: InstanceRecord = {
      pluginId: plugin.pluginId,
      releaseVersion: plugin.releaseVersion,
      namespace,
      fiber,
      publicToolNames: validated.publicToolNames,
      state: 'connecting',
    }
    this.records.set(plugin.pluginId, record)
    try {
      await fiber.await()
      this.seed(record)
    } catch (error: unknown) {
      this.revokedNamespaces.set(namespace, plugin.pluginId)
      this.records.delete(plugin.pluginId)
      try { await fiber.dispose() } finally { this.namespaceOwners.delete(namespace) }
      throw error
    }
    this.revokedNamespaces.delete(namespace)
  }

  /**
   * Unmount one plugin and wait for its registration effect and MCP instance to settle.
   * @param pluginId - catalog plugin id.
   * @throws InstanceCleanupError when a tool remains registered under the retired namespace.
   */
  async unmount(pluginId: string): Promise<void> {
    const record = this.records.get(pluginId)
    if (record === undefined) return
    // Deny new calls before the transport starts closing; an in-flight call is
    // refused by the hub endpoint's own per-request authorization check.
    this.revokedNamespaces.set(record.namespace, pluginId)
    try {
      await record.fiber.dispose()
    } finally {
      this.namespaceOwners.delete(record.namespace)
    }
    const left = [...record.publicToolNames].filter(name => this.owner.tools.get(name) !== undefined)
    if (left.length > 0) {
      record.state = 'error'
      throw new InstanceCleanupError(pluginId, left)
    }
    this.records.delete(pluginId)
  }

  /**
   * Apply one manager status event to its managed instance.
   * @param name - managed server name; only namespaces owned here are considered.
   * @param status - manager status for that server.
   */
  observeStatus(name: string, status: McpManagedServerStatus): void {
    const pluginId = this.namespaceOwners.get(name)
    if (pluginId === undefined) return
    const record = this.records.get(pluginId)
    if (record === undefined) return
    const next = statusError(status)
    record.state = next.state
    if (next.error === undefined) delete record.error
    else record.error = next.error
  }

  /**
   * Whether this service owns or has retired the public namespace of a tool.
   * @param name - public tool name to test.
   * @returns true when the name belongs to a live or retired hub namespace.
   */
  ownsName(name: string): boolean {
    return [...this.namespaceOwners.keys(), ...this.revokedNamespaces.keys()]
      .some(namespace => name.startsWith(`mcp__${namespace}__`))
  }

  /**
   * Retain one sanitized mount or cleanup failure for the next catalog view.
   * @param pluginId - catalog plugin id.
   * @param releaseVersion - release the failed operation targeted.
   * @param error - sanitized failure text.
   */
  setFailure(pluginId: string, releaseVersion: string, error: string): void {
    this.failures.set(pluginId, { pluginId, releaseVersion, error })
  }

  /**
   * Remove a retained failure.
   * @param pluginId - catalog plugin id.
   */
  clearFailure(pluginId: string): void {
    this.failures.delete(pluginId)
  }

  /** Remove every retained mount or cleanup failure, e.g. on token withdrawal. */
  clearFailures(): void {
    this.failures.clear()
  }

  /**
   * One view per live or failed instance. Catalog rows without an entry are
   * reported by the service as `disabled`.
   * @param authorized - approved releases keyed by plugin id; omission reports every instance unauthorized.
   * @returns instance views in insertion order.
   */
  views(authorized: ReadonlyMap<string, string> = new Map()): PluginInstanceView[] {
    const live = [...this.records.values()].map((record): PluginInstanceView => ({
      pluginId: record.pluginId,
      releaseVersion: record.releaseVersion,
      state: record.state,
      authorized: authorized.get(record.pluginId) === record.releaseVersion,
      ...record.error === undefined ? {} : { error: record.error },
    }))
    const failed = [...this.failures.values()].map((failure): PluginInstanceView => ({
      pluginId: failure.pluginId,
      releaseVersion: failure.releaseVersion,
      state: 'error',
      authorized: authorized.get(failure.pluginId) === failure.releaseVersion,
      error: failure.error,
    }))
    return [...live, ...failed]
  }

  /**
   * Read the mounted instances as the guard sees them.
   * @returns live bindings keyed by MCP namespace.
   */
  liveBindings(): ReadonlyMap<string, GuardedInstance> {
    const bindings = new Map<string, GuardedInstance>()
    for (const record of this.records.values()) {
      bindings.set(record.namespace, {
        pluginId: record.pluginId,
        releaseVersion: record.releaseVersion,
        publicToolNames: record.publicToolNames,
      })
    }
    return bindings
  }

  /**
   * Read the namespaces that must keep refusing calls after disposal.
   * @returns retired namespaces keyed to their plugin id.
   */
  revoked(): ReadonlyMap<string, string> {
    return this.revokedNamespaces
  }

  /**
   * List the mounted plugin ids.
   * @returns plugin ids with a live child instance.
   */
  pluginIds(): string[] {
    return [...this.records.keys()]
  }

  /**
   * Read one live record's state; used to avoid remounting an instance that is already connecting.
   * @param pluginId - catalog plugin id.
   * @returns the record's release version and state, or undefined when no instance is mounted.
   */
  get(pluginId: string): { readonly releaseVersion: string; readonly state: string } | undefined {
    const record = this.records.get(pluginId)
    return record === undefined ? undefined : { releaseVersion: record.releaseVersion, state: record.state }
  }

  /**
   * Dispose every live instance to quiescence, containing each failure so one
   * broken plugin cannot keep its siblings mounted.
   * @returns nothing; a failed unmount is logged and its remaining tools keep being denied by the guard.
   */
  async disposeAll(): Promise<void> {
    for (const pluginId of [...this.records.keys()]) {
      try {
        await this.unmount(pluginId)
      } catch (error: unknown) {
        this.owner.logger.error(`plugin-hub-client: unmounting "${pluginId}" failed during disposal`)
        this.owner.logger.error(error)
      }
    }
  }

  /** Seed a freshly activated instance from the manager's current status. */
  private seed(record: InstanceRecord): void {
    const view = this.owner.mcpManager.list().find(server => server.name === record.namespace)
    if (view === undefined) return
    const next = statusError(view.status)
    record.state = next.state
    if (next.error === undefined) delete record.error
    else record.error = next.error
  }
}

/**
 * Guard one tool execution against the hub's current authorization state.
 * @param execution - pending tool call.
 * @param instances - live instance owner.
 * @param authorized - release versions currently authorized, keyed by plugin id.
 * @returns a denial reason, or `undefined` to continue.
 */
export function guardInstanceCall(
  execution: Readonly<Pick<ToolExecution, 'name'>>,
  instances: PluginInstances,
  authorized: ReadonlyMap<string, string>,
): string | undefined {
  return guardToolCall(execution, instances.liveBindings(), instances.revoked(), authorized)
}
