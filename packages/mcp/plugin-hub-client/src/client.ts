/**
 * Strict client for the plugin hub platform JSON API.
 *
 * The catalog is untrusted wire data: every field is validated against the
 * frozen V1 shapes, every `mcpPath` must resolve to the platform origin and the
 * exact plugin endpoint, and no error carries the credential, a resolved secret,
 * or the platform endpoint toward UI consumers. Credential templates are
 * resolved per request through the credential seam and never retained.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/client
 */

import { z } from 'zod'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type { CatalogPlugin, PublishedTool } from './types.ts'
import { namespaceForPlugin, publicToolName } from './names.ts'

/** Credential lookup the client needs; the credential seam satisfies it. */
export interface CredentialResolver {
  /**
   * Resolve one credential reference for the current operation.
   * @param ref - reference name from a `${credential:REF}` template.
   * @returns the current value, or `undefined` while unconfigured.
   */
  resolve(ref: CredentialRef): Promise<{ value: string } | undefined>
}

/** One catalog plugin with the derived values the Host mounts. */
export interface ValidatedPlugin {
  /** The validated catalog row, with no extra fields. */
  readonly plugin: CatalogPlugin
  /** Same-origin MCP URL the instance connects to. */
  readonly mcpUrl: string
  /** Public tool names the frozen release allows on this namespace. */
  readonly publicToolNames: ReadonlySet<string>
}

/** One strictly validated catalog generation. */
export interface ValidatedCatalog {
  /** Opaque catalog generation from the platform. */
  readonly catalogVersion: string
  /** Validated plugin rows in platform order. */
  readonly plugins: readonly ValidatedPlugin[]
  /** Plugin lookup by id. */
  readonly byPluginId: ReadonlyMap<string, ValidatedPlugin>
}

/** Failure classes the platform client reports to its owning service. */
export type HubFailure =
  | 'network'
  | 'timeout'
  | 'http'
  | 'unauthorized'
  | 'invalid-response'
  | 'too-large'
  | 'credentials-unavailable'
  | 'credentials-missing'

/** One typed platform-client failure. Messages never include the endpoint or a resolved secret. */
export class HubClientError extends Error {
  /**
   * @param reason - stable failure class.
   * @param message - sanitized diagnostic that may reach Host logs.
   * @param options - optional credential reference or standard Error cause.
   */
  constructor(
    readonly reason: HubFailure,
    message: string,
    readonly options: { readonly credentialRef?: string; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'HubClientError'
  }
}

/** Request budget used by the service; validated by the service's Config schema. */
export interface HubClientOptions {
  /** Platform origin, without path, query, fragment, or credentials. */
  readonly platformUrl: string
  /** Header value template; `${credential:REF}` tokens resolve per request. */
  readonly authorization: string
  /** Largest accepted catalog body in bytes. */
  readonly maxCatalogBytes: number
  /** Deadline for one catalog request, in milliseconds. */
  readonly requestTimeoutMs: number
  /** Credential resolver, absent only while the template has no tokens. */
  readonly credentials?: CredentialResolver | undefined
}

const CREDENTIAL_TOKEN = /\$\{credential:([A-Za-z_][A-Za-z0-9_]*)\}/g

/** Timeout code carried by {@link deadline}; a protocol constant, not configuration. */
const CATALOG_TIMEOUT_CODE = 'PLUGIN_HUB_CATALOG_TIMEOUT'

/**
 * Normalize the configured platform base. The base is an origin: API paths are
 * rooted at `/api/v1`, and accepting a path would make same-origin validation
 * ambiguous.
 * @param value - configured platform URL.
 * @returns the canonical origin without a trailing slash.
 * @throws TypeError when the value is not a plain http(s) origin.
 */
export function normalizePlatformUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (error: unknown) {
    throw new TypeError('plugin hub platformUrl must be an absolute http(s) URL', { cause: error })
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('plugin hub platformUrl must use http or https')
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new TypeError('plugin hub platformUrl must not carry credentials')
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new TypeError('plugin hub platformUrl must be a bare origin without a path, query, or fragment')
  }
  return parsed.origin
}

/**
 * Whether an authorization header value uses at least one credential token.
 * @param value - header value template.
 * @returns true when a `${credential:REF}` token is present.
 */
