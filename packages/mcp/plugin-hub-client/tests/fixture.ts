/**
 * Test fixtures for the plugin hub client: a keyless platform JSON/MCP server
 * and a real Loader profile that mounts the hub beside mcp-manager.
 */

import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler, type NodeIncomingMessageLike } from '@modelcontextprotocol/node'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type Entry } from '@deepseek-ai/cordis-plugin-loader'
import { initProfile, mountRootInclude, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Settings from '@deepseek-ai/dsh-settings'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import McpServerManager from '@deepseek-ai/dsh-mcp-manager'
import type { SuiyiAccess, SuiyiAccessToken } from '../src/access.ts'
import PluginHub from '../src/index.ts'
import { hubIdentityScope, type HubIdentity } from '../src/identity.ts'
import type { CredentialResolver } from '../src/client.ts'
import type { CatalogPlugin } from '../src/types.ts'

/** Minimal access-token holder for plugin-hub tests; the real service is desktop-host's. */
export class TestSuiyiAccess implements SuiyiAccess {
  private token: SuiyiAccessToken | undefined
  private readonly listeners = new Set<() => void>()

  /** @param initial - optional first delivery. */
  constructor(initial?: SuiyiAccessToken) { this.token = initial }

  current(): SuiyiAccessToken | undefined {
    return this.token !== undefined && this.token.expiresAt > Date.now() ? this.token : undefined
  }

  accept(value: SuiyiAccessToken): boolean {
    if (this.token?.accessToken === value.accessToken && this.token.expiresAt === value.expiresAt) return false
    this.token = value
    for (const listener of [...this.listeners]) listener()
    return true
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

/** Verified account every fixture profile is bound to unless a test overrides it. */
export const TEST_IDENTITY: HubIdentity = {
  issuer: 'https://sso.example.test/realms/identity',
  subject: 'fixture-subject',
}

/** Opaque scope of {@link TEST_IDENTITY} as persisted beside decisions. */
export const TEST_SCOPE = hubIdentityScope(TEST_IDENTITY)

/** One fixture plugin: id, version, and the raw tool names its endpoint lists. */
export interface FixturePlugin {
  pluginId: string
  releaseVersion: string
  tools: string[]
  /** Raw tools the MCP endpoint advertises; defaults to `tools`. */
  advertisedTools?: string[]
  /** Optional catalog icon reference. */
  icon?: string
  /** Omit tool descriptions from the catalog row. */
  omitToolDescriptions?: boolean
}

/** Running fixture platform and its observable evidence. */
export interface PlatformFixture {
  /** Platform origin, e.g. `http://127.0.0.1:1234`. */
  url: string
  /** Authorization headers observed on catalog requests. */
  catalogAuthorization: Array<string | undefined>
  /** Authorization headers observed on MCP requests. */
  mcpAuthorization: Array<string | undefined>
  /** Raw tool calls observed at the fixture. */
  calls: string[]
  /** Replace the published catalog. */
  publish: (plugins: readonly FixturePlugin[], catalogVersion: string) => void
  /** Current fixture plugins. */
  plugins: () => readonly FixturePlugin[]
  /** Hold later catalog responses until the returned gate settles. */
  setCatalogGate: (gate: Promise<unknown> | undefined) => void
  /** Hold later MCP requests until the returned gate settles. */
  setMcpGate: (gate: Promise<unknown> | undefined) => void
  /** Replace the accepted Authorization values, e.g. to simulate a revoked token. */
  setAuthorization: (value: string) => void
  /** Stop the HTTP server and MCP handler. */
  close: () => Promise<void>
}

/** Build one catalog row with the frozen wire fields. */
function catalogRow(plugin: FixturePlugin): CatalogPlugin {
  return {
    pluginId: plugin.pluginId,
    ...plugin.icon === undefined ? {} : { icon: plugin.icon },
    workloadId: `workload-${plugin.pluginId}`,
    releaseVersion: plugin.releaseVersion,
    name: plugin.pluginId,
    description: `Fixture plugin ${plugin.pluginId}`,
    category: 'test',
    allowedTools: plugin.tools.map(tool => ({
      name: tool,
      ...plugin.omitToolDescriptions === true ? {} : { description: `Fixture tool ${tool}` },
      inputSchema: { type: 'object', properties: {} },
    })),
    schemaFingerprint: `fingerprint-${plugin.releaseVersion}`,
    riskLevel: 'low',
    visibility: 'public',
    allowedRoles: [],
    status: 'published',
    mcpPath: `/api/v1/plugins/${plugin.pluginId}/mcp?releaseVersion=${encodeURIComponent(plugin.releaseVersion)}`,
  }
}

/**
 * Start a keyless platform fixture exposing `/api/v1/catalog` and one MCP
 * endpoint per published plugin. Both routes require the configured credential.
 * @param options - expected authorization header and initial plugins.
 * @returns the running fixture.
 */
export async function startPlatformFixture(options: {
  authorization: string
  plugins?: readonly FixturePlugin[]
  catalogVersion?: string
  /** Additional accepted Authorization values, e.g. a rotated user token. */
  authorizations?: readonly string[]
  /** Delay each catalog response, in milliseconds. */
  catalogDelayMs?: number
  /** Hold every catalog response until this settles. */
  catalogGate?: Promise<unknown>
  /** Hold every MCP request until this settles. */
  mcpGate?: Promise<unknown>
  /** Answer every MCP route with 500 so an instance cannot connect. */
  failMcp?: boolean
}): Promise<PlatformFixture> {
  let accepted = new Set([options.authorization, ...(options.authorizations ?? [])])
  let plugins = [...options.plugins ?? []]
  let catalogVersion = options.catalogVersion ?? 'catalog-1'
  let catalogGate = options.catalogGate
  let mcpGate = options.mcpGate
  const catalogAuthorization: Array<string | undefined> = []
  const mcpAuthorization: Array<string | undefined> = []
  const calls: string[] = []
  const handler = createMcpHandler(({ requestInfo }) => {
    const url = requestInfo === undefined ? undefined : new URL(requestInfo.url)
    const pluginId = url?.pathname.split('/')[4]
    const plugin = pluginId === undefined ? undefined : plugins.find(candidate => candidate.pluginId === pluginId)
    const mcp = new McpServer({ name: 'fixture-platform', version: '1.0.0' }, { capabilities: { tools: {} } })
    if (plugin !== undefined) {
      for (const tool of plugin.advertisedTools ?? plugin.tools) {
        mcp.registerTool(tool, { description: `Fixture tool ${tool}`, inputSchema: z.object({}) }, async () => {
          calls.push(`${plugin.pluginId}:${tool}`)
          return { content: [{ type: 'text' as const, text: `${plugin.pluginId}:${tool}` }] }
        })
      }
    }
    return mcp
  })
  const handleMcp = toNodeHandler(handler)
  const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
    if (url.pathname === '/api/v1/catalog') {
      catalogAuthorization.push(request.headers.authorization)
      if (catalogGate !== undefined) await catalogGate
      if (options.catalogDelayMs !== undefined) {
        await new Promise(resolve => setTimeout(resolve, options.catalogDelayMs))
      }
      const authorization = request.headers.authorization
      if (authorization === undefined || !accepted.has(authorization)) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { code: 'unauthorized', message: 'fixture refuses the request' } }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        catalogVersion,
        plugins: plugins.map(catalogRow),
      }))
      return
    }
    if (/^\/api\/v1\/plugins\/[a-z0-9-]+\/mcp$/.test(url.pathname)) {
      mcpAuthorization.push(request.headers.authorization)
      if (mcpGate !== undefined) await mcpGate
      if (options.failMcp === true) {
        response.writeHead(500).end()
        return
      }
      await handleMcp(request as NodeIncomingMessageLike, response)
      return
    }
    response.writeHead(404).end()
  }
  const server = createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      response.writeHead(500).end(String(error))
    })
  })
  const listening = Promise.withResolvers<undefined>()
  server.listen(0, '127.0.0.1', () => { listening.resolve(undefined) })
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('platform fixture has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    catalogAuthorization,
    mcpAuthorization,
    calls,
    publish: (next, version) => {
      plugins = [...next]
      catalogVersion = version
    },
    plugins: () => plugins,
    setCatalogGate: (gate) => { catalogGate = gate },
    setMcpGate: (gate) => { mcpGate = gate },
    setAuthorization: (value) => { accepted = new Set([value]) },
    close: async () => {
      await handler.close()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    },
  }
}

