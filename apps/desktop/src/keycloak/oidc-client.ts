/** OIDC Authorization Code + PKCE S256 client for the Suiyi identity center. */

import { resolveDesktopLocale } from '../locale.ts'
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createLocalJWKSet, jwtVerify, type JWTPayload, errors as joseErrors } from 'jose'

/** Endpoints of one OIDC provider resolved from its discovery document. */
export interface OidcEndpoints {
  readonly issuer: string
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly jwksUri: string
  /** Optional: absent providers cannot be logged out server-side. */
  readonly endSessionEndpoint?: string
}

/** Minimum discovery fields this client relies on; extra members are ignored. */
interface DiscoveryDocument {
  readonly issuer: string
  readonly authorization_endpoint: string
  readonly token_endpoint: string
  readonly jwks_uri: string
  readonly end_session_endpoint?: string
  readonly id_token_signing_alg_values_supported?: readonly string[]
}

/** Keycloak token response fields this client consumes. */
export interface OidcTokenResponse {
  readonly access_token: string
  readonly id_token: string
  readonly refresh_token?: string
  /** Seconds until the access token expires; absent defaults to 0 (immediately stale). */
  readonly expires_in?: number
  readonly token_type: string
}

/** Verified identity facts of one completed login. */
export interface OidcIdentity {
  /** Exact `iss` claim value, equal to the configured issuer. */
  readonly issuer: string
  /** Stable subject id; never an email or username. */
  readonly sub: string
  /** Display name for the login shell only; never used for data partitioning. */
  readonly name?: string
  /** Access token expiry in epoch milliseconds. */
  readonly expiresAt: number
  /**
   * Verified access token for user-scoped upstream APIs. It stays in the Electron main process
   * and the Host's private IPC channel memory: never logged, persisted, or exposed to a renderer.
   */
  readonly accessToken: string
  /** Refresh token when the provider issued one. */
  readonly refreshToken?: string
}

/** Classified failure of one login attempt; reasons stay safe for UI copy. */
export type OidcFailure =
  | 'discovery-network'
  | 'discovery-invalid'
  | 'issuer-mismatch'
  | 'callback-aborted'
  | 'callback-server'
  | 'callback-timeout'
  | 'browser-unavailable'
  | 'callback-replay'
  | 'callback-malformed'
  | 'token-network'
  | 'token-invalid'
  | 'token-rejected'

/** One in-flight authorization request with its PKCE and anti-replay material. */
interface PendingAttempt {
  readonly state: string
  readonly verifier: string
  readonly nonce: string
}

/** Callback-server bound values for one attempt. */
interface CallbackServer {
  readonly server: Server
  readonly port: number
}

/** Redirect-path prefix the identity center must register per machine. */
export const SUIYI_CALLBACK_PATH = '/suiyi-desktop/callback'

/** Login deadline from browser opening to token receipt. */
export const SUIYI_LOGIN_TIMEOUT_MS = 10 * 60 * 1000

/** Accepted clock skew for ID token time claims, in seconds. */
export const SUIYI_CLOCK_SKEW_SECONDS = 30

/** Portable fetch used for discovery, token, and refresh exchanges. */
export type OidcFetch = (input: string, init?: RequestInit) => Promise<Response>

export interface OidcClientOptions {
  /** Localized callback receipt; token verification has not completed yet. */
  readonly callbackReceivedMessage?: string
  /** Configured issuer; discovery must report it exactly. */
  readonly issuer: string
  /** Public client id; no secret is exchanged anywhere. */
  readonly clientId: string
  /** Fetch implementation; production uses Node's global fetch with strict TLS. */
  readonly fetch?: OidcFetch
  /** Random-port HTTP server factory; injected by tests, defaults to node:http. */
  readonly createCallbackServer?: (
    handler: (request: CallbackRequest, respond: CallbackRespond) => void,
    signal: AbortSignal) => Promise<CallbackServer>
  /** Browser opener for the system default browser. */
  readonly openBrowser: (url: string) => Promise<void>
  /** Aborts discovery, the callback wait, and later exchanges; resolves as a cancelled attempt. */
  readonly signal?: AbortSignal
  /** Deadline control for tests. */
  readonly timeoutMs?: number
  /** Clock reading, epoch milliseconds. */
  readonly now?: () => number
}

