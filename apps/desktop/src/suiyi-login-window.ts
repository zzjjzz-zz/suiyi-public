/** Visible, unprivileged Suiyi login window shown before any identity is verified. */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app, BrowserWindow, clipboard, ipcMain, nativeTheme, screen,
  type BrowserWindowConstructorOptions, type IpcMainInvokeEvent,
} from 'electron'
import type { DesktopLocale } from './locale.ts'
import { WELCOME_IPC, type SuiyiLoginView } from './welcome-api.ts'
import type { SuiyiLoginAttemptResult, SuiyiLoginResult } from './keycloak/login-gate.ts'

/** Per-attempt hooks the window supplies to the Keycloak transport. */
export interface SuiyiLoginAttemptHooks {
  /** Reports the identity-center authorization address opened for this attempt. */
  readonly onAuthorizeUrl: (url: string) => void
  /** Aborted when the user cancels the attempt or the window closes. */
  readonly signal: AbortSignal
}

/** Inputs and callbacks of one pre-workspace login window. */
export interface SuiyiLoginWindowOptions {
  /** Shell-owned localized copy; the renderer receives these dictionaries. */
  readonly locale: DesktopLocale
  /** Runs exactly one full Keycloak authorization-code attempt. */
  readonly attempt: (hooks: SuiyiLoginAttemptHooks) => Promise<SuiyiLoginAttemptResult>
  /** Invoked when the user closes the window or abandons login before it is verified. */
  readonly onCancel: () => void
}

/** Startup-facing control of the login window. */
export interface SuiyiLoginWindow {
  /** Resolves with the verified login, or undefined when the user closes the window first. */
  readonly result: Promise<SuiyiLoginResult | undefined>
  /** Close after a verified login without reporting cancellation. */
  close(): void
}

/** Preferred login window content size; the prototype two-column page needs a desktop width. */
const LOGIN_WINDOW_PREFERRED_WIDTH = 1180
/** Preferred login window content height. */
const LOGIN_WINDOW_PREFERRED_HEIGHT = 860
/** Smallest content width that still fits the 390 CSS px layout when maximized or resized. */
const LOGIN_WINDOW_MIN_WIDTH = 360
/** Smallest usable content height before the page scrolls. */
const LOGIN_WINDOW_MIN_HEIGHT = 480
/** Space kept around the window inside the display work area. */
const LOGIN_WINDOW_WORK_AREA_MARGIN = 48

/**
 * Native options for the pre-auth page. The window carries the shared welcome renderer, whose
 * Suiyi face exposes only login operations, and no partition, remote content, or Node access.
 * The preferred desktop size is clamped to the current display's work area and remains resizable,
 * maximizable, and fullscreenable so the 390 CSS px layout can be inspected in the real window.
 * @param locale - shell-owned localized copy.
 * @param workArea - display work area; defaults to the primary display's current work area.
 * @returns sandboxed window options with the Suiyi login preload.
 */
export function suiyiLoginWindowOptions(
  locale: DesktopLocale,
  workArea: { readonly width: number; readonly height: number } = screen.getPrimaryDisplay().workAreaSize,
): BrowserWindowConstructorOptions {
  const width = Math.max(LOGIN_WINDOW_MIN_WIDTH,
    Math.min(LOGIN_WINDOW_PREFERRED_WIDTH, workArea.width - LOGIN_WINDOW_WORK_AREA_MARGIN))
  const height = Math.max(LOGIN_WINDOW_MIN_HEIGHT,
    Math.min(LOGIN_WINDOW_PREFERRED_HEIGHT, workArea.height - LOGIN_WINDOW_WORK_AREA_MARGIN))
  return {
    width,
    height,
    minWidth: LOGIN_WINDOW_MIN_WIDTH,
    minHeight: LOGIN_WINDOW_MIN_HEIGHT,
    useContentSize: true,
    center: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    show: false,
    autoHideMenuBar: true,
    title: locale.messages.suiyiLoginDocumentTitle,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111318' : '#F6F7FA',
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 21, y: 21 },
    } as const : {}),
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#F5F7FB' : '#0F1115',
        height: 36,
      },
    } as const : {}),
    webPreferences: {
      preload: fileURLToPath(new URL('./preload-suiyi-login.cjs', import.meta.url)),
      additionalArguments: [`--dsh-welcome-locale=${locale.id}`],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  }
}

/**
 * Open the process's Suiyi login window and drive one-or-more Keycloak attempts until verified,
 * the user abandons the attempt, or the window closes. No Host, settings, or user-scoped storage
 * may be created before `result` resolves a verified login.
 * @param options - localized copy, one-attempt transport, and the pre-verification cancel callback.
 * @returns the controller whose `result` settles once; a failed load destroys the window first.
 */
