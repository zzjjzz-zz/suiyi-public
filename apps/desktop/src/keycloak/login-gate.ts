/** Suiyi startup login gate: browser login before any window or Host exists. */

import { resolveSuiyiOidcIssuer } from './oidc-config.ts'
import { runAuthorizationCodeLogin, type OidcFailure, type OidcIdentity } from './oidc-client.ts'
import type { SuiyiVerifiedIdentity } from '../paths.ts'
import type { SuiyiLoginFailure } from '../welcome-api.ts'

/**
 * Copy shown while a login attempt runs or fails. Kept English-only: the
 * Electron locale dictionaries stay product-independent and this gate runs
 * before any locale state exists.
 */
export interface LoginGateCopy {
  readonly title: string
  readonly retryPrompt: string
  readonly cancelPrompt: string
  readonly expiredPrompt: string
}

/** Default dialog copy of the Suiyi login gate. */
export const LOGIN_GATE_COPY: LoginGateCopy = {
  title: 'Suiyi login',
  retryPrompt: 'Sign-in did not complete: {reason}. Try again?',
  cancelPrompt: 'Suiyi requires a signed-in account. The application will close.',
  expiredPrompt: 'The login expired before the workspace opened. Sign in again?',
}

/** Provider inputs the gate needs from the embedding application. */
export interface LoginGateOptions {
  /** Electron `appData` path holding the optional issuer override file. */
  readonly appData: string
  /** Browser opener for the identity center's authorization page. */
  readonly openBrowser: (url: string) => Promise<void>
  /**
   * Message-box presenter; production uses Electron's native
   * `dialog.showMessageBox` so no login window is built.
   * @param options - retry question with a Retry and a Cancel button.
   * @returns 0 to retry, or nonzero to stop.
   */
  readonly showRetry: (options: { readonly message: string }) => Promise<number>
  /** Deadline control and transport for tests; omitted values use production defaults. */
  readonly loginOptions?: { readonly timeoutMs?: number }
  /** File reader override for the issuer setting; tests inject failures. */
  readonly readIssuerFile?: (path: string) => Promise<string>
}

/** Human-safe failure reason of one login attempt; never contains token data. */
export function loginFailureText(failure: OidcFailure): string {
  switch (failure) {
    case 'discovery-network': return 'the identity center could not be reached'
    case 'discovery-invalid': return 'the identity center returned an invalid configuration'
    case 'issuer-mismatch': return 'the identity center reported a different issuer'
    case 'callback-aborted': return 'sign-in was cancelled'
    case 'callback-timeout': return 'sign-in timed out'
    case 'callback-server': return 'the local sign-in callback could not start'
    case 'callback-replay': return 'the sign-in response was already used'
    case 'callback-malformed': return 'the sign-in response was malformed'
    case 'browser-unavailable': return 'the system browser could not open the sign-in page'
    case 'token-network': return 'the identity center rejected the token request'
    case 'token-invalid': return 'the identity center returned an invalid token'
    case 'token-rejected': return 'the identity token failed verification'
    default: return 'unknown error'
  }
}

/** Verified identity plus the access-token expiry of one completed login. */
export interface SuiyiLoginResult extends SuiyiVerifiedIdentity {
  /** Access-token expiry in epoch milliseconds; 0 when the provider omitted it. */
  readonly expiresAt: number
  /** Verified bearer token; memory-only, never logged, persisted, or exposed to a renderer. */
  readonly accessToken: string
  /** Safe display name from the verified ID token; absent when the provider supplies none. */
  readonly displayName?: string
}

/** One login attempt as the pre-workspace window reports it. */
export type SuiyiLoginAttemptResult =
  | { readonly ok: true; readonly login: SuiyiLoginResult }
  | {
    readonly ok: false
    /** Renderer classification of the failed attempt. */
    readonly failure: SuiyiLoginFailure
    /** Human-safe reason without provider, token, or account detail. */
    readonly message: string
    /** True when the local issuer setting stopped the attempt before any browser request. */
    readonly issuer: boolean
  }

