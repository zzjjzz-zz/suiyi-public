/** Suiyi login gate: fail-closed startup, user-scoped storage, and expiry. */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOGIN_GATE_COPY,
  SESSION_LOCK_COPY,
  loginFailureText,
  runSuiyiLoginGate,
  suiyiLoginSession,
  suiyiSessionActive,
  suiyiSessionDeadline,
  suiyiSessionTimer,
  watchSuiyiSession,
  type SuiyiLoginResult,
  type SuiyiSessionTimer,
} from '../src/keycloak/login-gate.ts'
import {
  applySuiyiUserElectronStorage,
  suiyiUserHostEnvironment,
  suiyiUserPaths,
} from '../src/paths.ts'

const ISSUER = 'https://sso.example.test/realms/identity'
const ALICE = { issuer: ISSUER, sub: 'f1c0ffee-1234-4abc-9def-567890abcdef' }
const BOB = { issuer: ISSUER, sub: '0badcafe-4321-4fed-cba-9876543210fe' }

it('loginFailureText maps every failure to nonempty human-safe copy', () => {
  for (const failure of ['discovery-network', 'discovery-invalid', 'issuer-mismatch', 'callback-aborted',
    'callback-timeout', 'callback-replay', 'callback-malformed', 'token-network', 'token-invalid', 'token-rejected'] as const) {
    const text = loginFailureText(failure)
    expect(text.length).toBeGreaterThan(0)
    // The mapping is total: no failure code falls into generic copy.
    expect(text).not.toBe('unknown error')
  }
})