export async function openSuiyiLoginWindow(options: SuiyiLoginWindowOptions): Promise<SuiyiLoginWindow> {
  const window = new BrowserWindow(suiyiLoginWindowOptions(options.locale))
  const result = Promise.withResolvers<SuiyiLoginResult | undefined>()
  let settled = false
  let intentionalClose = false
  let generation = 0
  let active: AbortController | undefined
  let authorizeUrl: string | undefined

  const deliver = (view: SuiyiLoginView): void => {
    if (!window.isDestroyed()) window.webContents.send(WELCOME_IPC.suiyiState, view)
  }
  const settle = (login: SuiyiLoginResult | undefined): void => {
    if (settled) return
    settled = true
    result.resolve(login)
  }
  const abortActive = (): void => {
    active?.abort()
    active = undefined
    authorizeUrl = undefined
    generation++
  }

  const handlers = [
    WELCOME_IPC.suiyiStart, WELCOME_IPC.suiyiCancel, WELCOME_IPC.suiyiCopyLink,
  ] as const
  const disposeHandlers = (): void => {
    for (const channel of handlers) ipcMain.removeHandler(channel)
  }
  const assertSender = (event: IpcMainInvokeEvent): void => {
    if (settled || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('desktop Suiyi login: rejected action from an unowned frame')
    }
  }

  async function start(): Promise<void> {
    if (settled || active !== undefined) return
    const current = generation
    authorizeUrl = undefined
    deliver({ phase: 'working' })
    const controller = new AbortController()
    active = controller
    let attempt: SuiyiLoginAttemptResult
    try {
      attempt = await options.attempt({
        signal: controller.signal,
        onAuthorizeUrl: (url) => {
          if (settled || generation !== current || active !== controller) return
          authorizeUrl = url
          deliver({ phase: 'working', authorizeUrl: url })
        },
      })
    } catch {
      attempt = { ok: false, failure: 'unknown', message: 'login failed unexpectedly', issuer: false }
    }
    if (generation !== current || active !== controller) return
    active = undefined
    if (attempt.ok) {
      deliver({ phase: 'success' })
      settle(attempt.login)
      return
    }
    authorizeUrl = undefined
    deliver({ phase: 'error', failure: attempt.failure })
  }

  function cancel(): void {
    if (settled) return
    abortActive()
    deliver({ phase: 'ready' })
  }

  async function copyLink(): Promise<void> {
    if (settled || authorizeUrl === undefined) throw new Error('desktop Suiyi login: no active authorization link')
    await clipboard.writeText(authorizeUrl)
  }

  ipcMain.handle(WELCOME_IPC.suiyiStart, async (event) => { assertSender(event); await start() })
  ipcMain.handle(WELCOME_IPC.suiyiCancel, (event) => { assertSender(event); cancel() })
  ipcMain.handle(WELCOME_IPC.suiyiCopyLink, async (event) => { assertSender(event); await copyLink() })

  window.once('closed', () => {
    disposeHandlers()
    abortActive()
    if (settled) return
    settle(undefined)
    if (!intentionalClose) options.onCancel()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  window.webContents.on('will-redirect', (event) => { event.preventDefault() })
  try {
    await window.loadFile(join(app.getAppPath(), 'renderer', 'welcome.html'))
  } catch (error) {
    disposeHandlers()
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
  if (!window.isDestroyed()) {
    window.show()
    window.focus()
  }
  return {
    result: result.promise,
    close(): void {
      intentionalClose = true
      abortActive()
      settle(undefined)
      if (!window.isDestroyed()) window.destroy()
    },
  }
}

/**
 * Open the authenticated welcome page with no authorization or credential operations.
 * @param locale - shell-owned localized copy.
 * @returns the owned window; the caller closes it when identity access ends.
 */
export async function openSuiyiWelcomeWindow(locale: DesktopLocale): Promise<BrowserWindow> {
  const options = suiyiLoginWindowOptions(locale)
  const window = new BrowserWindow({ ...options, webPreferences: {
    ...options.webPreferences,
    additionalArguments: [...(options.webPreferences?.additionalArguments ?? []), '--dsh-suiyi-welcome-revisit'],
  } })
  ipcMain.handle(WELCOME_IPC.suiyiReturn, (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('desktop Suiyi welcome: rejected action from an unowned frame')
    }
    setImmediate(() => { if (!window.isDestroyed()) window.destroy() })
  })
  window.once('closed', () => { ipcMain.removeHandler(WELCOME_IPC.suiyiReturn) })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  window.webContents.on('will-redirect', (event) => { event.preventDefault() })
  try {
    await window.loadFile(join(app.getAppPath(), 'renderer', 'welcome.html'))
  } catch (error) {
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
  return window
}
