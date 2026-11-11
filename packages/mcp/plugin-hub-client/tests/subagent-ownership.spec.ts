/** Real AgentLoop and subagent providers: child authority is frozen at creation and never inferred on resume. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Fork from '@deepseek-ai/dsh-subagent-fork-in-process'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as SubagentTool from '@deepseek-ai/dsh-tool-subagent'
import McpManager from '@deepseek-ai/dsh-mcp-manager'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { mountWorkingDirectoryFixture } from '../../../subagent/subagent/tests/working-directory-fixture.ts'
import PluginHub from '../src/index.ts'
import { namespaceForPlugin, publicToolName } from '../src/names.ts'
import { fixtureCredentials, startPlatformFixture, TEST_IDENTITY, TEST_SCOPE } from './fixture.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** A non-owner caller used to prove guest-born children stay blocked. */
    'subagent-ownership-guest': { readonly kind: 'subagent-ownership-guest' }
  }
}

const DEMO = { pluginId: 'demo', releaseVersion: '1', tools: ['ping'] }

/** Wait for a predicate without assuming how many asynchronous turns the delegation takes. */
async function until(predicate: () => boolean, label: string): Promise<void> {
  await vi.waitFor(() => { expect(predicate(), label).toBe(true) }, { timeout: 20_000 })
}

/** Mount the real delegation and Hub composition used by these regressions. */
async function setup(options: { fork?: boolean } = {}): Promise<{
  ctx: Context
  platform: Awaited<ReturnType<typeof startPlatformFixture>>
  name: string
  root: string
}> {
  const ctx = new Context()
  const root = await mkdtemp(join(tmpdir(), 'hub-subagent-'))
  let platform: Awaited<ReturnType<typeof startPlatformFixture>> | undefined
  try {
    platform = await startPlatformFixture({ authorization: 'Bearer fixture-secret', plugins: [DEMO] })
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(Persistence, { root })
    await mountAgentLoopTestHarness(ctx)
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(Subagents)
    await ctx.plugin(Spawn, { providerName: 'spawn' })
    if (options.fork === true) await ctx.plugin(Fork, { providerName: 'fork' })
    await ctx.plugin(SubagentTool, { provider: options.fork === true ? 'fork' : 'spawn', toolName: options.fork === true ? 'subagent_fork' : 'subagent', maxDepth: 3 })
    ctx.provide('credentials', fixtureCredentials({ TOKEN: 'fixture-secret' }))
    await ctx.plugin(McpManager, {})
    await ctx.plugin(PluginHub, { enabled: true, platformUrl: platform.url, authorization: 'Bearer ${credential:TOKEN}', identity: TEST_IDENTITY, authorizations: [{ platform: platform.url, scope: TEST_SCOPE, pluginId: DEMO.pluginId, releaseVersion: DEMO.releaseVersion }] })
    await ctx.pluginHub.refresh()
    const name = publicToolName(namespaceForPlugin(DEMO.pluginId), 'ping')
    await until(() => ctx.tools.get(name) !== undefined, 'hub tool registration')
    return { ctx, platform, name, root }
  } catch (error: unknown) {
    await teardown(ctx, platform, root)
    throw error
  }
}

/** Release every acquired resource, including after partial startup or a failed disposer. */
async function teardown(ctx: Context, platform: Awaited<ReturnType<typeof startPlatformFixture>> | undefined, root: string): Promise<void> {
  try { await ctx.fiber.dispose() } finally {
    try { await platform?.close() } finally { await rm(root, { recursive: true, force: true }) }
  }
}