/** Strict HTTPS origin (scheme, exact host, exact port) every provider URL must share. */
function issuerOrigin(issuer: string): URL | undefined {
  let url: URL
  try {
    url = new URL(issuer)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
    || url.search !== '' || url.hash !== '' || url.href !== issuer) {
    return undefined
  }
  return url
}

/**
 * Provider endpoint paths a Suiyi identity center may expose. Keycloak serves
 * all of these directly under the realm URL.
 */
const ALLOWED_ENDPOINT_PATTERNS: readonly { readonly path: `/${string}`; readonly kind: EndpointKind }[] = [
  { path: '/protocol/openid-connect/auth', kind: 'authorization' },
  { path: '/protocol/openid-connect/token', kind: 'token' },
  { path: '/protocol/openid-connect/certs', kind: 'jwks' },
  { path: '/protocol/openid-connect/logout', kind: 'end-session' },
]

/** Discovery endpoint slots this client validates. */
type EndpointKind = 'authorization' | 'token' | 'jwks' | 'end-session'

/**
 * Check one discovery endpoint URL against the strict provider origin and the
 * allowed Keycloak path set. Plain `startsWith` would accept embedded-credential,
 * query, fragment, or subdomain tricks, so every URL component is compared.
 * @param endpoint - endpoint URL from the discovery document.
 * @param origin - the issuer's exact origin (scheme + host + port).
 * @param kind - which endpoint slot the URL occupies.
 * @returns an error message, or undefined when the endpoint is acceptable.
 */
function endpointViolation(endpoint: string, origin: URL, kind: EndpointKind): string | undefined {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return 'identity center endpoint is not a valid URL'
  }
  if (url.protocol !== origin.protocol || url.host !== origin.host || url.username !== '' || url.password !== ''
    || url.search !== '' || url.hash !== '') {
    return 'identity center endpoints must stay on the configured issuer origin'
  }
  const expected = origin.pathname
  if (!ALLOWED_ENDPOINT_PATTERNS.some(candidate => candidate.kind === kind && url.pathname === `${expected}${candidate.path}`)) {
    return 'identity center endpoint path is not an allowed Keycloak endpoint'
  }
  return undefined
}

/** Strict-match a required endpoint URL. @see endpointViolation */
function requireEndpoint(endpoint: unknown, origin: URL, kind: 'authorization' | 'token' | 'jwks'): { readonly ok: true
  readonly value: string
} | {
  readonly ok: false
  readonly message: string } {
  if (typeof endpoint !== 'string' || endpoint === '') {
    return { ok: false, message: `identity center discovery is missing the ${kind} endpoint` }
  }
  const violation = endpointViolation(endpoint, origin, kind)
  if (violation !== undefined) return { ok: false, message: violation }
  return { ok: true, value: endpoint }
}

/**
 * Strict-match OIDC discovery against the configured issuer.
 * @param issuer - exact expected issuer URL.
 * @param fetch - HTTP client.
 * @returns provider endpoints, or a typed failure.
 */
