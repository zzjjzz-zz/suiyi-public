/** Instance ownership behavior with a controllable manager: status, mount failure, cleanup, disposal. */

import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { McpManagedServerStatus, McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager/types'
import { InstanceCleanupError, PluginInstances, guardInstanceCall } from '../src/instances.ts'
import { namespaceForPlugin, publicToolName } from '../src/names.ts'
import * as naming from '../src/names.ts'
import type { ValidatedPlugin } from '../src/client.ts'
import type { CatalogPlugin } from '../src/types.ts'

const PLUGIN_ID = 'demo'
const NAMESPACE = namespaceForPlugin(PLUGIN_ID)
const TOOL = publicToolName(NAMESPACE, 'ping')

it('refuses a namespace collision without replacing the first MCP instance', async () => {
  const { ctx, manager } = await fixture()
  const instances = new PluginInstances(ctx)
  const collision = vi.spyOn(naming, 'namespaceForPlugin').mockReturnValue(NAMESPACE)
  try {
    await instances.mount(validated(), 'Bearer fixture')
    const second = validated()
    second.plugin.pluginId = 'different-plugin'
    await expect(instances.mount(second, 'Bearer fixture')).rejects.toThrow('already owned by another plugin')
    expect(manager.registered).toEqual([NAMESPACE])
  } finally { collision.mockRestore(); await instances.disposeAll(); await ctx.fiber.dispose() }
})

it('ignores a late connection status while an instance is being disposed', async () => {
  const { ctx } = await fixture()
  const instances = new PluginInstances(ctx)
  try {
    await instances.mount(validated(), 'Bearer fixture')
    const closing = instances.unmount(PLUGIN_ID)
    instances.observeStatus(NAMESPACE, { state: 'closed', result: { closeConfirmed: true } })
    await closing
    expect(instances.get(PLUGIN_ID)).toBeUndefined()
    expect(instances.revoked().get(NAMESPACE)).toBe(PLUGIN_ID)
  } finally { await ctx.fiber.dispose() }
})

/** Manager double that owns the registration effect on the calling child context. */
class FakeManager extends Service {
  registered: string[] = []
  disposed: string[] = []
  failRegister = false
  statuses: McpManagedServerView[] = []

  constructor(ctx: Context) {
    super(ctx, 'mcpManager')
  }

  register(name: string, _entry: unknown): () => void {
    if (this.failRegister) throw new Error('register refused')
    this.registered.push(name)
    const dispose = this.ctx.effect(() => () => { this.disposed.push(name) })
    return () => void dispose()
  }

  list(): McpManagedServerView[] {
    return this.statuses
  }
}

/** Mount a real registry plus the fake manager. */
async function fixture(): Promise<{ ctx: Context; manager: FakeManager }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  const manager = new FakeManager(ctx)
  return { ctx, manager }
}

/** One validated catalog row for the fake instance. */
function validated(releaseVersion = '1.0.0'): ValidatedPlugin {
  const plugin: CatalogPlugin = {
    pluginId: PLUGIN_ID,
    workloadId: 'workload-demo',
    releaseVersion,
    name: 'Demo',
    description: 'Demo',
    category: 'test',
    allowedTools: [{ name: 'ping', inputSchema: { type: 'object' } }],
    schemaFingerprint: 'fingerprint-1',
    riskLevel: 'low',
    visibility: 'public',
    allowedRoles: [],
    status: 'published',
    mcpPath: `/api/v1/plugins/${PLUGIN_ID}/mcp?releaseVersion=${releaseVersion}`,
  }
  return {
    plugin,
    mcpUrl: `http://127.0.0.1:1/api/v1/plugins/${PLUGIN_ID}/mcp?releaseVersion=${releaseVersion}`,
    publicToolNames: new Set([TOOL]),
  }
}

/** A registry tool used to simulate a registration that survived disposal. */
function staleTool(): ToolDefinition {
  return {
    name: TOOL,
    description: 'stale',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: () => [] },
    execute: () => Promise.resolve('stale'),
  }
}

const STATUSES: Array<[McpManagedServerStatus, string, string | undefined]> = [
  [{ state: 'connected', toolCount: 1, connectedAt: 1 }, 'enabled', undefined],
  [{ state: 'connecting', attempt: 0 }, 'connecting', undefined],
  [{ state: 'reconnecting', attempt: 1, maxAttempts: 3, nextRetryAtMs: 2, lastError: 'raw' }, 'connecting', undefined],
  [{ state: 'waiting-credentials', lastError: 'raw upstream text' }, 'error', 'The plugin credential is not available.'],
  [{ state: 'closed', result: { closeConfirmed: true } }, 'error', 'The plugin connection is closed.'],
  [{ state: 'failed', reason: 'gave-up' }, 'error', 'The plugin connection stopped retrying.'],
  [{ state: 'failed', reason: 'reconnect-disabled' }, 'error', 'The plugin connection was lost.'],
  [{ state: 'failed', reason: 'unclosed-generation' }, 'error', 'The previous plugin connection did not close cleanly. Restart DSH before enabling it again.'],
  [{ state: 'failed', reason: 'load', lastError: 'raw' }, 'error', 'The plugin failed to load.'],
  [{ state: 'failed', reason: 'cleanup', result: { closeConfirmed: false } }, 'error', 'The previous plugin connection did not close cleanly. Restart DSH before enabling it again.'],
  [{ state: 'disabled' }, 'error', 'The plugin instance is not running.'],
]