/** Credential provider stub resolving the fixture's one reference. */
export function fixtureCredentials(values: Record<string, string>): CredentialResolver & { resolved: string[] } {
  const resolved: string[] = []
  return {
    resolved,
    async resolve(ref) {
      const name = String(ref)
      resolved.push(name)
      const value = values[name]
      return value === undefined ? undefined : { value }
    },
  }
}

/** One started hub profile and the entry owning the hub service. */
export interface HubProfile {
  readonly home: string
  readonly profile: ProfileContext
  readonly hubEntry: Entry
  readonly hub: PluginHub
  readonly ctx: Context
  /** Concrete test token holder when the fixture provided one; consumer access lacks accept(). */
  readonly access?: TestSuiyiAccess
}

/**
 * Create the profile files once; a restart boots another context over them.
 * @param platformUrl - fixture platform origin.
 * @param options - optional manager config and hub config overrides.
 * @returns the initialized profile.
 */
export async function prepareHubProfile(
  platformUrl: string,
  options: { managerConfig?: unknown; hubConfig?: Record<string, unknown> } = {},
): Promise<{ home: string; profile: ProfileContext }> {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-plugin-hub-')))
  const dir = join(home, 'profile')
  initProfile(dir, ['test-hub-bundle'])
  const bundle = join(dir, 'node_modules', 'test-hub-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"test-installation"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: 'test-hub-bundle',
    version: '1.0.0',
    dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'mcp', name: 'cordis:mcp-manager', config: options.managerConfig ?? {} },
    { id: 'hub', name: 'cordis:plugin-hub-client', config: {
      enabled: true,
      platformUrl,
      authorization: 'Bearer ${credential:PLUGIN_HUB_TOKEN}',
      refreshIntervalMs: 60_000,
      identity: TEST_IDENTITY,
      ...options.hubConfig,
    } },
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  return {
    home,
    profile: {
      name: 'test',
      startedBundles: ['test-hub-bundle'],
      dir,
      patchPath: join(dir, 'cordis.patch.yml'),
      installAnchor: join(home, 'package.json'),
      cwd: home,
      home,
      overlays: [],
      telemetryDisabledEnv: undefined,
    },
  }
}

