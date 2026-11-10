/** Electron shell: desktop project ownership, custom protocol, windows, and lifecycle. */

import { installFileActions } from './file-actions.ts'
import { configurationFailure, channelSaveFailure, configurationMessage } from './update-configuration.ts'
import type { DesktopChannelState, DesktopChannelChangeResult } from '@deepseek-ai/dsh-client-ui-settings-general/types'
import { DesktopUpdateSettings } from './update-settings.ts'
import { isDesktopUpdateChannel } from './settings-file.ts'
import type { ProductEventMap, ProductEvent } from '@deepseek-ai/dsh-client-product-analytics/types'
import { SUIYI_WINDOWS_TITLEBAR_HEIGHT, WINDOWS_TITLEBAR_HEIGHT } from './windows-layout.ts'
import { desktopIdentity, isDesktopOpenUrl } from './product-identity.ts'
import { readFileSync } from 'node:fs'
import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  nativeImage,
  nativeTheme,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron'
import { resolveDesktopPaths, initializeSuiyiStorage, suiyiUserHostEnvironment, applySuiyiUserElectronStorage, suiyiUserDirectory, type SuiyiVerifiedIdentity } from './paths.ts'
import {
  runSuiyiLoginAttempt, watchSuiyiSession, suiyiLoginSession, suiyiSessionTimer, suiyiSessionDeadline,
  SESSION_LOCK_COPY, type SuiyiLoginResult, type SuiyiLoginSession,
} from './keycloak/login-gate.ts'
import { DesktopProjectManager } from './project-manager.ts'
import { DesktopHostFatalError, DesktopHostProcess, DesktopHostUncleanExitError } from './host-process.ts'
import { DesktopPlatformView, PLATFORM_IPC, platformBounds } from './platform-view.ts'
import { installDesktopFileDrag } from './file-drag.ts'
import { installDesktopDirectoryPicker } from './directory-picker.ts'
import { installMicrophonePermissions } from './microphone-permissions.ts'
import { DesktopBackendController } from './backend-controller.ts'
import {
  DESKTOP_IPC, SCHEME, assertDesktopSender,
  type DesktopSuiyiIdentityView, type DesktopSuiyiSignInResult, type DesktopUpdateState,
} from './ipc.ts'
import { readDeviceInfo } from './device-info.ts'
import { desktopUpdateReadyConfirmation, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale } from './locale.ts'
import type { DesktopMessages } from './locale.ts'
import { claimDesktopSingleInstance } from './single-instance.ts'
import { desktopUpdateChannel } from './update-channel.ts'
import { DesktopUpdateCoordinator } from './update-coordinator.ts'
import { prepareDesktopUpdateWindow } from './update-window.ts'
import { DesktopCommandManager } from './command-management.ts'
import { serveWebDocument, authenticateWebHost, forwardWebRequest, removeLegacyHostCookies } from './web-document.ts'
import { DesktopFatalRecovery } from './fatal-recovery.ts'
import { pruneCrashReports, RendererConsoleTail, writeCrashReport, type CrashReportSource } from './crash-report.ts'
import { OperationJournal } from './operation-journal.ts'
import { runOperationReportJob, type OperationReportJobResult } from './operation-report-job.ts'
import { openSuiyiLoginWindow, openSuiyiWelcomeWindow, type SuiyiLoginWindow } from './suiyi-login-window.ts'
import { openWelcomeWindow } from './welcome-window.ts'
import { WELCOME_IPC, needsWelcome, type WelcomeNotice } from './welcome-api.ts'
import { connectDesktopWelcome, type DesktopWelcomeBackend } from './welcome-backend.ts'
import { DesktopUpdateJournal } from './update-journal.ts'
import { DesktopUpdatePreparationError } from './update-error.ts'
import { DesktopUpdateSchedule, resolveDesktopUpdateScheduleConfig } from './update-schedule.ts'
import { desktopUpdateErrorSummary, presentDesktopUpdate } from './update-presentation.ts'
import { desktopErrorState } from './startup-error.ts'
import { readDesktopLoginShellEnvironment, resolveDesktopLoginShellConfig } from './login-shell-environment.ts'
import { DesktopMandatoryUpdatePolicy, resolveDesktopPolicyConfig, type DesktopPolicyState } from './mandatory-update-policy.ts'
import { desktopClientMetadata, desktopClientVersion } from './client-metadata.ts'
import { DesktopMandatoryUpdateWindow } from './mandatory-update-window.ts'
import { DesktopPolicyTestAuth } from './policy-test-auth.ts'
import { readDesktopSettings } from './settings.ts'
import { readDesktopLocaleCache, writeDesktopLocaleCache } from './locale-cache.ts'
import { DesktopUpdateDialog, type UpdateDialogOptions } from './update-dialog.ts'
import { readDesktopRuntime } from './runtime-tree.ts'
import { DesktopBrowserGuests } from './browser-guests.ts'
import { installDesktopShortcuts } from './keyboard.ts'
import { DesktopUpdateOverlays } from './update-overlay.ts'
import { DesktopQuitConfirmation } from './quit-confirmation.ts'
import { DesktopTray } from './tray.ts'
import { DesktopBackgroundNotice } from './background-notice.ts'

if (app.isPackaged) {
  const identityManifest = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { dshDesktopFlavor?: string }
  if ((identityManifest.dshDesktopFlavor ?? 'official') !== desktopIdentity.flavor) throw new Error('Desktop bundle and package flavor differ')
}
if (desktopIdentity.suiyi) {
  initializeSuiyiStorage(app, process.env)
  app.setAppUserModelId('com.zzjjzz.suiyi')
}

// The authenticated Suiyi user's Chromium partition; set before any app window exists.
let suiyiBrowserPartition: string | undefined
let focusPrimaryWindow = (): void => {}
let stopForRecovery = async (): Promise<void> => { await stopOperationReports() }
let shuttingDown = false
/**
 * Set by quit entries that must not ask: crash recovery exit and restart, and the
 * development restart command. The installer handoff has its own before-quit branch.
 */
let skipQuitConfirmation = false
let windowsLanguage: string | undefined = desktopIdentity.suiyi ? undefined : readDesktopLocaleCache(app.getPath('userData'))
/**
 * Whether the backend has reached ready: false until the first ready, back to
 * false when a restart returns it to starting, frozen during shutdown so a
 * failure while tearing down a ready backend still reads as `running`.
 */
let backendReady = false
/** Error-level console output of the primary window, attached to crash reports. */
const rendererConsole = new RendererConsoleTail()

// Platform-conventional logs directory (macOS ~/Library/Logs/<name>, otherwise under userData);
// set before ready so the first fatal report already resolves under it.
app.setAppLogsPath()

/** Brand only Electron-owned copy; shared renderer dictionaries remain product-independent. */
function brandDesktopLocale(locale: ReturnType<typeof resolveDesktopLocale>): ReturnType<typeof resolveDesktopLocale> {
  if (!desktopIdentity.suiyi) return locale
  return { ...locale, messages: Object.fromEntries(Object.entries(locale.messages).map(([key, value]) =>
    [key, value.replaceAll('DeepSeek Harness', desktopIdentity.displayName)])) as DesktopMessages }
}
function currentDesktopLocale(): ReturnType<typeof resolveDesktopLocale> {
  return brandDesktopLocale(resolveDesktopLocale(windowsLanguage ?? app.getLocale()))
}
/** Quit without the task confirmation; the caller has already decided the application must stop. */
function quitWithoutConfirmation(): void {
  skipQuitConfirmation = true
  app.quit()
}
const recovery = new DesktopFatalRecovery({
  messages: () => currentDesktopLocale().messages,
  show: options => dialog.showMessageBox(options),
  stop: () => { shuttingDown = true; return stopForRecovery() },
  disablePlugins: async () => {
    const manager = new DesktopProjectManager(resolveDesktopPaths(), runtimeResources())
    const backupPath = await manager.disableAllPlugins()
    console.info('Desktop profile recovery completed:', { profilePatchBackup: backupPath ?? null, homePatch: 'unchanged' })
  },
  exit: () => { quitWithoutConfirmation() },
  restart: () => { app.relaunch(); quitWithoutConfirmation() },
  writeReport: (error, source) => persistCrashReport(error, source),
  revealReport: async (path) => { await access(path); shell.showItemInFolder(path) },
})

let operationJournal: OperationJournal | undefined
let operationReportJob: Promise<OperationReportJobResult> | undefined
let operationReportAbort: AbortController | undefined
let operationReportsStopping = false
let operationReportStop: Promise<void> | undefined

/** Bound application shutdown waiting without claiming that an unresponsive Worker has exited. */
function stopOperationReports(): Promise<void> {
  operationReportStop ??= waitForOperationReports()
  return operationReportStop
}

async function waitForOperationReports(): Promise<void> {
  operationReportsStopping = true
  operationReportAbort?.abort()
  const job = operationReportJob
  if (job === undefined) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const exited = await Promise.race([job.then(() => true), new Promise<false>((resolve) => {
      timer = setTimeout(() => { resolve(false) }, 500)
    })])
    if (!exited) console.error('dsh desktop: operation report Worker has not exited; continuing shutdown')
  } finally { clearTimeout(timer) }
}

function persistCrashReport(error: unknown, source: CrashReportSource): Promise<string | undefined> {
  const directory = app.getPath('logs')
  const report = writeCrashReport(directory, {
    operationHistoryPlanned: !shuttingDown && !operationReportsStopping,
    source,
    phase: backendReady ? 'running' : 'startup',
    error,
    ...(error instanceof DesktopHostFatalError && error.diagnostic !== undefined ? { hostDiagnostic: error.diagnostic } : {}),
    rendererConsole: rendererConsole.snapshot(),
    app: {
      name: app.name, version: app.getVersion(), platform: process.platform, arch: process.arch,
      electron: process.versions.electron, node: process.versions.node, locale: currentDesktopLocale().id,
    },
    time: new Date(),
  })
  void report.then((path) => {
    if (path !== undefined && operationReportJob === undefined && !shuttingDown && !operationReportsStopping) {
      operationReportAbort = new AbortController()
      operationReportJob = runOperationReportJob({ reportPath: path, directory: join(app.getPath('userData'), 'plugin-operations'),
        limits: { bytes: 64 * 1024, recordBytes: 4096, records: 100, outputBytes: 64 * 1024 },
        journal: operationJournal?.status() ?? null,
      }, { timeoutMs: 500, cancellationGraceMs: 100 }, operationReportAbort.signal)
      void operationReportJob.finally(() => { operationReportJob = undefined; operationReportAbort = undefined })
    }
  }).catch((_error: unknown) => { /* Basic persistence failure is owned by fatal recovery. */ })
  return report
}

function reportFatal(error: unknown, source: CrashReportSource): void {
  console.error(error)
  if (shuttingDown) {
    // No dialog during shutdown, but the report still records what failed on the way out.
    void persistCrashReport(error, source)
    return
  }
  void recovery.report(error, source).catch(async (failure: unknown) => {
    console.error(failure)
    shuttingDown = true
    await stopOperationReports()
    app.exit(1)
  })
}

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    codeCache: true,
  },
}])

interface RuntimeResources {
  readonly nodeBin: string
  readonly node: string
  readonly pnpm: string
  readonly dsh: string
}