/** Inputs of one attempt; the gate adds retry prompting around it. */
export interface SuiyiLoginAttemptOptions {
  /** Shared pre-login userData holding the optional issuer override. */
  readonly appData: string
  /** Browser opener for the identity center's authorization page. */
  readonly openBrowser: (url: string) => Promise<void>
  /** Aborts discovery, the callback wait, or the token exchange. */
  readonly signal?: AbortSignal
  /** File reader override for the issuer setting; tests inject failures. */
  readonly readIssuerFile?: (path: string) => Promise<string>
  /** Deadline control and transport for tests; omitted values use production defaults. */
  readonly loginOptions?: { readonly timeoutMs?: number }
}

/**
 * Classify an identity-center failure for the login page. The renderer owns only these six
 * categories; provider-specific detail stays in the host-side message.
 * @param failure - transport failure reported by the OIDC client.
 * @returns the renderer classification.
 */
export function classifySuiyiLoginFailure(failure: OidcFailure): SuiyiLoginFailure {
  switch (failure) {
    case 'discovery-network':
    case 'token-network': return 'unreachable'
    case 'discovery-invalid':
    case 'issuer-mismatch': return 'configuration'
    case 'callback-aborted': return 'cancelled'
    case 'callback-timeout': return 'timeout'
    case 'callback-server':
    case 'browser-unavailable':
    case 'callback-replay':
    case 'callback-malformed': return 'unknown'
    case 'token-invalid':
    case 'token-rejected': return 'rejected'
  }
}

/**
 * Run one full PKCE authorization-code login without retrying. A failed attempt leaves no state
 * behind. The verified access token is returned for the Host's private channel and stays in
 * memory only; the refresh token is not retained.
 * @param options - issuer setting location, browser opener, cancellation, and test hooks.
 * @returns the verified login, or a classified failure with human-safe copy.
 */