/** Minimal launcher environment the fixture can provide for identity binding. */
export interface FixtureLaunchEnvironment {
  get(name: string): { readonly value: string; readonly source: 'process' } | undefined
  getFrom(name: string, sources: readonly ('process' | 'project-env' | 'user-env')[]): {
    readonly value: string
    readonly source: 'process' | 'project-env' | 'user-env'
  } | undefined
}

/**
 * Build one launcher environment whose only values are inherited process values.
 * @param values - environment values the launcher would inherit.
 * @returns a snapshot-compatible view.
 */
export function fixtureLaunchEnvironment(values: Readonly<Record<string, string>>): FixtureLaunchEnvironment {
  return {
    get: name => values[name] === undefined ? undefined : { value: values[name] as string, source: 'process' },
    getFrom: (name, sources) => sources.includes('process') && values[name] !== undefined
      ? { value: values[name] as string, source: 'process' }
      : undefined,
  }
}

/** Optional launcher and access-token inputs for one boot. */
export interface HubBootOptions {
  /** Launcher snapshot for identity binding. */
  launchEnvironment?: FixtureLaunchEnvironment
  /** Initial verified access token for the test access service. */
  access?: SuiyiAccessToken
  /** Mount the real desktop access service instead of the test holder. */
  accessFactory?: (ctx: Context) => Promise<void>
}

/**
 * Boot one context over a prepared profile through the real Loader.
 * @param profile - prepared profile.
 * @param credentials - credential provider mounted before the Loader.
 * @param options - optional launcher snapshot and desktop access token.
 * @returns the running context and the hub entry.
 */
export async function bootHubProfile(
  profile: ProfileContext,
  credentials: CredentialResolver,
  options: HubBootOptions = {},
): Promise<HubProfile> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  ctx.provide('credentials', credentials)
  ctx.baseUrl = pathToFileURL(profile.home).href + '/'
  ctx.provide('profileContext', profile)
  if (options.launchEnvironment !== undefined) ctx.provide('launchEnvironment', options.launchEnvironment)
  let access: TestSuiyiAccess | undefined
  if (options.accessFactory !== undefined) await options.accessFactory(ctx)
  else if (options.access !== undefined) {
    access = new TestSuiyiAccess(options.access)
    ctx.provide('suiyiAccess', access)
  }
  await ctx.plugin(Loader)
  ctx.loader.builtins['mcp-manager'] = McpServerManager
  ctx.loader.builtins['plugin-hub-client'] = PluginHub
  await ctx.plugin(ConfigEditor)
  await ctx.plugin(Settings)
  await mountRootInclude(ctx, join(profile.dir, 'cordis.yml'), readProfilePatches('test', profile))
  await ctx.loader.await()
  const hubEntry = ctx.configEditor.entries().find(entry => entry.options.id === 'hub')
  if (hubEntry === undefined) throw new Error('fixture profile has no hub entry')
  const hub = ctx.get('pluginHub')
  if (hub === undefined) throw new Error('fixture profile mounted no pluginHub service')
  return { home: profile.home, profile, hubEntry, hub, ctx, ...(access === undefined ? {} : { access }) }
}

/**
 * Remove one prepared installation.
 * @param home - temporary installation root.
 */
export async function removeHubProfile(home: string): Promise<void> {
  await rm(home, { recursive: true, force: true })
}