function runtimeResources(): RuntimeResources {
  const development = !app.isPackaged
  const node = process.execPath
  const nodeBin = development ? join(app.getAppPath(), 'scripts', 'node-bin') : join(process.resourcesPath, 'runtime', 'bin')
  const pnpm = (development ? process.env.DSH_DESKTOP_PNPM_ENTRY : undefined)
    ?? (development ? join(app.getAppPath(), 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
      : join(process.resourcesPath, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  const dsh = (development ? process.env.DSH_DESKTOP_DSH_DIR : undefined)
    ?? (development ? join(app.getAppPath(), '.desktop-build', 'development', 'project') : join(app.getAppPath(), 'dsh'))
  return { node, nodeBin, pnpm, dsh }
}

function developmentPrimaryRuntime(): string {
  const directory = process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR
  if (directory === undefined || directory === '') {
    throw new Error('dsh desktop: DSH_DESKTOP_PRIMARY_RUNTIME_DIR is required for an unpackaged launch')
  }
  return directory
}

function developmentHostInspectPort(enabled: boolean): number | undefined {
  const configured = process.env.DSH_DESKTOP_HOST_INSPECT_PORT
  if (!enabled || configured === undefined || configured === '') return undefined
  const port = Number(configured)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('dsh desktop: DSH_DESKTOP_HOST_INSPECT_PORT must be an integer from 1 through 65535')
  }
  return port
}

/**
 * Opaque chrome fallback matching the built-in sidebar palette (the resolved
 * `--dsw-static-neutral-bluish-900` / `-50` tokens). An approximation for
 * custom themes: Windows swaps in the renderer's measured palette over the
 * windowsAppearance IPC, and macOS shows it only while minimized or hidden.
 * @returns the sidebar fill hex for the active system color scheme.
 */
function chromeFallbackFill(): string {
  return nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb'
}

/**
 * Add the effective Desktop palette to a Platform authorization URL so the
 * login page opens in the application's theme. `system` resolves through
 * `nativeTheme.shouldUseDarkColors`, which follows the theme source the
 * application preload publishes.
 * @param authorizeUrl - validated Platform authorization URL.
 * @returns the authorization URL carrying `theme=light` or `theme=dark`.
 */
function platformLoginUrl(authorizeUrl: string): string {
  const url = new URL(authorizeUrl)
  url.searchParams.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  return url.href
}

function createWindow(preload: string, show = false, primary = false): BrowserWindow {
  if (desktopIdentity.suiyi && suiyiBrowserPartition === undefined) throw new Error('Suiyi window requires an authenticated partition')
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    show,
    ...(process.platform === 'win32' && primary ? {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: { height: desktopIdentity.suiyi ? SUIYI_WINDOWS_TITLEBAR_HEIGHT : WINDOWS_TITLEBAR_HEIGHT,
        color: desktopIdentity.suiyi ? '#00000000' : chromeFallbackFill(),
        symbolColor: nativeTheme.shouldUseDarkColors ? '#f9fafb' : '#0f1115' },
    } : {}),
    // hiddenInset places traffic lights inside the sidebar; sidebar vibrancy
    // needs a transparent window background to show through the page.
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar' as const,
      // 'active' keeps the vibrancy material stable when the window blurs;
      // 'followWindow' washes the sidebar out behind an unfocused window.
      visualEffectState: 'active' as const,
      backgroundColor: '#00000000',
    } : {}),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      ...(suiyiBrowserPartition === undefined ? {} : { partition: suiyiBrowserPartition }),
      webviewTag: primary,
      devTools: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.platform === 'darwin' || process.platform === 'win32') {
    // Fullscreen hides native window controls; overlays drop their caption clearance.
    const sendFullscreen = (): void => {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_IPC.windowFullscreen, window.isFullScreen())
    }
    window.on('enter-full-screen', sendFullscreen)
    window.on('leave-full-screen', sendFullscreen)
    // Reloads and navigations re-register the preload listener; resend the
    // current state so a fullscreen reload does not fall back to windowed CSS.
    window.webContents.on('did-finish-load', sendFullscreen)
  }
  if (process.platform === 'darwin') {
    // Deminiaturize reattaches the NSVisualEffectView material late
    // (electron/electron#25368), so a transparent window shows the desktop
    // through the sidebar until then. Paint an opaque base while minimized or
    // hidden so the deminiaturize animation and the reattachment gap show a
    // solid fill; restoring flips back, and the null -> 'sidebar' transition
    // forces the material to reattach.
    const applyBackdrop = (): void => {
      if (window.isDestroyed()) return
      if (window.isMinimized() || !window.isVisible()) {
        window.setVibrancy(null)
        window.setBackgroundColor(chromeFallbackFill())
      } else {
        window.setVibrancy('sidebar')
        window.setBackgroundColor('#00000000')
      }
    }
    window.on('minimize', applyBackdrop)
    window.on('hide', applyBackdrop)
    window.on('restore', applyBackdrop)
    window.on('show', applyBackdrop)
  }
  window.webContents.on('context-menu', (_event, { isEditable, selectionText, editFlags }) => {
    const items: MenuItemConstructorOptions[] = []
    if (isEditable) {
      items.push(
        { role: 'undo', enabled: editFlags.canUndo },
        { role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: editFlags.canSelectAll },
      )
    } else if (selectionText.length > 0) {
      items.push({ role: 'copy', enabled: editFlags.canCopy })
    }
    // Empty accelerators suppress Electron's default shortcut labels for native roles.
    if (items.length > 0) {
      const messages = currentDesktopLocale().messages
      Menu.buildFromTemplate(items.map(item => ({
        ...item,
        ...(process.platform === 'win32' && item.role !== undefined && item.role in messages
          ? { label: messages[item.role as keyof typeof messages] } : {}),
        accelerator: '',
      }))).popup({ window })
    }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const destination = new URL(url)
    const current = new URL(window.webContents.getURL())
    if (destination.protocol !== `${SCHEME}:`
      && !(destination.protocol === 'http:' && destination.origin === current.origin)) {
      event.preventDefault()
      if (['http:', 'https:'].includes(destination.protocol)) void shell.openExternal(url)
    }
  })
  return window
}