describe('subagent Hub authority', () => {
  it('lets an owner parent fork a seeded child that calls the Hub', { timeout: 30_000 }, async () => {
    const { ctx, platform, name, root } = await setup({ fork: true })
    const created: Agent[] = []
    ctx.on('agent/created', ({ agent }) => { created.push(agent) })
    try {
      const parentId = SessionId('fork-owner-parent')
      ctx.llm.registerAdapter(['mock'], new MockAdapter([
        textResponse('Warm up the parent transcript.'),
        toolCallResponse('fork-call', 'subagent_fork', { description: 'Call the approved tool', prompt: 'Call the Hub ping tool.' }),
        toolCallResponse('fork-child-hub', name, {}),
        textResponse('Child done'),
        textResponse('Parent done'),
      ]))
      const parent = await ctx.agentLoop.create(parentId, { provider: 'mock', model: 'mock' })
      parent.followup(createUserMessage({ content: [{ type: 'text', text: 'Warm up.' }], source: { kind: 'user' } }))
      await parent.whenIdle()
      parent.followup(createUserMessage({ content: [{ type: 'text', text: 'Delegate the tool call.' }], source: { kind: 'user' } }))
      await parent.whenIdle()
      await until(() => created.some(agent => agent.id !== parentId), 'forked child created')
      await until(() => platform.calls.includes('demo:ping'), 'forked child reached the platform')
      const child = created.find(agent => agent.id !== parentId)
      expect(child?.session.header.origin).toBe('subagent')
      expect(child?.session.header.parentSession).toBe(parentId)
      expect(child?.session.header.isSeeded).toBe(true)
      expect(platform.calls).toEqual(['demo:ping'])
    } finally {
      await teardown(ctx, platform, root)
    }
  })

  it('does not inherit authority for a guest parent fork child', { timeout: 30_000 }, async () => {
    const { ctx, platform, name, root } = await setup({ fork: true })
    try {
      const parentId = SessionId('fork-guest-parent')
      const children: Agent[] = []
      ctx.on('agent/created', ({ agent }) => { if (agent.id !== parentId) children.push(agent) })
      ctx.llm.registerAdapter(['mock'], new MockAdapter([
        toolCallResponse('fork-guest-call', 'subagent_fork', { description: 'Call the approved tool', prompt: 'Call the Hub ping tool.' }),
        toolCallResponse('fork-guest-child-hub', name, {}),
        textResponse('Child done'),
        textResponse('Parent done'),
      ]))
      const parent = await ctx.agentLoop.create(parentId, { provider: 'mock', model: 'mock' })
      parent.followup(createUserMessage({ content: [{ type: 'text', text: 'Delegate the tool call.' }], source: { kind: 'user', principal: { kind: 'subagent-ownership-guest' } } }))
      await parent.whenIdle()
      await until(() => children[0]?.session.snapshotEvents().some(event => event.type === 'tool/result') ?? false, 'guest child attempted the hub tool')
      expect(platform.calls).toEqual([])
      expect(JSON.stringify(children[0]?.session.snapshotEvents())).toContain('not attributed to the Host owner')
    } finally {
      await teardown(ctx, platform, root)
    }
  })

  it('refuses a resumed derived child without an origin even while its creator is live and owner-attributed', { timeout: 30_000 }, async () => {
    const { ctx, platform, name, root } = await setup()
    try {
      ctx.llm.registerAdapter(['mock'], new MockAdapter([
        textResponse('Parent owner turn.'),
        textResponse('Child persisted.'),
        toolCallResponse('resumed-child-hub', name, {}),
        textResponse('Resume denied.'),
      ]))
      const parent = await ctx.agentLoop.create(SessionId('resume-parent'), { provider: 'mock', model: 'mock' })
      parent.followup(createUserMessage({ content: [{ type: 'text', text: 'Owner input.' }], source: { kind: 'user' } }))
      await parent.whenIdle()

      const childId = SessionId('resume-child')
      const created = await ctx.agents.create({
        sessionId: childId,
        meta: { parentSession: parent.id },
        agentOptions: { provider: 'mock', model: 'mock' },
      })
      created.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Persist this child.' }], source: { kind: 'user' } }))
      await created.agent.whenIdle()
      await created.dispose()

      const resumed = await ctx.agents.resume({ resumeSessionId: childId, agentOptions: { provider: 'mock', model: 'mock' } })
      try {
        expect(resumed.agent.session.header.parentSession).toBe(parent.id)
        expect(resumed.agent.session.header.origin).toBeUndefined()
        resumed.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Call the Hub tool.' }], source: { kind: 'user' } }))
        await resumed.agent.whenIdle()
        expect(platform.calls).toEqual([])
        expect(JSON.stringify(resumed.agent.session.snapshotEvents())).toContain('not attributed to the Host owner')
      } finally {
        await resumed.dispose()
      }
    } finally {
      await teardown(ctx, platform, root)
    }
  })
})