describe('plugin instances', () => {
  it('maps every managed status to a sanitized view state', async () => {
    const { ctx } = await fixture()
    const instances = new PluginInstances(ctx)
    await instances.mount(validated(), 'Bearer fixture')
    expect(instances.get(PLUGIN_ID)).toEqual({ releaseVersion: '1.0.0', state: 'connecting' })
    for (const [status, state, error] of STATUSES) {
      instances.observeStatus(NAMESPACE, status)
      const view = instances.views().find(candidate => candidate.pluginId === PLUGIN_ID)
      expect(view).toMatchObject({ state, ...error === undefined ? {} : { error } })
    }
    instances.observeStatus('another-namespace', { state: 'connected', toolCount: 0, connectedAt: 0 })
    expect(instances.views()).toHaveLength(1)
    await instances.unmount(PLUGIN_ID)
  })

  it('rejects a failed child registration and releases its namespace for a retry', async () => {
    const { ctx, manager } = await fixture()
    const instances = new PluginInstances(ctx)
    manager.failRegister = true
    await expect(instances.mount(validated(), 'Bearer fixture')).rejects.toThrow('register refused')
    expect(instances.views()).toEqual([])
    expect(instances.pluginIds()).toEqual([])
    manager.failRegister = false
    await instances.mount(validated(), 'Bearer fixture')
    expect(instances.liveBindings().get(NAMESPACE)).toMatchObject({ pluginId: PLUGIN_ID })
    await instances.unmount(PLUGIN_ID)
    expect(manager.disposed).toEqual([NAMESPACE])
    instances.observeStatus(NAMESPACE, { state: 'connected', toolCount: 0, connectedAt: 0 })
    expect(instances.views()).toEqual([])
  })

  it('seeds a failed status and treats a repeated unmount as a no-op', async () => {
    const { ctx, manager } = await fixture()
    manager.statuses = [{ name: NAMESPACE, configured: true, status: { state: 'failed', reason: 'load', lastError: 'raw' } }]
    const instances = new PluginInstances(ctx)
    await instances.mount(validated(), 'Bearer fixture')
    expect(instances.views()).toMatchObject([{ pluginId: PLUGIN_ID, state: 'error', error: 'The plugin failed to load.' }])
    await instances.unmount(PLUGIN_ID)
    await expect(instances.unmount(PLUGIN_ID)).resolves.toBeUndefined()
  })

  it('refuses a duplicate mount and exposes retained failures', async () => {
    const { ctx } = await fixture()
    const instances = new PluginInstances(ctx)
    await instances.mount(validated(), 'Bearer fixture')
    await expect(instances.mount(validated(), 'Bearer fixture')).rejects.toThrow('already mounted')
    instances.setFailure(PLUGIN_ID, '1.0.0', 'The plugin instance could not start.')
    expect(instances.views().find(candidate => candidate.state === 'error')?.error).toBe('The plugin instance could not start.')
    instances.clearFailure(PLUGIN_ID)
    expect(instances.views().filter(candidate => candidate.state === 'error')).toEqual([])
    await instances.unmount(PLUGIN_ID)
  })

  it('reports tools that survive disposal instead of claiming a clean unmount', async () => {
    const { ctx } = await fixture()
    const instances = new PluginInstances(ctx)
    await instances.mount(validated(), 'Bearer fixture')
    const unregister = ctx.tools.register(staleTool())
    try {
      await expect(instances.unmount(PLUGIN_ID)).rejects.toBeInstanceOf(InstanceCleanupError)
      await expect(instances.unmount(PLUGIN_ID)).rejects.toBeInstanceOf(InstanceCleanupError)
      expect(instances.revoked().get(NAMESPACE)).toBe(PLUGIN_ID)
      expect(guardInstanceCall({ name: TOOL }, instances, new Map([[PLUGIN_ID, '1.0.0']]))).toContain('disabled')
      await expect(instances.mount(validated('2.0.0'), 'Bearer fixture')).rejects.toThrow('already mounted')
      expect(guardInstanceCall({ name: TOOL }, instances, new Map([[PLUGIN_ID, '2.0.0']]))).toContain('disabled')
    } finally {
      unregister()
    }
    await instances.unmount(PLUGIN_ID)
    await instances.mount(validated('2.0.0'), 'Bearer fixture')
    expect(instances.revoked().has(NAMESPACE)).toBe(false)
    await instances.unmount(PLUGIN_ID)
    const second = new PluginInstances(ctx)
    const errors = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
    await second.mount(validated(), 'Bearer fixture')
    const unregisterAgain = ctx.tools.register(staleTool())
    await second.disposeAll()
    expect(errors).toHaveBeenCalled()
    unregisterAgain()
    errors.mockRestore()
  })
})