export function hasCredentialTemplate(value: string): boolean {
  CREDENTIAL_TOKEN.lastIndex = 0
  return CREDENTIAL_TOKEN.test(value)
}

/**
 * Resolve every credential token in the authorization value. Resolution is per
 * request; the result is returned to the caller only and never cached here.
 * @param template - authorization header value.
 * @param credentials - credential resolver, absent when the value has no tokens.
 * @param signal - cancellation checked before and after every lookup.
 * @returns the header value with resolved secrets.
 * @throws HubClientError when the resolver is absent or a reference is unconfigured.
 */
async function resolveAuthorization(
  template: string,
  credentials: CredentialResolver | undefined,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  CREDENTIAL_TOKEN.lastIndex = 0
  const tokens = [...template.matchAll(CREDENTIAL_TOKEN)]
  if (tokens.length === 0) return template
  if (credentials === undefined) {
    throw new HubClientError('credentials-unavailable', 'plugin hub credential templates require a credentials provider')
  }
  let out = ''
  let cursor = 0
  for (const token of tokens) {
    const ref = token[1] as string
    const resolved = await credentials.resolve(credentialRef(ref))
    signal.throwIfAborted()
    if (resolved === undefined || resolved.value === '') {
      throw new HubClientError('credentials-missing', 'plugin hub credential is not configured', { credentialRef: ref })
    }
    out += template.slice(cursor, token.index) + resolved.value
    cursor = token.index + token[0].length
  }
  return out + template.slice(cursor)
}

const publishedToolSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.json()),
})

const catalogPluginSchema = z.strictObject({
  pluginId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  workloadId: z.string().min(1),
  releaseVersion: z.string().min(1).max(256),
  name: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  category: z.string(),
  allowedTools: z.array(publishedToolSchema),
  schemaFingerprint: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  visibility: z.enum(['public', 'roles', 'private']),
  allowedRoles: z.array(z.string()),
  status: z.literal('published'),
  mcpPath: z.string(),
})

const catalogResponseSchema = z.strictObject({
  plugins: z.array(catalogPluginSchema),
  catalogVersion: z.string().min(1),
})

/**
 * Validate the MCP path against the frozen endpoint for this plugin and make
 * it absolute on the platform origin. Exact equality with the expected
 * root-relative path is the same-origin and endpoint check: the value cannot be
 * absolute, protocol-relative, cross-origin, or name another plugin or release.
 * @param pluginId - catalog plugin id.
 * @param releaseVersion - catalog release version.
 * @param mcpPath - wire `mcpPath`.
 * @param platformOrigin - normalized platform origin.
 * @returns the absolute same-origin MCP URL.
 * @throws HubClientError when the path leaves the frozen endpoint.
 */
function mcpUrlOf(pluginId: string, releaseVersion: string, mcpPath: string, platformOrigin: string): string {
  const expected = `/api/v1/plugins/${pluginId}/mcp?releaseVersion=${encodeURIComponent(releaseVersion)}`
  if (mcpPath !== expected) {
    throw new HubClientError('invalid-response', 'catalog plugin mcpPath does not name its own release endpoint')
  }
  return `${platformOrigin}${mcpPath}`
}

/**
 * Validate one parsed catalog payload and derive its mount data.
 * @param value - parsed JSON value from the catalog endpoint.
 * @param platformOrigin - normalized platform origin.
 * @returns the validated catalog.
 * @throws HubClientError when any row or cross-row invariant fails.
 */