export async function discoverOidcEndpoints(issuer: string, fetch: OidcFetch): Promise<{
  readonly ok: true
  readonly endpoints: OidcEndpoints
} | {
  readonly ok: false
  readonly failure: OidcFailure
  readonly message: string }> {
  const origin = issuerOrigin(issuer)
  if (origin === undefined) {
    return { ok: false, failure: 'discovery-invalid', message: 'configured issuer must be a plain https URL' }
  }
  let response: Response
  try {
    // Keycloak serves the OIDC discovery document under the realm path: {issuer}/.well-known/openid-configuration.
    response = await fetch(`${issuer}/.well-known/openid-configuration`, { redirect: 'error' })
  } catch {
    return { ok: false, failure: 'discovery-network', message: 'identity center discovery request failed' }
  }
  if (!response.ok) return { ok: false, failure: 'discovery-network', message: `identity center discovery returned HTTP ${String(response.status)}` }
  let document: unknown
  try {
    document = await response.json()
  } catch {
    return { ok: false, failure: 'discovery-invalid', message: 'identity center discovery document is not JSON' }
  }
  if (typeof document !== 'object' || document === null) {
    return { ok: false, failure: 'discovery-invalid', message: 'identity center discovery document is not an object' }
  }
  const doc = document as DiscoveryDocument
  if (typeof doc.issuer !== 'string' || doc.issuer !== issuer) {
    return { ok: false, failure: 'issuer-mismatch', message: 'identity center discovery reports a different issuer' }
  }
  const authorization = requireEndpoint(doc.authorization_endpoint, origin, 'authorization')
  if (!authorization.ok) return { ok: false, failure: 'discovery-invalid', message: authorization.message }
  const token = requireEndpoint(doc.token_endpoint, origin, 'token')
  if (!token.ok) return { ok: false, failure: 'discovery-invalid', message: token.message }
  const jwks = requireEndpoint(doc.jwks_uri, origin, 'jwks')
  if (!jwks.ok) return { ok: false, failure: 'discovery-invalid', message: jwks.message }
  if (doc.id_token_signing_alg_values_supported !== undefined
    && (!Array.isArray(doc.id_token_signing_alg_values_supported) || !doc.id_token_signing_alg_values_supported.includes('RS256'))) {
    return { ok: false, failure: 'discovery-invalid', message: 'identity center does not support RS256 ID token signing' }
  }
  let endSession: string | undefined
  if (typeof doc.end_session_endpoint === 'string' && doc.end_session_endpoint !== '') {
    const violation = endpointViolation(doc.end_session_endpoint, origin, 'end-session')
    if (violation !== undefined) return { ok: false, failure: 'discovery-invalid', message: violation }
    endSession = doc.end_session_endpoint
  }
  return {
    ok: true,
    endpoints: {
      issuer,
      authorizationEndpoint: authorization.value,
      tokenEndpoint: token.value,
      jwksUri: jwks.value,
      ...(endSession !== undefined ? { endSessionEndpoint: endSession } : {}),
    },
  }
}

/** Base64url without padding, RFC 7636 appendix B. */
function base64url(bytes: Buffer): string {
  return bytes.toString('base64').replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
}

/** Cryptographically random URL-safe string. */
function randomUrlSafe(bytes: number): string {
  return base64url(randomBytes(bytes))
}

/** JSON Web Key Set as published by the identity center. */
export interface Jwks {
  readonly keys: readonly Record<string, unknown>[]
}

/**
 * Fetch and validate the provider key set.
 * @param jwksUri - discovery-resolved key-set URL under the issuer.
 * @param issuer - configured issuer for endpoint containment.
 * @param fetch - HTTP client.
 * @returns the key set, or a typed failure.
 */
export async function fetchJwks(jwksUri: string, issuer: string, fetch: OidcFetch): Promise<{
  readonly ok: true
  readonly jwks: Jwks
} | {
  readonly ok: false
  readonly failure: OidcFailure
  readonly message: string }> {
  const origin = issuerOrigin(issuer)
  if (origin === undefined) return { ok: false, failure: 'discovery-invalid', message: 'configured issuer must be a plain https URL' }
  const violation = endpointViolation(jwksUri, origin, 'jwks')
  if (violation !== undefined) return { ok: false, failure: 'discovery-invalid', message: violation }
  let response: Response
  try {
    response = await fetch(jwksUri, { redirect: 'error' })
  } catch {
    return { ok: false, failure: 'discovery-network', message: 'identity center key-set request failed' }
  }
  if (!response.ok) return { ok: false, failure: 'discovery-network', message: `identity center key set returned HTTP ${String(response.status)}` }
  let document: unknown
  try {
    document = await response.json()
  } catch {
    return { ok: false, failure: 'discovery-invalid', message: 'identity center key set is not JSON' }
  }
  if (typeof document !== 'object' || document === null || !Array.isArray((document as { keys?: unknown }).keys)) {
    return { ok: false, failure: 'discovery-invalid', message: 'identity center key set has no keys' }
  }
  const keys = (document as { keys: unknown[] }).keys
  if (keys.length === 0) {
    return { ok: false, failure: 'discovery-invalid', message: 'identity center key set is empty' }
  }
  if (keys.some(key => typeof key !== 'object' || key === null)) {
    return { ok: false, failure: 'discovery-invalid', message: 'identity center key set holds a non-object key' }
  }
  return { ok: true, jwks: { keys: keys as Record<string, unknown>[] } }
}

