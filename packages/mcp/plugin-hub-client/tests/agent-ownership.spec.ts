/** Real AgentLoop dispatch cannot use the Host credential for a guest-started turn. */
import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Principal } from '@deepseek-ai/dsh-typert-protocol'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import McpServerManager from '@deepseek-ai/dsh-mcp-manager'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import PluginHub from '../src/index.ts'
import { namespaceForPlugin, publicToolName } from '../src/names.ts'
import { fixtureCredentials, startPlatformFixture, TEST_IDENTITY, TEST_SCOPE } from './fixture.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'hub-execution-guest': { readonly kind: 'hub-execution-guest' } }
}
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'hub-admission-test': { kind: 'user'; principal?: Principal }
    'hub-internal-note': { kind: 'hub-internal-note'; form: 'notice'; summary: string }
  }
}

it('admits an owner Agent and rejects a second principal before any MCP tools/call', async () => {
  const platform = await startPlatformFixture({ authorization: 'Bearer fixture-secret', plugins: [{ pluginId: 'demo', releaseVersion: '1', tools: ['ping'] }] })
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx)
    const loop = await mountAgentLoopTestHarness(ctx)
    ctx.provide('credentials', fixtureCredentials({ TOKEN: 'fixture-secret' }))
    await ctx.plugin(McpServerManager, {})
    await ctx.plugin(PluginHub, { enabled: true, platformUrl: platform.url, authorization: 'Bearer ${credential:TOKEN}', identity: TEST_IDENTITY, authorizations: [{ platform: platform.url, scope: TEST_SCOPE, pluginId: 'demo', releaseVersion: '1' }] })
    await ctx.pluginHub.refresh()
    const name = publicToolName(namespaceForPlugin('demo'), 'ping')
    await vi.waitFor(() => { expect(ctx.tools.get(name)).toBeDefined() })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([
      toolCallResponse('owner-call', name, {}), textResponse('owner done'),
      toolCallResponse('guest-call', name, {}), textResponse('guest done'),
      toolCallResponse('unattributed-call', name, {}), textResponse('unattributed done'),
    ]))
    const owner = await loop.create(SessionId('hub-owner'), { provider: 'mock', model: 'mock' })
    owner.followup(createUserMessage({ content: [{ type: 'text', text: 'Call the approved tool' }], source: { kind: 'user' } }))
    await owner.whenIdle()
    expect(platform.calls).toEqual(['demo:ping'])
    const guest = await loop.create(SessionId('hub-guest'), { provider: 'mock', model: 'mock' })
    guest.followup(createUserMessage({ content: [{ type: 'text', text: 'Call the owner tool' }], source: { kind: 'user', principal: { kind: 'hub-execution-guest' } } }))
    await guest.whenIdle()
    expect(platform.calls).toEqual(['demo:ping'])
    expect(JSON.stringify(guest.session.snapshotEvents().filter(event => event.type === 'tool/result'))).toContain('not attributed to the Host owner')
    const unattributed = await loop.create(SessionId('hub-unattributed'), { provider: 'mock', model: 'mock' })
    unattributed.followup(createUserMessage({ content: [{ type: 'text', text: 'Internal note' }], source: { kind: 'hub-internal-note', form: 'notice', summary: 'Internal input' } }))
    await unattributed.whenIdle()
    expect(platform.calls).toEqual(['demo:ping'])
    ctx.on('agent/pre-step', async ({ agent }, next) => agent.id === SessionId('hub-entry-rejected') ? { kind: 'reject' } : next())
    const rejected = await loop.create(SessionId('hub-entry-rejected'), { provider: 'mock', model: 'mock' })
    rejected.followup(createUserMessage({ content: [{ type: 'text', text: 'Rejected before admission' }], source: { kind: 'user' } }))
    await rejected.whenIdle()
    expect(platform.calls).toEqual(['demo:ping'])
  } finally { await ctx.fiber.dispose(); await platform.close() }
})
