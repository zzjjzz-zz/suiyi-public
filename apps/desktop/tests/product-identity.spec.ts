import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'
import { resolveDesktopIdentity, isDesktopOpenUrl } from '../src/product-identity.ts'
import { suiyiDataPaths, suiyiHostEnvironment, initializeSuiyiStorage } from '../src/paths.ts'
import { claimDesktopSingleInstance } from '../src/single-instance.ts'
import { expandMacro } from 'app-builder-lib/out/util/macroExpander.js'
import { AppInfo, Packager } from 'app-builder-lib'
import { directoryUninstaller } from '../scripts/windows-directory-installer.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'

const base = { DSH_DESKTOP_APP_ID: 'com.deepseek.harness', DSH_DESKTOP_UNSIGNED: '1',
  DSH_DESKTOP_AUTO_UPDATE_ENV: 'test', DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.invalid',
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: '{"allowedAuthOrigins":["https://login.example.invalid"]}' }
const suiyi = { ...base, DSH_DESKTOP_FLAVOR: 'suiyi', DSH_DESKTOP_APP_ID: 'com.zzjjzz.suiyi' }

it('generates distinct actual builder identities while unsigned official retains upstream identity', () => {
  const official = createElectronBuilderConfig(base, 'win32', 'x64')
  const fork = createElectronBuilderConfig(suiyi, 'win32', 'x64')
  expect(official.productName).toBe('DeepSeek Harness')
  expect(official.protocols[0].schemes).toEqual(['dsh'])
  expect(official.appId).not.toBe(fork.appId)
  const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
  const builderRequire = createRequire(desktopRequire.resolve('app-builder-lib'))
  const { UUID } = builderRequire('builder-util-runtime') as { UUID: { parse(value: string): Buffer; v5(value: string, namespace: Buffer): string } }
  const namespace = UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')
  expect(UUID.v5(official.appId, namespace)).not.toBe(UUID.v5(fork.appId, namespace))
  const appInfo = (config: typeof fork) => {
    const packager = new Packager({ projectDir: tmpdir() })
    const metadata: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    if (typeof metadata !== 'object' || metadata === null) throw new Error('Invalid desktop manifest')
    Object.defineProperties(packager, { config: { value: config }, metadata: { value: { ...metadata, ...config.extraMetadata } } })
    return new AppInfo(packager, undefined)
  }
  expect(appInfo(fork).updaterCacheDirName).toBe('suiyi-desktop-updater')
  expect(appInfo(fork).updaterCacheDirName).not.toBe(appInfo(official).updaterCacheDirName)
  expect(appInfo(fork).productFilename).toBe('Suiyi')
  expect(expandMacro(fork.artifactName, 'x64', appInfo(fork), { os: 'win', ext: 'exe' }, false))
    .toBe(`suiyi-${appInfo(fork).version}-win-x64-unsigned.exe`)
  expect(fork.productName).toBe('Suiyi')
  expect(fork.protocols[0].schemes).toEqual(['suiyi'])
  expect(fork.publish).toBeNull()
  expect(fork.extraMetadata.dshMandatoryUpdatePolicy).toBeUndefined()
  expect(fork.extraMetadata.dshDesktopFlavor).toBe('suiyi')
  expect(fork.artifactName).toBe('suiyi-${version}-${os}-${arch}-unsigned.${ext}')
  // Negative controls use the production factory, rather than an independently re-created config.
  expect(() => createElectronBuilderConfig({ ...suiyi, DSH_DESKTOP_APP_ID: base.DSH_DESKTOP_APP_ID }, 'win32', 'x64')).toThrow(/independent appId/)
  expect(() => resolveDesktopIdentity('su iyi')).toThrow(/flavor/)
  expect(resolveDesktopIdentity(undefined)).toEqual(resolveDesktopIdentity('official'))
})

