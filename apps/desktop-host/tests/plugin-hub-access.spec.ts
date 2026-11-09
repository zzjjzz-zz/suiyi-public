/** Real desktop access service + real plugin-hub profile: current user token reaches catalog and MCP. */

import { expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  bootHubProfile,
  fixtureCredentials,
  prepareHubProfile,
  removeHubProfile,
  startPlatformFixture,
} from '../../../packages/mcp/plugin-hub-client/tests/fixture.ts'
import { namespaceForPlugin, publicToolName } from '../../../packages/mcp/plugin-hub-client/src/names.ts'
import { SuiyiAccess } from '../src/suiyi-access.ts'

const TOOL = publicToolName(namespaceForPlugin('demo'), 'ping')

/** Wait until a hub tool is registered or withdrawn. */
async function waitForTool(ctx: Context, present: boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.tools.get(TOOL) !== undefined).toBe(present)
  }, { timeout: 15_000 })
}

it('passes the desktop-provided current token to catalog and MCP and replaces it on rotation', async () => {
  const platform = await startPlatformFixture({
    authorization: 'Bearer desktop-token-one',
    authorizations: ['Bearer desktop-token-two'],
    plugins: [{ pluginId: 'demo', releaseVersion: '1.0.0', tools: ['ping'] }],
  })
  const prepared = await prepareHubProfile(platform.url, { hubConfig: { authorization: '' } })
  const credentials = fixtureCredentials({})
  const booted = await bootHubProfile(prepared.profile, credentials, {
    accessFactory: async (ctx) => {
      await ctx.plugin(SuiyiAccess, { accessToken: 'desktop-token-one', expiresAt: Date.now() + 60_000 })
    },
  })
  const access = booted.ctx.get('suiyiAccess') as SuiyiAccess | undefined
  if (access === undefined) throw new Error('desktop access service did not mount')
  try {
    const catalog = await booted.hub.refresh()
    expect(catalog.plugins.map(plugin => plugin.pluginId)).toEqual(['demo'])
    expect(platform.catalogAuthorization).toContain('Bearer desktop-token-one')

    await booted.hub.enable('demo')
    await waitForTool(booted.ctx, true)
    expect(platform.mcpAuthorization).toContain('Bearer desktop-token-one')

    expect(access.accept({ accessToken: 'desktop-token-two', expiresAt: Date.now() + 120_000 })).toBe(true)
    await vi.waitFor(() => {
      expect(platform.catalogAuthorization).toContain('Bearer desktop-token-two')
    }, { timeout: 15_000 })
    await waitForTool(booted.ctx, true)
    expect(platform.mcpAuthorization.at(-1)).toBe('Bearer desktop-token-two')
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(prepared.home)
    await platform.close()
  }
}, 25_000)
