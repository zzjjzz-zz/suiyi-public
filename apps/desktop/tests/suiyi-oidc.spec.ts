/** Suiyi OIDC core: real RSA JWT verification and a real loopback login flow. */

import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { ServerResponse } from 'node:http'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import {
  discoverOidcEndpoints,
  fetchJwks,
  runAuthorizationCodeLogin,
  validateIdToken,
  SUIYI_CALLBACK_PATH,
} from '../src/keycloak/oidc-client.ts'
import { resolveSuiyiOidcIssuer, SUIYI_OIDC_ISSUER } from '../src/keycloak/oidc-config.ts'

const ISSUER = 'https://sso.example.test/realms/identity'
const AUDIENCE = 'suiyi-desktop'
const SUB = 'f1c0ffee-1234-4abc-9def-567890abcdef'

/** Provider RSA key pair and published key set. */
interface ProviderKey {
  readonly privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
  readonly jwks: { readonly keys: readonly Record<string, unknown>[] }
}

let providerKey: ProviderKey

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  providerKey = { privateKey, jwks: { keys: [{ ...jwk, kid: 'test-key-1', use: 'sig', alg: 'RS256' }] } }
})

/** Stand-in identity center: discovery, JWKS, authorization, and token endpoints. */
class FakeProvider {
  /** Captured token-endpoint requests, for redirect_uri and PKCE checks. */
  readonly tokenRequests: { readonly body: URLSearchParams; readonly headers: Record<string, string> }[] = []
  private server: Server | undefined
  private port = 0
  /** Overrides applied to the discovery document before it is served. */
  discoveryOverride: Partial<Record<'issuer' | 'authorization_endpoint' | 'token_endpoint' | 'jwks_uri' | 'end_session_endpoint', string>> = {}
  /** When set, the token endpoint replies with this raw body and status. */
  tokenResponse: { readonly status: number; readonly body: string } | undefined
  /** Nonce observed by the fake authorization endpoint for this login attempt. */
  expectedNonce: string | undefined

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        void this.route(request.url ?? '/', body, request.headers, response)
      })
    })
    const port = await new Promise<number>((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(0, '127.0.0.1', () => {
        const address = this.server?.address() as AddressInfo
        if (typeof address === 'string' || address === null) {
          reject(new Error('fake provider could not bind'))
          return
        }
        resolve(address.port)
      })
    })
    this.port = port
  }

  private async route(
    url: string, body: string, headers: Record<string, string | string[] | undefined>, response: ServerResponse,
  ): Promise<void> {
    const pathname = new URL(url, 'http://127.0.0.1').pathname
    if (pathname === '/realms/identity/.well-known/openid-configuration') {
      const document = {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
        token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
        jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
        end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
        id_token_signing_alg_values_supported: ['RS256', 'RS512'],
        ...this.discoveryOverride,
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(document))
      return
    }
    if (pathname === '/realms/identity/protocol/openid-connect/certs') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(providerKey.jwks))
      return
    }
    if (pathname === '/realms/identity/protocol/openid-connect/token') {
      this.tokenRequests.push({ body: new URLSearchParams(body), headers: headers as Record<string, string> })
      if (this.tokenResponse !== undefined) {
        response.writeHead(this.tokenResponse.status, { 'content-type': 'application/json' })
        response.end(this.tokenResponse.body)
        return
      }
      const params = new URLSearchParams(body)
      const idToken = await issueIdToken({
        nonce: this.expectedNonce,
        issuerOverride: params.get('iss_override') ?? undefined,
        audOverride: params.get('aud_override') ?? undefined,
        expOverride: params.get('exp_override') !== null ? Number(params.get('exp_override')) : undefined,
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        access_token: 'access-token-value',
        id_token: idToken,
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
        token_type: 'Bearer',
      }))
      return
    }
    response.writeHead(404)
    response.end('not found')
  }

  /** Fake https transport: rewrite https issuer URLs onto this loopback server, keeping the full path. */
  fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const issuerOrigin = new URL(ISSUER).origin
    const requestUrl = new URL(input)
    // Discovery arrives as {issuer}/.well-known/openid-configuration (host-relative);
    // map it onto the realm path the fake provider serves. Every other request
    // already carries the realm path under the issuer origin.
    const path = requestUrl.pathname === '/.well-known/openid-configuration'
      ? `${new URL(ISSUER).pathname}/.well-known/openid-configuration`
      : requestUrl.pathname
    const target = `http://127.0.0.1:${String(this.port)}${path}`
    if (path === '/realms/identity/protocol/openid-connect/auth') {
      // Authorization endpoint: we never navigate there for real.
      return new Response('{}', { status: 200 })
    }
    void issuerOrigin
    return await globalThis.fetch(target, init)
  }

  get listenPort(): number {
    return this.port
  }

  async stop(): Promise<void> {
    if (this.server === undefined) return
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => { if (error === undefined) resolve(); else reject(error) })
    })
  }
}

