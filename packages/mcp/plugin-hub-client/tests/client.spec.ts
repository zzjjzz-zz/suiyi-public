/** Strict platform catalog validation and request behavior. */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  HubClient,
  HubClientError,
  normalizePlatformUrl,
  validateCatalogResponse,
} from '../src/client.ts'
import { namespaceForPlugin, publicToolName } from '../src/names.ts'
import { fixtureCredentials } from './fixture.ts'
import type { CatalogPlugin } from '../src/types.ts'

const ORIGIN = 'http://127.0.0.1:18080'

/** One valid catalog row. */
function row(overrides: Partial<CatalogPlugin> = {}): CatalogPlugin {
  return {
    pluginId: 'demo',
    workloadId: 'workload-demo',
    releaseVersion: '1.0.0',
    name: 'Demo',
    description: 'A demo plugin',
    category: 'test',
    allowedTools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object' } }],
    schemaFingerprint: 'fingerprint-1',
    riskLevel: 'low',
    visibility: 'public',
    allowedRoles: [],
    status: 'published',
    mcpPath: '/api/v1/plugins/demo/mcp?releaseVersion=1.0.0',
    ...overrides,
  }
}

/** A strict catalog response carrying the supplied rows. */
function catalog(plugins: unknown[]): unknown {
  return { plugins, catalogVersion: 'catalog-1' }
}

/** Build a one-shot HTTP server returning the supplied status and body. */
async function serve(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void>; closeAllConnections: () => void; headers: Array<string | undefined> }> {
  const headers: Array<string | undefined> = []
  const server = createServer((request, response) => {
    headers.push(request.headers.authorization)
    handler(request, response)
  })
  const listening = Promise.withResolvers<undefined>()
  server.listen(0, '127.0.0.1', () => { listening.resolve(undefined) })
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test server has no address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    headers,
    closeAllConnections: () => { server.closeAllConnections() },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    },
  }
}

describe('catalog validation', () => {
  it('accepts a frozen row and derives the same-origin MCP URL', () => {
    const catalogValue = validateCatalogResponse(catalog([row()]), ORIGIN)
    expect(catalogValue.catalogVersion).toBe('catalog-1')
    const plugin = catalogValue.byPluginId.get('demo')
    expect(plugin?.plugin).toEqual(row())
    expect(plugin?.mcpUrl).toBe(`${ORIGIN}/api/v1/plugins/demo/mcp?releaseVersion=1.0.0`)
    expect(new URL(plugin?.mcpUrl ?? '').origin).toBe(ORIGIN)
    expect(plugin?.publicToolNames.has(publicToolName(namespaceForPlugin('demo'), 'ping'))).toBe(true)
  })

  it('rejects a cross-origin or absolute MCP path', () => {
    expect(() => validateCatalogResponse(catalog([row({
      mcpPath: 'https://evil.example/api/v1/plugins/demo/mcp?releaseVersion=1.0.0',
    })]), ORIGIN)).toThrow(HubClientError)
    expect(() => validateCatalogResponse(catalog([row({
      mcpPath: '//evil.example/api/v1/plugins/demo/mcp?releaseVersion=1.0.0',
    })]), ORIGIN)).toThrow(HubClientError)
  })

  it('rejects an MCP path for another plugin, release, or extra query field', () => {
    for (const mcpPath of [
      '/api/v1/plugins/other/mcp?releaseVersion=1.0.0',
      '/api/v1/plugins/demo/mcp?releaseVersion=2.0.0',
      '/api/v1/plugins/demo/mcp?releaseVersion=1.0.0&extra=1',
      '/api/v1/plugins/demo/other?releaseVersion=1.0.0',
    ]) {
      expect(() => validateCatalogResponse(catalog([row({ mcpPath })]), ORIGIN)).toThrow(HubClientError)
    }
  })

  it('rejects unknown fields, malformed identities, and repeated rows or tools', () => {
    expect(() => validateCatalogResponse({ ...catalog([row()]) as object, extra: true }, ORIGIN)).toThrow(HubClientError)
    expect(() => validateCatalogResponse(catalog([{ ...row(), pluginId: 'Bad_ID' }]), ORIGIN)).toThrow(HubClientError)
    expect(() => validateCatalogResponse(catalog([row(), row()]), ORIGIN)).toThrow(HubClientError)
    expect(() => validateCatalogResponse(catalog([row({
      allowedTools: [
        { name: 'ping', inputSchema: {} },
        { name: 'ping', inputSchema: {} },
      ],
    })]), ORIGIN)).toThrow(HubClientError)
    expect(() => validateCatalogResponse(catalog([{ ...row(), status: 'revoked' }]), ORIGIN)).toThrow(HubClientError)
  })

  it('rejects a missing required field', () => {
    const missing: Partial<CatalogPlugin> = { ...row() }
    delete missing.schemaFingerprint
    expect(() => validateCatalogResponse(catalog([missing]), ORIGIN)).toThrow(HubClientError)
  })
})