export function validateCatalogResponse(value: unknown, platformOrigin: string): ValidatedCatalog {
  const parsed = catalogResponseSchema.safeParse(value)
  if (!parsed.success) {
    throw new HubClientError('invalid-response', 'catalog response does not match the frozen V1 fields', { cause: parsed.error })
  }
  const seen = new Set<string>()
  const plugins: ValidatedPlugin[] = []
  for (const row of parsed.data.plugins) {
    if (seen.has(row.pluginId)) {
      throw new HubClientError('invalid-response', 'catalog response repeats a pluginId')
    }
    seen.add(row.pluginId)
    const toolNames = new Set<string>()
    const namespace = namespaceForPlugin(row.pluginId)
    for (const tool of row.allowedTools) {
      const publicName = publicToolName(namespace, tool.name)
      if (toolNames.has(publicName)) {
        throw new HubClientError('invalid-response', 'catalog response repeats a tool name inside one plugin')
      }
      toolNames.add(publicName)
    }
    const plugin: CatalogPlugin = {
      pluginId: row.pluginId,
      workloadId: row.workloadId,
      releaseVersion: row.releaseVersion,
      name: row.name,
      description: row.description,
      ...row.icon === undefined ? {} : { icon: row.icon },
      category: row.category,
      allowedTools: row.allowedTools.map((tool): PublishedTool => ({
        name: tool.name,
        ...tool.description === undefined ? {} : { description: tool.description },
        inputSchema: tool.inputSchema,
      })),
      schemaFingerprint: row.schemaFingerprint,
      riskLevel: row.riskLevel,
      visibility: row.visibility,
      allowedRoles: [...row.allowedRoles],
      status: row.status,
      mcpPath: row.mcpPath,
    }
    plugins.push({
      plugin,
      mcpUrl: mcpUrlOf(plugin.pluginId, plugin.releaseVersion, plugin.mcpPath, platformOrigin),
      publicToolNames: toolNames,
    })
  }
  return {
    catalogVersion: parsed.data.catalogVersion,
    plugins,
    byPluginId: new Map(plugins.map(plugin => [plugin.plugin.pluginId, plugin])),
  }
}

/**
 * Read a response body with a byte bound. The bound applies to the complete
 * body, so an oversized document is refused before JSON parsing.
 * @param response - fetch response with an optional body stream.
 * @param maxBytes - largest accepted body in bytes.
 * @returns the decoded UTF-8 body.
 * @throws HubClientError when the body exceeds the bound.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new HubClientError('too-large', 'catalog response exceeds the accepted size')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/** Fetches and validates the catalog. One instance serves one configured platform origin. */
export class HubClient {
  private readonly platformOrigin: string

  /** @param options - platform origin, authorization template, bounds, and credential resolver. */
  constructor(private readonly options: HubClientOptions) {
    this.platformOrigin = normalizePlatformUrl(options.platformUrl)
  }

  /**
   * Fetch and strictly validate the platform catalog.
   * @param signal - service lifetime and caller cancellation.
   * @returns the validated catalog.
   * @throws HubClientError for transport, status, size, credential, and validation failures.
   */
  async fetchCatalog(signal: AbortSignal): Promise<ValidatedCatalog> {
    const request = deadline(signal, this.options.requestTimeoutMs, CATALOG_TIMEOUT_CODE)
    try {
      const authorization = await resolveAuthorization(this.options.authorization, this.options.credentials, request.signal)
      let response: Response
      try {
        response = await fetch(new URL('/api/v1/catalog', this.platformOrigin), {
          method: 'GET',
          headers: { accept: 'application/json', authorization },
          redirect: 'error',
          signal: request.signal,
        })
      } catch (error: unknown) {
        if (timeoutOf(request.signal, CATALOG_TIMEOUT_CODE) !== undefined) {
          throw new HubClientError('timeout', 'catalog request timed out', { cause: error })
        }
        if (request.signal.aborted) throw error
        throw new HubClientError('network', 'catalog request failed', { cause: error })
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new HubClientError('unauthorized', 'catalog request was refused')
        }
        throw new HubClientError('http', 'catalog request returned an error status')
      }
      const body = await readBoundedText(response, this.options.maxCatalogBytes)
      let value: unknown
      try {
        value = JSON.parse(body)
      } catch (error: unknown) {
        throw new HubClientError('invalid-response', 'catalog response is not JSON', { cause: error })
      }
      return validateCatalogResponse(value, this.platformOrigin)
    } catch (error: unknown) {
      if (error instanceof HubClientError) throw error
      if (timeoutOf(request.signal, CATALOG_TIMEOUT_CODE) !== undefined) {
        throw new HubClientError('timeout', 'catalog request timed out', { cause: error })
      }
      throw error
    } finally {
      request[Symbol.dispose]()
    }
  }
}

/** Default largest accepted catalog body; the service's Config exposes the bound. */
export const DEFAULT_MAX_CATALOG_BYTES = 8 * 1024 * 1024

/** Default catalog request deadline; the service's Config exposes the value. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

/** Refresh interval budget: a poll faster than this is refused rather than clamped. */
export const MIN_REFRESH_INTERVAL_MS = 1_000