export async function runSuiyiLoginAttempt(options: SuiyiLoginAttemptOptions): Promise<SuiyiLoginAttemptResult> {
  const issuerResolution = await resolveSuiyiOidcIssuer(options.appData, options.readIssuerFile)
  if (!issuerResolution.ok) {
    return { ok: false, failure: 'configuration', message: `${issuerResolution.reason}.`, issuer: true }
  }
  if (options.signal?.aborted === true) {
    return { ok: false, failure: 'cancelled', message: 'sign-in was cancelled', issuer: false }
  }
  const login = await runAuthorizationCodeLogin({
    issuer: issuerResolution.issuer,
    clientId: 'suiyi-desktop',
    openBrowser: options.openBrowser,
    ...(options.loginOptions?.timeoutMs === undefined ? {} : { timeoutMs: options.loginOptions.timeoutMs }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
  if (login.ok) {
    return {
      ok: true,
      login: {
        issuer: login.identity.issuer,
        sub: login.identity.sub,
        expiresAt: login.identity.expiresAt,
        accessToken: login.identity.accessToken,
        ...(login.identity.name === undefined ? {} : { displayName: login.identity.name }),
      },
    }
  }
  return { ok: false, failure: classifySuiyiLoginFailure(login.failure), message: loginFailureText(login.failure), issuer: false }
}

/**
 * Run interactive Suiyi logins until one succeeds or the user stops retrying.
 * Every attempt is a full PKCE authorization-code login with ID token verification; a failed
 * attempt leaves no state behind. The verified identity, expiry, and access token reach the
 * caller; the access token must stay in memory and never be logged or persisted.
 * @param options - provider transport and dialog hooks.
 * @returns the verified login, or undefined when the user declined to retry.
 */
export async function runSuiyiLoginGate(options: LoginGateOptions): Promise<SuiyiLoginResult | undefined> {
  while (true) {
    const attempt = await runSuiyiLoginAttempt(options)
    if (attempt.ok) return attempt.login
    const retry = await options.showRetry({
      message: attempt.issuer
        ? `${attempt.message} Try again?`
        : LOGIN_GATE_COPY.retryPrompt.replace('{reason}', attempt.message),
    })
    if (retry !== 0) return undefined
  }
}

/** Expiry watchdog inputs; unit-testable scheduling facts. */
export interface SuiyiSessionDeadline {
  /** Access-token expiry in epoch milliseconds from the verified login. */
  readonly expiresAt: number
  /** Current clock reading in epoch milliseconds. */
  readonly now: number
}

/**
 * Compute the re-login deadline at token expiry, capped at 24 hours.
 * Signature verification's clock tolerance must not extend Host access.
 * @param session - expiry facts of the verified login.
 * @returns epoch milliseconds when the application must ask for re-login.
 */
export function suiyiSessionDeadline(session: SuiyiSessionDeadline): number {
  // Clock tolerance applies only when checking the signed ID token, never when
  // deciding whether an access token may continue to authorize a running Host.
  return Math.min(session.expiresAt, session.now + 24 * 60 * 60 * 1000)
}

/**
 * Whether a session clock reading is still within the login window.
 * @param deadline - computed by {@link suiyiSessionDeadline}.
 * @param now - current clock reading in epoch milliseconds.
 * @returns true while the session may continue.
 */
export function suiyiSessionActive(deadline: number, now: number): boolean {
  return now < deadline
}

/** Verified login facts the main process needs after the gate opens. */
export interface SuiyiLoginSession {
  readonly identity: SuiyiVerifiedIdentity
  /** Re-login deadline in epoch milliseconds computed from the token expiry. */
  readonly deadline: number
  /**
   * Verified bearer token for user-scoped upstream APIs. The main process keeps it in memory and
   * hands it to the Host through the private IPC channel; it never reaches a renderer, log, argv,
   * environment variable, or file.
   */
  readonly accessToken: string
  /** Safe display name carried from the verified ID token; never an email or username. */
  readonly displayName?: string
}

/**
 * Shape the gate's raw login outcome into the main-process session record. The refresh token is
 * dropped; the access token is retained for the Host's private channel and must not be logged,
 * persisted, or passed to a renderer.
 * @param identity - verified identity from the completed login.
 * @param now - current clock reading in epoch milliseconds.
 */
export function suiyiLoginSession(identity: OidcIdentity | SuiyiLoginResult, now: number): SuiyiLoginSession {
  const displayName = ('name' in identity ? identity.name : undefined)
    ?? ('displayName' in identity ? identity.displayName : undefined)
  return { identity: { issuer: identity.issuer, sub: identity.sub },
    deadline: suiyiSessionDeadline({ expiresAt: identity.expiresAt, now }),
    accessToken: identity.accessToken,
    ...(displayName === undefined ? {} : { displayName }) }
}

/**
 * Copy of the lock screen shown when a verified login expires. The window
 * carrying it never displays workspace content.
 */
export const SESSION_LOCK_COPY = {
  /** Re-login loop title, shared with the login gate. */
  title: LOGIN_GATE_COPY.title,
  /** Why the session stopped; never contains token data. */
  expired: 'Your session expired. Sign in again to continue.',
  /** Shown after a failed or cancelled re-login; the application stays locked. */
  locked: 'Suiyi is locked. Sign in to continue.',
  cleanupFailed: 'The previous session could not be stopped safely. Restart Suiyi to sign in again.',
  /** The only remaining action while locked. */
  signIn: 'Sign in',
} as const

/** Effects a locked Suiyi application needs; all are observable in tests. */
export interface SuiyiSessionLockEffects {
  /** Synchronously deny workspace access and hide or destroy windows; resolve after UI cleanup. */
  readonly closeWorkspace: () => Promise<void>
  /** Stop the Host child and its IPC so an expired identity keeps no live session. */
  readonly stopHost: () => Promise<void>
  /** Chromium storage and cache reset before another identity's Host may start. */
  readonly clearBrowserStorage: () => Promise<void>
  /** Report an incomplete teardown without allowing another login. */
  readonly reportLockFailure?: () => Promise<void>
  /** Present the lock dialog; resolves with 0 to sign in again. */
  readonly showLock: (options: { readonly message: string }) => Promise<number>
  /** Open the identity center's authorization page. */
  readonly openBrowser: (url: string) => Promise<void>
}

/** Scheduling surface so tests drive the deadline with a fake clock. */
export interface SuiyiSessionTimer {
  /** Schedule `onExpiry` at `delayMs`; replaces any earlier schedule. */
  schedule(delayMs: number, onExpiry: () => void): void
  cancel(): void
}

/** Production timer; the handle never holds the process alive. */
export function suiyiSessionTimer(): SuiyiSessionTimer {
  let handle: NodeJS.Timeout | undefined
  return {
    schedule(delayMs: number, onExpiry: () => void) {
      if (handle !== undefined) clearTimeout(handle)
      handle = setTimeout(onExpiry, Math.max(delayMs, 0))
      handle.unref()
    },
    cancel() {
      if (handle !== undefined) clearTimeout(handle)
      handle = undefined
    },
  }
}

export interface SuiyiSessionWatchOptions {
  /** Session facts of the verified login the application runs under. */
  readonly session: SuiyiLoginSession
  readonly effects: SuiyiSessionLockEffects
  readonly timer: SuiyiSessionTimer
  /** Re-login gate; a different identity fails until storage is safely reset. */
  readonly login: () => Promise<SuiyiLoginResult | undefined>
  /** Notified once a re-login verified the same identity again. */
  readonly onRelogin?: (session: SuiyiLoginSession) => Promise<void> | void
  /** Clock reading, epoch milliseconds; defaults to the real clock. */
  readonly now?: () => number
}

/**
 * Own one verified session's expiry. The first expiry locks the application —
 * windows gone, Host stopped, browser storage cleared — and starts a re-login
 * loop that never quits the process: every outcome leaves the application
 * locked until the same identity signs in again. A different identity is
 * rejected with the lock held, because resetting per-user storage in place
 * cannot be made safe without a process restart. Repeated expiry callbacks
 * are idempotent; one lock at a time exists.
 * @param options - session facts, effects, timer, and re-login transport.
 * @returns watcher controlling this session; `refresh` starts a new session.
 */
export function watchSuiyiSession(options: SuiyiSessionWatchOptions): {
  readonly refresh: (session: SuiyiLoginSession) => void
  readonly cancel: () => void
  /** Revoke an expired session immediately, even when the timer was delayed. */
  readonly expire: () => void
  /** Re-present the lock dialog while locked; a no-op once unlocked. */
  readonly promptWhileLocked: () => void
} {
  const now = options.now ?? Date.now
  let session = options.session
  let locked = false
  let cancelled = false
  const isCancelled = (): boolean => cancelled
  let cleanupComplete = false
  let prompting: Promise<void> | undefined
  const promptLogin = async (): Promise<void> => {
    let message: string = SESSION_LOCK_COPY.expired
    while (locked && !isCancelled()) {
      const choice = await options.effects.showLock({ message })
      if (isCancelled() || choice !== 0) return
      const login = await options.login()
      if (isCancelled()) return
      message = SESSION_LOCK_COPY.locked
      if (login === undefined || login.issuer !== session.identity.issuer || login.sub !== session.identity.sub) {
        // No account switch while this process owns another account's storage.
        continue
      }
      const next = suiyiLoginSession(login, now())
      if (next.deadline <= now()) continue
      try {
        await options.onRelogin?.(next)
      } catch (error) {
        console.error('Suiyi session could not resume; keeping the workspace locked', error)
        continue
      }
      if (isCancelled()) return
      session = next
      locked = false
      schedule()
      return
    }
  }
  const requestLogin = (): void => {
    if (!locked || !cleanupComplete || cancelled || prompting !== undefined) return
    const current = promptLogin().catch((error: unknown) => {
      console.error('Suiyi login prompt failed; the workspace remains locked', error)
    }).finally(() => { if (prompting === current) prompting = undefined })
    prompting = current
  }
  const onExpiry = (): void => {
    if (locked || cancelled) return
    locked = true
    options.timer.cancel()
    void (async () => {
      // Window revocation starts synchronously; pending UI cleanup cannot delay Host stop.
      const cleanup = async (effect: () => Promise<void>): Promise<boolean> => {
        try { await effect() } catch (error) {
          console.error('Suiyi session cleanup failed; the workspace remains locked', error)
          return false
        }
        return true
      }
      const workspace = cleanup(options.effects.closeWorkspace)
      const host = cleanup(options.effects.stopHost).then(async (stopped) => {
        const cleared = await cleanup(options.effects.clearBrowserStorage)
        return stopped && cleared
      })
      const results = await Promise.all([workspace, host])
      if (results.includes(false)) {
        try { await options.effects.reportLockFailure?.() }
        catch (reportError) { console.error('Suiyi lock failure could not be displayed', reportError) }
        return
      }
      cleanupComplete = true
      requestLogin()
    })()
  }
  const schedule = (): void => { options.timer.schedule(Math.max(session.deadline - now(), 0), onExpiry) }
  schedule()
  return {
    refresh(next: SuiyiLoginSession) {
      if (locked || cancelled) return
      session = next
      schedule()
    },
    cancel() { cancelled = true; options.timer.cancel() },
    expire: onExpiry,
    promptWhileLocked() { requestLogin() },
  }
}
