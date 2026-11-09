/** Pre-workspace Suiyi login window: sandboxing, state pushes, cancellation, and settlement. */
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WELCOME_IPC } from '../src/welcome-api.ts'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { SuiyiLoginAttemptHooks, SuiyiLoginWindowOptions } from '../src/suiyi-login-window.ts'
import type { SuiyiLoginAttemptResult, SuiyiLoginResult } from '../src/keycloak/login-gate.ts'

interface FakeWindow {
  readonly options: Record<string, unknown>
  readonly urls: string[]
  readonly webContents: {
    readonly mainFrame: { url: string }
    send: ReturnType<typeof vi.fn>
    emit(event: string, ...args: unknown[]): void
    setWindowOpenHandler: (...args: unknown[]) => unknown
    on(event: string, listener: (...args: unknown[]) => void): void
  }
  destroyed: boolean
  shown: boolean
  focused: boolean
  destroy(): void
}

const state = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  written: [] as string[],
}))

vi.mock('electron', () => {
  class Emitter {
    private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    on(event: string, listener: (...args: unknown[]) => void): this {
      const listeners = this.listeners.get(event) ?? new Set()
      listeners.add(listener)
      this.listeners.set(event, listeners)
      return this
    }
    once(event: string, listener: (...args: unknown[]) => void): this {
      const wrapper = (...args: unknown[]): void => {
        this.listeners.get(event)?.delete(wrapper)
        listener(...args)
      }
      return this.on(event, wrapper)
    }
    emit(event: string, ...args: unknown[]): void {
      for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args)
    }
  }
  class FakeBrowserWindow extends Emitter {
    readonly options: Record<string, unknown>
    readonly urls: string[] = []
    readonly webContents = Object.assign(new Emitter(), {
      mainFrame: { url: '' },
      setWindowOpenHandler: vi.fn(),
      send: vi.fn(),
    })
    destroyed = false
    shown = false
    focused = false
    constructor(options: Record<string, unknown>) {
      super()
      this.options = options
      state.windows.push(this)
    }
    async loadFile(path: string): Promise<void> { this.urls.push(path) }
    isDestroyed(): boolean { return this.destroyed }
    show(): void { this.shown = true }
    focus(): void { this.focused = true }
    destroy(): void {
      if (this.destroyed) return
      this.destroyed = true
      this.emit('closed')
    }
  }
  return {
    app: { getAppPath: () => '/app' },
    BrowserWindow: FakeBrowserWindow,
    nativeTheme: { shouldUseDarkColors: false },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1440, height: 1000 } }) },
    clipboard: { writeText: vi.fn(async (text: string) => { state.written.push(text) }) },
    ipcMain: {
      handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        state.handlers.set(channel, handler)
      },
      removeHandler: (channel: string) => { state.handlers.delete(channel) },
    },
  }
})

import { openSuiyiLoginWindow, openSuiyiWelcomeWindow, suiyiLoginWindowOptions } from '../src/suiyi-login-window.ts'

const loginResult: SuiyiLoginResult = {
  issuer: 'https://identity.example.test/realms/test',
  sub: 'alice',
  expiresAt: 2_000_000_000_000,
  // Virtual test value; not a real credential.
  accessToken: 'test-access-token',
}

/** Controllable attempt transport; each call records its hooks and settles on demand. */
function attemptFixture() {
  const calls: SuiyiLoginAttemptHooks[] = []
  const pending: PromiseWithResolvers<SuiyiLoginAttemptResult>[] = []
  const attempt = vi.fn((hooks: SuiyiLoginAttemptHooks): Promise<SuiyiLoginAttemptResult> => {
    calls.push(hooks)
    const settling = Promise.withResolvers<SuiyiLoginAttemptResult>()
    pending.push(settling)
    return settling.promise
  })
  return { attempt, calls, pending }
}

function options(overrides: Partial<SuiyiLoginWindowOptions> = {}): SuiyiLoginWindowOptions {
  return {
    locale: resolveDesktopLocale('zh-CN'),
    attempt: vi.fn(async () => ({ ok: false as const, failure: 'unknown' as const, message: 'failed', issuer: false })),
    onCancel: vi.fn(),
    ...overrides,
  }
}

/** The window's own web contents are the only accepted IPC sender. */
function senderOf() {
  const window = state.windows.at(-1)!
  return { sender: window.webContents, senderFrame: window.webContents.mainFrame }
}

async function invoke(channel: string, event: unknown = senderOf()): Promise<unknown> {
  return await state.handlers.get(channel)!(event)
}