describe('platform URL and request behavior', () => {
  it('normalizes a bare http origin and refuses paths or credentials', () => {
    expect(normalizePlatformUrl('https://hub.example.com/')).toBe('https://hub.example.com')
    expect(() => normalizePlatformUrl('https://hub.example.com/api')).toThrow(TypeError)
    expect(() => normalizePlatformUrl('https://user:pass@hub.example.com')).toThrow(TypeError)
    expect(() => normalizePlatformUrl('ftp://hub.example.com')).toThrow(TypeError)
    expect(() => normalizePlatformUrl('not a url')).toThrow(TypeError)
  })

  it('resolves the credential template per request and never returns the secret', async () => {
    const server = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(catalog([row()])))
    })
    const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'top-secret' })
    const client = new HubClient({
      platformUrl: server.url,
      authorization: 'Bearer ${credential:PLUGIN_HUB_TOKEN}',
      maxCatalogBytes: 1024 * 1024,
      requestTimeoutMs: 5_000,
      credentials,
    })
    try {
      const result = await client.fetchCatalog(new AbortController().signal)
      expect(result.byPluginId.get('demo')?.plugin.pluginId).toBe('demo')
      expect(server.headers).toEqual(['Bearer top-secret'])
      expect(credentials.resolved).toEqual(['PLUGIN_HUB_TOKEN'])
    } finally {
      await server.close()
    }
  })

  it('reports a template without a credential provider', async () => {
    const client = new HubClient({
      platformUrl: 'http://127.0.0.1:9',
      authorization: 'Bearer ${credential:PLUGIN_HUB_TOKEN}',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 1_000,
    })
    await expect(client.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'credentials-unavailable' })
  })

  it('reports a missing credential without carrying the template or secret', async () => {
    const client = new HubClient({
      platformUrl: 'http://127.0.0.1:9',
      authorization: 'Bearer ${credential:PLUGIN_HUB_TOKEN}',
      maxCatalogBytes: 1024,
      requestTimeoutMs: 1_000,
      credentials: fixtureCredentials({}),
    })
    const failure = await client.fetchCatalog(new AbortController().signal).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HubClientError)
    expect((failure as HubClientError).reason).toBe('credentials-missing')
    expect(String(failure)).not.toContain('PLUGIN_HUB_TOKEN')
  })

  it('maps a refused credential to unauthorized', async () => {
    const server = await serve((_request, response) => {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end('{}')
    })
    const client = new HubClient({
      platformUrl: server.url,
      authorization: 'Bearer wrong',
      maxCatalogBytes: 1024,
      requestTimeoutMs: 5_000,
    })
    try {
      await expect(client.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'unauthorized' })
    } finally {
      await server.close()
    }
  })

  it('refuses a body over the configured byte bound', async () => {
    const server = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('x'.repeat(4_096))
    })
    const client = new HubClient({
      platformUrl: server.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 5_000,
    })
    try {
      await expect(client.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'too-large' })
    } finally {
      await server.close()
    }
  })

  it('maps an error status and a bodyless response', async () => {
    const errorServer = await serve((_request, response) => {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end('{}')
    })
    const errorClient = new HubClient({
      platformUrl: errorServer.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 5_000,
    })
    try {
      await expect(errorClient.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'http' })
    } finally {
      await errorServer.close()
    }
    const emptyServer = await serve((_request, response) => {
      response.writeHead(204)
      response.end()
    })
    const emptyClient = new HubClient({
      platformUrl: emptyServer.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 5_000,
    })
    try {
      await expect(emptyClient.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'invalid-response' })
    } finally {
      await emptyServer.close()
    }
  })

  it('reports a request deadline and an early caller cancellation', async () => {
    const server = await serve(() => { /* never answers */ })
    const client = new HubClient({
      platformUrl: server.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 50,
    })
    try {
      await expect(client.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'timeout' })
    } finally {
      server.closeAllConnections()
      await server.close()
    }
    const connecting = await serve(() => { /* never sends headers */ })
    const connectingClient = new HubClient({
      platformUrl: connecting.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 60_000,
    })
    try {
      const controller = new AbortController()
      const pending = connectingClient.fetchCatalog(controller.signal)
      setTimeout(() => { controller.abort() }, 20)
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      connecting.closeAllConnections()
      await connecting.close()
    }
    const cancelled = new AbortController()
    const credentials = {
      resolve: async (): Promise<{ value: string }> => {
        await new Promise(resolve => setTimeout(resolve, 20))
        return { value: 'secret' }
      },
    }
    const slow = new HubClient({
      platformUrl: 'http://127.0.0.1:9',
      authorization: 'Bearer ${credential:TOKEN}',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 5_000,
      credentials,
    })
    const pending = slow.fetchCatalog(cancelled.signal)
    cancelled.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('cancels an in-flight request and a response body read', async () => {
    const server = await serve((_request, response) => {
      // Start the response, then leave the body open so cancellation reaches the body read.
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{')
    })
    const client = new HubClient({
      platformUrl: server.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 60_000,
    })
    try {
      const controller = new AbortController()
      const pending = client.fetchCatalog(controller.signal)
      setTimeout(() => { controller.abort() }, 20)
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      server.closeAllConnections()
      await server.close()
    }
    const timed = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{')
    })
    const timedClient = new HubClient({
      platformUrl: timed.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 60,
    })
    try {
      await expect(timedClient.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'timeout' })
    } finally {
      timed.closeAllConnections()
      await timed.close()
    }
  })

  it('keeps optional icon and tool-description fields absent or present exactly', () => {
    const withoutOptionals = validateCatalogResponse(catalog([row({
      allowedTools: [{ name: 'ping', inputSchema: {} }],
    })]), ORIGIN)
    expect(withoutOptionals.byPluginId.get('demo')?.plugin.icon).toBeUndefined()
    expect(withoutOptionals.byPluginId.get('demo')?.plugin.allowedTools[0]?.description).toBeUndefined()
    const withOptionals = validateCatalogResponse(catalog([row({
      icon: 'icon.svg',
      allowedTools: [{ name: 'ping', description: 'Ping', inputSchema: {} }],
    })]), ORIGIN)
    expect(withOptionals.byPluginId.get('demo')?.plugin.icon).toBe('icon.svg')
    expect(withOptionals.byPluginId.get('demo')?.plugin.allowedTools[0]?.description).toBe('Ping')
  })

  it('refuses a redirect instead of forwarding the credential', async () => {
    const server = await serve((_request, response) => {
      response.writeHead(302, { location: 'http://127.0.0.1:9/catalog' })
      response.end()
    })
    const client = new HubClient({
      platformUrl: server.url,
      authorization: 'Bearer test',
      maxCatalogBytes: 1_024,
      requestTimeoutMs: 5_000,
    })
    try {
      await expect(client.fetchCatalog(new AbortController().signal)).rejects.toMatchObject({ reason: 'network' })
      expect(server.headers).toEqual(['Bearer test'])
    } finally {
      await server.close()
    }
  })
})
