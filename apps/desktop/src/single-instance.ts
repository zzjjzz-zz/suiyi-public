/** Electron single-instance ownership before any Desktop profile lifecycle begins. */

import { win32 } from 'node:path'

/** Command-line switch the Windows uninstaller passes to ask the running application to quit. */
export const UNINSTALL_QUIT_SWITCH = '--suiyi-uninstall-quit'

/** Minimal Electron application operations needed for instance ownership. */
export interface DesktopSingleInstanceApplication {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', listener: (event: unknown, argv: string[]) => void): unknown
}

/**
 * Whether the same Windows installation sent the uninstaller's graceful-quit request.
 * @param argv - Full process command line.
 * @param executable - Running application's absolute executable path.
 * @returns true only for a matching absolute executable path and the exact switch.
 */
export function requestsUninstallQuit(argv: readonly string[], executable: string): boolean {
  const source = argv[0]
  return source !== undefined && win32.isAbsolute(source) && win32.isAbsolute(executable)
    && win32.normalize(source).toLowerCase() === win32.normalize(executable).toLowerCase()
    && argv.includes(UNINSTALL_QUIT_SWITCH)
}

/**
 * Claim the process-lifetime Desktop lock and route later launches to the owner.
 * @param application - Electron application singleton.
 * @param onSecondInstance - handles another launch, receiving its full command line.
 * @returns true only in the process that may access the Desktop profile.
 */
export function claimDesktopSingleInstance(
  application: DesktopSingleInstanceApplication,
  onSecondInstance: (argv: readonly string[]) => void,
): boolean {
  if (!application.requestSingleInstanceLock()) {
    application.quit()
    return false
  }
  application.on('second-instance', (_event, argv) => { onSecondInstance(argv) })
  return true
}