/**
 * Validate one ID token's RS256 signature and registered claims with jose.
 * Signature, algorithm, issuer, audience, expiry, issued-at, and nonce
 * presence are enforced by `jwtVerify`; nothing here reimplements JWS.
 * @param idToken - raw JWT from the token exchange.
 * @param issuer - configured issuer, matched exactly.
 * @param clientId - expected audience.
 * @param nonce - one-time value from this attempt.
 * @param jwks - provider key set.
 * @param now - clock reading in epoch milliseconds.
 * @param leewaySeconds - accepted clock skew.
 * @returns verified claims, or a typed failure.
 */
export async function validateIdToken(
  idToken: string,
  issuer: string,
  clientId: string,
  nonce: string,
  jwks: Jwks,
  now: number,
  leewaySeconds = SUIYI_CLOCK_SKEW_SECONDS,
): Promise<{
  readonly ok: true
  readonly claims: { readonly sub: string
    readonly nonce: string
    readonly exp: number
    /** Verified display name from the `name` claim, when the provider supplies one. */
    readonly name?: string }
} | {
  readonly ok: false
  readonly failure: OidcFailure
  readonly message: string }> {
  let keySet: ReturnType<typeof createLocalJWKSet>
  try {
    keySet = createLocalJWKSet({ keys: jwks.keys.map(key => ({ ...key })) })
  } catch {
    return { ok: false, failure: 'token-rejected', message: 'identity center key set is not usable' }
  }
  let payload: JWTPayload | undefined
  try {
    ;({ payload } = await jwtVerify(idToken, keySet, {
      issuer,
      audience: clientId,
      algorithms: ['RS256'],
      currentDate: new Date(now),
      clockTolerance: Math.max(leewaySeconds, 0),
      requiredClaims: ['iss', 'aud', 'exp', 'iat', 'nonce', 'sub'],
    }))
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      return { ok: false, failure: 'token-rejected', message: `ID token was rejected: ${error.code}` }
    }
    return { ok: false, failure: 'token-rejected', message: 'ID token could not be verified' }
  }
  if (payload.nonce !== nonce) {
    return { ok: false, failure: 'token-rejected', message: 'ID token nonce does not match this login attempt' }
  }
  if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
    return { ok: false, failure: 'token-rejected', message: 'ID token has no subject' }
  }
  if (typeof payload.exp !== 'number') {
    return { ok: false, failure: 'token-rejected', message: 'ID token has no expiry' }
  }
  const displayName = typeof payload.name === 'string'
    ? payload.name.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 80)
    : ''
  return {
    ok: true,
    claims: {
      sub: payload.sub,
      nonce: payload.nonce,
      exp: payload.exp,
      ...(displayName === '' ? {} : { name: displayName }),
    },
  }
}

/**
 * Exchange the authorization code for tokens over HTTPS.
 * @param tokenEndpoint - discovery-resolved token URL.
 * @param clientId - public client id.
 * @param code - one-time authorization code from the loopback callback.
 * @param verifier - PKCE code verifier of this attempt.
 * @param redirectUri - the exact loopback redirect registered with the attempt.
 * @param fetch - HTTP client.
 * @returns the provider token response, or a typed failure.
 */
