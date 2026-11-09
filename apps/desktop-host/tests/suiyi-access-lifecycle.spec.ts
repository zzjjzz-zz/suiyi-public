/** Provider unload, expiry, in-flight catalog, and stop settle for the real access service. */

import { expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import {
  bootHubProfile,
  fixtureCredentials,
  prepareHubProfile,
  removeHubProfile,
  startPlatformFixture,
} from '../../../packages/mcp/plugin-hub-client/tests/fixture.ts'
import { namespaceForPlugin, publicToolName } from '../../../packages/mcp/plugin-hub-client/src/names.ts'
import { SuiyiAccess } from '../src/suiyi-access.ts'

const DEMO = { pluginId: 'demo', releaseVersion: '1.0.0', tools: ['ping'] }
const TOOL = publicToolName(namespaceForPlugin('demo'), 'ping')

/** Wait until a hub tool is registered or withdrawn. */
async function waitForTool(ctx: Context, present: boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.tools.get(TOOL) !== undefined).toBe(present)
  }, { timeout: 15_000 })
}

/** Wait for one observed request header. */
async function waitForHeader(headers: readonly (string | undefined)[], value: string): Promise<void> {
  await vi.waitFor(() => { expect(headers).toContain(value) }, { timeout: 15_000 })
}

/** Boot one profile with the real access service and a controllable fiber. */
async function boot(
  platformUrl: string,
  initial: { accessToken: string; expiresAt: number },
): Promise<{
  booted: Awaited<ReturnType<typeof bootHubProfile>>
  access: SuiyiAccess
  disposeAccess: () => Promise<void>
}> {
  let fiber: { dispose(): Promise<void> } | undefined
  const prepared = await prepareHubProfile(platformUrl, { hubConfig: { authorization: '' } })
  const booted = await bootHubProfile(prepared.profile, fixtureCredentials({}), {
    accessFactory: async (ctx) => {
      fiber = ctx.plugin(SuiyiAccess, initial)
      await fiber
    },
  })
  const access = booted.ctx.get('suiyiAccess') as SuiyiAccess | undefined
  if (access === undefined || fiber === undefined) throw new Error('desktop access service did not mount')
  return { booted, access, disposeAccess: () => fiber?.dispose() ?? Promise.resolve() }
}

/** Gate the real Settings service's update call and expose its first entry. */
function gateSettingsUpdate(booted: Awaited<ReturnType<typeof bootHubProfile>>): {
  entered: Promise<void>
  release: () => void
  restore: () => void
} {
  const settings = booted.ctx.get('settings')
  if (settings === undefined) throw new Error('fixture profile mounted no settings service')
  const original = settings.update.bind(settings)
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  settings.update = async (...args: Parameters<typeof original>) => {
    entered.resolve(undefined)
    await release.promise
    return original(...args)
  }
  return {
    entered: entered.promise,
    release: () => { release.resolve(undefined) },
    restore: () => { settings.update = original },
  }
}

it('aborts an in-flight catalog read and never applies a late token-scoped response', async () => {
  const gate = Promise.withResolvers<undefined>()
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted, access } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 })
  try {
    await booted.hub.refresh()
    platform.setCatalogGate(gate.promise)
    const reading = booted.hub.refresh()
    await waitForHeader(platform.catalogAuthorization, 'Bearer user-token-one')
    access.clear()
    await expect(booted.hub.catalog()).rejects.toMatchObject({ code: 'plugin-hub/credentials-missing' })
    gate.resolve(undefined)
    await reading.catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 50))
    await expect(booted.hub.catalog()).rejects.toMatchObject({ code: 'plugin-hub/credentials-missing' })
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)

it('withdraws authority before the queued unmount, so a live tool is denied immediately', async () => {
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted, access } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 })
  try {
    await booted.hub.refresh()
    await booted.hub.enable('demo')
    await waitForTool(booted.ctx, true)
    access.clear()
    const denied = await executeToolFixture(booted.ctx, {
      signal: new AbortController().signal,
      callId: ToolCallId('after-withdraw'),
      name: TOOL,
      arguments: {},
    })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied)).toMatch(/disabled|no longer authorized/)
    await waitForTool(booted.ctx, false)
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)

