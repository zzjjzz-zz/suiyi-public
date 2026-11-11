/**
 * Plugin hub Host client: the `pluginHub` Remote service and per-plugin MCP
 * instance owner.
 *
 * The hub is explicitly opt-in (`enabled: false` by default). When enabled it
 * presents the verified account's access token to the platform catalog, every
 * MCP connection, and every invocation, so the platform returns and authorizes
 * only that account's rows. One independent MCP instance is mounted per active
 * catalog release. The directory is stored in the profile's Settings document,
 * keyed by platform and by the opaque scope of the verified login, so a restart
 * restores only this account's active rows whose release version still matches;
 * absent, changed, disabled, or other-account rows are never mounted.
 *
 * The platform endpoint and user token never cross the Remote seam: `catalog()`
 * and `refresh()` return only the frozen client types, and instance failures
 * carry sanitized text. The hub MCP endpoint revalidates the same user token on
 * every request; the Host guard is an additional pre-dispatch check against a
 * stale local release binding.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cordis'
import { principalOf, Remote, RemoteError, TypertRemoteService, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { assertTemplateSyntax } from '@deepseek-ai/dsh-mcp-client'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  DEFAULT_MAX_CATALOG_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  HubClient,
  HubClientError,
  MIN_REFRESH_INTERVAL_MS,
  hasCredentialTemplate,
  normalizePlatformUrl,
  type ValidatedCatalog,
  type ValidatedPlugin,
} from './client.ts'
import type { SuiyiAccess } from './access.ts'
import {
  hubIdentityFromLauncher,
  hubIdentityScope,
  validateHubIdentity,
  type HubIdentity,
  type HubLaunchEnvironment,
} from './identity.ts'
import { guardInstanceCall, PluginInstances } from './instances.ts'
import { PLUGIN_ID_PATTERN } from './names.ts'
import { HubInvocationOwners, type HubAgentLineage } from './owner-guard.ts'
import type { CatalogPlugin, PluginHubCatalog, PluginInstanceView } from './types.ts'
// Side-effect type imports: `ctx.tools`, `ctx.mcpManager`, `mcp-manager/status`, and `ctx.settings`.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from '@deepseek-ai/dsh-agent'

export type * from './types.ts'

/**
 * One stored enablement decision: this account authorized one release on one
 * platform. Decisions persist whole through Settings, so a decision that
 * belongs to another account is recognizable and never mounted.
 */
export interface HubAuthorization {
  /** Normalized platform origin the decision was made for. */
  platform: string
  /**
   * Opaque account scope from `hubIdentityScope`. Absent only on a decision
   * written before account binding; such a row is never authorized.
   */
  scope?: string
  /** Catalog plugin id. */
  pluginId: string
  /** Release version the user authorized. */
  releaseVersion: string
  /**
   * Whether the account wants this plugin active. Omitted rows written before
   * the add/remove split are active, matching their original mount behavior.
   */
  enabled?: boolean
}

/** One internal decision: a release plus whether the account wants it active. */
interface HubApproval {
  readonly releaseVersion: string
  readonly enabled: boolean
}

/** Service configuration. All fields are validated at load. */
export interface Config {
  /** Explicit opt-in; `false` mounts nothing and contacts no platform. */
  enabled: boolean
  /** Platform origin; required when enabled and never exposed to clients. */
  platformUrl: string
  /**
   * Optional static Authorization value for a deployment or test that supplies
   * its own user credential, usually `Bearer ${credential:REF}`. The Suiyi
   * desktop leaves this empty and injects the current token through
   * `ctx.suiyiAccess` instead; an installation-wide token is never accepted.
   */
  authorization: string
  /** Catalog poll interval in milliseconds. */
  refreshIntervalMs: number
  /** Deadline for one catalog request in milliseconds. */
  requestTimeoutMs: number
  /** Largest accepted catalog body in bytes. */
  maxCatalogBytes: number
  /**
   * Issuer and subject of the verified account that owns this profile. The
   * platform Authorization header carries that user's access token; this field
   * binds local storage and decisions to the same login and never authorizes a
   * request on its own.
   */
  identity?: HubIdentity
  /** Durable enablement decisions written through Settings. */
  authorizations: Volatile<HubAuthorization[]>
}

type ConfigInput = Partial<Omit<Config, 'authorizations'>> & { authorizations?: HubAuthorization[] }

const IdentitySchema = z.object({
  issuer: z.string().min(1).max(2048),
  subject: z.string().min(1).max(256),
})

const AuthorizationSchema = z.object({
  platform: z.string().min(1),
  scope: z.string().pattern(/^[0-9a-f]{64}$/).required(false),
  pluginId: z.string().pattern(PLUGIN_ID_PATTERN),
  releaseVersion: z.string().min(1).max(256),
  enabled: z.boolean().required(false),
})

/** Sanitized instance failure text; raw diagnostics stay in Host logs. */
const MOUNT_FAILURE = 'The plugin instance could not start.'
const CLEANUP_FAILURE = 'The previous plugin instance did not close cleanly.'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The plugin hub Host client and Remote namespace. */
    pluginHub: PluginHub
  }
}

