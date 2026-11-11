/** Service lifecycle edges: opt-in, validation, failure mapping, persistence, and background polling. */

import { describe, expect, it, vi } from 'vitest'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import McpServerManager from '@deepseek-ai/dsh-mcp-manager'
import { HubClientError, type HubFailure } from '../src/client.ts'
import PluginHub from '../src/index.ts'
import { fixtureCredentials, startPlatformFixture, TEST_IDENTITY, TEST_SCOPE } from './fixture.ts'
import type { FixturePlugin } from './fixture.ts'

const DEMO: FixturePlugin = { pluginId: 'demo', releaseVersion: '1.0.0', tools: ['ping'] }

/** Host context with the services the hub injects. */
async function base(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(McpServerManager, {})
  return ctx
}

/** Mount the hub directly, without a Loader profile. */
async function mount(ctx: Context, config: Record<string, unknown>): Promise<{ fiber: Fiber; hub: PluginHub }> {
  const fiber = ctx.plugin(PluginHub, config)
  await fiber.await()
  const hub = ctx.get('pluginHub')
  if (hub === undefined) throw new Error('hub did not register')
  return { fiber, hub }
}

describe('plugin hub service edges', () => {
  it('stays inert while disabled and refuses lifecycle calls', async () => {
    const ctx = await base()
    const { fiber, hub } = await mount(ctx, { enabled: false })
    try {
      expect(await hub.catalog()).toEqual({ plugins: [], catalogVersion: '', instances: [], enabled: false })
      expect(await hub.refresh()).toEqual({ plugins: [], catalogVersion: '', instances: [], enabled: false })
      await expect(hub.enable('Bad_ID')).rejects.toMatchObject({ code: 'plugin-hub/invalid-request' })
      await expect(hub.enable('demo')).rejects.toMatchObject({ code: 'plugin-hub/disabled' })
      await expect(hub.disable('demo')).rejects.toMatchObject({ code: 'plugin-hub/disabled' })
      await expect(hub.add('demo')).rejects.toMatchObject({ code: 'plugin-hub/disabled' })
      await expect(hub.removeInstance('demo')).rejects.toMatchObject({ code: 'plugin-hub/disabled' })
    } finally {
      await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('fails activation for each enabled configuration invariant', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ enabled: true, authorization: 'Bearer token' }, '"platformUrl" is required'],
      [{ enabled: true, platformUrl: 'http://127.0.0.1:9' }, '"identity" is required'],
      [{ enabled: true, platformUrl: 'http://127.0.0.1:9', authorization: '${vault:NOPE}' }, 'is not a template token'],
      [
        { enabled: true, platformUrl: 'http://127.0.0.1:9', authorization: 'Bearer ${credential:TOKEN}' },
        '"identity" is required',
      ],
      [
        { enabled: true, platformUrl: 'http://127.0.0.1:9', authorization: 'Bearer ${credential:TOKEN}', identity: TEST_IDENTITY },
        'no credentials provider is mounted',
      ],
      [
        { enabled: true, platformUrl: 'http://127.0.0.1:9', authorization: 'plain-user-token', identity: TEST_IDENTITY },
        'must be "Bearer <user access token>"',
      ],
    ]
    for (const [config, message] of cases) {
      const ctx = await base()
      const fiber = ctx.plugin(PluginHub, config)
      await expect(fiber.await()).rejects.toThrow(message)
      await ctx.fiber.dispose()
    }
  })

  it('maps every platform client failure to its Remote failure', async () => {
    const cases: Array<[HubFailure, string, Record<string, unknown>]> = [
      ['credentials-unavailable', 'plugin-hub/credentials-unavailable', {}],
      ['credentials-missing', 'plugin-hub/credentials-missing', {}],
      ['unauthorized', 'plugin-hub/unavailable', { reason: 'unauthorized' }],
      ['timeout', 'plugin-hub/unavailable', { reason: 'timeout' }],
      ['too-large', 'plugin-hub/unavailable', { reason: 'too-large' }],
      ['invalid-response', 'plugin-hub/unavailable', { reason: 'invalid-response' }],
      ['network', 'plugin-hub/unavailable', { reason: 'network' }],
      ['http', 'plugin-hub/unavailable', { reason: 'http' }],
    ]
    for (const [reason, code, details] of cases) {
      const ctx = await base()
      ctx.provide('credentials', {
        resolve: () => Promise.reject(new HubClientError(reason, 'fixture failure')),
      })
      const { fiber, hub } = await mount(ctx, {
        enabled: true,
        platformUrl: 'http://127.0.0.1:9',
        authorization: 'Bearer ${credential:TOKEN}',
        identity: TEST_IDENTITY,
      })
      try {
        await expect(hub.refresh()).rejects.toMatchObject({ code, details })
      } finally {
        await fiber.dispose()
        await ctx.fiber.dispose()
      }
    }
  })

  it('prunes a stale release without Settings, then reports enablement cannot be saved', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
    })
    const ctx = await base()
    ctx.provide('credentials', fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' }))
    const errors = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
    const { fiber, hub } = await mount(ctx, {
      enabled: true,
      platformUrl: platform.url,
      authorization: 'Bearer ${credential:PLUGIN_HUB_TOKEN}',
      identity: TEST_IDENTITY,
      authorizations: [{ platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1.0.0' }],
    })
    try {
      platform.publish([{ pluginId: 'demo', releaseVersion: '2.0.0', tools: ['ping'] }], 'catalog-2')
      const catalog = await hub.refresh()
      expect(catalog.plugins.map(plugin => plugin.releaseVersion)).toEqual(['2.0.0'])
      expect(catalog.instances).toEqual([{ pluginId: 'demo', releaseVersion: '2.0.0', state: 'disabled', authorized: false, added: false }])
      expect(errors).toHaveBeenCalled()
      await expect(hub.enable('demo')).rejects.toMatchObject({ code: 'plugin-hub/settings-unavailable' })
      await expect(hub.enable('absent')).rejects.toMatchObject({ code: 'plugin-hub/unknown-plugin' })
      // The stale decision could not be persisted away, so withdrawing it also cannot be claimed.
      await expect(hub.disable('demo')).rejects.toMatchObject({ code: 'plugin-hub/settings-unavailable' })
      await expect(hub.disable('Bad_ID')).rejects.toMatchObject({ code: 'plugin-hub/invalid-request' })
    } finally {
      errors.mockRestore()
      await fiber.dispose()
      await ctx.fiber.dispose()
      await platform.close()
    }
  })

  it('skips a poll tick while another refresh is in flight', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer fixture-secret',
      plugins: [DEMO],
      catalogDelayMs: 1_500,
    })
    const ctx = await base()
    ctx.provide('credentials', fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' }))
    const { fiber } = await mount(ctx, {
      enabled: true,
      platformUrl: platform.url,
      authorization: 'Bearer ${credential:PLUGIN_HUB_TOKEN}',
      identity: TEST_IDENTITY,
      refreshIntervalMs: 1_000,
    })
    try {
      // The activation-time refresh is in flight when the first poll fires.
      await new Promise(resolve => setTimeout(resolve, 1_200))
    } finally {
      await fiber.dispose()
      await ctx.fiber.dispose()
      await platform.close()
    }
  })

  it('contains a non-client background refresh failure', async () => {
    const ctx = await base()
    ctx.provide('credentials', {
      resolve: () => Promise.reject(new Error('fixture resolver failure')),
    })
    const errors = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
    const { fiber } = await mount(ctx, {
      enabled: true,
      platformUrl: 'http://127.0.0.1:9',
      authorization: 'Bearer ${credential:TOKEN}',
      identity: TEST_IDENTITY,
      refreshIntervalMs: 1_000,
    })
    try {
      await vi.waitFor(() => { expect(errors).toHaveBeenCalled() }, { timeout: 5_000 })
    } finally {
      errors.mockRestore()
      await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('polls on the configured interval, contains poll failures, and refuses work after disposal', async () => {
    const platform = await startPlatformFixture({
      authorization: 'Bearer correct',
      plugins: [DEMO],
    })
    const ctx = await base()
    ctx.provide('credentials', fixtureCredentials({ PLUGIN_HUB_TOKEN: 'wrong' }))
    const errors = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
    const { fiber, hub } = await mount(ctx, {
      enabled: true,
      platformUrl: platform.url,
      authorization: 'Bearer ${credential:PLUGIN_HUB_TOKEN}',
      identity: TEST_IDENTITY,
      refreshIntervalMs: 1_000,
    })
    try {
      await vi.waitFor(() => { expect(errors).toHaveBeenCalled() }, { timeout: 5_000 })
      // Let one armed interval tick run and contain its own failure.
      await new Promise(resolve => setTimeout(resolve, 1_200))
      const failure = await hub.refresh().catch((error: unknown) => error)
      expect(failure).toMatchObject({ code: 'plugin-hub/unavailable', details: { reason: 'unauthorized' } })
    } finally {
      errors.mockRestore()
      await fiber.dispose()
    }
    await expect(hub.refresh()).rejects.toMatchObject({ code: 'gateway/internal', message: 'The plugin hub is stopping.' })
    await expect(hub.enable('demo')).rejects.toMatchObject({ code: 'gateway/internal', message: 'The plugin hub is stopping.' })
    await ctx.fiber.dispose()
    await platform.close()
  })
})