it('does not leave tools after the token expires while a mount is still in flight', async () => {
  const gate = Promise.withResolvers<undefined>()
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted, access } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 250 })
  try {
    await booted.hub.refresh()
    platform.setMcpGate(gate.promise)
    const enabling = booted.hub.enable('demo').catch((error: unknown) => error)
    await waitForHeader(platform.mcpAuthorization, 'Bearer user-token-one')
    await vi.waitFor(() => { expect(access.current()).toBeUndefined() }, { timeout: 5_000 })
    gate.resolve(undefined)
    await enabling
    await waitForTool(booted.ctx, false)
    await expect(booted.hub.catalog()).rejects.toMatchObject({ code: 'plugin-hub/credentials-missing' })
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)

it('settles queue and instances when the provider unmounts the access service', async () => {
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted, disposeAccess } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 })
  try {
    await booted.hub.refresh()
    await booted.hub.enable('demo')
    await waitForTool(booted.ctx, true)
    await disposeAccess()
    await waitForTool(booted.ctx, false)
    await expect(booted.hub.catalog()).rejects.toMatchObject({ code: 'plugin-hub/credentials-missing' })
    await expect(booted.hub.enable('demo')).rejects.toMatchObject({ code: 'plugin-hub/credentials-missing' })
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)

it('withdraws tools after the current token is observed as 401', async () => {
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted, access } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 })
  try {
    await booted.hub.refresh()
    await booted.hub.enable('demo')
    await waitForTool(booted.ctx, true)

    platform.setAuthorization('Bearer another-token')
    const failure = await booted.hub.refresh().catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'plugin-hub/unavailable', details: { reason: 'unauthorized' } })
    await waitForTool(booted.ctx, false)
    await expect(booted.hub.catalog()).rejects.toMatchObject({
      code: 'plugin-hub/unavailable',
      details: { reason: 'unauthorized' },
    })
    await expect(booted.hub.enable('demo')).rejects.toMatchObject({
      code: 'plugin-hub/unavailable',
      details: { reason: 'unauthorized' },
    })

    // A new token delivery clears the rejection and re-enters the normal flow.
    platform.setAuthorization('Bearer user-token-two')
    expect(access.accept({ accessToken: 'user-token-two', expiresAt: Date.now() + 120_000 })).toBe(true)
    await vi.waitFor(() => {
      expect(platform.catalogAuthorization).toContain('Bearer user-token-two')
    }, { timeout: 15_000 })
    await booted.hub.enable('demo')
    await waitForTool(booted.ctx, true)
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)

it('does not refill authority when Settings writes are gated across token withdrawal', async () => {
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted, access } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 })
  const gate = gateSettingsUpdate(booted)
  try {
    await booted.hub.refresh()
    const enabling = booted.hub.enable('demo').catch((error: unknown) => error)
    await gate.entered
    access.clear()
    gate.release()
    await enabling
    await waitForTool(booted.ctx, false)
    await expect(booted.hub.catalog()).rejects.toMatchObject({ code: 'plugin-hub/credentials-missing' })
  } finally {
    gate.restore()
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)

it('does not publish a pruned catalog when Settings is gated across token withdrawal', async () => {
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted, access } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 })
  let gate: ReturnType<typeof gateSettingsUpdate> | undefined
  try {
    await booted.hub.refresh()
    await booted.hub.enable('demo')
    await waitForTool(booted.ctx, true)
    platform.publish([{ pluginId: 'demo', releaseVersion: '2.0.0', tools: ['ping'] }], 'catalog-2')

    gate = gateSettingsUpdate(booted)
    const refreshing = booted.hub.refresh().catch((error: unknown) => error)
    await gate.entered
    access.clear()
    gate.release()
    await refreshing
    await waitForTool(booted.ctx, false)
    await expect(booted.hub.catalog()).rejects.toMatchObject({ code: 'plugin-hub/credentials-missing' })
  } finally {
    gate?.restore()
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)

it('settles a catalog read and every instance when the hub fiber is disposed mid-read', async () => {
  const gate = Promise.withResolvers<undefined>()
  const platform = await startPlatformFixture({ authorization: 'Bearer user-token-one', plugins: [DEMO] })
  const { booted } = await boot(platform.url, { accessToken: 'user-token-one', expiresAt: Date.now() + 60_000 })
  try {
    await booted.hub.refresh()
    await booted.hub.enable('demo')
    await waitForTool(booted.ctx, true)
    platform.setCatalogGate(gate.promise)
    const reading = booted.hub.refresh().catch((error: unknown) => error)
    await waitForHeader(platform.catalogAuthorization, 'Bearer user-token-one')
    const disposing = booted.hubEntry.fiber?.dispose()
    gate.resolve(undefined)
    await reading
    await disposing
    expect(booted.ctx.tools.get(TOOL)).toBeUndefined()
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(booted.home)
    await platform.close()
  }
}, 25_000)
