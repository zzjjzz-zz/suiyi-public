import { readInstallerLocales } from '../scripts/installer-locales.mjs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { Arch, Platform } from 'electron-builder'
import { AppInfo, Packager } from 'app-builder-lib'
import { expandMacro } from 'app-builder-lib/out/util/macroExpander.js'
import { describe, expect, it, vi } from 'vitest'

const { execute, write } = vi.hoisted(() => ({ execute: vi.fn(async () => undefined), write: vi.fn(async () => undefined) }))
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...original, execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) }
})

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(), writeFile: write,
}))

describe('installer preparation preserves application dependencies', () => {
  it.each(['win32', 'darwin'] as const)('rejects a missing production policy before signing on %s', async (platform) => {
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    expect(() => createElectronBuilderConfig({ DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://test.example.com',
    }, platform, 'x64')).toThrow('DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN')
  })
  it.each(['win32', 'darwin'] as const)('preserves installer metadata and dependency ownership on %s', async (platform) => {
    execute.mockClear()
    write.mockClear()
    const env = {
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
      DSH_DESKTOP_TARGET_PLATFORM: platform,
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_UNSIGNED: platform === 'win32' ? '1' : '0',
      DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
      DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
      APPLE_KEYCHAIN_PROFILE: 'installer-test',
      DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com', DOWNLOAD_TEST_RELEASE_ID: '0123456789abcdef0123456789abcdef',
    }
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    try {
      const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
      const config = createElectronBuilderConfig(env, platform, 'x64')
      const metadataPackager = new Packager({ projectDir: tmpdir() })
      const metadata: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
      Object.defineProperties(metadataPackager, {
        config: { value: config },
        metadata: { value: metadata },
      })
      const appInfo = new AppInfo(metadataPackager, undefined)
      // Default official flavor retains its identity regardless of signing.
      const productName = 'DeepSeek Harness'
      expect(appInfo.companyName).toBe('Hangzhou DeepSeek Artificial Intelligence Co., Ltd.')
      expect(appInfo.copyright).toBe(`Copyright © ${new Date().getFullYear()} ${productName}`)
      if (platform === 'win32') {
        expect(expandMacro(config.nsis.uninstallDisplayName, null, appInfo, {}, false)).toBe(productName)
        expect(config.nsis.installerLanguages).toEqual(readInstallerLocales().map(locale => locale.id))
      }
      const aboutIcon = config.extraResources.find(resource => resource.to === 'icon.png')
      expect(aboutIcon).toBeDefined()
      expect(readFileSync(aboutIcon!.from)).toEqual(readFileSync(new URL('../resources/icon-windows.png', import.meta.url)))
      // Only the Windows package carries the tray bitmaps; macOS keeps the Dock.
      const trayIcon = config.extraResources.find(resource => resource.to === 'tray.ico')
      if (platform === 'win32') {
        expect(readFileSync(trayIcon!.from)).toEqual(readFileSync(new URL('../resources/tray-windows.ico', import.meta.url)))
      } else {
        expect(trayIcon).toBeUndefined()
      }
      const packager = new Packager({ projectDir: tmpdir() })
      // A foreign source-build target avoids rebuilding modules; the real dependency ownership decision still runs.
      Object.defineProperties(packager, {
        config: { value: { beforeBuild: config.beforeBuild, buildDependenciesFromSource: true } },
        framework: { value: { isNpmRebuildRequired: true, version: '42.0.0' } },
        appInfo: { value: { type: 'module' } },
      })
      vi.spyOn(packager, 'getWorkspaceRoot').mockResolvedValue(tmpdir())
      await packager.installAppDependencies(process.platform === 'win32' ? Platform.LINUX : Platform.WINDOWS, Arch.x64)
      expect(packager.areNodeModulesHandledExternally).toBe(false)
      expect(execute).toHaveBeenCalledTimes(platform === 'win32' ? 1 : 0)
      expect(write).toHaveBeenCalledTimes(platform === 'win32' ? 1 : 0)
      if (platform === 'win32') {
        expect(write).toHaveBeenCalledWith(expect.stringMatching(/installer-ui[\\/]strings\.nsh$/u),
          expect.stringContaining('LangString INSTALLER_INSTALL ${LANG_JAPANESE}'), 'utf8')
      }
    } finally {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })

  it('names unsigned Windows artifacts so they cannot pass for release builds', async () => {
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_UNSIGNED: '1',
    }, 'win32', 'x64')
    expect(config.artifactName).toBe('deepseek-harness-${version}-${os}-${arch}-unsigned.${ext}')
    expect(config.productName).toBe('DeepSeek Harness')
    expect(config.protocols).toEqual([{ name: 'DeepSeek Harness', schemes: ['dsh'] }])
  })

  it('packages every preload entry point the shell loads', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const sourceDirectory = new URL('../src/', import.meta.url)
    const referenced = new Set<string>()
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      for (const match of readFileSync(new URL(entry.name, sourceDirectory), 'utf8').matchAll(/preload-[a-z-]+\.cjs/gu)) referenced.add(match[0])
    }
    expect(referenced.size).toBeGreaterThan(0)
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://harness-test.deepseek.com',
      DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
      DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
      APPLE_KEYCHAIN_PROFILE: 'installer-test',
    }, 'darwin', 'arm64')
    const packaged = new Set(config.files.filter((entry): entry is string => typeof entry === 'string'))
    for (const name of referenced) expect(packaged.has(`lib/${name}`)).toBe(true)
  })

  it('keeps official installer artwork intact and ships distinct Suiyi bitmaps', async () => {
    execute.mockClear()
    write.mockClear()
    const assets = new URL('../installer/assets/', import.meta.url)
    const officialHashes: Record<string, string> = {
      'brand.png': '3276df8a1d3491160e9436a4b5690444c96c1351661901a84581ff216d10fd2f',
      'brand-2x.png': '2d3538a84ecf40619053218f9f32ee853d26614377cbcd8d3c96a9a0192ac529',
      'brand-dark.png': '59901811702183ee8047b61ca7d0be9adc6c1bbd8f6d630f859b60b0e583cd9a',
      'brand-dark-2x.png': 'd9ac067d453cceace270fdf17158a2dccd8df5577f35639699030d6a80c39e40',
      'uninstaller-sidebar.png': 'f853ea4d1d54fc9aa55565ce05ae51c1f577db835636dadb74db54cd8b00e3ea',
    }
    const dimensions = (bytes: Buffer) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
    for (const [name, width, height] of [
      ['brand.png', 600, 196],
      ['brand-2x.png', 1200, 392],
      ['brand-dark.png', 600, 196],
      ['brand-dark-2x.png', 1200, 392],
      ['uninstaller-sidebar.png', 164, 314],
    ] as const) {
      const official = readFileSync(new URL(name, assets))
      const suiyi = readFileSync(new URL(`suiyi/${name}`, assets))
      expect(dimensions(official)).toEqual([width, height])
      expect(dimensions(suiyi)).toEqual([width, height])
      expect(createHash('sha256').update(official).digest('hex')).toBe(officialHashes[name])
      expect(suiyi.equals(official)).toBe(false)
    }
    for (const [light, dark] of [['brand.png', 'brand-dark.png'], ['brand-2x.png', 'brand-dark-2x.png']] as const) {
      expect(readFileSync(new URL(`suiyi/${light}`, assets)).equals(readFileSync(new URL(`suiyi/${dark}`, assets)))).toBe(false)
    }
    const script = readFileSync(new URL('../scripts/prepare-windows-installer.ps1', import.meta.url), 'utf8')
    expect(script).toContain('$env:DSH_DESKTOP_FLAVOR')
    expect(script).toContain("Join-Path $installerRoot 'assets/suiyi'")
    expect(script).toContain('Unknown desktop flavor')
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_FLAVOR: 'suiyi',
      DSH_DESKTOP_APP_ID: 'com.zzjjzz.suiyi',
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_UNSIGNED: '1',
    }, 'win32', 'x64')
    await config.beforeBuild()
    expect(execute).toHaveBeenCalledWith('powershell.exe', expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ DSH_DESKTOP_FLAVOR: 'suiyi' }) }))
  })
})