beforeEach(() => {
  state.windows.length = 0
  state.handlers.clear()
  state.written.length = 0
})

afterEach(() => {
  for (const window of [...state.windows]) window.destroy()
  vi.clearAllMocks()
})

describe('Suiyi login window', () => {
  it('loads the shared welcome renderer in a resizable sandboxed window', async () => {
    const login = await openSuiyiLoginWindow(options())
    const window = state.windows[0]!
    expect(window.urls).toEqual([join('/app', 'renderer', 'welcome.html')])
    expect(window.shown).toBe(true)
    expect(window.focused).toBe(true)
    expect(window.options).toMatchObject({
      width: 1180,
      height: 860,
      minWidth: 360,
      minHeight: 480,
      useContentSize: true,
      resizable: true,
      maximizable: true,
      fullscreenable: true,
      show: false,
      title: resolveDesktopLocale('zh-CN').messages.suiyiLoginDocumentTitle,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
    expect(window.options.webPreferences).toMatchObject({
      additionalArguments: ['--dsh-welcome-locale=zh-CN'],
    })
    expect(window.options.webPreferences).not.toHaveProperty('partition')
    login.close()
  })

  it.each([
    [1440, 1000, 1180, 860],
    [1280, 800, 1180, 752],
    [390, 844, 360, 796],
    [1920, 1080, 1180, 860],
  ])('clamps the initial content size to a %d x %d work area', (screenWidth, screenHeight, width, height) => {
    const options = suiyiLoginWindowOptions(resolveDesktopLocale('en'), {
      width: screenWidth, height: screenHeight,
    })
    expect(options).toMatchObject({ width, height, minWidth: 360, minHeight: 480 })
  })

  it('starts one attempt, pushes the authorization address, and copies it', async () => {
    const fixture = attemptFixture()
    const login = await openSuiyiLoginWindow(options({ attempt: fixture.attempt }))
    const window = state.windows[0]!
    const running = invoke(WELCOME_IPC.suiyiStart)
    expect(window.webContents.send).toHaveBeenLastCalledWith(WELCOME_IPC.suiyiState, { phase: 'working' })
    expect(fixture.attempt).toHaveBeenCalledOnce()
    await expect(invoke(WELCOME_IPC.suiyiStart)).resolves.toBeUndefined()
    expect(fixture.attempt).toHaveBeenCalledOnce()
    fixture.calls[0]!.onAuthorizeUrl('https://identity.example.test/authorize?state=one')
    expect(window.webContents.send).toHaveBeenLastCalledWith(WELCOME_IPC.suiyiState, {
      phase: 'working', authorizeUrl: 'https://identity.example.test/authorize?state=one',
    })
    await invoke(WELCOME_IPC.suiyiCopyLink)
    expect(state.written).toEqual(['https://identity.example.test/authorize?state=one'])
    fixture.pending[0]!.resolve({ ok: true, login: loginResult })
    await running
    expect(window.webContents.send).toHaveBeenLastCalledWith(WELCOME_IPC.suiyiState, { phase: 'success' })
    await expect(login.result).resolves.toEqual(loginResult)
    login.close()
  })

  it('rejects a copy request before any authorization address exists', async () => {
    const login = await openSuiyiLoginWindow(options())
    await expect(invoke(WELCOME_IPC.suiyiCopyLink)).rejects.toThrow('no active authorization link')
    login.close()
  })

  it('reports a classified failure and starts a fresh attempt on retry', async () => {
    const fixture = attemptFixture()
    const login = await openSuiyiLoginWindow(options({ attempt: fixture.attempt }))
    const window = state.windows[0]!
    const first = invoke(WELCOME_IPC.suiyiStart)
    fixture.pending[0]!.resolve({ ok: false, failure: 'timeout', message: 'sign-in timed out', issuer: false })
    await first
    expect(window.webContents.send).toHaveBeenLastCalledWith(WELCOME_IPC.suiyiState, { phase: 'error', failure: 'timeout' })
    const second = invoke(WELCOME_IPC.suiyiStart)
    expect(fixture.attempt).toHaveBeenCalledTimes(2)
    fixture.pending[1]!.resolve({ ok: true, login: loginResult })
    await second
    await expect(login.result).resolves.toEqual(loginResult)
    login.close()
  })

  it('cancels the active attempt, returns to the entry, and ignores its late result', async () => {
    const fixture = attemptFixture()
    const login = await openSuiyiLoginWindow(options({ attempt: fixture.attempt }))
    const window = state.windows[0]!
    const running = invoke(WELCOME_IPC.suiyiStart)
    await invoke(WELCOME_IPC.suiyiCancel)
    expect(fixture.calls[0]!.signal.aborted).toBe(true)
    expect(window.webContents.send).toHaveBeenLastCalledWith(WELCOME_IPC.suiyiState, { phase: 'ready' })
    fixture.pending[0]!.resolve({ ok: true, login: loginResult })
    await running
    expect(window.webContents.send).toHaveBeenLastCalledWith(WELCOME_IPC.suiyiState, { phase: 'ready' })
    expect(window.webContents.send).not.toHaveBeenCalledWith(WELCOME_IPC.suiyiState, { phase: 'success' })
    const retried = invoke(WELCOME_IPC.suiyiStart)
    expect(fixture.attempt).toHaveBeenCalledTimes(2)
    fixture.pending[1]!.resolve({ ok: true, login: loginResult })
    await retried
    login.close()
  })

  it('treats a user close as cancellation and an intentional close after success as completion', async () => {
    const onCancel = vi.fn()
    const closed = await openSuiyiLoginWindow(options({ onCancel }))
    state.windows[0]!.destroy()
    await expect(closed.result).resolves.toBeUndefined()
    expect(onCancel).toHaveBeenCalledOnce()

    const fixture = attemptFixture()
    const succeeded = await openSuiyiLoginWindow(options({ attempt: fixture.attempt, onCancel }))
    const running = invoke(WELCOME_IPC.suiyiStart)
    fixture.pending[0]!.resolve({ ok: true, login: loginResult })
    await running
    await expect(succeeded.result).resolves.toEqual(loginResult)
    succeeded.close()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(state.handlers.has(WELCOME_IPC.suiyiStart)).toBe(false)
  })

  it('aborts the active attempt when the user closes the window', async () => {
    const fixture = attemptFixture()
    const onCancel = vi.fn()
    const login = await openSuiyiLoginWindow(options({ attempt: fixture.attempt, onCancel }))
    const running = invoke(WELCOME_IPC.suiyiStart)
    state.windows[0]!.destroy()
    expect(fixture.calls[0]!.signal.aborted).toBe(true)
    fixture.pending[0]!.resolve({ ok: false, failure: 'cancelled', message: 'sign-in was cancelled', issuer: false })
    await running
    await expect(login.result).resolves.toBeUndefined()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('rejects actions from another frame', async () => {
    const login = await openSuiyiLoginWindow(options())
    const foreign = { sender: {}, senderFrame: { url: 'https://attacker.test' } }
    await expect(invoke(WELCOME_IPC.suiyiStart, foreign)).rejects.toThrow('unowned frame')
    await expect(invoke(WELCOME_IPC.suiyiCancel, foreign)).rejects.toThrow('unowned frame')
    login.close()
  })
})

describe('Authenticated Suiyi welcome', () => {
  it('exposes only return, rejects a foreign frame, and releases its handler on close', async () => {
    const window = await openSuiyiWelcomeWindow(resolveDesktopLocale('zh-CN'))
    const native = state.windows[0]!
    expect(native.shown).toBe(false)
    expect(native.options.webPreferences).toMatchObject({
      sandbox: true, nodeIntegration: false, contextIsolation: true,
      additionalArguments: ['--dsh-welcome-locale=zh-CN', '--dsh-suiyi-welcome-revisit'],
    })
    expect([...state.handlers.keys()]).toEqual([WELCOME_IPC.suiyiReturn])
    await expect(invoke(WELCOME_IPC.suiyiReturn, { sender: {}, senderFrame: {} })).rejects.toThrow('unowned frame')
    expect(window.isDestroyed()).toBe(false)
    await invoke(WELCOME_IPC.suiyiReturn)
    await new Promise<void>((resolve) => { setImmediate(resolve) })
    expect(window.isDestroyed()).toBe(true)
    expect(state.handlers.size).toBe(0)
  })

  it('can be destroyed on identity expiry without disturbing a separate login window', async () => {
    const revisit = await openSuiyiWelcomeWindow(resolveDesktopLocale('en'))
    const login = await openSuiyiLoginWindow(options())
    revisit.destroy()
    expect(state.handlers.has(WELCOME_IPC.suiyiReturn)).toBe(false)
    expect(state.handlers.has(WELCOME_IPC.suiyiStart)).toBe(true)
    login.close()
    expect(state.handlers.size).toBe(0)
  })
})