async function main(): Promise<void> {
  // Suiyi runs one verified identity-center login before any window, Host, or
  // settings read exists; the DeepSeek account login below stays untouched.
  let suiyiIdentity: SuiyiVerifiedIdentity | undefined
  let suiyiLocked = false
  let startupWindowPending = desktopIdentity.suiyi
  app.on('window-all-closed', () => {
    // Startup hands the login window to the workspace; expiry removes protected windows.
    if (process.platform !== 'darwin' && !startupWindowPending && !suiyiLocked) app.quit()
  })
  let suiyiDeadline = 0
  // Verified bearer token kept only in the main process and the Host's private channel.
  let suiyiAccess: Pick<SuiyiLoginResult, 'accessToken' | 'expiresAt'> | undefined
  let suiyiRenew: SuiyiLoginResult['renew']
  let suiyiLoginHandoff: SuiyiLoginWindow | undefined
  // Safe display name from the verified ID token; never an email, username, or issuer value.
  let suiyiDisplayName: string | undefined
  let suiyiExpiryWatch: { promptWhileLocked(): void; expire(): void; cancel(): void } | undefined
  let suiyiResume: (session: SuiyiLoginSession) => Promise<void> = async () => {}
  let armSuiyiExpiry: (() => void) | undefined
  let promptSuiyiLogin = (): Promise<SuiyiLoginResult | undefined> => Promise.resolve(undefined)
  let suiyiSignIn = (): Promise<DesktopSuiyiSignInResult> => Promise.resolve({ ok: false, reason: 'unavailable' })
  let suiyiSignOut = (): Promise<void> => Promise.resolve()
  if (desktopIdentity.suiyi) {
    // This machine-wide issuer setting belongs to the pre-login profile;
    // keep its path stable after userData switches to the verified user.
    const issuerSettingsRoot = app.getPath('userData')
    // No Host, user home, or user-scoped storage exists yet, so the login page
    // reads only the pre-login locale cache and the OS language preference.
    const loginLocale = brandDesktopLocale(resolveDesktopStartupLocale(
      readDesktopLocaleCache(app.getPath('userData')) ?? null, app.getPreferredSystemLanguages()))
    // One verified login page drives first login, failed retries, and expiry re-login.
    promptSuiyiLogin = async (): Promise<SuiyiLoginResult | undefined> => {
      suiyiLoginHandoff?.close()
      suiyiLoginHandoff = undefined
      const prompt = await openSuiyiLoginWindow({
        locale: loginLocale,
        attempt: ({ signal, onAuthorizeUrl }) => runSuiyiLoginAttempt({
          appData: issuerSettingsRoot,
          callbackReceivedMessage: loginLocale.messages.suiyiLoginCallbackReceived,
          openBrowser: async (url) => {
            onAuthorizeUrl(url)
            await shell.openExternal(url)
          },
          signal,
        }),
        onCancel: quitWithoutConfirmation,
      })
      const verified = await prompt.result
      if (verified === undefined) prompt.close()
      else suiyiLoginHandoff = prompt
      return verified
    }
    let login: SuiyiLoginResult | undefined
    while (login === undefined) {
      const verified = await promptSuiyiLogin()
      if (verified === undefined) return
      // A token that expired before the window closed cannot authorize the Host;
      // ask for a fresh login instead of entering a locked workspace.
      if (suiyiSessionDeadline({ expiresAt: verified.expiresAt, now: Date.now() }) <= Date.now()) continue
      login = verified
    }
    suiyiAccess = { accessToken: login.accessToken, expiresAt: login.expiresAt }
    suiyiRenew = login.renew
    suiyiDisplayName = login.displayName
    // Verified issuer+sub now own every data root and the Host environment. The
    // renewal closure stays in this process; only the bearer reaches the Host's private channel.
    const appData = app.getPath('appData')
    const userPaths = applySuiyiUserElectronStorage(app, appData, login)
    suiyiBrowserPartition = `persist:suiyi-${suiyiUserDirectory(login)}`
    // sessionData is fixed before Electron ready. The verified user's partition
    // isolates Chromium state from every other account in the installation.
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearCache()
    const browserSession = session.fromPartition(suiyiBrowserPartition)
    await browserSession.clearStorageData()
    await browserSession.clearCache()
    windowsLanguage = readDesktopLocaleCache(app.getPath('userData'))
    suiyiIdentity = { issuer: login.issuer, sub: login.sub }
    suiyiDeadline = suiyiSessionDeadline({ expiresAt: login.expiresAt, now: Date.now() })
    process.env.DSH_HOME = userPaths.home
    process.env.DSH_AGENTS_HOME = userPaths.agents
    app.setAppLogsPath(join(app.getPath('userData'), 'logs'))
    // Register the expiry watcher only after the Host and every lock effect
    // are initialized; startup I/O may outlive a short-lived access token.
    let expiryQuitBound = false
    armSuiyiExpiry = () => {
      if (suiyiIdentity === undefined || suiyiAccess === undefined || suiyiDeadline <= 0) return
      const currentSession = suiyiLoginSession({
        issuer: suiyiIdentity.issuer,
        sub: suiyiIdentity.sub,
        expiresAt: suiyiDeadline,
        accessToken: suiyiAccess.accessToken,
        ...(suiyiDisplayName === undefined ? {} : { name: suiyiDisplayName }),
      }, Date.now(), suiyiRenew)
      const expiry = watchSuiyiSession({
        session: currentSession,
        timer: suiyiSessionTimer(),
        effects: {
          closeWorkspace: async () => { await suiyiLock.closeWorkspace() },
          stopHost: async () => { await suiyiLock.stopHost() },
          clearBrowserStorage: async () => { await suiyiLock.clearBrowserStorage() },
          reportLockFailure: async () => {
            await dialog.showMessageBox({ type: 'error', title: SESSION_LOCK_COPY.title,
              message: SESSION_LOCK_COPY.cleanupFailed, buttons: ['OK'] })
          },
          showLock: () => Promise.resolve(0),
          openBrowser: url => shell.openExternal(url),
        },
        login: () => promptSuiyiLogin().catch(() => {
          // A window that cannot open leaves the workspace locked; activation retries.
          console.error('Suiyi re-login window failed')
          return undefined
        }),
        onRelogin: session => suiyiResume(session),
        onRenewed: (renewed) => {
          suiyiDeadline = renewed.deadline
          suiyiAccess = { accessToken: renewed.accessToken, expiresAt: renewed.deadline }
          suiyiRenew = renewed.renew
          suiyiDisplayName = renewed.displayName
          backend.host?.refreshSuiyiAccess()
          publishSuiyiIdentity()
        },
      })
      suiyiExpiryWatch = expiry
      if (!expiryQuitBound) {
        expiryQuitBound = true
        app.on('will-quit', () => { suiyiExpiryWatch?.cancel() })
      }
    }
    login = undefined
  }
  // The Host profile remains bound to the first verified account even if its
  // token expires during asynchronous initialization. Host startup itself is
  // still blocked by the session watcher and the workspace access gate.
  const verifiedHostOwner = suiyiIdentity
  const suiyiHostOwner = (): SuiyiVerifiedIdentity => {
    if (verifiedHostOwner === undefined) throw new Error('Suiyi Host requires a verified account')
    return verifiedHostOwner
  }
  // Re-check wall-clock expiry at every privileged entry point. A suspended
  // process must not rely only on the timer firing before the next request.
  const suiyiAccessAllowed = (): boolean => {
    if (!desktopIdentity.suiyi) return true
    if (suiyiLocked || suiyiIdentity === undefined) return false
    if (Date.now() < suiyiDeadline) return true
    suiyiExpiryWatch?.expire()
    return false
  }
  const suiyiLogin = (): SuiyiVerifiedIdentity => {
    if (!suiyiAccessAllowed() || suiyiIdentity === undefined) throw new Error('Suiyi Host startup requires a valid login')
    return suiyiIdentity
  }
  // Session-expiry lock effects, rebound below once windows and the backend exist.
  const suiyiLock = {
    closeWorkspace: async (): Promise<void> => {},
    stopHost: async (): Promise<void> => {},
    clearBrowserStorage: async (): Promise<void> => {},
  }
  const desktopSettings = await readDesktopSettings(app.getPath('userData'))
  void pruneCrashReports(app.getPath('logs'))
  const journalDirectory = process.env.DSH_DESKTOP_UPDATE_JOURNAL_DIR
  const updateJournal = journalDirectory === undefined ? undefined : new DesktopUpdateJournal(journalDirectory, app.getVersion())
  const resources = runtimeResources()
  const documentSession = suiyiBrowserPartition === undefined
    ? session.defaultSession : session.fromPartition(suiyiBrowserPartition)
  // The login gate set DSH_HOME before this point, so the desktop profile —
  // plugin state and the Host project directory — resolves into the logged-in
  // user's home rather than the shared pre-login root.
  const paths = resolveDesktopPaths()
  const development = !app.isPackaged
  const primaryRuntime = development
    ? developmentPrimaryRuntime()
    : join(process.resourcesPath, 'runtime', 'primary-runtime')
  const activeProject = paths.profile
  const manager = new DesktopProjectManager(paths, resources)
  // Dock and Finder launches inherit only launchd's environment; every Host shares one login-shell read.
  const loginShellRead = new AbortController()
  // The probe runs in its own process group, which outlives Desktop unless the read is aborted.
  app.on('will-quit', () => { loginShellRead.abort() })
  const loginShell = readDesktopLoginShellEnvironment(process.env, resolveDesktopLoginShellConfig(process.env), {
    signal: loginShellRead.signal,
  }).then((result) => {
    for (const failure of result.failures) console.warn(`desktop login shell: ${failure.shell} failed (${failure.reason})`)
    return desktopIdentity.suiyi ? suiyiUserHostEnvironment(result.environment, app.getPath('appData'), suiyiHostOwner()) : result.environment
  })
  let hostEnvironment: NodeJS.ProcessEnv = desktopIdentity.suiyi ? suiyiUserHostEnvironment(process.env, app.getPath('appData'), suiyiHostOwner()) : process.env
  const prepareHostEnvironment = async (): Promise<void> => {
    hostEnvironment = await loginShell
  }
  let quitting = false
  let startup: Promise<void> | undefined
  let workspaceRecovery: Promise<void> | undefined
  let mainWindow: BrowserWindow | undefined
  let welcomeWindow: BrowserWindow | undefined
  let suiyiWelcomeWindow: BrowserWindow | undefined
  let openingSuiyiWelcome: Promise<void> | undefined
  /** Safe identity view consumed by the account menu and top bar. */
  const suiyiIdentityView = (): DesktopSuiyiIdentityView => {
    if (!desktopIdentity.suiyi) return { state: 'unavailable' }
    if (suiyiLocked || suiyiIdentity === undefined) return { state: 'locked' }
    return { state: 'signed-in', ...(suiyiDisplayName === undefined ? {} : { displayName: suiyiDisplayName }) }
  }
  const publishSuiyiIdentity = (): void => {
    if (mainWindow === undefined || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(DESKTOP_IPC.suiyiIdentityChanged, suiyiIdentityView())
  }
  // The stopped backend rejects in-flight Host work and frees the child so no
  // background session outlives the verified login.
  suiyiLock.stopHost = async () => {
    try { await backend.stop() }
    catch (error) {
      // A failed stop cannot be treated as a successful teardown or re-login.
      await backend.close().catch(() => { console.error('Suiyi Host close after failed stop also failed') })
      throw error
    }
  }
  suiyiLock.clearBrowserStorage = async () => {
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearCache()
    if (suiyiBrowserPartition !== undefined) {
      const browserSession = session.fromPartition(suiyiBrowserPartition)
      await browserSession.clearStorageData()
      await browserSession.clearCache()
    }
  }
  const installFileDrag = (): (() => Promise<void>) => installDesktopFileDrag(
    event => assertProductSender(event),
    (address, signal) => {
      const host = backend.host
      if (host === undefined) return Promise.reject(new Error('File drag Host unavailable'))
      return host.resolveDragResource(address, signal)
    },
  )
  const fileDragCleanups = new Set([installFileDrag()])
  let fileDragStopped = false
  const disposeFileDrag = async (): Promise<void> => {
    fileDragStopped = true
    const results = await Promise.allSettled([...fileDragCleanups].map(async (release) => {
      await release()
      fileDragCleanups.delete(release)
    }))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
  let enteredWorkspace = false
  // Session expiry takes the workspace away before the re-login dialog opens:
  // no window may keep showing the expired identity's content.
  suiyiLock.closeWorkspace = async () => {
    suiyiLocked = true
    suiyiIdentity = undefined
    suiyiDeadline = 0
    suiyiAccess = undefined
    suiyiRenew = undefined
    suiyiLoginHandoff?.close()
    suiyiLoginHandoff = undefined
    suiyiDisplayName = undefined
    hostUrl = undefined
    hostCookie = undefined
    injections = []
    enteredWorkspace = false
    // Hide and destroy sensitive content before awaiting native view cleanup.
    for (const window of [welcomeWindow, suiyiWelcomeWindow, mainWindow]) {
      if (window !== undefined && !window.isDestroyed()) { window.hide(); window.destroy() }
    }
    welcomeWindow = undefined
    suiyiWelcomeWindow = undefined
    mainWindow = undefined
    platformView.setSession(null)
    await platformView.closeAndWait()
  }
  if (desktopIdentity.suiyi) {
    // The same verified identity re-signed-in: its per-user storage already
    // exists, so only the locked workspace has to be rebuilt. A different
    // identity never reaches this resume; the watcher keeps the lock held.
    suiyiResume = async (relogin) => {
      suiyiIdentity = relogin.identity
      suiyiDeadline = relogin.deadline
      suiyiAccess = { accessToken: relogin.accessToken, expiresAt: relogin.deadline }
      suiyiRenew = relogin.renew
      suiyiDisplayName = relogin.displayName
      try {
        // Backend startup may run while the screen remains locked, but only
        // a confirmed ready Host can release the workspace access gate.
        await reconcileBackend()
        if (isQuitting() || backend.host === undefined || Date.now() >= relogin.deadline) {
          throw new Error('Suiyi session expired before the Host could resume')
        }
        suiyiLocked = false
        await openInitialWindow()
      } catch (error) {
        suiyiLocked = true
        suiyiIdentity = undefined
        suiyiDeadline = 0
        await backend.stop().catch(() => { console.error('Suiyi Host stop after failed resume also failed') })
        throw error
      }
    }
    let suiyiSignFlow: Promise<'ok' | 'cancelled' | 'failed'> | undefined
    let suiyiSigningOut = false
    const promptAndResumeSuiyi = (): Promise<'ok' | 'cancelled' | 'failed'> => {
      if (suiyiSignFlow !== undefined) return suiyiSignFlow
      const flow = (async (): Promise<'ok' | 'cancelled' | 'failed'> => {
        const verified = await promptSuiyiLogin()
        if (verified === undefined) return 'cancelled'
        // A different account requires a full restart so per-user storage and
        // Electron partitions cannot be rebound in place.
        if (verifiedHostOwner !== undefined
          && (verified.issuer !== verifiedHostOwner.issuer || verified.sub !== verifiedHostOwner.sub)) {
          return 'failed'
        }
        const session = suiyiLoginSession(verified, Date.now(), verified.renew)
        if (session.deadline <= Date.now()) return 'failed'
        await suiyiResume(session)
        suiyiExpiryWatch?.cancel()
        armSuiyiExpiry?.()
        publishSuiyiIdentity()
        return 'ok'
      })().catch(() => {
        // Authentication errors can carry provider detail; log only the fixed class.
        console.error('Suiyi sign-in failed')
        return 'failed' as const
      }).finally(() => { suiyiSignFlow = undefined })
      suiyiSignFlow = flow
      return flow
    }
    suiyiSignIn = async () => {
      if (!desktopIdentity.suiyi) return { ok: false, reason: 'unavailable' }
      if (!suiyiLocked) return { ok: true }
      const outcome = await promptAndResumeSuiyi()
      return outcome === 'ok' ? { ok: true } : { ok: false, reason: outcome }
    }
    const reportSuiyiSignOutFailure = async (): Promise<void> => {
      // A failed cleanup cannot leave a background shell with no UI: report once,
      // then quit through the same confirmation-free exit the lock path uses.
      try {
        await dialog.showMessageBox({ type: 'error', title: SESSION_LOCK_COPY.title,
          message: SESSION_LOCK_COPY.cleanupFailed, buttons: ['OK'] })
      } catch {
        // A dialog failure must not keep the process alive without a window.
      }
      quitWithoutConfirmation()
    }
    suiyiSignOut = async () => {
      if (!desktopIdentity.suiyi || suiyiLocked || suiyiIdentity === undefined || suiyiSigningOut) return
      suiyiSigningOut = true
      suiyiExpiryWatch?.cancel()
      suiyiExpiryWatch = undefined
      try {
        try {
          await suiyiLock.closeWorkspace()
        } catch {
          console.error('Suiyi sign-out lock failed')
          await reportSuiyiSignOutFailure()
          return
        }
        try {
          await suiyiLock.stopHost()
          await suiyiLock.clearBrowserStorage()
        } catch {
          console.error('Suiyi sign-out cleanup failed')
          await reportSuiyiSignOutFailure()
          return
        }
        publishSuiyiIdentity()
        const outcome = await promptAndResumeSuiyi()
        // Cancelling or failing the real login page must not leave a windowless
        // background process; quit explicitly (the Host is already stopped).
        if (outcome !== 'ok') quitWithoutConfirmation()
      } catch {
        console.error('Suiyi sign-out failed')
        await reportSuiyiSignOutFailure()
      } finally {
        suiyiSigningOut = false
        publishSuiyiIdentity()
      }
    }
  }
  // NSIS passes --updated when it launches the application after installation.
  let raiseAfterUpdate = process.platform === 'win32' && process.argv.includes('--updated')
  let shellInstallerOwnsQuit = false
  let requireCleanStop = false
  let updateStoppedHost = false
  let updateStopFailure: DesktopHostUncleanExitError | undefined
  let updateState: DesktopUpdateState = { phase: 'idle' }
  let channelState: DesktopChannelState | undefined
  const updatePresentation = (state: DesktopUpdateState) => ({ ...presentDesktopUpdate(state),
    ...(channelState?.error === undefined ? {} : { configurationError: channelState.error }) })
  const systemLanguages = app.getPreferredSystemLanguages()
  let locale = brandDesktopLocale(windowsLanguage === undefined
    ? resolveDesktopStartupLocale(null, systemLanguages) : resolveDesktopLocale(windowsLanguage))
  windowsLanguage = locale.id
  let mandatoryPolicy: DesktopMandatoryUpdatePolicy | undefined
  let mandatoryUI: DesktopMandatoryUpdateWindow | undefined
  let policyAuth: DesktopPolicyTestAuth | undefined
  let tray: DesktopTray | undefined
  /**
   * The operating system is ending the session: the quit skips its confirmation. Windows sets it
   * on the definitive session-end message. macOS sets it on the power-off notification, which
   * another application can still cancel, so the next focus or show of the main window clears it.
   */
  let sessionEnding = false
  const isQuitting = (): boolean => quitting
  const currentMainWindow = (): BrowserWindow | undefined => mainWindow
  const ordinaryDialogs = new Set<AbortController>()
  const currentDialogWindow = (): BrowserWindow | undefined => welcomeWindow ?? mainWindow
  const updateOverlays = new DesktopUpdateOverlays()
  const updateDialog = new DesktopUpdateDialog(fileURLToPath(new URL('./preload-update-dialog.cjs', import.meta.url)), () => locale, updateOverlays)
  const isMandatory = (): boolean => mandatoryPolicy?.state.blocking === true
  const ordinaryMessageBox = async (options: UpdateDialogOptions,
    parent = currentDialogWindow()): Promise<Electron.MessageBoxReturnValue> => {
    const controller = new AbortController()
    ordinaryDialogs.add(controller)
    try {
      if (parent === undefined) return { response: options.cancelId ?? 0, checkboxChecked: false }
      return await updateDialog.show(parent, { ...options, signal: controller.signal })
    }
    finally { ordinaryDialogs.delete(controller) }
  }
  // Copy comes from the same locale as the update prompts so the dialog
  // chrome and its content never mix languages.
  const showAbout = async (): Promise<void> => {
    await ordinaryMessageBox({ type: 'info', title: locale.messages.aboutMenu, message: locale.messages.aboutProduct,
      detail: formatDesktopMessage(locale.messages.aboutVersion, { version: app.getVersion() }),
      buttons: [locale.messages.updateAcknowledge], cancelId: 0 })
  }
  const commandManager = new DesktopCommandManager({
    resources: process.resourcesPath,
    isPackaged: app.isPackaged,
    isInstalledLocation: () => process.platform !== 'darwin' || app.isInApplicationsFolder(),
    isInstalling: () => updateState.phase === 'installing',
    isQuitting,
    messages: () => currentDesktopLocale().messages,
    show: ordinaryMessageBox,
  })
  const appPreload = fileURLToPath(new URL('./preload-app.cjs', import.meta.url))
  const applicationUrl = `${SCHEME}://app/`
  let hostUrl: string | undefined
  let hostCookie: string | undefined
  const browserGuests = new DesktopBrowserGuests(() => hostUrl)
  let injections: readonly unknown[] = []
  let welcomeBackend: DesktopWelcomeBackend | undefined
  let reportedLaunch = false
  let analyticsEnabled = false
  const track = async <K extends keyof ProductEventMap>(eventName: K, attributes: ProductEventMap[K]): Promise<void> => {
    const event = { eventName, attributes, timestamp: Date.now() } as ProductEvent
    try {
      if (analyticsEnabled) await welcomeBackend?.report(event)
    } catch (_error) { /* Analytics cannot interrupt native actions. */ }
  }
  let stopAccount: (() => void) | undefined
  let openedAttempt: string | undefined
  let returnedAttempt: string | undefined
  let pendingWelcomeNotice: WelcomeNotice | undefined
  let previousAccountStatus: string | undefined
  const assertProductSender = (event: IpcMainInvokeEvent): BrowserWindow => {
    if (!suiyiAccessAllowed()) {
      throw new Error('Suiyi workspace is locked')
    }
    assertDesktopSender(event, ['app'])
    if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
      || event.senderFrame === null || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('dsh desktop: rejected IPC from an unowned renderer')
    }
    return mainWindow
  }
  let navigation: { window: BrowserWindow; url: string; promise: Promise<void> } | undefined
  const navigateMain = (url: string): Promise<void> => {
    const window = mainWindow
    if (quitting || window === undefined || window.isDestroyed()) return Promise.resolve()
    if (navigation?.window === window && navigation.url === url) return navigation.promise
    const next = { window, url, promise: Promise.resolve() }
    next.promise = window.loadURL(url).catch((error: unknown) => {
      if (quitting || shuttingDown || window.isDestroyed() || navigation !== next
        || (error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED')) return
      navigation = undefined
      throw error
    })
    navigation = next
    return next.promise
  }
  const platformView = new DesktopPlatformView(join(app.getAppPath(), 'lib', 'preload-platform-account.cjs'),
    () => locale.id === 'zh-CN' ? 'zh_CN' : 'en_US', process.platform === 'win32' ? 'win32' : 'darwin',
    owner => isMandatory() || updateOverlays.input(owner).blocked,
    suiyiIdentity === undefined ? undefined : suiyiUserDirectory(suiyiIdentity))
  const backend = new DesktopBackendController((onFailure) => {
    const hostInspectPort = developmentHostInspectPort(development)
    const host = new DesktopHostProcess(resources.node, resources.dsh, activeProject,
      hostInspectPort, { ...hostEnvironment, DSH_CLIENT_VERSION: desktopClientVersion() }, onFailure,
      primaryRuntime,
      resources, (next) => { platformView.setSession(next) }, (record) => {
        operationJournal ??= new OperationJournal(join(app.getPath('userData'), 'plugin-operations'), {
          segmentBytes: 256 * 1024, recordBytes: 4096, queuedBytes: 64 * 1024,
        })
        operationJournal.enqueue(JSON.stringify(record))
      }, () => suiyiAccess)
    return {
      start: async () => {
        const ready = await host.start()
        const cookie = await authenticateWebHost(ready.url)
        hostCookie = cookie
        hostUrl = ready.url
        void removeLegacyHostCookies(documentSession.cookies, ready.url)
          .catch((error: unknown) => { console.error('desktop: legacy Host cookie cleanup failed', error) })
        if (ready.injections === undefined) throw new Error('Desktop Host did not provide boot injections')
        injections = ready.injections
        welcomeBackend = connectDesktopWelcome(ready.url, cookie)
        analyticsEnabled = await welcomeBackend.analyticsEnabled().catch(() => false)
        if (!reportedLaunch) { reportedLaunch = true; void track('desktop_app_launch', {}) }
        stopAccount?.()
        const accountBackend = welcomeBackend.account
        // DeepSeek sign-in events are model-provider state, not Suiyi identity.
        // They must not open a second login window or change Suiyi's workspace.
        if (!desktopIdentity.suiyi) stopAccount = accountBackend.watch((state) => {
          if (quitting) return
          if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
          const attempt = state.attempt
          if (attempt?.phase === 'waiting-browser' && attempt.authorizeUrl !== undefined && openedAttempt !== attempt.id) {
            openedAttempt = attempt.id
            void shell.openExternal(platformLoginUrl(attempt.authorizeUrl)).catch(() => undefined)
          }
          if ((attempt?.phase === 'failed' || attempt?.phase === 'expired') && returnedAttempt !== attempt.id) {
            returnedAttempt = attempt.id
            focusPrimaryWindow()
          }
          if (state.status === 'credential-stored' && attempt?.phase === 'succeeded' && welcomeWindow !== undefined) void enterWorkspace({ activate: false }).catch(() => undefined)
          if (previousAccountStatus === 'credential-stored' && state.status === 'signed-out') {
            void readWelcomeState().then(async (value) => {
              if (!desktopIdentity.suiyi && needsWelcome(value) && !quitting) {
                enteredWorkspace = false
                await showWelcome()
                if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
              }
              return undefined
            }).catch(() => undefined)
          }
          previousAccountStatus = state.status
        }, () => {
          // The stream reconnects; a transport failure does not change account state.
        }, () => {
          void readWelcomeState().then(async (value) => {
            if (desktopIdentity.suiyi || !needsWelcome(value) || quitting) return
            pendingWelcomeNotice = 'session-expired'
            enteredWorkspace = false
            await showWelcome()
            const state = await accountBackend.state()
            if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
          }).catch(() => undefined)
        }, (enabled) => { analyticsEnabled = enabled })
      },
      stop: async () => {
        analyticsEnabled = false
        stopAccount?.()
        try { await host.stop(requireCleanStop) }
        catch (error) {
          if (!requireCleanStop || !(error instanceof DesktopHostUncleanExitError)) throw error
          // Backend cleanup succeeded; installation still rejects the unsuccessful task teardown.
          updateStopFailure = error
        }
      },
      updateTasks: (action: 'inspect' | 'lock' | 'unlock') => host.updateTasks(action),
      refreshSuiyiAccess: () => { host.refreshSuiyiAccess() },
      inspectQuit: () => host.inspectQuit(),
      resolveDragResource: (address: string, signal?: AbortSignal) => host.resolveDragResource(address, signal),
    }
  }, (state) => {
    if (state.phase === 'error') reportFatal(state.failure, 'host')
    else if (!shuttingDown) backendReady = state.phase === 'ready'
  })

  const updateErrors = new WeakMap<DesktopUpdateState, Promise<void>>()
  const showUpdateFailure = (state: DesktopUpdateState): Promise<void> => {
    if (state.phase !== 'error') return Promise.resolve()
    if (isMandatory()) { mandatoryUI?.sync(); return Promise.resolve() }
    let shown = updateErrors.get(state)
    if (shown === undefined) {
      shown = ordinaryMessageBox({ type: 'error', title: locale.messages.updateFailedTitle,
        message: desktopUpdateErrorSummary(state, locale.messages),
        technicalDetails: state.technicalDetails ?? state.message ?? '' }).then(() => {})
      updateErrors.set(state, shown)
    }
    return shown
  }
  const publishUpdate = (state: DesktopUpdateState): DesktopUpdateState => {
    updateJournal?.state(state)
    updateState = state
    mandatoryUI?.sync()
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_IPC.updatesPresentation, updatePresentation(state))
    }
    if (state.phase === 'error' && state.failedOperation !== 'check' && state.failedOperation !== 'configuration') {
      if (state.failedOperation === 'install' && fileDragStopped && !quitting) {
        fileDragCleanups.add(installFileDrag())
        fileDragStopped = false
      }
      const restoreHost = state.failedOperation === 'install' && updateStoppedHost && !quitting
      if (state.failedOperation === 'install' && !quitting) {
        operationReportsStopping = shuttingDown
        operationReportStop = undefined
      }
      shellInstallerOwnsQuit = false
      updateStoppedHost = false
      if (restoreHost) {
        // Only confirmed process exit permits replacement before another installation confirmation.
        const hostReady = backend.start(prepareHostEnvironment)
        startup = hostReady
        const recovery = hostReady.then(async () => {
          if (quitting) return
          // A replacement Host can have a new port, cookie, or boot injections even at the same URL.
          navigation = undefined
          await navigateMain(applicationUrl)
          if (backend.host !== undefined) updateJournal?.action('workspace-ready')
        })
        workspaceRecovery = recovery
        void recovery.catch((error: unknown) => { reportFatal(error, 'main') }).finally(() => {
          if (startup === hostReady) startup = undefined
          if (workspaceRecovery === recovery) workspaceRecovery = undefined
        })
      }
      void showUpdateFailure(state).catch((error: unknown) => { console.error(error) })
    }
    return state
  }

  const readWelcomeState = async () => {
    if (backend.host === undefined || welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
    return welcomeBackend.read()
  }
  stopForRecovery = async () => {
    const reports = stopOperationReports()
    try { await backend.close() }
    finally { await Promise.all([operationJournal?.drain(500), reports]) }
  }

  const reconcileBackend = (): Promise<void> => {
    startup ??= (async () => {
      await navigateMain(applicationUrl)
      await backend.start(async () => {
        await Promise.all([manager.applyRelease(), prepareHostEnvironment()])
      })
      // A verified re-login may restart the Host while the old screen remains
      // locked. Only its explicit resume path can reveal the workspace.
      if (backend.host !== undefined && (!desktopIdentity.suiyi || !suiyiLocked)) await openInitialWindow()
      if (backend.host !== undefined) updateJournal?.action('workspace-ready')
      // The existing Web document resumes through the boot IPC response.
    })().catch((error: unknown) => {
      updateJournal?.action('workspace-failed')
      reportFatal(error, 'main')
      throw error
    }).finally(() => { startup = undefined })
    return startup
  }

  const manifest: unknown = JSON.parse(await readFile(join(app.getAppPath(), 'package.json'), 'utf8'))
  const packagedChannel = desktopUpdateChannel(manifest)
  const channelSettings = new DesktopUpdateSettings(app.getPath('userData'), packagedChannel)
  const initialChannel = await channelSettings.load()
  channelState = { channel: initialChannel.kind === 'ready' ? initialChannel.channel : null,
    packagedChannel, changing: false,
    ...(initialChannel.kind === 'error' ? { error: configurationFailure(initialChannel.error) } : {}) }
  const updateChannel = initialChannel.kind === 'ready' ? initialChannel.channel : packagedChannel
  const updates = new DesktopUpdateCoordinator(
    publishUpdate,
    async () => {
      await commandManager.idle()
      await workspaceRecovery
      await startup?.catch(() => undefined)
      const host = backend.host
      if (host === undefined) throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable)
      const active = await host.updateTasks('inspect')
      const parent = currentDialogWindow()
      if (parent === undefined || !await prepareDesktopUpdateWindow(parent, locale.messages.updateFullscreenTimeout)) return false
      const ready = desktopUpdateReadyConfirmation(locale.messages, updates.state.version ?? '', process.platform)
      const confirmation: Electron.MessageBoxOptions = {
        type: active ? 'warning' : 'info', title: locale.messages.updateTitle,
        message: active ? locale.messages.updateActiveTasks : ready.message,
        detail: active ? locale.messages.updateActiveTasksDetail : ready.detail,
        buttons: active ? [locale.messages.updateStopTasks, locale.messages.updateLater] : [locale.messages.installAndRestart],
        defaultId: 1, cancelId: 1,
      }
      if (isMandatory()) {
        if (!await mandatoryUI?.confirm(updates.state.version ?? '', active)) return false
      } else {
        const result = await updateDialog.show(parent, confirmation)
        if (result.response !== 0 || isMandatory()) return false
      }
      // The update lock rejects new HTTP requests, including analytics intake.
      await track('desktop_upgrade_install_restart_click', {})
      if (backend.host !== host) throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable)
      try {
        const stillActive = await host.updateTasks('lock')
        if (stillActive && !active) throw new DesktopUpdatePreparationError('tasks-changed', locale.messages.updateTasksChanged)
        mandatoryUI?.preparingRestart(stillActive)
        // The embedded Platform document holds credentials issued by the Host that is about to stop.
        await platformView.closeAndWait()
        await disposeFileDrag().catch((error: unknown) => { console.error(error) })
        requireCleanStop = true
        updateStopFailure = undefined
        await Promise.all([backend.stop(), stopOperationReports()])
        updateStoppedHost = true
        // The backend's async cleanup callback can assign this after the reset above.
        const stopFailure = updateStopFailure as DesktopHostUncleanExitError | undefined
        if (stopFailure !== undefined) throw new DesktopUpdatePreparationError('stop-failed', locale.messages.updateStopFailed, stopFailure.message)
        await operationJournal?.drain(500)
        updateJournal?.action('install-confirmed')
        shellInstallerOwnsQuit = true
      } catch (error) {
        operationReportsStopping = shuttingDown
        operationReportStop = undefined
        if (!updateStoppedHost) await host.updateTasks('unlock').catch((unlockError: unknown) => { console.error(unlockError) })
        throw error
      } finally {
        requireCleanStop = false
      }
      return true
    },
    undefined, desktopIdentity.suiyi ? () => false : undefined, undefined,
    (success, reason) => { void track('desktop_upgrade_download_result', { is_success: success, ...reason === undefined ? {} : { error_reason: reason } }) },
    updateChannel,
  )

  if (initialChannel.kind === 'error') updates.suspendConfiguration(initialChannel.error.path)
  const publishChannel = (state: DesktopChannelState): DesktopChannelState => {
    channelState = state
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_IPC.updatesChannelChanged, state)
      window.webContents.send(DESKTOP_IPC.updatesPresentation, updatePresentation(updates.state))
    }
    return state
  }

  const updateSchedule = new DesktopUpdateSchedule(updates, resolveDesktopUpdateScheduleConfig(process.env))

  const downloadUpdate = async (version: string, revision = updates.revision): Promise<DesktopUpdateState> => {
    void track('desktop_upgrade_click', {})
    updateJournal?.action('download-requested')
    const state = await updates.download(version, revision)
    if (state.phase !== 'ready' || quitting) return state
    // Only a completed user-driven download opens this prompt; cancelling installation does not reopen it.
    // A confirmation on a hidden window would go unseen, so it waits for the next show; the mandatory
    // flow keeps its own taskbar and Dock attention instead.
    if (!isMandatory()) await windowShown()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- A quit can begin while the show is awaited.
    if (quitting) return state
    return updates.install(version, revision)
  }
  const windowShown = (): Promise<void> => new Promise((resolve) => {
    const window = currentDialogWindow()
    if (window === undefined || window.isDestroyed() || window.isVisible()) { resolve(); return }
    window.once('show', () => { resolve() })
    window.once('closed', () => { resolve() })
  })

  const registerDocumentProtocol = desktopIdentity.suiyi ? documentSession.protocol : protocol
  registerDocumentProtocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    // Shell-owned documents live in the application bundle and never pass through the Host.
    if (url.hostname === 'shell') return serveWebDocument(request, join(app.getAppPath(),
      url.pathname === '/design-platform.css' ? 'lib/welcome' : 'renderer'))
    if (url.hostname === 'app') {
      if (!suiyiAccessAllowed()) {
        return Promise.resolve(new Response(null, { status: 401 }))
      }
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/')
        || ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) {
        return serveWebDocument(request, join(resources.dsh, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist'))
      }
      if (backend.host === undefined || hostUrl === undefined || hostCookie === undefined) {
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return forwardWebRequest(request, hostUrl, hostCookie)
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })

  installDesktopDirectoryPicker(() => mainWindow)
  installMicrophonePermissions(documentSession, () => mainWindow?.webContents)
  const shortcuts = installDesktopShortcuts(() => mainWindow, app.getPath('userData'),
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux', () => { refreshApplicationMenu() }, window => updateOverlays.input(window))
  app.on('will-quit', () => { shortcuts.dispose() })

  ipcMain.handle(DESKTOP_IPC.boot, async (event) => {
    if (desktopIdentity.suiyi) assertProductSender(event)
    else assertDesktopSender(event, ['app'])
    await startup
    if (backend.host === undefined || hostUrl === undefined) throw new Error('Desktop Host is unavailable')
    return { injections, streamBaseUrl: new URL(hostUrl).origin }
  })

  ipcMain.handle(DESKTOP_IPC.bootFailed, (event, message: unknown) => {
    if (desktopIdentity.suiyi) assertProductSender(event)
    else assertDesktopSender(event, ['app'])
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('dsh desktop: rejected startup failure from a non-primary frame')
    }
    if (typeof message !== 'string') throw new Error('dsh desktop: startup failure must be text')
    reportFatal(new Error(message), 'web-boot')
  })

  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace: unknown) => {
    assertProductSender(event)
    return browserGuests.acquire(event.sender, workspace)
  })
  ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease: unknown) => {
    assertProductSender(event)
    return browserGuests.release(event.sender, lease)
  })

  documentSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*', 'wss://127.0.0.1/*'] }, (details, callback) => {
    if (!suiyiAccessAllowed()
      || hostUrl === undefined || hostCookie === undefined || details.webContentsId !== mainWindow?.webContents.id) {
      callback({})
      return
    }
    const target = new URL(hostUrl)
    const requested = new URL(details.url)
    if (requested.host !== target.host || requested.protocol !== (target.protocol === 'https:' ? 'wss:' : 'ws:')) { callback({}); return }
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value]))
    if (headers.origin !== 'dsh-app://app') { callback({ cancel: true }); return }
    callback({ requestHeaders: { ...headers, origin: target.origin, cookie: hostCookie, 'sec-fetch-site': 'same-origin' } })
  })

  const assertMainApplication = (event: IpcMainInvokeEvent): BrowserWindow => {
    if (!suiyiAccessAllowed()) {
      throw new Error('Suiyi workspace is locked')
    }
    const owner = mainWindow
    if (owner === undefined || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame
      || !event.senderFrame.url.startsWith('dsh-app://app/')) throw new Error('Rejected Platform command')
    return owner
  }
  installFileActions(assertMainApplication, () => hostUrl)
  ipcMain.on(PLATFORM_IPC.bootstrap, (event) => {
    try { event.returnValue = platformView.bootstrap(event) }
    catch { event.returnValue = null }
  })
  ipcMain.handle(PLATFORM_IPC.open, (event, page: unknown, bounds: unknown) => {
    const owner = assertMainApplication(event)
    if (page !== 'usage' && page !== 'top-up') throw new Error('Invalid Platform page')
    return platformView.open(owner, page, platformBounds(bounds))
  })
  ipcMain.handle(PLATFORM_IPC.bounds, (event, bounds: unknown) => {
    assertMainApplication(event)
    platformView.setBounds(platformBounds(bounds))
  })
  ipcMain.handle(PLATFORM_IPC.close, (event) => { assertMainApplication(event); platformView.close() })
  // Only the main window may synchronize its palette with the native material.
  ipcMain.on(DESKTOP_IPC.nativeThemeSet, (event, source: unknown) => {
    if (mainWindow === undefined || event.sender !== mainWindow.webContents) return
    if (source === 'light' || source === 'dark' || source === 'system') nativeTheme.themeSource = source
  })
  ipcMain.handle(DESKTOP_IPC.localeBootstrap, async (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
      || new URL(event.senderFrame.url).origin !== new URL(applicationUrl).origin) {
      throw new Error('desktop welcome: rejected locale request from an unowned frame')
    }
    if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
    return { languages: systemLanguages, preference: await welcomeBackend.readLocalePreference() }
  })
  ipcMain.on(DESKTOP_IPC.localeChanged, (event, next: unknown) => {
    const window = mainWindow
    if (window === undefined || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || typeof next !== 'string') return
    const current = brandDesktopLocale(resolveDesktopStartupLocale(next, systemLanguages))
    writeDesktopLocaleCache(app.getPath('userData'), current.id)
    if (current.id === locale.id) return
    locale = current
    platformView.notifyLocaleChanged()
    windowsLanguage = locale.id
    refreshApplicationMenu()
  })
  ipcMain.handle(DESKTOP_IPC.updatesChannelGet, (event) => {
    assertProductSender(event)
    return channelState
  })
  let channelRequests = 0
  ipcMain.handle(DESKTOP_IPC.updatesChannelSet, async (event, channel: unknown): Promise<DesktopChannelChangeResult> => {
    assertProductSender(event)
    if (!isDesktopUpdateChannel(channel)) throw new Error('desktop update: unsupported channel')
    if (channelState === undefined) throw new Error('desktop update: settings are not initialized')
    channelRequests++
    publishChannel({ ...channelState, changing: true })
    try {
      const kind = await updates.switchChannel(channel, async () => {
        try { await channelSettings.save(channel) } catch (error) {
          if (channelSaveFailure(error) === 'uncertain') {
            updates.suspendConfiguration('desktop update: settings save outcome is unknown')
            publishChannel({ channel: updates.selectedChannel, packagedChannel, changing: true, error: 'read' })
          }
          throw error
        }
      })
      if (kind === 'applied') void mandatoryPolicy?.check('channel-change', true).catch((error: unknown) => { console.error(error) })
      return { kind, state: publishChannel({ channel: updates.selectedChannel, packagedChannel, changing: --channelRequests > 0 }) }
    } catch (error) {
      console.error('desktop update: channel change failed', error)
      const state = publishChannel({ ...channelState, changing: --channelRequests > 0,
        ...(updates.configurationFailure === 'cleanup' ? { error: 'cleanup' as const } : {}) })
      return { kind: 'failed', state, reason: channelSaveFailure(error) }
    }
  })
  ipcMain.handle(DESKTOP_IPC.updatesStatus, (event) => {
    assertProductSender(event)
    return updatePresentation(updates.state)
  })
  ipcMain.handle(DESKTOP_IPC.suiyiIdentityView, (event) => {
    assertProductSender(event)
    return suiyiIdentityView()
  })
  ipcMain.handle(DESKTOP_IPC.suiyiWelcome, async (event) => {
    assertProductSender(event)
    if (!desktopIdentity.suiyi || !suiyiAccessAllowed()) throw new Error('Suiyi welcome requires a valid login')
    if (suiyiWelcomeWindow !== undefined && !suiyiWelcomeWindow.isDestroyed()) {
      suiyiWelcomeWindow.show()
      suiyiWelcomeWindow.focus()
      return
    }
    if (openingSuiyiWelcome !== undefined) return openingSuiyiWelcome
    const opening = (async (): Promise<void> => {
      const window = await openSuiyiWelcomeWindow(locale)
      if (!suiyiAccessAllowed() || isQuitting()) { window.destroy(); return }
      suiyiWelcomeWindow = window
      window.once('closed', () => {
        if (suiyiWelcomeWindow === window) suiyiWelcomeWindow = undefined
        if (suiyiAccessAllowed() && mainWindow !== undefined && !mainWindow.isDestroyed()) mainWindow.focus()
      })
      window.show()
      window.focus()
    })().finally(() => { openingSuiyiWelcome = undefined })
    openingSuiyiWelcome = opening
    return opening
  })
  ipcMain.handle(DESKTOP_IPC.suiyiIdentitySignIn, async (event) => {
    assertProductSender(event)
    return await suiyiSignIn()
  })
  ipcMain.handle(DESKTOP_IPC.suiyiIdentitySignOut, (event) => {
    assertProductSender(event)
    // The handler acknowledges before the workspace is torn down; the caller
    // window is intentionally destroyed by the lock lifecycle.
    setImmediate(() => {
      void suiyiSignOut().catch(() => {
        // The sign-out path owns its cleanup; this is the last unhandled guard.
        console.error('Suiyi sign-out failed')
      })
    })
  })
  ipcMain.handle(DESKTOP_IPC.deviceInfo, (event) => {
    assertProductSender(event)
    return readDeviceInfo()
  })
  ipcMain.handle(DESKTOP_IPC.onboardingApiKey, async (event) => {
    assertProductSender(event)
    return (await readWelcomeState()).hasApiKey
  })
  ipcMain.on(DESKTOP_IPC.onboardingActive, (event, active: unknown) => {
    const window = mainWindow
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame
      || !event.senderFrame.url.startsWith(`${SCHEME}://app/`) || typeof active !== 'boolean') return
    window.setMinimumSize(active ? 960 : 520, 600)
    if (active) {
      const { width, height } = window.getBounds()
      if (width < 960) window.setSize(960, height)
    }
  })
  ipcMain.handle(DESKTOP_IPC.updatesOpen, async (event) => {
    assertProductSender(event)
    await openUpdatePrompt()
  })

  let configurationPrompt: Promise<void> | undefined
  const showConfigurationError = (): Promise<void> => {
    configurationPrompt ??= Promise.resolve().then(async () => {
      while (channelState?.error !== undefined) {
        const result = await ordinaryMessageBox({ type: 'error', title: locale.messages.updateFailedTitle,
          message: configurationMessage(channelState.error, locale.messages),
          ...{ detail: channelSettings.path,
            buttons: [locale.messages.updateReloadSettings, locale.messages.updateShowSettingsFile, locale.messages.updateClose],
            defaultId: 0, cancelId: 2,
            keepOpenAction: { index: 1, run: () => { shell.showItemInFolder(channelSettings.path) } },
            action: { index: 0, run: async () => {
              if (channelRequests > 0 || channelState === undefined) return false
              channelRequests++
              publishChannel({ ...channelState, changing: true })
              try {
                const loaded = await channelSettings.load()
                if (loaded.kind === 'error') {
                  publishChannel({ ...channelState, changing: true, error: configurationFailure(loaded.error) })
                  return false
                }
                await updates.switchChannel(loaded.channel, async () => {})
                publishChannel({ channel: updates.selectedChannel, packagedChannel, changing: true })
                return true
              } catch (error) {
                console.error('desktop update: settings reload failed', error)
                publishChannel({ ...channelState,
                  ...(updates.configurationFailure === 'cleanup' ? { error: 'cleanup' as const } : {}) })
                return false
              } finally {
                publishChannel({ ...channelState, changing: --channelRequests > 0 })
              }
            } } },
        }, mandatoryUI?.confirmationWindow ?? currentDialogWindow())
        if (result.response !== 0) return
      }
    }).finally(() => { configurationPrompt = undefined })
    return configurationPrompt
  }

  let promptOperation: Promise<void> | undefined
  let policyAuthenticationQueued = false
  /** Present check results only while their captured channel revision remains current. */
  const openUpdatePrompt = (manual = false): Promise<void> => {
    if (channelState?.error !== undefined) {
      return showConfigurationError()
    }
    if (authenticationOperation !== undefined) {
      policyAuth?.focus(); updateDialog.focus()
    }
    let failedOperation: 'check' | 'download' | 'install' = 'check'
    promptOperation ??= Promise.resolve().then(async () => {
      if (manual) updateJournal?.action('check-requested')
      const joinedPolicyAuthentication = authenticationOperation !== undefined
      if (joinedPolicyAuthentication) await authenticatePolicy()
      if (isMandatory()) {
        mandatoryUI?.focus()
        if (manual) await Promise.all([checkPolicyManually(), updateSchedule.check(true)])
        return
      }
      let controller: AbortController | undefined
      let progress: Promise<unknown> | undefined
      try {
        let state = updates.state
        const revision = updates.revision
        if (manual || state.phase === 'idle' || (state.phase === 'error' && state.failedOperation === 'check')) {
          controller = new AbortController()
          ordinaryDialogs.add(controller)
          const parent = currentDialogWindow()
          progress = parent === undefined ? Promise.resolve() : updateDialog.show(parent, { type: 'info', title: locale.messages.updateCheckTitle,
            message: locale.messages.updateChecking, buttons: [locale.messages.later], cancelId: 0, signal: controller.signal })
          if (!joinedPolicyAuthentication) {
            void checkPolicyManually('deferred').catch((error: unknown) => { console.error(error) })
          }
          state = await updateSchedule.check(true)
        }
        if (revision !== updates.revision) return
        if (isMandatory()) { mandatoryUI?.focus(); return }
        if (state.phase === 'error' && state.failedOperation === 'check') { await showUpdateFailure(state); return }
        if (state.phase === 'idle') {
          await ordinaryMessageBox({ type: 'info', title: locale.messages.updateCheckTitle,
            message: locale.messages.updateCurrent,
            detail: formatDesktopMessage(locale.messages.updateCurrentDetail, { version: app.getVersion() }) })
          return
        }
        if (state.phase === 'ready' || (state.phase === 'error' && state.failedOperation === 'install')) {
          if (state.version !== undefined) {
            failedOperation = 'install'
            await showUpdateFailure(await updates.install(state.version, revision))
          }
          return
        }
        if (state.phase !== 'available' && !(state.phase === 'error' && state.failedOperation === 'download')) return
        if (manual) {
          const result = await ordinaryMessageBox({ title: locale.messages.updateCheckTitle,
            message: formatDesktopMessage(locale.messages.updateAvailable, { version: state.version ?? '' }),
            detail: locale.messages.updateDetail,
            buttons: [locale.messages.updateDownload], cancelId: 1 })
          if (result.response !== 0) return
        }
        if (!isMandatory() && state.version !== undefined) {
          controller?.abort()
          failedOperation = 'download'
          await showUpdateFailure(await downloadUpdate(state.version, revision))
        }
      } finally {
        controller?.abort()
        if (controller !== undefined) ordinaryDialogs.delete(controller)
        await progress
      }
    }).catch((error: unknown) => showUpdateFailure({ phase: 'error', failedOperation,
      message: desktopErrorState(error).message }))
      .finally(() => { promptOperation = undefined; flushQueuedPolicyAuthentication() })
    return promptOperation
  }

  let authenticationOperation: Promise<DesktopPolicyState | undefined> | undefined
  const authenticatePolicy = () => {
    if (authenticationOperation !== undefined) { policyAuth?.focus(); updateDialog.focus() }
    authenticationOperation ??= runPolicyAuthentication().finally(() => { authenticationOperation = undefined })
    return authenticationOperation
  }
  const flushQueuedPolicyAuthentication = (): void => {
    if (!policyAuthenticationQueued || promptOperation !== undefined || authenticationOperation !== undefined
      || isMandatory() || quitting) return
    policyAuthenticationQueued = false
    void authenticatePolicy().catch((error: unknown) => { console.error(error) })
  }
  const queuePolicyAuthentication = (): void => {
    if (!desktopSettings.updates.allowTestAuthPopupWindow) return
    if (authenticationOperation !== undefined) {
      policyAuth?.focus(); updateDialog.focus()
      return
    }
    policyAuthenticationQueued = true
    flushQueuedPolicyAuthentication()
  }
  const runPolicyAuthentication = async () => {
    if (!desktopSettings.updates.allowTestAuthPopupWindow
      || policyAuth === undefined || mandatoryPolicy === undefined || quitting) return undefined
    const parent = mandatoryUI?.confirmationWindow ?? currentDialogWindow()
    if (parent === undefined) return undefined
    const consent = await updateDialog.show(parent, { type: 'info', title: locale.messages.policyLoginTitle,
      message: locale.messages.policyLoginRequired, buttons: [locale.messages.policyLogin, locale.messages.later], cancelId: 1 })
    if (consent.response !== 0 || isQuitting()) return undefined
    const outcome = await policyAuth.login()
    if (isQuitting() || outcome === 'cancelled') return undefined
    if (outcome === 'failed') {
      await updateDialog.show(parent, { type: 'error', title: locale.messages.policyLoginTitle,
        message: locale.messages.policyLoginFailed, buttons: [locale.messages.updateAcknowledge], cancelId: 0 })
      return undefined
    }
    // Drain a pre-login request before asking the server to evaluate the new cookies.
    await mandatoryPolicy.check('login-return')
    if (isQuitting()) return undefined
    return mandatoryPolicy.check('login-return', true)
  }

  const checkPolicyManually = async (authentication: 'immediate' | 'deferred' = 'immediate') => {
    if (authenticationOperation !== undefined) return authenticatePolicy()
    const policy = await mandatoryPolicy?.check('manual', true)
    if (policy?.error !== 'authentication-required' || !desktopSettings.updates.allowTestAuthPopupWindow) return policy
    if (authentication === 'immediate') return authenticatePolicy()
    queuePolicyAuthentication()
    return policy
  }

  const automaticCheck = (): void => {
    if (!quitting) void mandatoryPolicy?.check('foreground-or-resume').catch((error: unknown) => { console.error(error) })
    if (!quitting) void updateSchedule.check().catch((error: unknown) => { console.error(error) })
  }
  powerMonitor.on('resume', automaticCheck)
  app.on('will-quit', () => {
    updateSchedule.dispose()
    powerMonitor.off('resume', automaticCheck)
    updates.dispose()
  })

  const applicationIconPath = development ? join(app.getAppPath(), 'resources', desktopIdentity.suiyi ? 'suiyi' : '', 'icon-windows.png')
    : join(process.resourcesPath, 'icon.png')
  app.setAboutPanelOptions({
    applicationName: desktopIdentity.displayName,
    applicationVersion: app.getVersion(),
    // The release has no separate build number; omit Electron's bundle version.
    version: '',
    copyright: '',
    iconPath: applicationIconPath,
  })
  // A custom application menu replaces Electron's default menu, so macOS needs
  // its standard menus and application hide commands declared explicitly.
  // Keep app.name stable: Electron derives its default userData directory from it.
  const darwin = process.platform === 'darwin'
  // A copy of Electron 44's macOS Edit menu that binds Paste and Match Style to Shift+Command+V
  // (#7782) and keeps Electron's Option+Shift+Command+V as a hidden alias.
  const macEditMenu = (messages: DesktopMessages): MenuItemConstructorOptions => ({ role: 'editMenu', submenu: [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'pasteAndMatchStyle', accelerator: 'Shift+Command+V' },
    { role: 'pasteAndMatchStyle', accelerator: 'Option+Shift+Command+V', visible: false, acceleratorWorksWhenHidden: true },
    { role: 'delete' },
    { role: 'selectAll' },
    { type: 'separator' },
    { label: messages.substitutionsMenu, submenu: [
      { role: 'showSubstitutions' },
      { type: 'separator' },
      { role: 'toggleSmartQuotes' },
      { role: 'toggleSmartDashes' },
      { role: 'toggleTextReplacement' },
    ] },
    { label: messages.speechMenu, submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] },
  ] })
  const platformMenus = (): MenuItemConstructorOptions[] => darwin
    ? [shortcuts.fileMenu(currentDesktopLocale().messages), macEditMenu(currentDesktopLocale().messages), { role: 'windowMenu' }]
    : [{ role: 'editMenu' }]
  const hideCommands: MenuItemConstructorOptions[] = darwin
    ? [{ role: 'hide', label: currentDesktopLocale().messages.hideApplication },
      { role: 'hideOthers', label: currentDesktopLocale().messages.hideOtherApplications },
      { role: 'unhide', label: currentDesktopLocale().messages.showAllApplications }, { type: 'separator' }]
    : []
  const applicationItems = (): MenuItemConstructorOptions[] => [
    // Windows has no system About panel; Electron's fallback is a plain
    // message box, so the shell shows its own dimmed dialog instead.
    process.platform === 'win32'
      ? { label: currentDesktopLocale().messages.aboutMenu,
        click: () => { void showAbout().catch((error: unknown) => { console.error(error) }) } }
      : { label: currentDesktopLocale().messages.aboutMenu, role: 'about' },
    { type: 'separator' },
    { label: currentDesktopLocale().messages.checkUpdatesMenu, click: () => { void openUpdatePrompt(true) } },
    ...!desktopIdentity.suiyi && (process.platform === 'darwin' || process.platform === 'win32')
      ? [{ label: currentDesktopLocale().messages.cliCommandMenu, click: () => { void commandManager.show() } }] : [],
    { type: 'separator' },
    ...development ? [
      { label: currentDesktopLocale().messages.reloadPageMenu, role: 'reload' as const },
      { label: currentDesktopLocale().messages.restartAppHostMenu, click: () => {
        if (quitting) return
        app.relaunch()
        quitWithoutConfirmation()
      } },
    ] : [],
    { role: 'toggleDevTools', label: currentDesktopLocale().messages.toggleDevToolsMenu },
    { type: 'separator' },
    ...hideCommands,
    { role: 'quit', ...(darwin ? { label: currentDesktopLocale().messages.quitApplication }
      : process.platform === 'win32' ? { label: currentDesktopLocale().messages.exitApplication } : {}) },
  ]
  const devToolsF12Shortcut: MenuItemConstructorOptions = { role: 'toggleDevTools', visible: false, accelerator: 'F12' }
  const windowsDevToolsShortcuts: MenuItemConstructorOptions[] = [
    { role: 'toggleDevTools', visible: false },
    devToolsF12Shortcut,
  ]
  const refreshApplicationMenu = (): void => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'win32'
      ? windowsDevToolsShortcuts : [{
        label: darwin ? app.name : currentDesktopLocale().messages.application,
        submenu: [...applicationItems(), devToolsF12Shortcut],
      }, ...platformMenus()]))
    tray?.relabel()
  }
  refreshApplicationMenu()
  const trayIconPath = development ? join(app.getAppPath(), 'resources', desktopIdentity.suiyi ? 'suiyi' : '', 'tray-windows.ico')
    : join(process.resourcesPath, 'tray.ico')
  if (process.platform === 'win32') {
    // The tray is the way back to a hidden window; without it, relaunching the application still focuses it.
    try {
      tray = new DesktopTray({ iconPath: trayIconPath, locale: currentDesktopLocale,
        open: () => { focusPrimaryWindow() }, quit: () => { app.quit() } })
    } catch (error) { console.warn('desktop tray: unavailable', error) }
  }
  const backgroundNotice = process.platform === 'win32'
    ? new DesktopBackgroundNotice({ markerPath: join(app.getPath('userData'), 'background-close-confirmed'),
      locale: () => locale, show: ordinaryMessageBox, focus: () => { updateDialog.focus() } })
    : undefined
  const quitConfirmation = new DesktopQuitConfirmation({
    locale: () => locale,
    inspect: () => backend.host?.inspectQuit(),
    // No owner window: a hidden window stays hidden and the native box is its own top-level window.
    show: options => dialog.showMessageBox(options),
    // macOS raises the open alert with the application; Electron exposes no handle to the Windows task
    // dialog, so a repeated request there only joins the open decision.
    focus: () => { if (process.platform === 'darwin') app.focus({ steal: true }) },
    // The task dialog draws its main icon at the system icon size; the multi-size ICO yields that
    // size directly, where the 1024 px PNG would be scaled down by GDI.
    ...(process.platform === 'win32' ? { icon: nativeImage.createFromPath(trayIconPath) } : {}),
  })

  if (process.platform === 'win32') {
    ipcMain.handle(DESKTOP_IPC.windowsMenu, (event, name: unknown, x: unknown, y: unknown) => {
      assertDesktopSender(event, ['app'])
      if (mainWindow === undefined || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('desktop menu: rejected sender')
      if ((name !== 'application' && name !== 'edit')
        || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)
        || x < 0 || y < 0 || x > 100_000 || y > 100_000) throw new Error('desktop menu: invalid popup request')
      const window = mainWindow
      // Editor-owned history listens to key events rather than Chromium's native undo stack.
      const editItem = (label: string, keyCode: string, modifiers: Array<'control'>, accelerator?: string): MenuItemConstructorOptions => ({
        label,
        ...(accelerator === undefined ? {} : { accelerator }),
        click: () => {
          shortcuts.sendEditingKey(keyCode, modifiers)
        },
      })
      const editItems: MenuItemConstructorOptions[] = [
        editItem(currentDesktopLocale().messages.undo, 'Z', ['control'], 'Ctrl+Z'),
        editItem(currentDesktopLocale().messages.redo, 'Y', ['control'], 'Ctrl+Y'),
        { type: 'separator' },
        editItem(currentDesktopLocale().messages.cut, 'X', ['control'], 'Ctrl+X'),
        editItem(currentDesktopLocale().messages.copy, 'C', ['control'], 'Ctrl+C'),
        editItem(currentDesktopLocale().messages.paste, 'V', ['control'], 'Ctrl+V'),
        editItem(currentDesktopLocale().messages.delete, 'Delete', []),
        { type: 'separator' },
        editItem(currentDesktopLocale().messages.selectAll, 'A', ['control'], 'Ctrl+A'),
      ]
      // Suiyi has one toolbar menu button; its application popup also carries
      // the complete editing commands instead of losing the old Edit menu.
      const items: MenuItemConstructorOptions[] = name === 'application'
        ? [...applicationItems(), ...desktopIdentity.suiyi ? [{ type: 'separator' } as MenuItemConstructorOptions, ...editItems] : []]
        : editItems
      const zoom = mainWindow.webContents.getZoomFactor()
      return new Promise<void>((resolve) => {
        Menu.buildFromTemplate(items).popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve })
      })
    })
    ipcMain.on(DESKTOP_IPC.windowsAppearance, (event, _language: unknown, color: unknown, symbolColor: unknown) => {
      if (mainWindow === undefined || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame) return
      if (!event.senderFrame.url.startsWith(`${SCHEME}://app/`)) return
      // Document lang starts as English before Host locale bootstrap; only localeChanged owns shell language.
      // Empty colors precede client stylesheet installation; only CSS color values cross IPC.
      const validColor = (value: unknown): value is string => typeof value === 'string'
        && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value)
      if (validColor(color) && validColor(symbolColor)) mainWindow.setTitleBarOverlay({ color, symbolColor })
    })
  }

  const hideMainWindow = (window: BrowserWindow): void => {
    if (process.platform === 'darwin' && window.isFullScreen()) {
      // Hiding a fullscreen window leaves an empty black space; leave fullscreen first.
      window.once('leave-full-screen', () => { if (!window.isDestroyed()) window.hide() })
      window.setFullScreen(false)
    } else {
      window.hide()
    }
  }
  const createMainWindow = (): BrowserWindow => {
    const window = createWindow(appPreload, false, true)
    mainWindow = window
    browserGuests.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name))
    shortcuts.attach(window)
    window.on('focus', automaticCheck)
    // Closing hides: the page and the Host keep running, and the next show resumes the same document.
    window.on('close', (event) => {
      if (quitting || shellInstallerOwnsQuit || sessionEnding) return
      event.preventDefault()
      if (updateDialog.isOpen) { updateDialog.focus(); return }
      const hide = (): void => {
        if (!quitting && !shellInstallerOwnsQuit && !sessionEnding && !window.isDestroyed()) hideMainWindow(window)
      }
      if (backgroundNotice === undefined) hide()
      else backgroundNotice.close(hide)
    })
    if (process.platform === 'win32') {
      // Shutdown, restart, and log-off must not wait on a confirmation. query-session-end is only a
      // question that another application can veto without any follow-up message, so it does not count.
      window.on('session-end', () => { sessionEnding = true })
    } else {
      // The macOS power-off notification arrives before the terminate request; a cancelled shutdown
      // leaves the process running, and user attention on the window shows the session continues.
      window.on('focus', () => { sessionEnding = false })
      window.on('show', () => { sessionEnding = false })
    }
    window.on('closed', () => { if (mainWindow === window) mainWindow = undefined })
    window.webContents.on('console-message', (details) => {
      if (details.level !== 'error') return
      rendererConsole.push(`${details.sourceId}:${String(details.lineNumber)} ${details.message}`)
    })
    window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && !quitting && !window.isDestroyed()) {
        reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`), 'renderer')
      }
    })
    window.webContents.on('preload-error', (_event, _path, error) => {
      if (!quitting && !window.isDestroyed()) reportFatal(error, 'renderer')
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      navigation = undefined
      if (!quitting && !window.isDestroyed() && details.reason !== 'clean-exit') {
        reportFatal(new Error(`Desktop renderer exited: ${details.reason}`), 'renderer')
      }
    })
    return window
  }
  const enterWorkspace = async ({ activate = true }: { activate?: boolean } = {}): Promise<void> => {
    if (quitting || !suiyiAccessAllowed()) return
    const window = mainWindow ?? createMainWindow()
    await navigateMain(applicationUrl)
    if (isQuitting() || recovery.active || window.isDestroyed()) return
    if (activate) window.show()
    else window.showInactive()
    suiyiLoginHandoff?.close()
    suiyiLoginHandoff = undefined
    enteredWorkspace = true
    publishSuiyiIdentity()
    if (welcomeWindow !== undefined) {
      welcomeWindow.close()
      window.webContents.send(DESKTOP_IPC.enterWorkspace)
    }
    welcomeWindow = undefined
    if (raiseAfterUpdate) {
      raiseAfterUpdate = false
      window.moveTop()
      window.focus()
    }
    if (activate && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== '0') {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  }
  let openingWelcome: Promise<void> | undefined
  const showWelcome = (): Promise<void> => {
    if (quitting) return Promise.resolve()
    if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) {
      if (!welcomeWindow.isVisible()) void track('auth_page_view', {})
      welcomeWindow.show()
      welcomeWindow.focus()
      return Promise.resolve()
    }
    openingWelcome ??= (async () => {
      welcomeWindow = await openWelcomeWindow(locale, {
        analytics: track,
        analyticsEnabled: () => Promise.resolve(analyticsEnabled),
        takeNotice: () => {
          const notice = pendingWelcomeNotice
          pendingWelcomeNotice = undefined
          return Promise.resolve(notice)
        },
        startSignIn: async () => {
          if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
          return welcomeBackend.account.start(desktopClientMetadata(locale.id))
        },
        cancelSignIn: async (id) => {
          if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
          return welcomeBackend.account.cancel(id)
        },
        copySignInLink: async (id) => {
          const state = await welcomeBackend?.account.state()
          if (state?.attempt?.id !== id || state.attempt.phase !== 'waiting-browser' || state.attempt.authorizeUrl === undefined) {
            throw new Error('desktop welcome: login link is unavailable')
          }
          await clipboard.writeText(platformLoginUrl(state.attempt.authorizeUrl))
        },
        saveApiKey: async (apiKey) => {
          if (backend.host === undefined || welcomeBackend === undefined) return { ok: false }
          const saved = await welcomeBackend.save(apiKey)
          if (!saved.ok) return saved
          await enterWorkspace()
          return { ok: true }
        },
        skip: enterWorkspace,
      })
      const window = welcomeWindow
      window.once('closed', () => {
        void welcomeBackend?.account.state().then((state) => {
          if (state.attempt !== null && !enteredWorkspace) return welcomeBackend?.account.cancel(state.attempt.id)
          return undefined
        }).catch(() => undefined)
      })
      window.once('closed', () => {
        if (welcomeWindow === window) welcomeWindow = undefined
        if (enteredWorkspace || recovery.active) return
        // Nothing runs before the workspace opens. macOS keeps the Dock convention and drops the
        // unused main window so the next activation rebuilds the welcome; elsewhere the close quits.
        if (process.platform === 'darwin') mainWindow?.destroy()
        else app.quit()
      })
      if (isQuitting() || recovery.active || enteredWorkspace) window.close()
      else mainWindow?.hide()
    })().finally(() => { openingWelcome = undefined })
    return openingWelcome
  }
  const openInitialWindow = async (): Promise<void> => {
    if (quitting || recovery.active) return
    if (desktopIdentity.suiyi) {
      suiyiLogin()
      // Keycloak is the Suiyi login; DeepSeek account/API keys are model choices, not an entry gate.
      await enterWorkspace()
      return
    }
    const state = await readWelcomeState()
    if (isQuitting() || backend.state.phase !== 'ready') return
    locale = brandDesktopLocale(resolveDesktopStartupLocale(state.localePreference, systemLanguages))
    writeDesktopLocaleCache(app.getPath('userData'), locale.id)
    windowsLanguage = locale.id
    refreshApplicationMenu()
    if (!enteredWorkspace && needsWelcome({ loggedIn: state.loggedIn, hasApiKey: state.hasApiKey })) {
      // A later login must retain its own activation policy instead of replaying startup focus.
      raiseAfterUpdate = false
      await showWelcome()
    } else {
      await enterWorkspace()
    }
  }
  focusPrimaryWindow = () => {
    if (quitting) return
    if (!suiyiAccessAllowed()) {
      if (suiyiExpiryWatch !== undefined) suiyiExpiryWatch.promptWhileLocked()
      else void suiyiSignIn()
      return
    }
    if (isMandatory()) { mandatoryUI?.focus(); return }
    const window = welcomeWindow ?? mainWindow
    if (window === undefined || window.isDestroyed()) {
      try { createMainWindow() } catch (error) { reportFatal(error, 'main'); return }
      void (backend.state.phase === 'ready' ? openInitialWindow() : navigateMain(applicationUrl)).catch((error: unknown) => { reportFatal(error, 'main') })
      return
    }
    // Startup and sign-out select the visible window before activation may reveal the workspace.
    if (window === mainWindow && !enteredWorkspace) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient(desktopIdentity.scheme)
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (isDesktopOpenUrl(url)) focusPrimaryWindow()
  })

  app.on('activate', (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows) focusPrimaryWindow()
  })
  if (process.platform !== 'win32') powerMonitor.on('shutdown', () => { sessionEnding = true })
  const finishQuit = (): void => {
    quitting = true
    shuttingDown = true
    updateJournal?.action('quit-requested')
    quitConfirmation.dispose()
    backgroundNotice?.dispose()
    tray?.dispose()
    stopAccount?.()
    if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.hide()
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) mainWindow.hide()
    updateSchedule.dispose()
    updateDialog.dispose()
    mandatoryUI?.dispose()
    void Promise.all([stopOperationReports(), Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()),
      backend.close().then(async () => { await operationJournal?.drain(500) }, async (error: unknown) => {
        await operationJournal?.drain(500)
        throw error
      }),
      platformView.dispose(),
      disposeFileDrag(),
    ].map(cleanup => cleanup.catch(() => { console.error('Desktop quit cleanup failed') })))
      .then(() => { app.quit() })
  }
  app.on('before-quit', (event) => {
    if (shellInstallerOwnsQuit) {
      shuttingDown = true
      quitConfirmation.dispose()
      backgroundNotice?.dispose()
      updateJournal?.action('quit-requested')
      tray?.dispose()
      updateDialog.dispose()
      mandatoryUI?.dispose()
      // Installation preparation already awaited Platform storage cleanup.
      void platformView.dispose().catch((error: unknown) => { console.error(error) })
      return
    }
    if (quitting) return
    event.preventDefault()
    if (skipQuitConfirmation || sessionEnding) { finishQuit(); return }
    void quitConfirmation.confirm().then((approved) => {
      if (quitting || shellInstallerOwnsQuit) return
      if (approved) { finishQuit(); return }
      // A quit that started from closing the welcome window destroyed it; a cancelled quit needs it back.
      if (!enteredWorkspace && !recovery.active) void showWelcome().catch((error: unknown) => { reportFatal(error, 'main') })
    }).catch((error: unknown) => { console.error(error); if (!quitting && !shellInstallerOwnsQuit) finishQuit() })
  })

  mainWindow = createMainWindow()
  startupWindowPending = false
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop policy: invalid application manifest')
  const developmentPolicy = app.isPackaged ? undefined : process.env.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG
  const policyInput: unknown = app.isPackaged
    ? ('dshMandatoryUpdatePolicy' in manifest ? manifest.dshMandatoryUpdatePolicy : undefined)
    : developmentPolicy === undefined ? undefined : JSON.parse(developmentPolicy) as unknown
  const policyConfig = desktopIdentity.suiyi ? undefined : resolveDesktopPolicyConfig(policyInput, !app.isPackaged)
  if (policyConfig !== undefined) {
    if (policyConfig.authentication === 'feishu-test') {
      policyAuth = new DesktopPolicyTestAuth(policyConfig.origin, policyConfig.allowedAuthOrigins, locale,
        () => mandatoryUI?.confirmationWindow ?? currentDialogWindow(),
        (event) => { console.info(`desktop policy authentication: ${event}`); updateJournal?.action(`policy-login-${event}`) })
    }
    if (!['win32', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) throw new Error('desktop policy: unsupported platform')
    let wasBlocking = false
    mandatoryPolicy = new DesktopMandatoryUpdatePolicy(policyConfig, {
      platform: process.platform as 'win32' | 'darwin', arch: process.arch as 'x64' | 'arm64',
      get channel() { return updates.selectedChannel },
      bundledDshVersion: app.isPackaged ? readDesktopRuntime(resources.dsh).release.version : app.getVersion(),
    }, (state) => {
      if (state.error !== 'authentication-required') policyAuthenticationQueued = false
      if (state.blocking) {
        for (const controller of ordinaryDialogs) controller.abort()
        if (!wasBlocking) updateDialog.cancel()
      }
      mandatoryUI?.sync()
      if (state.blocking && !wasBlocking) void updateSchedule.check(false, true).catch((error: unknown) => { console.error(error) })
      wasBlocking = state.blocking
    }, policyAuth?.request, () => desktopClientMetadata(locale.id))
    const policy = mandatoryPolicy
    mandatoryUI = new DesktopMandatoryUpdateWindow({
      overlays: updateOverlays,
      preload: fileURLToPath(new URL('./preload-mandatory.cjs', import.meta.url)), locale,
      allowedPageOrigins: policyConfig.allowedPageOrigins, parent: () => mainWindow,
      policy: () => policy.state, update: () => updates.state,
      refresh: async () => {
        if (channelState?.error !== undefined) await showConfigurationError()
        if (channelState?.error === undefined) await Promise.all([checkPolicyManually(), updateSchedule.check(true)])
      },
      download: downloadUpdate, install: version => updates.install(version),
    })
    void mandatoryPolicy.check('launch').then((state) => {
      if (app.isPackaged && state.error === 'authentication-required' && !isQuitting()) queuePolicyAuthentication()
    }).catch((error: unknown) => { console.error(error) })
  }
  // All lock effects, backend dependencies and window lifecycle handlers now
  // exist. Arm expiry before any Host startup; an expired startup login locks
  // the existing hidden window without launching a Host.
  armSuiyiExpiry?.()
  if (desktopIdentity.suiyi && suiyiAccessAllowed()) await enterWorkspace()
  if (!desktopIdentity.suiyi || suiyiAccessAllowed()) {
    automaticCheck()
    await reconcileBackend().catch(() => undefined)
  }
  // Window lifecycle callbacks run while backend startup is pending.
  if (isQuitting()) return
  const window = currentMainWindow()
  if (window !== undefined && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== '0') {
    window.webContents.openDevTools({ mode: 'detach' })
  }
  publishUpdate(updateState)
}

const ownsDesktopInstance = claimDesktopSingleInstance(app, () => { focusPrimaryWindow() })

if (ownsDesktopInstance) void app.whenReady().then(main).catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(error)
  const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE
  if (diagnosticFile !== undefined) {
    await writeFile(diagnosticFile, `${error instanceof Error ? error.stack ?? message : message}\n`).catch(() => undefined)
  }
  reportFatal(error, 'main')
}).catch(async (error: unknown) => {
  console.error(error)
  shuttingDown = true
  await stopOperationReports()
  app.exit(1)
})
