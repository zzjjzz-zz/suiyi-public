/** Real Loader composition, independent MCP instances, restart restore, and disposal. */

import { readFile, writeFile } from 'node:fs/promises'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { describe, expect, it, vi } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { hubIdentityScope, type HubIdentity } from '../src/identity.ts'
import { namespaceForPlugin, publicToolName } from '../src/names.ts'
import {
  bootHubProfile,
  fixtureCredentials,
  prepareHubProfile,
  removeHubProfile,
  startPlatformFixture,
  TEST_IDENTITY,
  TEST_SCOPE,
  type FixturePlugin,
} from './fixture.ts'

const TEST_SIGNAL = new AbortController().signal
const DEMO: FixturePlugin = { pluginId: 'demo', releaseVersion: '1.0.0', tools: ['ping'], icon: 'icon.svg' }
const OTHER: FixturePlugin = { pluginId: 'other', releaseVersion: '1.0.0', tools: ['ping'], omitToolDescriptions: true }
const FOREIGN_IDENTITY: HubIdentity = { issuer: TEST_IDENTITY.issuer, subject: 'foreign-subject' }
const FOREIGN_SCOPE = hubIdentityScope(FOREIGN_IDENTITY)

/** Public name of one fixture tool. */
function toolName(pluginId: string, tool: string): string {
  return publicToolName(namespaceForPlugin(pluginId), tool)
}

/** Wait until a public tool is registered or withdrawn. */
async function waitForTool(ctx: Context, name: string, present: boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.tools.get(name) !== undefined).toBe(present)
  }, { timeout: 15_000 })
}

/** Run one tool and return its first text block. */
async function runTool(ctx: Context, name: string, callId: string): Promise<string> {
  const result = await executeToolFixture(ctx, {
    signal: TEST_SIGNAL,
    callId: ToolCallId(callId),
    name,
    arguments: {},
  })
  const first = result.content[0]
  return first?.type === 'text' ? first.text : JSON.stringify(result.content)
}

/** Rewrite the hub entry's identity, standing in for a different verified login. */
async function rebindHubIdentity(profilePath: string, identity: HubIdentity): Promise<void> {
  const patches = parseYaml(await readFile(profilePath, 'utf8')) as Array<{ id?: string; config?: Record<string, unknown> }>
  const hub = patches.find(patch => patch.id === 'hub')
  if (hub?.config === undefined) throw new Error('fixture profile has no hub entry config')
  hub.config.identity = identity
  await writeFile(profilePath, stringifyYaml(patches), 'utf8')
}

/** Read the persisted authorizations from the profile patch document. */
async function persistedAuthorizations(profilePath: string): Promise<unknown> {
  const patches = parseYaml(await readFile(profilePath, 'utf8')) as Array<{ id?: string; config?: { authorizations?: unknown } }>
  return patches.find(patch => patch.id === 'hub')?.config?.authorizations
}