export async function exchangeAuthorizationCode(
  tokenEndpoint: string,
  clientId: string,
  code: string,
  verifier: string,
  redirectUri: string,
  fetch: OidcFetch,
): Promise<{
  readonly ok: true
  readonly tokens: OidcTokenResponse
} | {
  readonly ok: false
  readonly failure: OidcFailure
  readonly message: string }> {
  let response: Response
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      }).toString(),
    })
  } catch {
    return { ok: false, failure: 'token-network', message: 'identity center token exchange failed' }
  }
  if (response.status === 400 || response.status === 401) {
    return { ok: false, failure: 'token-invalid', message: 'identity center token exchange rejected the request' }
  }
  if (!response.ok) return { ok: false, failure: 'token-network', message: `identity center token exchange returned HTTP ${String(response.status)}` }
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return { ok: false, failure: 'token-invalid', message: 'identity center token response is not JSON' }
  }
  const shape = tokenResponseShape(parsed, 'token exchange')
  if (!shape.ok) return shape
  return { ok: true, tokens: shape.tokens }
}

/**
 * Field-level validation shared by token and refresh responses: required
 * fields, refresh/expiry types, and the mandatory `token_type: Bearer`
 * (case-insensitive per RFC 6750). Token values never reach a log.
 * @param parsed - response body already JSON-parsed.
 * @param phase - response phase named in failure messages.
 * @returns the typed token response, or a typed failure.
 */
function tokenResponseShape(parsed: unknown, phase: string): { readonly ok: true
  readonly tokens: OidcTokenResponse
} | {
  readonly ok: false
  readonly failure: OidcFailure
  readonly message: string } {
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, failure: 'token-invalid', message: `identity center ${phase} response is not an object` }
  }
  const tokens = parsed as Record<string, unknown>
  if (typeof tokens.access_token !== 'string' || tokens.access_token === ''
    || typeof tokens.id_token !== 'string' || tokens.id_token === '') {
    return { ok: false, failure: 'token-invalid', message: `identity center ${phase} response is missing required fields` }
  }
  if (typeof tokens.token_type !== 'string' || tokens.token_type.toLowerCase() !== 'bearer') {
    return { ok: false, failure: 'token-invalid', message: `identity center ${phase} response must use the Bearer token type` }
  }
  if (tokens.refresh_token !== undefined && typeof tokens.refresh_token !== 'string') {
    return { ok: false, failure: 'token-invalid', message: `identity center ${phase} refresh token is malformed` }
  }
  if (tokens.expires_in !== undefined && (typeof tokens.expires_in !== 'number' || !Number.isFinite(tokens.expires_in) || tokens.expires_in < 0)) {
    return { ok: false, failure: 'token-invalid', message: `identity center ${phase} token expiry is malformed` }
  }
  return {
    ok: true,
    tokens: {
      access_token: tokens.access_token,
      id_token: tokens.id_token,
      ...(typeof tokens.refresh_token === 'string' && tokens.refresh_token !== '' ? { refresh_token: tokens.refresh_token } : {}),
      token_type: tokens.token_type,
      ...(typeof tokens.expires_in === 'number' ? { expires_in: tokens.expires_in } : {}),
    },
  }
}

/** Loopback callback request as seen by the handler. */
interface CallbackRequest {
  readonly method: string | undefined
  readonly url: string | undefined
}

/** Response writer the handler receives. */
export type CallbackRespond = (status: number, body: string, headers?: Record<string, string>) => void

/** Random-port loopback server bound to 127.0.0.1; aborting the signal closes it. */
async function createDefaultCallbackServer(
  handler: (request: CallbackRequest, respond: CallbackRespond) => void,
  signal: AbortSignal,
): Promise<CallbackServer> {
  const server = createServer((request, response) => {
    const respond = (status: number, body: string, headers: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8' }): void => {
      response.writeHead(status, headers)
      response.end(body)
    }
    handler({ method: request.method, url: request.url }, respond)
  })
  signal.addEventListener('abort', () => { server.close() }, { once: true })
  return await new Promise<CallbackServer>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('loopback callback could not bind a port'))
        return
      }
      resolve({ server, port: address.port })
    })
  })
}

