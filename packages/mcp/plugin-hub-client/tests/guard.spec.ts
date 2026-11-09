/** Pre-dispatch guard behavior and parity with the MCP client's naming contract. */

import { describe, expect, it } from 'vitest'
import { publicToolName as mcpPublicToolName } from '../../mcp-client/src/tools.ts'
import { guardToolCall, type GuardedInstance } from '../src/guard.ts'
import { namespaceForPlugin, publicToolName } from '../src/names.ts'

const NAMESPACE = namespaceForPlugin('demo')
const TOOL = publicToolName(NAMESPACE, 'ping')

/** One live binding for the namespace. */
function live(overrides: Partial<GuardedInstance> = {}): Map<string, GuardedInstance> {
  return new Map([[NAMESPACE, {
    pluginId: 'demo',
    releaseVersion: '1.0.0',
    publicToolNames: new Set([TOOL]),
    ...overrides,
  }]])
}

describe('hub tool guard', () => {
  it('keeps the MCP client public-name derivation in step', () => {
    expect(publicToolName(NAMESPACE, 'ping')).toBe(mcpPublicToolName(NAMESPACE, 'ping'))
    expect(publicToolName(NAMESPACE, 'a'.repeat(80))).toBe(mcpPublicToolName(NAMESPACE, 'a'.repeat(80)))
    expect(namespaceForPlugin('demo')).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
  })

  it('refuses to derive a namespace from an invalid plugin id', () => {
    expect(() => namespaceForPlugin('Bad_ID')).toThrow(TypeError)
    expect(() => namespaceForPlugin('')).toThrow(TypeError)
  })

  it('allows an authorized live release and its approved tool', () => {
    expect(guardToolCall({ name: TOOL }, live(), new Map(), new Map([['demo', '1.0.0']]))).toBeUndefined()
  })

  it('denies a call whose live release is no longer authorized', () => {
    expect(guardToolCall({ name: TOOL }, live(), new Map(), new Map([['demo', '2.0.0']])))
      .toContain('no longer authorized')
    expect(guardToolCall({ name: TOOL }, live(), new Map(), new Map()))
      .toContain('no longer authorized')
  })

  it('denies a public name outside the frozen allowed tools', () => {
    expect(guardToolCall({ name: publicToolName(NAMESPACE, 'shell') }, live(), new Map(), new Map([['demo', '1.0.0']])))
      .toContain('not in the plugin')
  })

  it('denies a retired namespace and leaves foreign names untouched', () => {
    const revoked = new Map([[NAMESPACE, 'demo']])
    expect(guardToolCall({ name: TOOL }, new Map(), revoked, new Map([['demo', '1.0.0']])))
      .toContain('disabled')
    expect(guardToolCall({ name: 'mcp__other__ping' }, new Map(), revoked, new Map())).toBeUndefined()
    expect(guardToolCall({ name: 'another_tool' }, new Map(), revoked, new Map())).toBeUndefined()
  })

  it('keeps a retired namespace blocked while a replacement fiber is starting', () => {
    expect(guardToolCall({ name: TOOL }, live(), new Map([[NAMESPACE, 'demo']]), new Map([['demo', '1.0.0']])))
      .toContain('disabled')
  })
})