/** Encode one Remote failure without the platform endpoint or a credential. */
function remoteErrorFor(error: HubClientError): RemoteError {
  switch (error.reason) {
    case 'credentials-unavailable':
      return new RemoteError(
        'plugin-hub/credentials-unavailable',
        'The plugin hub uses a credential template but no credential provider is mounted.',
        {},
        { cause: error },
      )
    case 'credentials-missing':
      return new RemoteError(
        'plugin-hub/credentials-missing',
        'The plugin hub credential is not configured.',
        {},
        { cause: error },
      )
    case 'unauthorized':
      return new RemoteError('plugin-hub/unavailable', 'The plugin hub rejected the configured credential.', { reason: 'unauthorized' }, { cause: error })
    case 'timeout':
      return new RemoteError('plugin-hub/unavailable', 'The plugin hub did not answer in time.', { reason: 'timeout' }, { cause: error })
    case 'too-large':
      return new RemoteError('plugin-hub/unavailable', 'The plugin hub catalog is too large.', { reason: 'too-large' }, { cause: error })
    case 'invalid-response':
      return new RemoteError('plugin-hub/unavailable', 'The plugin hub returned an invalid catalog.', { reason: 'invalid-response' }, { cause: error })
    case 'network':
    case 'http':
      return new RemoteError('plugin-hub/unavailable', 'The plugin hub could not be read.', { reason: error.reason }, { cause: error })
  }
}

/**
 * The hub service. Mutating lifecycle operations serialize on one queue so an
 * enable, disable, initial restore, and poll refresh cannot interleave their
 * catalog, approval, and instance changes.
 */