/** Issue a real RS256-signed ID token with the claim shape under test. */
async function issueIdToken(claims: {
  nonce?: string | undefined
  issuerOverride?: string | undefined
  audOverride?: string | undefined
  expOverride?: number | undefined
  iatMissing?: boolean
  alg?: string
} = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const builder = new SignJWT({
    sub: SUB,
    nonce: claims.nonce ?? 'unused-nonce',
    ...(claims.audOverride === undefined ? {} : { aud: claims.audOverride }),
  })
    .setProtectedHeader({ alg: claims.alg ?? 'RS256', kid: 'test-key-1' })
    .setIssuer(claims.issuerOverride ?? ISSUER)
    .setAudience(claims.audOverride ?? AUDIENCE)
    .setExpirationTime(claims.expOverride ?? now + 600)
  if (!claims.iatMissing) builder.setIssuedAt(now)
  return await builder.sign(providerKey.privateKey)
}

/** A loopback login driver that captures the authorize URL and drives callbacks over real TCP. */
interface LoopbackRun {
  authorizeUrl: URL
  result: Promise<{ readonly ok: boolean }>
}

describe('ID token verification (real RSA signatures)', () => {
  it('accepts a genuine RS256 token with matching iss, aud, nonce, exp, iat, and sub', async () => {
    const nonce = 'nonce-1'
    const idToken = await issueIdToken({ nonce })
    const result = await validateIdToken(idToken, ISSUER, AUDIENCE, nonce, providerKey.jwks, Date.now())
    expect(result).toEqual({ ok: true, claims: { sub: SUB, nonce, exp: expect.any(Number) as number } })
  })

  it('rejects a tampered signature', async () => {
    const idToken = await issueIdToken({ nonce: 'n' })
    const parts = idToken.split('.')
    const encodedSignature = parts[2]
    if (encodedSignature === undefined) throw new Error('signed token has no signature')
    const signature = Buffer.from(encodedSignature, 'base64url')
    signature.writeUInt8(signature.readUInt8(0) ^ 0x01, 0)
    const tampered = [parts[0], parts[1], signature.toString('base64url')].join('.')
    const result = await validateIdToken(tampered, ISSUER, AUDIENCE, 'n', providerKey.jwks, Date.now())
    expect(result).toMatchObject({ ok: false, failure: 'token-rejected' })
  })

  it('rejects a signature made with a different RSA key', async () => {
    const attacker = await generateKeyPair('RS256')
    const now = Math.floor(Date.now() / 1000)
    const forged = await new SignJWT({ sub: SUB, nonce: 'n' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt(now).setExpirationTime(now + 600)
      .sign(attacker.privateKey)
    const result = await validateIdToken(forged, ISSUER, AUDIENCE, 'n', providerKey.jwks, Date.now())
    expect(result).toMatchObject({ ok: false, failure: 'token-rejected' })
  })

  it('rejects issuer mismatch', async () => {
    const idToken = await issueIdToken({ nonce: 'n', issuerOverride: 'https://evil.example/realms/identity' })
    const result = await validateIdToken(idToken, ISSUER, AUDIENCE, 'n', providerKey.jwks, Date.now())
    expect(result).toMatchObject({ ok: false, failure: 'token-rejected' })
  })

  it('rejects audience mismatch', async () => {
    const idToken = await issueIdToken({ nonce: 'n', audOverride: 'other-client' })
    const result = await validateIdToken(idToken, ISSUER, AUDIENCE, 'n', providerKey.jwks, Date.now())
    expect(result).toMatchObject({ ok: false, failure: 'token-rejected' })
  })

  it('rejects a nonce mismatch', async () => {
    const idToken = await issueIdToken({ nonce: 'wrong-nonce' })
    const result = await validateIdToken(idToken, ISSUER, AUDIENCE, 'expected-nonce', providerKey.jwks, Date.now())
    expect(result).toMatchObject({ ok: false, failure: 'token-rejected' })
  })

  it('rejects an expired token beyond the clock skew', async () => {
    const now = Math.floor(Date.now() / 1000)
    const idToken = await issueIdToken({ nonce: 'n', expOverride: now - 600 })
    const result = await validateIdToken(idToken, ISSUER, AUDIENCE, 'n', providerKey.jwks, Date.now())
    expect(result).toMatchObject({ ok: false, failure: 'token-rejected' })
  })
})

describe('discovery validation', () => {
  let provider: FakeProvider

  beforeAll(async () => {
    provider = new FakeProvider()
    await provider.start()
  })

  afterAll(async () => {
    await provider.stop()
  })

  it('accepts a well-formed discovery document', async () => {
    const result = await discoverOidcEndpoints(ISSUER, provider.fetch)
    expect(result).toMatchObject({
      ok: true,
      endpoints: {
        issuer: ISSUER,
        authorizationEndpoint: `${ISSUER}/protocol/openid-connect/auth`,
        tokenEndpoint: `${ISSUER}/protocol/openid-connect/token`,
        jwksUri: `${ISSUER}/protocol/openid-connect/certs`,
        endSessionEndpoint: `${ISSUER}/protocol/openid-connect/logout`,
      },
    })
  })

  it('rejects a discovery document reporting a different issuer', async () => {
    provider.discoveryOverride = { issuer: 'https://evil.example/realms/identity' }
    try {
      const result = await discoverOidcEndpoints(ISSUER, provider.fetch)
      // The configured issuer is well-formed, so the mismatch itself is what fails.
      expect(result).toMatchObject({ ok: false, failure: 'issuer-mismatch' })
    } finally {
      provider.discoveryOverride = {}
    }
  })

  for (const override of [
    { token_endpoint: 'https://sub.sso.example.test/realms/identity/protocol/openid-connect/token' },
    { token_endpoint: 'https://sso.example.test/realms/other/protocol/openid-connect/token' },
    { token_endpoint: 'https://sso.example.test:8443/realms/identity/protocol/openid-connect/token' },
    { token_endpoint: 'https://sso.example.test/realms/identity/protocol/openid-connect/login' },
    { token_endpoint: 'https://user:pass@sso.example.test/realms/identity/protocol/openid-connect/token' },
    { token_endpoint: 'http://sso.example.test/realms/identity/protocol/openid-connect/token' },
  ] as const) {
    it(`rejects a tampered token endpoint (${Object.values(override)[0]})`, async () => {
      provider.discoveryOverride = override
      try {
        const result = await discoverOidcEndpoints(ISSUER, provider.fetch)
        expect(result).toMatchObject({ ok: false, failure: 'discovery-invalid' })
      } finally {
        provider.discoveryOverride = {}
      }
    })
  }
})

describe('loopback authorization-code login over real TCP', () => {
  let provider: FakeProvider
  /** The nonce the provider saw at the token endpoint; decoded, not trusted. */
  let observedCallbackNonce: string | undefined

  beforeAll(async () => {
    provider = new FakeProvider()
    await provider.start()
  })

  afterAll(async () => {
    await provider.stop()
  })

  /** Start a login and return its authorize URL before the callback arrives. */
  async function startLogin(): Promise<LoopbackRun> {
    let authorizeUrl: URL | undefined
    let resolveBrowser: (() => void) | undefined
    const browserGate = new Promise<void>((resolve) => { resolveBrowser = resolve })
    const result = runAuthorizationCodeLogin({
      issuer: ISSUER,
      clientId: AUDIENCE,
      fetch: provider.fetch,
      timeoutMs: 1000,
      openBrowser: async (url) => {
        authorizeUrl = new URL(url)
        provider.expectedNonce = authorizeUrl.searchParams.get('nonce') ?? undefined
        resolveBrowser?.()
      },
    })
    await browserGate
    if (authorizeUrl === undefined) throw new Error('login never opened the browser')
    return { authorizeUrl, result }
  }

  /** Deliver one real HTTP GET to the loopback callback listener. */
  async function hitCallback(port: number, pathAndQuery: string): Promise<{ status: number; body: string }> {
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, path: pathAndQuery, method: 'GET' }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => { chunks.push(chunk) })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) })
      })
      request.on('error', reject)
      request.end()
    })
    return response
  }

  it('completes a login: one listener, matching port, PKCE S256, nonce, and verified identity', async () => {
    const run = await startLogin()
    const redirectUri = run.authorizeUrl.searchParams.get('redirect_uri')
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/suiyi-desktop\/callback$/)
    const callbackPort = Number(new URL(redirectUri ?? '').port)
    // The authorize URL registered exactly the port the listener owns; the
    // provider echoes the code back over real TCP on that same port.
    const state = run.authorizeUrl.searchParams.get('state') ?? ''
    const code = 'auth-code-1'
    const callback = await hitCallback(callbackPort, `${SUIYI_CALLBACK_PATH}?code=${code}&state=${encodeURIComponent(state)}`)
    expect(callback.status).toBe(200)
    const result = await run.result
    expect(result).toMatchObject({ ok: true, identity: { issuer: ISSUER, sub: SUB } })
    // The token endpoint saw the exact same redirect_uri and a S256 challenge
    // matching the verifier that was sent.
    expect(provider.tokenRequests.length).toBe(1)
    const tokenRequest = provider.tokenRequests[0]
    if (tokenRequest === undefined) throw new Error('provider received no token request')
    expect(tokenRequest.body.get('redirect_uri')).toBe(redirectUri)
    expect(tokenRequest.body.get('code')).toBe(code)
    expect(tokenRequest.body.get('grant_type')).toBe('authorization_code')
    expect(tokenRequest.body.get('client_id')).toBe(AUDIENCE)
    const verifier = tokenRequest.body.get('code_verifier') ?? ''
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    const challenge = run.authorizeUrl.searchParams.get('code_challenge') ?? ''
    const expectedChallenge = createHash('sha256').update(verifier, 'ascii').digest('base64url')
    expect(challenge).toBe(expectedChallenge)
    expect(run.authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(run.authorizeUrl.searchParams.get('response_type')).toBe('code')
    expect(run.authorizeUrl.searchParams.get('client_id')).toBe(AUDIENCE)
    expect(run.authorizeUrl.searchParams.get('scope')).toContain('openid')
    expect(run.authorizeUrl.searchParams.get('nonce')).not.toBeNull()
    observedCallbackNonce = run.authorizeUrl.searchParams.get('nonce') ?? undefined
    void observedCallbackNonce
  })

  it('closes the callback listener after the attempt completes', async () => {
    const run = await startLogin()
    const port = Number(new URL(run.authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
    const state = run.authorizeUrl.searchParams.get('state') ?? ''
    const callback = await hitCallback(port, `${SUIYI_CALLBACK_PATH}?code=code-close&state=${encodeURIComponent(state)}`)
    expect(callback.status).toBe(200)
    await run.result
    // After settle, the listener is closing; new connections must fail rather
    // than be answered as a fresh login attempt.
    let connectFailed = false
    try {
      await new Promise(resolve => setTimeout(resolve, 40))
      await hitCallback(port, `${SUIYI_CALLBACK_PATH}?code=x&state=${encodeURIComponent(state)}`)
    } catch {
      connectFailed = true
    }
    expect(connectFailed).toBe(true)
  })

  it('refuses to redeem a callback with the wrong state', async () => {
    const run = await startLogin()
    const port = Number(new URL(run.authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
    const response = await hitCallback(port, `${SUIYI_CALLBACK_PATH}?code=stolen-code&state=someone-elses-state`)
    expect(response.status).toBe(400)
    // A wrong-state hit is never redeemable; the attempt then times out only
    // because nothing valid ever arrives — force it closed via rejection.
    const result = await run.result
    expect(result).toMatchObject({ ok: false, failure: 'callback-timeout' })
  })

  it('rejects a replayed callback after the first was accepted', async () => {
    provider.tokenRequests.length = 0
    const run = await startLogin()
    const port = Number(new URL(run.authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
    const state = run.authorizeUrl.searchParams.get('state') ?? ''
    const path = `${SUIYI_CALLBACK_PATH}?code=replay-code&state=${encodeURIComponent(state)}`
    const first = await hitCallback(port, path)
    expect(first.status).toBe(200)
    const second = await hitCallback(port, path)
    expect(second.status).toBe(400)
    const result = await run.result
    expect(result).toMatchObject({ ok: true, identity: { sub: SUB } })
    expect(provider.tokenRequests.length).toBe(1)
  })

  it('rejects a non-GET callback', async () => {
    const run = await startLogin()
    const port = Number(new URL(run.authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
    const state = run.authorizeUrl.searchParams.get('state') ?? ''
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, path: `${SUIYI_CALLBACK_PATH}?code=c&state=${encodeURIComponent(state)}`, method: 'POST' }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => { chunks.push(chunk) })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) })
      })
      request.on('error', reject)
      request.end('x=1')
    })
    expect(response.status).toBe(405)
    const result = await run.result
    expect(result).toMatchObject({ ok: false, failure: 'callback-timeout' })
  })

  it('reports cancellation when the provider returns access_denied', async () => {
    const run = await startLogin()
    const port = Number(new URL(run.authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
    const state = run.authorizeUrl.searchParams.get('state') ?? ''
    const response = await hitCallback(port, `${SUIYI_CALLBACK_PATH}?error=access_denied&state=${encodeURIComponent(state)}`)
    expect(response.status).toBe(200)
    const result = await run.result
    expect(result).toMatchObject({ ok: false, failure: 'callback-aborted' })
  })

  it('fails closed when the ID token signature is not from the provider key', async () => {
    provider.tokenResponse = {
      status: 200,
      body: JSON.stringify({
        access_token: 'a',
        id_token: 'not-a-real-jwt',
        token_type: 'Bearer',
        expires_in: 60,
      }),
    }
    try {
      const run = await startLogin()
      const port = Number(new URL(run.authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
      const state = run.authorizeUrl.searchParams.get('state') ?? ''
      const callback = await hitCallback(port, `${SUIYI_CALLBACK_PATH}?code=bad-token&state=${encodeURIComponent(state)}`)
      expect(callback.status).toBe(200)
      const result = await run.result
      expect(result).toMatchObject({ ok: false, failure: 'token-rejected' })
    } finally {
      provider.tokenResponse = undefined
    }
  })

  it('fails closed when token_type is not Bearer', async () => {
    provider.tokenResponse = {
      status: 200,
      body: JSON.stringify({
        access_token: 'a',
        id_token: await issueIdToken({ nonce: 'unused' }),
        token_type: 'MAC',
        expires_in: 60,
      }),
    }
    try {
      const run = await startLogin()
      const port = Number(new URL(run.authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
      const state = run.authorizeUrl.searchParams.get('state') ?? ''
      await hitCallback(port, `${SUIYI_CALLBACK_PATH}?code=mac-token&state=${encodeURIComponent(state)}`)
      const result = await run.result
      expect(result).toMatchObject({ ok: false, failure: 'token-invalid' })
    } finally {
      provider.tokenResponse = undefined
    }
  })
})

describe('issuer configuration fallback', () => {
  it('ships the configured HTTPS identity center rather than an invalid placeholder', () => {
    expect(SUIYI_OIDC_ISSUER).toBe('https://sso.zzjjzz.top/realms/identity')
  })

  it('uses the packaged default when the override file is missing', async () => {
    const result = await resolveSuiyiOidcIssuer('/tmp', async () => {
      const error = new Error('no such file') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    })
    expect(result).toEqual({ ok: true, issuer: SUIYI_OIDC_ISSUER })
  })

  it('rejects EACCES instead of falling back to the default', async () => {
    const result = await resolveSuiyiOidcIssuer('/tmp', async () => {
      const error = new Error('permission denied') as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    })
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects invalid JSON instead of falling back', async () => {
    const result = await resolveSuiyiOidcIssuer('/tmp', async () => '{ not json')
    expect(result).toMatchObject({ ok: false })
  })
})

describe('JWKS endpoint containment', () => {
  it('rejects a key-set URL outside the issuer', async () => {
    const fetch = async (): Promise<Response> => new Response('{}', { status: 200 })
    const result = await fetchJwks('https://evil.example/realms/identity/protocol/openid-connect/certs', ISSUER, fetch)
    expect(result).toMatchObject({ ok: false, failure: 'discovery-invalid' })
  })
})

/** The loopback listener must be reachable on the exact port embedded in redirect_uri. */
describe('loopback listener and redirect_uri share one port', () => {
  it('binds the authorize-URL port on 127.0.0.1 before the browser opens', async () => {
    let authorizeUrl: URL | undefined
    const gate = new Promise<void>((resolve) => {
      void runAuthorizationCodeLogin({
        issuer: ISSUER,
        clientId: AUDIENCE,
        fetch: async () => new Response(JSON.stringify({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
          token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
          jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
        }), { status: 200 }),
        timeoutMs: 2_000,
        openBrowser: async (url) => {
          authorizeUrl = new URL(url)
          resolve()
        },
      }).then((result) => {
        expect(result).toMatchObject({ ok: false, failure: 'callback-timeout' })
      }, (error: unknown) => { throw error })
    })
    await gate
    if (authorizeUrl === undefined) throw new Error('authorize URL never opened')
    const port = Number(new URL(authorizeUrl.searchParams.get('redirect_uri') ?? '').port)
    expect(port).toBeGreaterThan(0)
    // A real TCP probe on that port: the listener answers (404 for a foreign
    // path proves it is the same server the redirect points at).
    const response = await new Promise<{ status: number }>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, path: '/health-check', method: 'GET' }, (res) => {
        res.resume()
        res.on('end', () => { resolve({ status: res.statusCode ?? 0 }) })
      })
      request.on('error', reject)
      request.end()
    })
    expect(response.status).toBe(404)
  })
})