describe('plugin hub real composition', () => {
  it('mounts one independent instance per enabled plugin, guards stale names, and disposes with the fiber', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO, OTHER],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    try {
      const initial = await booted.hub.refresh()
      expect(initial.enabled).toBe(true)
      expect(initial.plugins.map(plugin => plugin.pluginId)).toEqual(['demo', 'other'])
      expect(initial.plugins[1]?.allowedTools[0]?.description).toBeUndefined()
      expect(initial.instances).toEqual([
        { pluginId: 'demo', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: false },
        { pluginId: 'other', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: false },
      ])
      expect(platform.catalogAuthorization).toContain('Bearer fixture-secret')

      await booted.hub.enable('demo')
      await booted.hub.enable('other')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      await waitForTool(booted.ctx, toolName('other', 'ping'), true)
      expect(await runTool(booted.ctx, toolName('demo', 'ping'), 'demo-call')).toBe('demo:ping')
      await booted.hub.enable('demo')
      expect(await runTool(booted.ctx, toolName('other', 'ping'), 'other-call')).toBe('other:ping')
      expect(platform.mcpAuthorization).toContain('Bearer fixture-secret')
      await vi.waitFor(async () => {
        const catalog = await booted.hub.catalog()
        expect(catalog.instances).toMatchObject([
          { pluginId: 'demo', state: 'enabled' },
          { pluginId: 'other', state: 'enabled' },
        ])
      })

      await booted.hub.disable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), false)
      await waitForTool(booted.ctx, toolName('other', 'ping'), true)

      let executed = false
      const stale: ToolDefinition = {
        name: toolName('demo', 'ping'),
        description: 'stale registration standing in for an in-flight generation',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'unexpected' }] },
        execute: () => {
          executed = true
          return Promise.resolve('unexpected')
        },
      }
      const unregister = booted.ctx.tools.register(stale)
      try {
        const denied = await executeToolFixture(booted.ctx, {
          signal: TEST_SIGNAL,
          callId: ToolCallId('stale-call'),
          name: stale.name,
          arguments: {},
        })
        expect(executed).toBe(false)
        expect(denied.isError).toBe(true)
        expect(JSON.stringify(denied)).toContain('disabled')
      } finally {
        unregister()
      }

      await booted.hubEntry.fiber?.dispose()
      expect(booted.ctx.tools.get(toolName('other', 'ping'))).toBeUndefined()
    } finally {
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  }, 20_000)

  it('restores only the currently authorized release after restart', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const first = await bootHubProfile(prepared.profile, credentials)
    try {
      await first.hub.refresh()
      await first.hub.enable('demo')
      await waitForTool(first.ctx, toolName('demo', 'ping'), true)
      expect(await runTool(first.ctx, toolName('demo', 'ping'), 'first-call')).toBe('demo:ping')
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([
        { platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0', enabled: true },
      ])
    } finally {
      await first.ctx.fiber.dispose()
    }

    const second = await bootHubProfile(prepared.profile, credentials)
    try {
      await second.hub.refresh()
      await waitForTool(second.ctx, toolName('demo', 'ping'), true)
      expect(await runTool(second.ctx, toolName('demo', 'ping'), 'restored-call')).toBe('demo:ping')
    } finally {
      await second.ctx.fiber.dispose()
    }

    platform.publish([{ pluginId: 'demo', releaseVersion: '2.0.0', tools: ['ping'] }], 'catalog-2')
    const third = await bootHubProfile(prepared.profile, credentials)
    try {
      const catalog = await third.hub.refresh()
      expect(catalog.plugins[0]?.releaseVersion).toBe('2.0.0')
      expect(catalog.instances).toEqual([{ pluginId: 'demo', releaseVersion: '2.0.0', state: 'disabled', authorized: false, added: false }])
      expect(third.ctx.tools.get(toolName('demo', 'ping'))).toBeUndefined()
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([])

      await third.hub.enable('demo')
      await waitForTool(third.ctx, toolName('demo', 'ping'), true)
      await vi.waitFor(async () => {
        const current = await third.hub.catalog()
        expect(current.instances).toMatchObject([{ pluginId: 'demo', state: 'enabled' }])
      })
    } finally {
      await third.ctx.fiber.dispose()
    }
    await removeHubProfile(prepared.home)
    await platform.close()
  })

  it('never restores another account\'s decisions after an identity switch', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const first = await bootHubProfile(prepared.profile, credentials)
    try {
      await first.hub.refresh()
      await first.hub.enable('demo')
      await waitForTool(first.ctx, toolName('demo', 'ping'), true)
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([
        { platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0', enabled: true },
      ])
    } finally {
      await first.ctx.fiber.dispose()
    }

    await rebindHubIdentity(prepared.profile.patchPath, FOREIGN_IDENTITY)
    const second = await bootHubProfile(prepared.profile, credentials)
    try {
      // The previous account's catalog and tool registrations are gone with its
      // Host; this account starts from an empty published catalog.
      expect(await second.hub.catalog()).toEqual({ plugins: [], catalogVersion: '', instances: [], enabled: true })
      const refreshed = await second.hub.refresh()
      expect(refreshed.instances).toEqual([{ pluginId: 'demo', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: false }])
      expect(second.ctx.tools.get(toolName('demo', 'ping'))).toBeUndefined()
      // The refresh also removes the previous account's decision from Settings.
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([])

      await second.hub.enable('demo')
      await waitForTool(second.ctx, toolName('demo', 'ping'), true)
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([
        { platform: platform.url, scope: FOREIGN_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0', enabled: true },
      ])
      expect(await persistedAuthorizations(prepared.profile.patchPath)).not.toContainEqual(
        expect.objectContaining({ scope: TEST_SCOPE }),
      )
    } finally {
      await second.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })

  it('reports a manager registration refusal as a sanitized instance failure', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const namespace = namespaceForPlugin('demo')
    const prepared = await prepareHubProfile(platform.url, {
      managerConfig: { servers: { [namespace]: { transport: 'stdio', command: 'echo' } } },
      hubConfig: { authorizations: [{ platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0' }] },
    })
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    try {
      const failed = await booted.hub.refresh()
      expect(failed.instances).toMatchObject([{ pluginId: 'demo', state: 'error', error: 'The plugin instance could not start.' }])
      await expect(booted.hub.enable('demo')).rejects.toMatchObject({ code: 'plugin-hub/instance-failed' })
      platform.publish([], 'catalog-empty')
      const empty = await booted.hub.refresh()
      expect(empty.plugins).toEqual([])
      expect(empty.instances).toMatchObject([{ pluginId: 'demo', state: 'error' }])
      await booted.hub.disable('demo')
      expect((await booted.hub.catalog()).instances).toEqual([])
    } finally {
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })

  it('refuses to claim a clean disable when a tool survives unmount', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    let unregister: (() => void) | undefined
    try {
      await booted.hub.refresh()
      credentials.resolve = async () => undefined
      await booted.hub.enable('demo')
      const stale: ToolDefinition = {
        name: toolName('demo', 'ping'),
        description: 'registration that outlives the instance',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'stale' }] },
        execute: () => Promise.resolve('stale'),
      }
      unregister = booted.ctx.tools.register(stale)
      await expect(booted.hub.disable('demo')).rejects.toMatchObject({ code: 'plugin-hub/instance-failed' })
      expect((await booted.hub.catalog()).instances).toMatchObject([
        { pluginId: 'demo', state: 'error', authorized: false, error: 'The previous plugin instance did not close cleanly.' },
      ])
      await expect(booted.hub.disable('demo')).rejects.toMatchObject({ code: 'plugin-hub/instance-failed' })
      expect((await booted.hub.catalog()).instances).toMatchObject([{ state: 'error', authorized: false }])
      unregister()
      unregister = undefined
      await booted.hub.disable('demo')
      expect((await booted.hub.catalog()).instances).toMatchObject([{ pluginId: 'demo', state: 'disabled' }])
    } finally {
      unregister?.()
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })

  it('reports a failed unmount during reconcile and keeps the stale failure visible', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [{ pluginId: 'demo', releaseVersion: '1.0.0', tools: ['ping'], advertisedTools: [] }],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    let unregister: (() => void) | undefined
    try {
      await booted.hub.refresh()
      await booted.hub.enable('demo')
      const stale: ToolDefinition = {
        name: toolName('demo', 'ping'),
        description: 'registration that outlives the instance',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'stale' }] },
        execute: () => Promise.resolve('stale'),
      }
      unregister = booted.ctx.tools.register(stale)
      platform.publish([{ pluginId: 'demo', releaseVersion: '2.0.0', tools: ['ping'], advertisedTools: [] }], 'catalog-2')
      const reconciled = await booted.hub.refresh()
      expect(reconciled.instances).toMatchObject([
        { pluginId: 'demo', releaseVersion: '1.0.0', state: 'error', authorized: false, error: 'The previous plugin instance did not close cleanly.' },
      ])
      unregister()
      unregister = undefined
    } finally {
      unregister?.()
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })

  it('reports generic Settings write failures and keeps the instance running', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    const settings = booted.ctx.get('settings')
    if (settings === undefined) throw new Error('fixture profile mounted no settings service')
    const update = settings.update.bind(settings)
    try {
      await booted.hub.refresh()
      await booted.hub.enable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      settings.update = () => Promise.reject(new Error('fixture write failure'))
      await expect(booted.hub.disable('demo')).rejects.toMatchObject({ code: 'gateway/internal' })
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      settings.update = update
      await booted.hub.disable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), false)
    } finally {
      settings.update = update
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })

  it('remounts an errored release and refuses to claim a clean unmount with a leftover tool', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    let unregister: (() => void) | undefined
    let hideCredential = false
    const originalResolve = credentials.resolve.bind(credentials)
    credentials.resolve = async ref => hideCredential ? undefined : originalResolve(ref)
    try {
      await booted.hub.refresh()
      hideCredential = true
      await booted.hub.enable('demo')
      await vi.waitFor(async () => {
        const catalog = await booted.hub.catalog()
        expect(catalog.instances).toMatchObject([{ pluginId: 'demo', state: 'error' }])
      })
      const stale: ToolDefinition = {
        name: toolName('demo', 'ping'),
        description: 'registration that outlives the errored instance',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'stale' }] },
        execute: () => Promise.resolve('stale'),
      }
      unregister = booted.ctx.tools.register(stale)
      await expect(booted.hub.enable('demo')).rejects.toMatchObject({ code: 'plugin-hub/instance-failed' })
      unregister()
      unregister = undefined
      await booted.hub.disable('demo')
      expect((await booted.hub.catalog()).instances).toMatchObject([{ pluginId: 'demo', state: 'disabled' }])
    } finally {
      unregister?.()
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })

  it('keeps add, disable, enable, and remove as distinct durable states across restarts', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const first = await bootHubProfile(prepared.profile, credentials)
    try {
      await first.hub.refresh()
      expect((await first.hub.catalog()).instances).toEqual([
        { pluginId: 'demo', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: false },
      ])

      await first.hub.add('demo')
      expect((await first.hub.catalog()).instances).toEqual([
        { pluginId: 'demo', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: true },
      ])
      expect(first.ctx.tools.get(toolName('demo', 'ping'))).toBeUndefined()
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([
        { platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0', enabled: false },
      ])
    } finally {
      await first.ctx.fiber.dispose()
    }

    const second = await bootHubProfile(prepared.profile, credentials)
    try {
      await second.hub.refresh()
      expect(second.ctx.tools.get(toolName('demo', 'ping'))).toBeUndefined()
      expect((await second.hub.catalog()).instances).toMatchObject([
        { pluginId: 'demo', state: 'disabled', added: true },
      ])

      await second.hub.enable('demo')
      await waitForTool(second.ctx, toolName('demo', 'ping'), true)
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([
        { platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0', enabled: true },
      ])

      await second.hub.disable('demo')
      await waitForTool(second.ctx, toolName('demo', 'ping'), false)
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([
        { platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0', enabled: false },
      ])
      expect((await second.hub.catalog()).instances).toMatchObject([
        { pluginId: 'demo', state: 'disabled', added: true },
      ])
    } finally {
      await second.ctx.fiber.dispose()
    }

    const third = await bootHubProfile(prepared.profile, credentials)
    try {
      await third.hub.refresh()
      expect(third.ctx.tools.get(toolName('demo', 'ping'))).toBeUndefined()
      expect((await third.hub.catalog()).instances).toMatchObject([
        { pluginId: 'demo', state: 'disabled', added: true },
      ])

      await third.hub.removeInstance('demo')
      expect(await persistedAuthorizations(prepared.profile.patchPath)).toEqual([])
      expect((await third.hub.catalog()).instances).toEqual([
        { pluginId: 'demo', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: false },
      ])
    } finally {
      await third.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  }, 30_000)

  it('injects the current Host access token into catalog and MCP requests and rotates it', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer user-token-one',
      authorizations: ['Bearer user-token-two'],
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url, { hubConfig: { authorization: '' } })
    const credentials = fixtureCredentials({})
    const booted = await bootHubProfile(prepared.profile, credentials, {
      access: { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 },
    })
    const access = booted.access
    if (access === undefined) throw new Error('fixture did not mount the access service')
    try {
      const catalog = await booted.hub.refresh()
      expect(catalog.plugins.map(plugin => plugin.pluginId)).toEqual(['demo'])
      expect(platform.catalogAuthorization).toContain('Bearer user-token-one')

      await booted.hub.enable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      expect(platform.mcpAuthorization).toContain('Bearer user-token-one')
      expect(platform.mcpAuthorization).not.toContain('Bearer fixture-secret')
      expect(await runTool(booted.ctx, toolName('demo', 'ping'), 'user-token-call')).toBe('demo:ping')

      // The Electron sender replaces the token after a refresh; the Hub drops
      // the previous account-scoped catalog and instances before re-reading.
      const rotated = { accessToken: 'user-token-two', expiresAt: Date.now() + 120_000 }
      expect(access.accept(rotated)).toBe(true)
      expect(access.accept({ ...rotated })).toBe(false)
      await vi.waitFor(() => {
        expect(platform.catalogAuthorization).toContain('Bearer user-token-two')
      }, { timeout: 15_000 })
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      expect(await runTool(booted.ctx, toolName('demo', 'ping'), 'rotated-call')).toBe('demo:ping')
      expect(platform.mcpAuthorization.at(-1)).toBe('Bearer user-token-two')
    } finally {
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  }, 20_000)

  it('rejects a token for another account and clears token-scoped state', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer user-token-one',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url, { hubConfig: { authorization: '' } })
    const credentials = fixtureCredentials({})
    const booted = await bootHubProfile(prepared.profile, credentials, {
      access: { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 },
    })
    const access = booted.access
    if (access === undefined) throw new Error('fixture did not mount the access service')
    try {
      await booted.hub.refresh()
      await booted.hub.enable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      const other = `e30.${Buffer.from(JSON.stringify({
        iss: TEST_IDENTITY.issuer,
        sub: 'another-verified-subject',
      })).toString('base64url')}.signature`
      expect(access.accept({ accessToken: other, expiresAt: Date.now() + 120_000 })).toBe(true)
      await waitForTool(booted.ctx, toolName('demo', 'ping'), false)
      await expect(booted.hub.catalog()).rejects.toMatchObject({
        code: 'plugin-hub/unavailable',
        details: { reason: 'unauthorized' },
      })
    } finally {
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  }, 20_000)

  it('keeps mounted instances when a refresh fails and reports a sanitized failure', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    let platformClosed = false
    try {
      await booted.hub.refresh()
      await booted.hub.enable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      await platform.close()
      platformClosed = true
      const failure = await booted.hub.refresh().catch((error: unknown) => error)
      expect(failure).toMatchObject({ code: 'plugin-hub/unavailable', details: { reason: 'network' } })
      expect(String(failure)).not.toContain(platform.url)
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
    } finally {
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      if (!platformClosed) await platform.close()
    }
  })
})

