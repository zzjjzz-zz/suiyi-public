import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  claimDesktopSingleInstance, requestsUninstallQuit, UNINSTALL_QUIT_SWITCH,
  type DesktopSingleInstanceApplication,
} from '../src/single-instance.ts'

describe('desktop single-instance ownership', () => {
  it('quits a second process without registering lifecycle work', () => {
    const quit = vi.fn()
    const on = vi.fn()
    const application = {
      requestSingleInstanceLock: () => false,
      quit,
      on,
    } satisfies DesktopSingleInstanceApplication

    expect(claimDesktopSingleInstance(application, vi.fn())).toBe(false)
    expect(quit).toHaveBeenCalledOnce()
    expect(on).not.toHaveBeenCalled()
  })

  it('routes a later launch to the primary process with its command line', () => {
    let secondInstance: ((event: unknown, argv: string[]) => void) | undefined
    const launched = vi.fn()
    const application = {
      requestSingleInstanceLock: () => true,
      quit: vi.fn(),
      on: vi.fn((_event: 'second-instance', listener: (event: unknown, argv: string[]) => void) => {
        secondInstance = listener
      }),
    } satisfies DesktopSingleInstanceApplication

    expect(claimDesktopSingleInstance(application, launched)).toBe(true)
    secondInstance?.(undefined, ['Suiyi.exe', '--example'])
    expect(launched).toHaveBeenCalledOnce()
    expect(launched).toHaveBeenCalledWith(['Suiyi.exe', '--example'])
  })

  it('recognizes the exact uninstaller switch from the same installation', () => {
    const executable = 'C:/Apps/Suiyi/Suiyi.exe'
    expect(requestsUninstallQuit([executable, UNINSTALL_QUIT_SWITCH], executable)).toBe(true)
    expect(requestsUninstallQuit(['c:/apps/suiyi/SUIYI.EXE', UNINSTALL_QUIT_SWITCH], executable)).toBe(true)
    expect(requestsUninstallQuit([executable], executable)).toBe(false)
    expect(requestsUninstallQuit([executable, '--suiyi-uninstall-quit=1'], executable)).toBe(false)
  })

  it('rejects uninstall requests from another installation or a relative executable', () => {
    const executable = 'C:/Apps/Suiyi/Suiyi.exe'
    expect(requestsUninstallQuit(['D:/Other/Suiyi.exe', UNINSTALL_QUIT_SWITCH], executable)).toBe(false)
    expect(requestsUninstallQuit(['Suiyi.exe', UNINSTALL_QUIT_SWITCH], executable)).toBe(false)
    expect(requestsUninstallQuit([executable, UNINSTALL_QUIT_SWITCH], 'Suiyi.exe')).toBe(false)
    expect(requestsUninstallQuit([], executable)).toBe(false)
  })

  it('keeps the uninstaller switch aligned with the NSIS launcher', () => {
    const installer = readFileSync(new URL('../scripts/installer.nsh', import.meta.url), 'utf8')
    expect(installer).toContain(UNINSTALL_QUIT_SWITCH)
  })
})