it('the gate returns undefined without opening the browser when the issuer override is unreadable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-gate-cancel-'))
  const openBrowser = vi.fn(async () => {})
  const showRetry = vi.fn(async () => 1)
  try {
    const result = await runSuiyiLoginGate({
      appData: root,
      openBrowser,
      showRetry,
      readIssuerFile: async () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) },
    })
    expect(result).toBeUndefined()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(showRetry).toHaveBeenCalledTimes(1)
    // Failing closed leaves no user directory behind.
    expect(existsSync(join(root, 'Suiyi', 'users'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('the gate retries a failed login when the user chooses retry, then stops on cancel', async () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-gate-retry-'))
  try {
    // The override points at an issuer whose discovery dead-ends on loopback:
    // no real network is touched, and each attempt fails at discovery.
    writeFileSync(join(root, 'suiyi-oidc-issuer.json'), JSON.stringify({ issuer: 'https://127.0.0.1:9/realms/identity' }))
    const openBrowser = vi.fn(async () => { throw new Error('never reached') })
    let prompts = 0
    const result = await runSuiyiLoginGate({
      appData: root,
      openBrowser,
      showRetry: async ({ message }) => {
        prompts++
        expect(message).toContain('could not be reached')
        return prompts < 2 ? 0 : 1
      },
      loginOptions: { timeoutMs: 200 },
    })
    expect(result).toBeUndefined()
    expect(prompts).toBe(2)
    expect(openBrowser).not.toHaveBeenCalled()
    expect(existsSync(join(root, 'Suiyi', 'users'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('the gate surfaces an unreadable issuer override as a retryable failure naming the file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-gate-issuer-'))
  const showRetry = vi.fn(async ({ message }: { message: string }) => {
    expect(message).toContain('suiyi-oidc-issuer.json')
    return 1
  })
  try {
    const result = await runSuiyiLoginGate({
      appData: root,
      openBrowser: vi.fn(),
      showRetry,
      readIssuerFile: async () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) },
    })
    expect(result).toBeUndefined()
    expect(showRetry).toHaveBeenCalledTimes(1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('session deadline never outlives the token, caps long windows, and expires at the boundary', () => {
  const now = 1_000_000_000_000
  expect(suiyiSessionDeadline({ expiresAt: now + 300_000, now })).toBe(now + 300_000)
  // A very long token is capped so an unbounded session cannot outlive a day.
  expect(suiyiSessionDeadline({ expiresAt: now + 10 * 24 * 60 * 60 * 1000, now })).toBe(now + 24 * 60 * 60 * 1000)
  // An absent or expired access token cannot extend an authenticated Host.
  expect(suiyiSessionDeadline({ expiresAt: 0, now })).toBe(0)
  expect(suiyiSessionDeadline({ expiresAt: now - 60_000, now })).toBe(now - 60_000)
  const deadline = suiyiSessionDeadline({ expiresAt: now + 300_000, now })
  expect(suiyiSessionActive(deadline, now + 60_000)).toBe(true)
  expect(suiyiSessionActive(deadline, deadline)).toBe(false)
  expect(suiyiSessionActive(deadline, deadline + 1)).toBe(false)
})

it('user-scoped Electron app data leaves the pre-ready Chromium storage directory intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-electron-'))
  try {
    const applied = new Map<string, string>()
    const application = {
      getPath: (name: 'appData' | 'userData') => name === 'appData' ? root : join(root, 'Suiyi', 'electron'),
      setPath: (name: 'userData' | 'sessionData', path: string) => { applied.set(name, path) },
    }
    const paths = applySuiyiUserElectronStorage(application, root, ALICE)
    const expected = suiyiUserPaths(root, ALICE)
    expect(applied.get('userData')).toBe(paths.userData)
    expect(applied.has('sessionData')).toBe(false)
    // The switch left the shared pre-login roots, not just added new ones.
    expect(applied.get('userData')).not.toBe(join(root, 'Suiyi', 'electron'))
    for (const path of [paths.userData, paths.sessionData, paths.home, paths.agents]) {
      expect(existsSync(path)).toBe(true)
    }
    expect(paths.home).toBe(expected.home)
    // Distinct users never share Electron storage.
    const bob = applySuiyiUserElectronStorage(application, root, BOB)
    expect(bob.userData).not.toBe(paths.userData)
    expect(bob.sessionData).not.toBe(paths.sessionData)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('user-scoped Electron storage refuses a link planted at the user root without writing through it', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-electron-link-'))
  try {
    const upstream = join(root, 'upstream')
    mkdirSync(upstream, { recursive: true })
    writeFileSync(join(upstream, 'session'), 'preserved')
    const aliceHash = createHash('sha256').update(`${ISSUER}\n${ALICE.sub}`).digest('hex')
    const aliceRoot = join(root, 'Suiyi', 'users', aliceHash)
    mkdirSync(join(root, 'Suiyi', 'users'), { recursive: true })
    symlinkSync(upstream, aliceRoot, 'junction')
    expect(() => applySuiyiUserElectronStorage({
      getPath: (name: 'appData' | 'userData') => name === 'appData' ? root : join(root, 'Suiyi', 'electron'),
      setPath: () => {},
    }, root, ALICE)).toThrow(/link or junction/)
    // Nothing was created through the link; the target is untouched.
    expect(readFileSync(join(upstream, 'session'), 'utf8')).toBe('preserved')
    expect(existsSync(join(upstream, 'electron'))).toBe(false)
    expect(existsSync(join(upstream, 'dsh-home'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('the host environment partitions model credentials per user and inherits no DSH overrides', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-gate-env-'))
  try {
    const environment = { PATH: 'p', DSH_HOME: 'inherited', DSH_CONFIG: 'inherited.yml' }
    const alice = suiyiUserHostEnvironment(environment, root, ALICE)
    const bob = suiyiUserHostEnvironment(environment, root, BOB)
    expect(alice.DSH_HOME).toBe(suiyiUserPaths(root, ALICE).home)
    expect(alice.DSH_CONFIG).toBeUndefined()
    expect(alice.DSH_HOME).not.toBe(bob.DSH_HOME)
    expect(alice.DSH_AGENTS_HOME).not.toBe(bob.DSH_AGENTS_HOME)
    // Model credential files resolve under each user's home, never a shared root.
    expect(join(suiyiUserPaths(root, ALICE).home, '.credentials.yaml'))
      .not.toBe(join(suiyiUserPaths(root, BOB).home, '.credentials.yaml'))
    expect(alice.DSH_HOME).not.toContain(join(root, 'Suiyi', 'dsh-home'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('dialog copy states the login requirement and carries a replaceable reason', () => {
  expect(LOGIN_GATE_COPY.cancelPrompt).toContain('requires a signed-in account')
  expect(LOGIN_GATE_COPY.retryPrompt).toContain('{reason}')
  expect(LOGIN_GATE_COPY.title).toBe('Suiyi login')
})

describe('session expiry watcher', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000_000_000) })
  afterEach(() => vi.useRealTimers())

  /** Observable effects, an injectable clock, and a stub timer for one watcher. */
  function fixture(expiresAt = Date.now() + 300_000) {
    let clock = Date.now()
    let nextLogin: SuiyiLoginResult | undefined
    const calls = { closed: 0, stopped: 0, cleared: 0, locks: [] as string[], logins: 0, resumes: [] as number[] }
    const schedule = vi.fn<(delayMs: number, onExpiry: () => void) => void>()
    const timer: SuiyiSessionTimer = { schedule, cancel: vi.fn() }
    // The lock recording wraps the mock so once-style return values do not
    // detach the observation from the dialog the watcher actually presents.
    const lockReturn = vi.fn<() => number>().mockReturnValue(0)
    const effects = {
      closeWorkspace: vi.fn(async () => { calls.closed++ }),
      stopHost: vi.fn(async () => { calls.stopped++ }),
      clearBrowserStorage: vi.fn(async () => { calls.cleared++ }),
      reportLockFailure: vi.fn(async () => {}),
      showLock: vi.fn(async ({ message }: { message: string }) => { calls.locks.push(message); return lockReturn() }),
      openBrowser: vi.fn(async () => {}),
    }
    const watcher = watchSuiyiSession({
      session: suiyiLoginSession({ issuer: ISSUER, sub: ALICE.sub, expiresAt }, clock),
      effects,
      timer,
      now: () => clock,
      login: async () => { calls.logins++; return nextLogin },
      onRelogin: (session) => { calls.resumes.push(session.deadline) },
    })
    const drain = async () => { await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(0) }
    return {
      watcher, effects, calls, schedule, drain, lockReturn,
      get nextLogin() { return nextLogin }, set nextLogin(value: SuiyiLoginResult | undefined) { nextLogin = value },
      set clock(value: number) { clock = value },
    }
  }

  it('a login expired during startup locks before it can reopen a workspace', async () => {
    const test = fixture(Date.now() - 1_000)
    test.lockReturn.mockReturnValue(1)
    expect(test.schedule).toHaveBeenCalledWith(0, expect.any(Function))
    test.schedule.mock.calls[0]![1]()
    await test.drain()
    expect(test.calls.closed).toBe(1)
    expect(test.calls.stopped).toBe(1)
    expect(test.calls.cleared).toBe(1)
    expect(test.calls.logins).toBe(0)
    expect(test.calls.resumes).toEqual([])
    expect(test.calls.locks).toEqual([SESSION_LOCK_COPY.expired])
  })

  it('expiry locks without quitting: windows close, the Host stops, storage clears, and the same user resumes', async () => {
    const test = fixture()
    test.nextLogin = { issuer: ISSUER, sub: ALICE.sub, expiresAt: Date.now() + 300_000 }
    test.schedule.mock.calls[0]![1]()
    await test.drain()
    // Lock order: windows die first, then the Host, then browser storage, and
    // only then the lock dialog offers re-login. The process is never asked to quit.
    expect(test.calls.closed).toBe(1)
    expect(test.calls.stopped).toBe(1)
    expect(test.calls.cleared).toBe(1)
    expect(test.calls.logins).toBe(1)
    expect(test.calls.locks).toEqual([SESSION_LOCK_COPY.expired])
    expect(test.calls.resumes.length).toBe(1)
    // The fresh session scheduled its own expiry on the same timer.
    expect(test.schedule.mock.calls.length).toBe(2)
  })

  it('a cancelled re-login keeps the application locked without spinning, and sign-in re-enters', async () => {
    const test = fixture()
    test.lockReturn.mockReturnValueOnce(1).mockReturnValue(0)
    test.nextLogin = { issuer: ISSUER, sub: ALICE.sub, expiresAt: Date.now() + 300_000 }
    test.schedule.mock.calls[0]![1]()
    await test.drain()
    // Cancel exits the re-login loop; nothing runs in the background and the
    // lock stays: no login attempt, no resume, exactly one lock dialog so far.
    expect(test.calls.logins).toBe(0)
    expect(test.calls.resumes.length).toBe(0)
    expect(test.calls.closed).toBe(1)
    // The locked application still offers sign-in on demand.
    test.watcher.promptWhileLocked()
    await test.drain()
    expect(test.calls.logins).toBe(1)
    expect(test.calls.resumes.length).toBe(1)
  })

  it('a failed re-login returns to the lock dialog; a different identity never resumes', async () => {
    const test = fixture()
    // First presentation: sign in. After the failed attempt: cancel, leaving the lock standing.
    test.lockReturn.mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValue(0)
    test.nextLogin = undefined
    test.schedule.mock.calls[0]![1]()
    await test.drain()
    // Login fails (the user stopped at the identity center); the dialog now
    // reports the ongoing lock, and the user leaves it open by cancelling.
    expect(test.calls.logins).toBe(1)
    expect(test.calls.resumes.length).toBe(0)
    expect(test.calls.locks).toEqual([SESSION_LOCK_COPY.expired, SESSION_LOCK_COPY.locked])
    // Still locked: the workspace was closed exactly once and nothing resumed.
    expect(test.calls.closed).toBe(1)
    expect(test.calls.stopped).toBe(1)
    // A later explicit sign-in as Bob verifies but never resumes Alice's storage.
    // The user then declines further attempts, so no re-login storm can run.
    test.nextLogin = { issuer: ISSUER, sub: BOB.sub, expiresAt: Date.now() + 300_000 }
    test.lockReturn.mockReturnValueOnce(0).mockReturnValueOnce(1)
    test.watcher.promptWhileLocked()
    await test.drain()
    expect(test.calls.logins).toBe(2)
    expect(test.calls.resumes.length).toBe(0)
    // The same Alice finally re-verifies and resumes her own workspace.
    test.nextLogin = { issuer: ISSUER, sub: ALICE.sub, expiresAt: Date.now() + 300_000 }
    test.watcher.promptWhileLocked()
    await test.drain()
    expect(test.calls.logins).toBe(3)
    expect(test.calls.resumes.length).toBe(1)
    expect(test.calls.closed).toBe(1)
    // Bob was never resumed; only Alice's deadline reached the application.
    expect(test.calls.resumes).toEqual([test.calls.resumes[0]!])
  })

  it('repeated expiry callbacks lock only once', async () => {
    const test = fixture()
    test.nextLogin = { issuer: ISSUER, sub: ALICE.sub, expiresAt: Date.now() + 300_000 }
    test.schedule.mock.calls[0]![1]()
    test.schedule.mock.calls[0]![1]()
    await test.drain()
    expect(test.calls.closed).toBe(1)
    expect(test.calls.stopped).toBe(1)
  })

  it('a failed Host stop reports the failure and never resumes an untrusted session', async () => {
    const test = fixture()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      test.effects.stopHost.mockRejectedValueOnce(new Error('child still running'))
      test.nextLogin = { issuer: ISSUER, sub: ALICE.sub, expiresAt: Date.now() + 300_000 }
      test.schedule.mock.calls[0]![1]()
      await test.drain()
      expect(test.calls.closed).toBe(1)
      expect(test.effects.reportLockFailure).toHaveBeenCalledOnce()
      // Storage cleanup still runs when Host shutdown fails; no login is allowed.
      expect(test.calls.cleared).toBe(1)
      expect(test.calls.logins).toBe(0)
      test.watcher.promptWhileLocked()
      await test.drain()
      expect(test.calls.resumes).toEqual([])
    } finally { log.mockRestore() }
  })

  it('a failed window cleanup still attempts Host stop and storage clearing', async () => {
    const test = fixture()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      test.effects.closeWorkspace.mockRejectedValueOnce(new Error('view cleanup failed'))
      test.nextLogin = { issuer: ISSUER, sub: ALICE.sub, expiresAt: Date.now() + 300_000 }
      test.schedule.mock.calls[0]![1]()
      await test.drain()
      expect(test.effects.stopHost).toHaveBeenCalledOnce()
      expect(test.effects.clearBrowserStorage).toHaveBeenCalledOnce()
      expect(test.effects.reportLockFailure).toHaveBeenCalledOnce()
      expect(test.calls.resumes).toEqual([])
    } finally { log.mockRestore() }
  })

  it('stops the Host while workspace cleanup is pending and refuses re-login until it settles', async () => {
    const test = fixture()
    let finish!: () => void
    test.effects.closeWorkspace.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    test.lockReturn.mockReturnValue(1)
    test.schedule.mock.calls[0]![1]()
    await test.drain()
    expect(test.effects.stopHost).toHaveBeenCalledOnce()
    expect(test.effects.clearBrowserStorage).toHaveBeenCalledOnce()
    test.watcher.promptWhileLocked()
    await test.drain()
    expect(test.effects.showLock).not.toHaveBeenCalled()
    expect(test.calls.resumes).toEqual([])
    finish()
    await test.drain()
    expect(test.effects.showLock).toHaveBeenCalledOnce()
    expect(test.calls.logins).toBe(0)
    expect(test.calls.resumes).toEqual([])
    test.watcher.cancel()
  })

  it('the production timer schedules and replaces one expiry timeout', () => {
    const timer = suiyiSessionTimer()
    const first = vi.fn()
    timer.schedule(5_000, first)
    timer.schedule(50_000, vi.fn())
    vi.advanceTimersByTime(10_000)
    expect(first).not.toHaveBeenCalled()
    timer.cancel()
  })
})