/** Number of hub guard effects registered on the root tools registry. */
function rootGuardCount(ctx: Context): number {
  return ctx.root.fiber.getEffects().filter(effect => effect.label === 'tools.guard()').length
}

describe('plugin hub guard lifetime across whole-service disposal', () => {
  it('removes the root-owned guard after a clean disposal and every hub tool is gone', { timeout: 20_000 }, async () => {
    const platform = await startPlatformFixture({ authorization: 'Bearer fixture-secret', plugins: [DEMO] })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    try {
      await booted.hub.refresh()
      await booted.hub.enable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      expect(rootGuardCount(booted.ctx)).toBe(1)
      await booted.hubEntry.fiber?.dispose()
      expect(booted.ctx.tools.get(toolName('demo', 'ping'))).toBeUndefined()
      expect(rootGuardCount(booted.ctx)).toBe(0)
    } finally {
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })

  it('retains the guard while a hub-namespaced tool survives disposal', { timeout: 20_000 }, async () => {
    const platform = await startPlatformFixture({ authorization: 'Bearer fixture-secret', plugins: [DEMO] })
    const prepared = await prepareHubProfile(platform.url)
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
    const booted = await bootHubProfile(prepared.profile, credentials)
    const orphan = `mcp__${namespaceForPlugin('demo')}__orphan`
    let executed = false
    let unregister: (() => void) | undefined
    try {
      await booted.hub.refresh()
      await booted.hub.enable('demo')
      await waitForTool(booted.ctx, toolName('demo', 'ping'), true)
      unregister = booted.ctx.tools.register({
        name: orphan,
        description: 'tool that outlives the disposed service',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'orphan' }] },
        execute: () => { executed = true; return Promise.resolve('orphan') },
      })
      await booted.hubEntry.fiber?.dispose()
      expect(booted.ctx.tools.get(orphan)).toBeDefined()
      expect(rootGuardCount(booted.ctx)).toBe(1)
      const denied = await executeToolFixture(booted.ctx, {
        signal: TEST_SIGNAL,
        callId: ToolCallId('orphan-call'),
        name: orphan,
        arguments: {},
      })
      expect(executed).toBe(false)
      expect(denied.isError).toBe(true)
      expect(platform.calls).toEqual([])
    } finally {
      unregister?.()
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })
})