/** One accepted callback outcome. */
type CallbackOutcome = { readonly code: string } | { readonly error: string }

/**
 * Run one complete browser login: PKCE S256, state/nonce, random-port loopback
 * callback, HTTPS token exchange, and full ID token validation. One attempt
 * per call; replayed or malformed callbacks fail closed, the listener closes
 * after use, and no token value is ever logged.
 * @param options - issuer, client, transport, and clock hooks.
 * @returns verified identity on success, or a typed failure safe for UI copy.
 */
export async function runAuthorizationCodeLogin(options: OidcClientOptions): Promise<{
  readonly ok: true
  readonly identity: OidcIdentity
} | {
  readonly ok: false
  readonly failure: OidcFailure
  readonly message: string }> {
  const fetch = options.fetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init))
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? SUIYI_LOGIN_TIMEOUT_MS
  const signal = options.signal
  // A method call keeps TypeScript from narrowing `aborted` across awaits; the flag changes
  // outside this process's control.
  const aborted = (): boolean => signal?.aborted === true
  const cancelled = (): { readonly ok: false; readonly failure: 'callback-aborted'; readonly message: string } =>
    ({ ok: false, failure: 'callback-aborted', message: 'login was cancelled' })
  if (aborted()) return cancelled()
  const discovered = await discoverOidcEndpoints(options.issuer, fetch)
  if (!discovered.ok) return discovered
  if (aborted()) return cancelled()
  const endpoints = discovered.endpoints
  const attempt: PendingAttempt = {
    state: randomUrlSafe(32),
    verifier: randomUrlSafe(32),
    nonce: randomUrlSafe(32),
  }
  const callbackChallenge = base64url(createHash('sha256').update(attempt.verifier, 'ascii').digest())
  const controller = new AbortController()
  const createServerHook = options.createCallbackServer ?? createDefaultCallbackServer
  let timer: ReturnType<typeof setTimeout> | undefined
  let callback: CallbackServer | undefined
  const finished = Promise.withResolvers<CallbackOutcome>()
  let settled = false
  const settle = (value: CallbackOutcome): void => {
    if (settled) return
    settled = true
    finished.resolve(value)
  }
  const onAbort = (): void => {
    controller.abort()
    settle({ error: 'cancelled' })
  }
  if (aborted()) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  let redeemable = true
  const handler = (request: CallbackRequest, respond: CallbackRespond): void => {
    if (request.method !== 'GET') {
      respond(405, 'Method not allowed', { allow: 'GET' })
      return
    }
    let url: URL
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1')
    } catch {
      respond(400, 'Invalid callback')
      return
    }
    if (url.pathname !== SUIYI_CALLBACK_PATH) {
      respond(404, 'Not found')
      return
    }
    const state = url.searchParams.get('state')
    if (state === null || state !== attempt.state) {
      // A foreign or replayed callback: answered, but never accepted.
      respond(400, 'Stale login request')
      return
    }
    if (!redeemable) {
      // The single-use attempt already produced its outcome; later hits are replays.
      respond(400, 'Login request already used')
      return
    }
    const error = url.searchParams.get('error')
    if (error !== null) {
      redeemable = false
      settle({ error })
      respond(200, 'Login was cancelled.')
      return
    }
    const code = url.searchParams.get('code')
    if (code === null || code === '') {
      redeemable = false
      settle({ error: 'missing_code' })
      respond(400, 'Missing authorization code')
      return
    }
    redeemable = false
    settle({ code })
    respond(200, options.callbackReceivedMessage ?? resolveDesktopLocale('en').messages.suiyiLoginCallbackReceived)
  }
  try {
    if (aborted()) return cancelled()
    try {
      callback = await createServerHook(handler, controller.signal)
    } catch {
      if (aborted()) return cancelled()
      return { ok: false, failure: 'callback-server', message: 'loopback callback server could not start' }
    }
    // The listener owns its random port first; only that exact port is
    // registered as this attempt's redirect target.
    const redirectUri = `http://127.0.0.1:${String(callback.port)}${SUIYI_CALLBACK_PATH}`
    const authorizeUrl = new URL(endpoints.authorizationEndpoint)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', options.clientId)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('scope', 'openid profile')
    authorizeUrl.searchParams.set('state', attempt.state)
    authorizeUrl.searchParams.set('nonce', attempt.nonce)
    authorizeUrl.searchParams.set('code_challenge', callbackChallenge)
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')
    const deadline = now() + timeoutMs
    timer = setTimeout(() => { settle({ error: 'timeout' }) }, Math.max(deadline - now(), 0))
    timer.unref()
    try {
      await options.openBrowser(authorizeUrl.href)
    } catch {
      if (aborted()) return cancelled()
      return { ok: false, failure: 'browser-unavailable', message: 'the system browser could not open the login page' }
    }
    const outcome = await finished.promise
    if ('error' in outcome) {
      if (outcome.error === 'cancelled') return cancelled()
      if (outcome.error === 'timeout') return { ok: false, failure: 'callback-timeout', message: 'login timed out waiting for the browser' }
      if (outcome.error === 'access_denied' || outcome.error === 'login_required' || outcome.error === 'consent_required') {
        return { ok: false, failure: 'callback-aborted', message: 'login was cancelled in the browser' }
      }
      if (outcome.error === 'missing_code') return { ok: false, failure: 'callback-malformed', message: 'the login callback carried no authorization code' }
      return { ok: false, failure: 'callback-malformed', message: `the login callback reported ${outcome.error}` }
    }
    if (aborted()) return cancelled()
    const exchanged = await exchangeAuthorizationCode(
      endpoints.tokenEndpoint, options.clientId, outcome.code, attempt.verifier, redirectUri, fetch,
    )
    if (!exchanged.ok) return exchanged
    const jwks = await fetchJwks(endpoints.jwksUri, options.issuer, fetch)
    if (!jwks.ok) return jwks
    const validated = await validateIdToken(exchanged.tokens.id_token, options.issuer, options.clientId, attempt.nonce, jwks.jwks, now())
    if (!validated.ok) return validated
    const expiresInMs = (exchanged.tokens.expires_in ?? 0) * 1000
    return {
      ok: true,
      identity: {
        issuer: options.issuer,
        sub: validated.claims.sub,
        expiresAt: Math.min(now() + expiresInMs, validated.claims.exp * 1000),
        accessToken: exchanged.tokens.access_token,
        ...(validated.claims.name === undefined ? {} : { name: validated.claims.name }),
      },
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    controller.abort()
    callback?.server.close()
  }
}