it('sets independent storage before lock acquisition and strips inherited Host configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-identity-'))
  try {
    const original = join(root, '.dsh')
    writeFileSync(original, 'original sessions')
    const environment = { DSH_HOME: original, DSH_AGENTS_HOME: join(root, '.agents'), DSH_CONFIG: 'original.yml',
      dsh_home: 'case-insensitive-windows-pollution', PATH: 'existing path', DSH_DESKTOP_DIAGNOSTIC_FILE: 'diagnostic' }
    const paths = new Map<string, string>()
    initializeSuiyiStorage({ getPath: () => root, setName: () => {}, setPath: (name, path) => { paths.set(name, path) } }, environment)
    const expected = suiyiDataPaths(root)
    expect(paths.get('userData')).toBe(expected.userData)
    expect(paths.get('sessionData')).toBe(expected.sessionData)
    for (const [key, path] of Object.entries(expected)) {
      expect(existsSync(path)).toBe(true)
      if (key !== 'userData') expect(relative(expected.userData, path).startsWith('..')).toBe(true)
    }
    const host = suiyiHostEnvironment(environment, root)
    expect(host.DSH_HOME).toBe(expected.home)
    expect(host.DSH_AGENTS_HOME).toBe(expected.agents)
    expect(host.DSH_CONFIG).toBeUndefined()
    expect(host.dsh_home).toBeUndefined()
    expect(host.PATH).toBe('existing path')
    expect(readFileSync(original, 'utf8')).toBe('original sessions')
    // Model Electron's documented userData-scoped lock and exercise our real ownership wrapper.
    const locks = new Map<string, () => void>()
    const focused: string[] = []
    const launch = (directory: string, name: string) => claimDesktopSingleInstance({
      requestSingleInstanceLock: () => {
        if (locks.has(directory)) { locks.get(directory)?.(); return false }
        return true
      }, quit: () => {}, on: (_event, focus) => { locks.set(directory, focus) },
    }, () => { focused.push(name) })
    expect(launch(original, 'official')).toBe(true)
    expect(launch(expected.userData, 'suiyi')).toBe(true)
    expect(launch(expected.userData, 'second suiyi')).toBe(false)
    expect(focused).toEqual(['suiyi'])
    // Negative control: sharing userData sends the focus to the wrong product.
    expect(launch(original, 'conflicting fork')).toBe(false)
    expect(focused).toEqual(['suiyi', 'official'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('wires early storage, protocol, updater and CLI protection into the shipped entry', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  expect(main.indexOf('initializeSuiyiStorage(app')).toBeLessThan(main.indexOf("app.getPath('userData')"))
  expect(main.indexOf('initializeSuiyiStorage(app')).toBeLessThan(main.indexOf('claimDesktopSingleInstance(app'))
  expect(main).toContain('setAsDefaultProtocolClient(desktopIdentity.scheme)')
  expect(main).not.toContain("setAsDefaultProtocolClient('dsh')")
  expect(main).toContain('desktopIdentity.suiyi ? () => false : undefined')
  expect(main).toContain('desktopIdentity.suiyi ? undefined : resolveDesktopPolicyConfig')
  const command = readFileSync(new URL('../src/command-management.ts', import.meta.url), 'utf8')
  expect(command).toContain('if (desktopIdentity.suiyi) return Promise.resolve()')
  const cleanup = readFileSync(new URL('../installer/uninstall.nsh', import.meta.url), 'utf8')
  expect(cleanup.indexOf('!ifdef DSH_SUIYI')).toBeLessThan(cleanup.indexOf('ReadEnvStr $UnHome DSH_HOME'))
  expect(cleanup).toMatch(/!ifdef DSH_SUIYI[\s\S]*?Return\s+!endif/)
  const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
  const upstreamTemplate = readFileSync(join(desktopRequire.resolve('app-builder-lib/package.json'), '..', 'templates', 'nsis', 'uninstaller.nsh'), 'utf8')
  const actualUninstaller = directoryUninstaller(upstreamTemplate)
  expect(actualUninstaller).not.toContain('RMDir /r "$APPDATA')
  expect(actualUninstaller).not.toContain('Var /GLOBAL isDeleteAppData')
  // Negative control: an incompatible template must stop packaging.
  expect(() => directoryUninstaller('unexpected upstream template')).toThrow(/template changed/)
  const template = readFileSync(new URL('../scripts/windows-directory-installer.mjs', import.meta.url), 'utf8')
  expect(template).toContain("dshDesktopFlavor === 'suiyi'")
  const workflow = readFileSync(new URL('../../../.github/workflows/suiyi-windows-unsigned.yml', import.meta.url), 'utf8')
  expect(workflow).toContain('DSH_DESKTOP_FLAVOR=suiyi')
  expect(workflow).toContain('suiyi-$env:SUIYI_TEST_VERSION-win-x64-unsigned.exe')
  expect(workflow).toContain("Join-Path $installDir 'Suiyi.exe'")
  expect(workflow).toContain("Join-Path $installDir 'Uninstall Suiyi.exe'")
})

it('rejects foreign deep links and redirected data roots without touching original data', () => {
  expect(isDesktopOpenUrl('suiyi://open', 'suiyi')).toBe(true)
  expect(isDesktopOpenUrl('dsh://open', 'suiyi')).toBe(false)
  expect(isDesktopOpenUrl('suiyi://open', 'dsh')).toBe(false)
  const root = mkdtempSync(join(tmpdir(), 'suiyi-redirect-'))
  try {
    const original = join(root, '.dsh')
    mkdirSync(original)
    writeFileSync(join(original, 'session'), 'preserved')
    symlinkSync(original, join(root, 'Suiyi'), 'junction')
    expect(() => { initializeSuiyiStorage({ getPath: () => root, setPath: () => {}, setName: () => {} }, {}) }).toThrow(/link or junction/)
    expect(readFileSync(join(original, 'session'), 'utf8')).toBe('preserved')
    expect(existsSync(join(original, 'dsh-home'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