export default class PluginHub extends TypertRemoteService {
  /** Schema for {@link Config}; enablement decisions are the volatile fields Settings edits. */
  static Config = z.object({
    enabled: z.boolean().default(false),
    platformUrl: z.string().default(''),
    authorization: z.string().default(''),
    refreshIntervalMs: z.natural().min(MIN_REFRESH_INTERVAL_MS).max(MAX_TIMER_DELAY_MS).default(60_000),
    requestTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_REQUEST_TIMEOUT_MS),
    maxCatalogBytes: z.natural().min(1).default(DEFAULT_MAX_CATALOG_BYTES),
    identity: (IdentitySchema as z<HubIdentity | undefined>).default(undefined),
    authorizations: z.array(AuthorizationSchema).default([]).volatile(),
  }) as z<ConfigInput, Config>

  static inject = ['tools', 'mcpManager']

  private readonly platformOrigin: string
  private readonly entryId: string | undefined
  private readonly instances: PluginInstances
  /** Verified account that owns this profile; absent only while the hub is disabled. */
  private readonly identity: HubIdentity | undefined
  /** Opaque account scope persisted with every decision; empty while unbound. */
  private readonly scope: string
  /** Static Authorization override; empty when `ctx.suiyiAccess` supplies the token. */
  private readonly authorization: string
  /** Desktop-provided current access token, absent in static-credential compositions. */
  private access: SuiyiAccess | undefined
  /** Raw token the current catalog and instances were built from. */
  private lastAccessToken: string | undefined
  /** Increments on every accepted token change; late catalog responses compare it. */
  private accessGeneration = 0
  /** Aborted when the access token changes or the service stops. */
  private accessAbort = new AbortController()
  /** Set when a delivered token does not match the configured identity. */
  private accessIdentityConflict = false
  /** Set after the platform observes 401 for the current token. */
  private accessRejected = false
  /** Token value the platform rejected; a re-delivery stays denied. */
  private rejectedAccessToken: string | undefined
  /** Aborted at service dispose; cancels an in-flight catalog request. */
  private readonly lifetime = new AbortController()
  /** This account's decisions, including other platforms; rewritten whole through Settings. */
  private authorizations: HubAuthorization[]
  /** Whether activation dropped decisions written for another account and owes a Settings write. */
  private staleDecisions = false
  /** Release versions this platform currently authorizes, keyed by plugin id. */
  private readonly authorized = new Map<string, string>()
  /** Last catalog generation; absent until a successful refresh. */
  private lastCatalog: ValidatedCatalog | undefined
  /** Settled operation tail serializing every lifecycle operation. */
  private tail: Promise<unknown> = Promise.resolve()
  /** Number of in-flight refreshes; a poll tick is skipped while one runs. */
  private activeRefreshes = 0
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  /** Set at service dispose: refuse new work while queued work drains. */
  private stopped = false
  private stopping: Promise<void> | undefined
  private readonly watchers = new Set<() => void>()
  private readonly invocationOwners: HubInvocationOwners
  /** Removed after all hub tool registrations have been withdrawn. */
  private removeGuard: (() => void) | undefined

  /**
   * Register the service and retain the configured platform and decisions.
   * Platform, authorization-template, and decision validation happens at
   * activation so a self-contained misconfiguration fails the plugin load.
   * @param ctx - the service context; child instances mount under it.
   * @param config - resolved service configuration.
   */
  constructor(ctx: Context, public config: Config) {
    super(ctx, 'pluginHub')
    this.platformOrigin = config.platformUrl === '' ? '' : normalizePlatformUrl(config.platformUrl)
    this.entryId = ctx.fiber.entry?.options.id
    const launcher = ctx.reflect.get('launchEnvironment') as HubLaunchEnvironment | undefined
    this.identity = config.identity === undefined
      ? hubIdentityFromLauncher(launcher)
      : validateHubIdentity(config.identity)
    this.scope = this.identity === undefined ? '' : hubIdentityScope(this.identity)
    this.authorization = config.authorization
    this.instances = new PluginInstances(ctx)
    const stored = config.authorizations.get()
    this.authorizations = stored
      .filter(entry => entry.scope === this.scope)
      .map(entry => ({ ...entry }))
    if (this.authorizations.length !== stored.length) {
      this.staleDecisions = true
      ctx.logger.warn(`plugin-hub-client: ignored ${String(stored.length - this.authorizations.length)} enablement decision(s) written for another account`)
    }
    this.authorized = this.activeApprovals()
    this.invocationOwners = new HubInvocationOwners(this.agentLineage())
  }

  /**
   * Validate the resolved configuration, publish the tool guard, subscribe to
   * manager status, and schedule the initial restore/poll once the service is
   * visible to dependents. Teardown aborts polling and awaits every instance.
   */
  * [Service.init](): Generator<() => Promise<void> | void, void, void> {
    yield async () => { await this.stop() }
    this.validate()
    this.removeGuard = this.ctx.root.tools.guard((execution) => {
      if (!this.instances.ownsName(execution.name)) return undefined
      if (this.stopped) return 'Plugin hub: the plugin hub is stopping.'
      const denied = guardInstanceCall(execution, this.instances, this.authorized)
      if (denied !== undefined) return denied
      return this.invocationOwners.permits(execution.agent)
        ? undefined
        : 'Plugin hub: this turn is not attributed to the Host owner.'
    })
    this.ctx.on('agent/created', ({ agent, source }) => {
      if (source === 'startup') this.invocationOwners.adopt(agent)
    })
    this.ctx.on('agent/pre-step', async ({ agent, turn }, next) => {
      const decision = await next()
      if (decision.kind === 'enter') {
        const principals = decision.messages.flatMap(message => ['user', 'retry'].includes(message.source.kind)
          ? ['principal' in message.source ? message.source.principal : undefined]
          : [])
        this.invocationOwners.noteStep(agent, turn, principals)
      }
      return decision
    })
    this.ctx.on('mcp-manager/status', (name, status) => {
      this.instances.observeStatus(name, status)
      this.changed()
    })
    const owner = this.ctx.fiber
    this.ctx.on('internal/plugin', (fiber) => {
      if (fiber === owner && fiber.uid === null) void this.stop()
    }, { global: true })
    // The service is visible to dependents only once this fiber is ACTIVE, so
    // the first refresh waits for activation instead of racing it.
    void this.ctx.fiber.await().then(
      () => {
        if (!this.config.enabled) return
        this.armPoll()
        if (this.authorization !== '') {
          this.scheduleRefresh()
          return
        }
        this.ctx.inject(['suiyiAccess'], (scope) => {
          const service = scope.suiyiAccess
          this.access = service
          scope.effect(() => {
            const unsubscribe = service.subscribe(() => { this.accessChanged() })
            return async () => {
              unsubscribe()
              this.access = undefined
              this.withdrawAccess(false)
              await this.settleAccess()
            }
          }, 'plugin-hub-client: access token changes')
          this.accessChanged()
        })
      },
      /* v8 ignore next 2 -- init is this fiber's whole startup and this registration is its
         last statement, so a rejected activation cannot reach a registered continuation */
      () => undefined,
    )
  }

  /**
   * Read the last committed catalog, instance views, and the hub enablement
   * flag. This never contacts the platform; {@link PluginHub.refresh} does.
   * @returns the current client-visible state.
   */
  // oxlint-disable typescript/require-await -- Ownership and credential failures must reject the returned Promise.
  @Remote
  async catalog(): Promise<PluginHubCatalog> {
    this.assertOwner()
    if (this.config.enabled && this.authorizationHeader() === undefined) throw this.accessFailure()
    return this.view()
  }
  // oxlint-enable typescript/require-await

  /**
   * Stream the current catalog and live instance status until this subscription ends.
   * @param signal - subscription lifetime.
   * @returns coalesced complete snapshots; no credential crosses the Remote seam.
   */
  @Remote({ mode: 'stream' })
  async* watch(signal: AbortSignal): AsyncIterable<PluginHubCatalog> {
    this.assertOwner()
    if (this.config.enabled && this.authorizationHeader() === undefined) throw this.accessFailure()
    const ended = AbortSignal.any([signal, this.lifetime.signal, this.accessAbort.signal])
    const aborted = (): boolean => ended.aborted
    let wake = Promise.withResolvers<undefined>()
    let dirty = true
    const notify = (): void => { dirty = true; wake.resolve(undefined) }
    this.watchers.add(notify)
    ended.addEventListener('abort', notify, { once: true })
    try {
      while (!aborted()) {
        if (!dirty) await wake.promise
        if (aborted()) break
        dirty = false
        wake = Promise.withResolvers<undefined>()
        yield this.view()
      }
    } finally {
      this.watchers.delete(notify)
      ended.removeEventListener('abort', notify)
    }
  }

  /**
   * Fetch and validate the platform catalog, then reconcile instances with the
   * stored enablement. A failed read leaves the previous catalog and instances
   * untouched.
   * @returns the state after reconciliation.
   * @throws {RemoteError} `plugin-hub/unavailable`, `plugin-hub/credentials-*`,
   *   `plugin-hub/unknown-plugin`, or `gateway/internal`.
   */
  @Remote
  async refresh(): Promise<PluginHubCatalog> {
    this.assertOwner()
    if (!this.config.enabled) return this.view()
    const authorization = this.authorizationHeader()
    if (authorization === undefined) throw this.accessFailure()
    this.activeRefreshes += 1
    try {
      await this.enqueue(() => this.refreshNow())
    } catch (error: unknown) {
      throw this.failure(error)
    } finally {
      this.activeRefreshes -= 1
    }
    return this.view()
  }

  /**
   * Add the catalog's current release to this account's directory without
   * running it. The decision is durable and reports `added: true` with state
   * `disabled`; {@link PluginHub.enable} starts it later.
   * @param pluginId - catalog plugin id.
   * @throws {RemoteError} `plugin-hub/disabled`, `plugin-hub/invalid-request`,
   *   `plugin-hub/unknown-plugin`, `plugin-hub/instance-failed`, or
   *   `plugin-hub/settings-unavailable`.
   */
  @Remote
  async add(pluginId: string): Promise<void> {
    this.assertOwner()
    this.assertPluginId(pluginId)
    if (!this.config.enabled) throw new RemoteError('plugin-hub/disabled', 'The plugin hub is disabled in this profile.', {})
    try {
      await this.enqueue(() => this.addNow(pluginId))
    } catch (error: unknown) {
      throw this.failure(error)
    }
  }

  /**
   * Add the catalog's current release to this account's directory if needed and
   * start its instance. The active decision is persisted before mounting; an
   * instance that cannot start keeps the decision and reports a sanitized
   * `error` view, so the enabled state survives a restart.
   * @param pluginId - catalog plugin id.
   * @throws {RemoteError} `plugin-hub/disabled`, `plugin-hub/invalid-request`,
   *   `plugin-hub/unknown-plugin`, `plugin-hub/instance-failed`, or
   *   `plugin-hub/settings-unavailable`.
   */
  @Remote
  async enable(pluginId: string): Promise<void> {
    this.assertOwner()
    this.assertPluginId(pluginId)
    if (!this.config.enabled) throw new RemoteError('plugin-hub/disabled', 'The plugin hub is disabled in this profile.', {})
    try {
      await this.enqueue(() => this.enableNow(pluginId))
    } catch (error: unknown) {
      throw this.failure(error)
    }
  }

  /**
   * Keep one plugin in this account's directory but stop its instance to
   * quiescence. The inactive decision is persisted before the transport starts
   * closing, so a restart does not remount it; a failed unmount keeps the
   * visible failure while the plugin stays added and disabled.
   * @param pluginId - catalog plugin id.
   * @throws {RemoteError} `plugin-hub/disabled`, `plugin-hub/invalid-request`,
   *   `plugin-hub/instance-failed`, or `plugin-hub/settings-unavailable`.
   */
  @Remote
  async disable(pluginId: string): Promise<void> {
    this.assertOwner()
    this.assertPluginId(pluginId)
    if (!this.config.enabled) throw new RemoteError('plugin-hub/disabled', 'The plugin hub is disabled in this profile.', {})
    try {
      await this.enqueue(() => this.disableNow(pluginId))
    } catch (error: unknown) {
      throw this.failure(error)
    }
  }

  /**
   * Remove one plugin from this account's directory and unmount its instance to
   * quiescence. The durable decision is removed before the transport starts
   * closing; a failed unmount keeps the visible failure without restoring the
   * removed decision.
   * @param pluginId - catalog plugin id.
   * @throws {RemoteError} `plugin-hub/disabled`, `plugin-hub/invalid-request`,
   *   `plugin-hub/instance-failed`, or `plugin-hub/settings-unavailable`.
   */
  @Remote
  async removeInstance(pluginId: string): Promise<void> {
    this.assertOwner()
    this.assertPluginId(pluginId)
    if (!this.config.enabled) throw new RemoteError('plugin-hub/disabled', 'The plugin hub is disabled in this profile.', {})
    try {
      await this.enqueue(() => this.removeNow(pluginId))
    } catch (error: unknown) {
      throw this.failure(error)
    }
  }

  /** Validate the activation-time invariants that depend on other services. */
  private validate(): void {
    if (this.config.authorization !== '') {
      assertTemplateSyntax(this.config.authorization, 'plugin-hub-client.authorization')
    }
    const templated = this.authorization !== '' && hasCredentialTemplate(this.authorization)
    if (!this.config.enabled) return
    if (this.platformOrigin === '') {
      throw new Error('plugin-hub-client: "platformUrl" is required when "enabled" is true')
    }
    if (this.authorization !== '' && !templated && !/^Bearer [^\s]+$/u.test(this.authorization)) {
      throw new Error('plugin-hub-client: "authorization" must be "Bearer <user access token>" or a credential template')
    }
    if (this.identity === undefined) {
      throw new Error('plugin-hub-client: "identity" is required when "enabled" is true; it must name the verified account issuer and subject')
    }
    if (templated && this.ctx.get('credentials') === undefined) {
      throw new Error('plugin-hub-client: "authorization" uses ${credential:REF} but no credentials provider is mounted')
    }
  }

  /** Current Authorization value from the static override or the injected token. */
  private authorizationHeader(): string | undefined {
    if (this.authorization !== '') return this.authorization
    if (this.accessRejected || this.accessIdentityConflict) return undefined
    const token = this.access?.current()
    return token === undefined ? undefined : `Bearer ${token.accessToken}`
  }

  /** One typed failure for a missing or mismatched current token. */
  private accessFailure(): RemoteError {
    if (this.accessRejected) {
      return new RemoteError('plugin-hub/unavailable', 'The plugin hub rejected the current user access token.', { reason: 'unauthorized' })
    }
    return this.accessIdentityConflict
      ? new RemoteError('plugin-hub/unavailable', 'The plugin hub token does not belong to this signed-in account.', { reason: 'unauthorized' })
      : new RemoteError('plugin-hub/credentials-missing', 'The plugin hub has no current user access token.', {})
  }

  /**
   * Compare an unverified JWT payload's issuer and subject with the configured
   * identity. This is a delivery-consistency check, not authorization; opaque
   * or undecodable tokens pass and the platform remains the verifier.
   */
  private tokenMatchesIdentity(token: string): boolean {
    if (this.identity === undefined) return true
    const parts = token.split('.')
    if (parts.length !== 3) return true
    let payload: { readonly iss?: unknown; readonly sub?: unknown }
    try {
      payload = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf8')) as {
        readonly iss?: unknown
        readonly sub?: unknown
      }
    } catch {
      return true
    }
    return (typeof payload.iss !== 'string' || payload.iss === this.identity.issuer)
      && (typeof payload.sub !== 'string' || payload.sub === this.identity.subject)
  }

  /** Apply one delivered token change: withdraw synchronously, then clear and refresh. */
  private accessChanged(): void {
    if (this.stopped || !this.config.enabled || this.authorization !== '') return
    const token = this.access?.current()
    if (token === undefined) {
      if (this.lastAccessToken === undefined && !this.accessIdentityConflict && !this.accessRejected) return
      this.lastAccessToken = undefined
      this.withdrawAccess(false)
      void this.enqueue(() => this.clearAccessState())
      return
    }
    if (token.accessToken === this.lastAccessToken) return
    if (token.accessToken === this.rejectedAccessToken) {
      this.accessRejected = true
      this.withdrawAccess(false)
      return
    }
    const conflict = !this.tokenMatchesIdentity(token.accessToken)
    this.accessRejected = false
    this.rejectedAccessToken = undefined
    this.withdrawAccess(conflict)
    this.lastAccessToken = token.accessToken
    if (conflict) {
      this.ctx.logger.error('plugin-hub-client: the delivered access token does not belong to this verified account')
      void this.enqueue(() => this.clearAccessState())
      return
    }
    void this.enqueue(() => this.clearAccessState()).then(() => {
      if (!this.stopped) this.scheduleRefresh()
    }, (error: unknown) => {
      this.ctx.logger.error('plugin-hub-client: clearing token-scoped hub state failed')
      this.ctx.logger.error(error)
    })
  }

  /**
   * Synchronously withdraw authority before any queued cleanup runs: bump the
   * access generation, abort the in-flight catalog request, clear the guard's
   * authorization map, and drop the cached catalog. New calls are denied from
   * this point; mounted instances are unmounted by the queued cleanup.
   * @param identityConflict - whether the delivered token names another account.
   */
  private withdrawAccess(identityConflict: boolean): void {
    this.accessIdentityConflict = identityConflict
    this.accessGeneration += 1
    this.accessAbort.abort()
    this.accessAbort = new AbortController()
    this.authorized.clear()
    this.lastCatalog = undefined
    this.instances.clearFailures()
    this.changed()
  }

  /**
   * Fail closed after the current generation's platform request returned 401.
   * The provider still holds the token; the local request source is denied and
   * token-scoped state is queued for cleanup without awaiting the queue from
   * inside a queued operation.
   */
  private rejectAccess(): void {
    this.accessRejected = true
    this.rejectedAccessToken = this.lastAccessToken
    this.withdrawAccess(false)
    if (!this.stopped) void this.enqueue(() => this.clearAccessState())
  }

  /** Withdraw an expired token and queue the token-scoped cleanup. */
  private withdrawExpired(): void {
    this.withdrawAccess(false)
    if (!this.stopped) void this.enqueue(() => this.clearAccessState())
  }

  /** Drop the catalog, authorization map, failures, and every token-scoped instance. */
  private async clearAccessState(): Promise<void> {
    this.lastCatalog = undefined
    this.authorized.clear()
    this.instances.clearFailures()
    await this.instances.disposeAll()
    this.changed()
  }

  /** Await the queue and every instance after the access source disappears. */
  private async settleAccess(): Promise<void> {
    await this.tail
    await this.clearAccessState()
  }

  /**
   * Build the platform client for one operation.
   * @param authorization - current user Authorization value.
   */
  private client(authorization: string): HubClient {
    /* v8 ignore next -- `refreshNow` runs only when enabled, which activation required a platform origin for */
    if (this.platformOrigin === '') throw new Error('plugin-hub-client: no platform origin is configured')
    return new HubClient({
      platformUrl: this.platformOrigin,
      authorization,
      maxCatalogBytes: this.config.maxCatalogBytes,
      requestTimeoutMs: this.config.requestTimeoutMs,
      credentials: this.ctx.get('credentials'),
    })
  }

  /** Read and reconcile the platform catalog with the current user token. */
  private async refreshNow(): Promise<void> {
    const generation = this.accessGeneration
    const authorization = this.authorizationHeader()
    if (authorization === undefined) throw this.accessFailure()
    let catalog: ValidatedCatalog
    try {
      catalog = await this.client(authorization).fetchCatalog(
        AbortSignal.any([this.lifetime.signal, this.accessAbort.signal]),
      )
    } catch (error: unknown) {
      // A token change aborted this request; its result must never be applied.
      if (generation !== this.accessGeneration) return
      if (error instanceof HubClientError && error.reason === 'unauthorized') this.rejectAccess()
      throw error
    }
    /* v8 ignore next -- disposal waits on this operation after aborting the request; a late result has no consumer */
    if (this.stopped || generation !== this.accessGeneration) return
    if (this.authorizationHeader() === undefined) {
      this.withdrawExpired()
      return
    }
    await this.reconcile(catalog, authorization, generation)
  }

  /**
   * Apply one validated catalog generation: prune decisions for absent or
   * changed rows, publish the new authorization set before changing children,
   * unmount stale instances, then mount missing authorized instances.
   * @param catalog - validated catalog generation.
   * @param authorization - Authorization value the catalog was read with.
   * @param generation - access generation the read observed.
   */
  private async reconcile(catalog: ValidatedCatalog, authorization: string, generation: number): Promise<void> {
    const stale = (): boolean => this.stopped || generation !== this.accessGeneration
    const kept = new Map<string, ValidatedPlugin>()
    const desired = new Map<string, ValidatedPlugin>()
    // Activation already removed another account's decisions from memory; the
    // first successful reconcile also removes them from the document.
    let pruned = this.staleDecisions
    for (const [pluginId, approval] of this.approvals()) {
      const current = catalog.byPluginId.get(pluginId)
      if (current === undefined || current.plugin.releaseVersion !== approval.releaseVersion) {
        pruned = true
        continue
      }
      kept.set(pluginId, current)
      if (approval.enabled) desired.set(pluginId, current)
    }
    if (pruned) {
      const origin = this.platformOrigin
      const next = this.authorizations.filter(entry =>
        entry.platform !== origin || kept.get(entry.pluginId)?.plugin.releaseVersion === entry.releaseVersion)
      try {
        await this.persist(next)
        this.authorizations = next
        this.staleDecisions = false
      } catch (error: unknown) {
        // The stale decision stays in the document and is pruned again on the
        // next boot; it is never used to mount an instance in this process.
        this.ctx.logger.error('plugin-hub-client: pruning stale enablement could not be saved')
        this.ctx.logger.error(error)
      }
      if (stale()) return
    }
    this.authorized.clear()
    for (const [pluginId, validated] of desired) this.authorized.set(pluginId, validated.plugin.releaseVersion)
    this.lastCatalog = catalog
    for (const pluginId of this.instances.pluginIds()) {
      const record = this.instances.get(pluginId)
      if (record !== undefined && desired.get(pluginId)?.plugin.releaseVersion === record.releaseVersion) continue
      try {
        await this.instances.unmount(pluginId)
        if (stale()) return
      } catch (error: unknown) {
        if (stale()) return
        this.ctx.logger.error(`plugin-hub-client: unmounting "${pluginId}" failed`)
        this.ctx.logger.error(error)
        /* v8 ignore next -- pluginIds() and get() share one records map, so a listed id has a record */
        this.instances.setFailure(pluginId, record?.releaseVersion ?? '', CLEANUP_FAILURE)
      }
    }
    for (const [pluginId, validated] of desired) {
      if (this.instances.get(pluginId) !== undefined) {
        this.instances.clearFailure(pluginId)
        continue
      }
      try {
        await this.instances.mount(validated, authorization)
        if (stale()) return
        if (this.authorizationHeader() === undefined) {
          this.withdrawExpired()
          return
        }
        this.instances.clearFailure(pluginId)
      } catch (error: unknown) {
        if (stale()) return
        this.ctx.logger.error(`plugin-hub-client: mounting "${pluginId}" failed`)
        this.ctx.logger.error(error)
        this.instances.setFailure(pluginId, validated.plugin.releaseVersion, MOUNT_FAILURE)
      }
    }
  }

  /** Resolve the last committed catalog's row for one plugin. */
  private catalogRelease(pluginId: string): ValidatedPlugin {
    const validated = this.lastCatalog?.byPluginId.get(pluginId)
    if (validated === undefined) {
      throw new RemoteError('plugin-hub/unknown-plugin', 'The plugin is not in the current catalog. Refresh and try again.', { pluginId })
    }
    return validated
  }

  /** Add one catalog release to the account's directory without mounting it. */
  private async addNow(pluginId: string): Promise<void> {
    if (this.authorizationHeader() === undefined) throw this.accessFailure()
    const releaseVersion = this.catalogRelease(pluginId).plugin.releaseVersion
    await this.setApproval(pluginId, releaseVersion, false, this.accessGeneration)
    this.instances.clearFailure(pluginId)
    await this.stopInstance(pluginId, releaseVersion, 'adding')
  }

  /** Add if needed and mount one plugin from the last committed catalog. */
  private async enableNow(pluginId: string): Promise<void> {
    const generation = this.accessGeneration
    const authorization = this.authorizationHeader()
    if (authorization === undefined) throw this.accessFailure()
    const validated = this.catalogRelease(pluginId)
    const releaseVersion = validated.plugin.releaseVersion
    const approval = this.approvals().get(pluginId)
    const current = this.instances.get(pluginId)
    if (approval?.enabled === true && approval.releaseVersion === releaseVersion
      && current?.releaseVersion === releaseVersion && current.state !== 'error') {
      this.instances.clearFailure(pluginId)
      return
    }
    await this.setApproval(pluginId, releaseVersion, true, generation)
    if (generation !== this.accessGeneration) return
    this.instances.clearFailure(pluginId)
    await this.stopInstance(pluginId, releaseVersion, 'enabling')
    if (generation !== this.accessGeneration) return
    try {
      await this.instances.mount(validated, authorization)
      if (generation !== this.accessGeneration) return
      if (this.authorizationHeader() === undefined) {
        this.withdrawExpired()
        return
      }
    } catch (error: unknown) {
      if (generation !== this.accessGeneration) return
      this.ctx.logger.error(`plugin-hub-client: mounting "${pluginId}" failed`)
      this.ctx.logger.error(error)
      this.instances.setFailure(pluginId, releaseVersion, MOUNT_FAILURE)
      throw new RemoteError(
        'plugin-hub/instance-failed',
        'The plugin instance did not start.',
        { pluginId },
        { cause: error },
      )
    }
  }

  /** Keep one plugin added but stop its instance. */
  private async disableNow(pluginId: string): Promise<void> {
    const approval = this.approvals().get(pluginId)
    const current = this.instances.get(pluginId)
    this.instances.clearFailure(pluginId)
    if (approval === undefined && current === undefined) return
    if (approval !== undefined && !approval.enabled && current === undefined) return
    const releaseVersion = approval?.releaseVersion ?? current?.releaseVersion ?? ''
    if (approval !== undefined) await this.setApproval(pluginId, approval.releaseVersion, false, this.accessGeneration)
    await this.stopInstance(pluginId, releaseVersion, 'disabling')
  }

  /** Remove one plugin from the account's directory and stop its instance. */
  private async removeNow(pluginId: string): Promise<void> {
    const approval = this.approvals().get(pluginId)
    const current = this.instances.get(pluginId)
    this.instances.clearFailure(pluginId)
    if (approval === undefined && current === undefined) return
    const releaseVersion = approval?.releaseVersion ?? current?.releaseVersion ?? ''
    await this.removeApproval(pluginId)
    await this.stopInstance(pluginId, releaseVersion, 'removing')
  }

  /**
   * Unmount one live instance to quiescence and retain a sanitized cleanup
   * failure for the next catalog view.
   * @param pluginId - catalog plugin id.
   * @param releaseVersion - release the failed operation targeted.
   * @param operation - lifecycle operation named in the Host log.
   */
  private async stopInstance(pluginId: string, releaseVersion: string, operation: string): Promise<void> {
    if (this.instances.get(pluginId) === undefined) return
    try {
      await this.instances.unmount(pluginId)
    } catch (error: unknown) {
      this.ctx.logger.error(`plugin-hub-client: unmounting "${pluginId}" while ${operation} failed`)
      this.ctx.logger.error(error)
      this.instances.setFailure(pluginId, releaseVersion, CLEANUP_FAILURE)
      throw new RemoteError(
        'plugin-hub/instance-failed',
        'The plugin instance did not unmount cleanly.',
        { pluginId },
        { cause: error },
      )
    }
  }

  /**
   * Store one decision, replacing any earlier release for the same platform
   * and plugin. The write commits before the in-memory set changes.
   * @param pluginId - catalog plugin id.
   * @param releaseVersion - release the user authorized.
   * @param enabled - whether the account wants the plugin active.
   * @param generation - access generation the caller observed before the write.
   */
  private async setApproval(
    pluginId: string,
    releaseVersion: string,
    enabled: boolean,
    generation: number,
  ): Promise<void> {
    const next = this.authorizations.filter(entry =>
      !(entry.platform === this.platformOrigin && entry.pluginId === pluginId))
    next.push({ platform: this.platformOrigin, scope: this.scope, pluginId, releaseVersion, enabled })
    next.sort(compareAuthorizations)
    await this.persist(next)
    this.authorizations = next
    // A token change during the write has already cleared the guard map; do
    // not refill it with authority the new generation has not verified.
    if (enabled && generation === this.accessGeneration) this.authorized.set(pluginId, releaseVersion)
    else this.authorized.delete(pluginId)
  }

  /**
   * Remove one authorization for this platform. The write commits before the
   * in-memory set changes.
   * @param pluginId - catalog plugin id.
   */
  private async removeApproval(pluginId: string): Promise<void> {
    const next = this.authorizations.filter(entry =>
      !(entry.platform === this.platformOrigin && entry.pluginId === pluginId))
    await this.persist(next)
    this.authorizations = next
    this.authorized.delete(pluginId)
  }

  /**
   * Write the complete decision list through Settings so the profile patch
   * persists it. Arrays replace rather than deep-merge, so removals persist.
   * @param next - complete decision list.
   */
  private async persist(next: HubAuthorization[]): Promise<void> {
    const settings = this.ctx.get('settings')
    if (settings === undefined || this.entryId === undefined) {
      throw new RemoteError(
        'plugin-hub/settings-unavailable',
        'Plugin hub enablement requires @deepseek-ai/dsh-settings and a profile entry.',
        {},
      )
    }
    try {
      await settings.update(this.entryId, { authorizations: next })
    } catch (error: unknown) {
      throw new RemoteError('gateway/internal', 'Plugin hub enablement could not be saved.', {}, { cause: error })
    }
  }

  /** This account's decisions for this platform, keyed by plugin id. */
  private approvals(): Map<string, HubApproval> {
    if (this.platformOrigin === '') return new Map()
    const approvals = new Map<string, HubApproval>()
    for (const entry of this.authorizations) {
      if (entry.platform !== this.platformOrigin || entry.scope !== this.scope) continue
      approvals.set(entry.pluginId, { releaseVersion: entry.releaseVersion, enabled: entry.enabled !== false })
    }
    return approvals
  }

  /** Release versions this platform currently authorizes and runs, keyed by plugin id. */
  private activeApprovals(): Map<string, string> {
    const active = new Map<string, string>()
    for (const [pluginId, approval] of this.approvals()) {
      if (approval.enabled) active.set(pluginId, approval.releaseVersion)
    }
    return active
  }

  /** Publish client-visible state from the catalog cache, decisions, and live instances. */
  private view(): PluginHubCatalog {
    const plugins = this.lastCatalog?.plugins.map(validated => validated.plugin) ?? []
    const approvals = this.approvals()
    const byId = new Map<string, PluginInstanceView>()
    for (const view of this.instances.views(this.authorized)) byId.set(view.pluginId, view)
    const instances: PluginInstanceView[] = []
    const listed = new Set<string>()
    for (const plugin of plugins) {
      listed.add(plugin.pluginId)
      const live = byId.get(plugin.pluginId)
      const added = approvals.get(plugin.pluginId)?.releaseVersion === plugin.releaseVersion
      instances.push(live === undefined ? {
        pluginId: plugin.pluginId,
        releaseVersion: plugin.releaseVersion,
        state: 'disabled',
        authorized: this.authorized.get(plugin.pluginId) === plugin.releaseVersion,
        added,
      } : { ...live, added })
    }
    for (const view of byId.values()) {
      if (!listed.has(view.pluginId)) {
        instances.push({ ...view, added: approvals.get(view.pluginId)?.releaseVersion === view.releaseVersion })
      }
    }
    return {
      plugins: plugins.map(plugin => clonePlugin(plugin)),
      catalogVersion: this.lastCatalog?.catalogVersion ?? '',
      instances,
      enabled: this.config.enabled,
    }
  }

  /** Queue one poll refresh unless one is already in flight. */
  private scheduleRefresh(): void {
    if (this.stopped || this.activeRefreshes > 0) return
    const authorization = this.authorizationHeader()
    if (authorization === undefined) return
    this.activeRefreshes += 1
    void this.enqueue(() => this.refreshNow())
      .catch((error: unknown) => {
        if (this.stopped) return
        this.ctx.logger.error('plugin-hub-client: background catalog refresh failed')
        this.ctx.logger.error(error instanceof HubClientError ? error.reason : error)
      })
      .finally(() => { this.activeRefreshes -= 1 })
  }

  /** Arm the next poll; only the timer's trigger is paced, never a correctness decision. */
  private armPoll(): void {
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined
      /* v8 ignore next -- stop() clears this timer; a firing timer cannot observe a stopped service */
      if (this.stopped) return
      this.scheduleRefresh()
      this.armPoll()
    }, this.config.refreshIntervalMs)
  }

  /** Add one operation to the serialized lifecycle queue. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      if (this.stopped) throw new Error('plugin-hub-client: the service is disposed')
      try { return await operation() } finally { this.changed() }
    })
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }

  /** Stop polling, cancel the in-flight read, drain queued work, and unmount every instance. */
  private stop(): Promise<void> {
    if (this.stopping !== undefined) return this.stopping
    this.stopped = true
    this.lifetime.abort()
    this.accessAbort.abort()
    this.access = undefined
    this.lastAccessToken = undefined
    this.accessGeneration += 1
    this.authorized.clear()
    this.lastCatalog = undefined
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer)
      this.pollTimer = undefined
    }
    this.stopping = (async () => {
      await this.tail
      try {
        await this.instances.disposeAll()
        this.instances.clearFailures()
      } finally {
        this.lastCatalog = undefined
        this.authorized.clear()
        this.releaseGuard()
      }
    })()
    return this.stopping
  }

  /**
   * Remove the root-owned guard once no hub tool remains. A failed unmount
   * retains it so surviving tools stay denied until the process ends.
   */
  private releaseGuard(): void {
    if (this.removeGuard === undefined) return
    const tools = this.ctx.get('tools')
    const surviving = tools !== undefined
      && tools.definitions().some(tool => this.instances.ownsName(tool.name))
    if (surviving) return
    const remove = this.removeGuard
    this.removeGuard = undefined
    remove()
  }

  /** Resolve Session lineage without assuming a private Agent layout beyond the documented header. */
  private agentLineage(): HubAgentLineage {
    return {
      isChild: agent => (agent as Agent).session.header.parentSession !== undefined,
      parentOf: (agent) => {
        // adopt() calls this only after isChild() checks the immutable header.
        const parentId = (agent as Agent).session.header.parentSession as Agent['id']
        return this.ctx.get('agents')?.get(parentId)
      },
    }
  }

  /** Refuse a plugin id outside the frozen catalog grammar. */
  private assertPluginId(pluginId: string): void {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) {
      throw new RemoteError('plugin-hub/invalid-request', 'The plugin id is not valid.', {
        field: 'pluginId',
        reason: 'pattern',
      })
    }
  }

  /** One V1 Host has one owner identity; other Peers cannot use its configured credential. */
  private assertOwner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('plugin-hub/owner-required', 'The plugin hub requires this Host owner.', {})
    }
  }

  /** Wake streams after an operation or managed connection status changes. */
  private changed(): void {
    for (const notify of this.watchers) notify()
  }

  /** Map an operation failure to the one Remote failure it may cross the wire as. */
  private failure(error: unknown): RemoteError {
    const remote = remoteErrorOf(error)
    if (remote !== undefined) {
      return new RemoteError(remote.code, remote.message, remote.details, { cause: error })
    }
    if (error instanceof HubClientError) return remoteErrorFor(error)
    /* v8 ignore next -- a failure raised after disposal has no owning request */
    if (this.stopped) return new RemoteError('gateway/internal', 'The plugin hub is stopping.', {})
    /* v8 ignore next -- every operation maps its own failures above; this contains an unexpected implementation defect */
    return new RemoteError('gateway/internal', 'The plugin hub operation failed.', {}, { cause: error })
  }
}

/** Stable order for persisted decisions so the patch diff is reviewable. */
function compareAuthorizations(left: HubAuthorization, right: HubAuthorization): number {
  return left.platform.localeCompare(right.platform) || left.pluginId.localeCompare(right.pluginId)
}

/** Copy exactly the frozen catalog fields; a remote row can carry no Host-private value. */
function clonePlugin(plugin: CatalogPlugin): CatalogPlugin {
  return {
    pluginId: plugin.pluginId,
    workloadId: plugin.workloadId,
    releaseVersion: plugin.releaseVersion,
    name: plugin.name,
    description: plugin.description,
    ...plugin.icon === undefined ? {} : { icon: plugin.icon },
    category: plugin.category,
    allowedTools: plugin.allowedTools.map(tool => ({
      name: tool.name,
      ...tool.description === undefined ? {} : { description: tool.description },
      inputSchema: tool.inputSchema,
    })),
    schemaFingerprint: plugin.schemaFingerprint,
    riskLevel: plugin.riskLevel,
    visibility: plugin.visibility,
    allowedRoles: [...plugin.allowedRoles],
    status: plugin.status,
    mcpPath: plugin.mcpPath,
  }
}