/**
 * Refresh an access token with the stored refresh token. The response always
 * carries a fresh ID token that callers must re-verify before trusting any
 * identity claim; this exchange only refreshes, it never re-establishes who
 * the user is.
 * @param tokenEndpoint - discovery-resolved token URL.
 * @param clientId - public client id.
 * @param refreshToken - stored refresh token.
 * @param fetch - HTTP client.
 * @returns fresh tokens, or a typed failure; `refresh-invalid` means re-login is required.
 */
export async function refreshAccessToken(
  tokenEndpoint: string,
  clientId: string,
  refreshToken: string,
  fetch: OidcFetch,
): Promise<{
  readonly ok: true
  readonly tokens: OidcTokenResponse
} | {
  readonly ok: false
  readonly failure: OidcFailure | 'refresh-invalid'
  readonly message: string }> {
  let response: Response
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      }).toString(),
    })
  } catch {
    return { ok: false, failure: 'token-network', message: 'identity center refresh request failed' }
  }
  if (response.status === 400 || response.status === 401) {
    return { ok: false, failure: 'refresh-invalid', message: 'the saved login has expired; sign in again' }
  }
  if (!response.ok) return { ok: false, failure: 'token-network', message: `identity center refresh returned HTTP ${String(response.status)}` }
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return { ok: false, failure: 'token-invalid', message: 'identity center refresh response is not JSON' }
  }
  const shape = tokenResponseShape(parsed, 'refresh')
  if (!shape.ok) return shape
  return { ok: true, tokens: shape.tokens }
}
