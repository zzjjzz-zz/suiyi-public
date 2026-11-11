/** Built settings UI uses the shell file API; external edits wait for a new shell startup. */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { DesktopUpdateSettings } from '../../desktop/src/update-settings.ts'
import type { DesktopChannelState, DesktopChannelChangeResult } from '../../desktop/src/ipc.ts'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'
import { openSettings } from './support.ts'

it('persists a Desktop channel from Settings and keeps external edits startup-only', async () => {
  const scaffold = await launchWebScaffold({})
  try {
    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    try {
      const settings = new DesktopUpdateSettings(join(scaffold.harnessHome, 'shell'), 'nightly')
      await settings.save('nightly')
      let state: DesktopChannelState = { channel: 'nightly', packagedChannel: 'nightly', changing: false }
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-US' })
      const tripwire = watchConsole(page)
      let detailOpens = 0
      await page.exposeFunction('openUpdateDetails', () => { detailOpens++ })
      await page.exposeFunction('readChannel', () => state)
      await page.exposeFunction('setChannel', async (channel: 'nightly' | 'stable'): Promise<DesktopChannelChangeResult> => {
        try {
          await settings.save(channel)
          state = { ...state, channel, error: undefined }
          return { kind: 'applied', state }
        } catch (_error) { return { kind: 'failed', state, reason: 'format' } }
      })
      await page.addInitScript(() => {
        const bridge = globalThis as typeof globalThis & {
          readChannel(): Promise<DesktopChannelState>
          openUpdateDetails(): Promise<void>
          setChannel(channel: 'nightly' | 'stable'): Promise<DesktopChannelChangeResult>
        }
        Object.assign(globalThis, { dshDesktop: { protocolVersion: 1, updates: {
          status: async () => ({ phase: 'idle' }), open: () => bridge.openUpdateDetails(), subscribe: () => () => {},
          channels: { get: () => bridge.readChannel(), set: (channel: 'nightly' | 'stable') => bridge.setChannel(channel),
            subscribe: () => () => {} },
        } } })
      })
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await openSettings(page, 'en')
      const row = page.getByRole('group', { name: 'Update channel', exact: true })
      await row.getByText('Development', { exact: true }).waitFor()
      await row.getByRole('button', { name: 'Update channel', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Stable', exact: true }).click()
      await row.getByText('Stable', { exact: true }).waitFor()
      await page.getByText('Update channel changed', { exact: true }).waitFor()
      expect(JSON.parse(await readFile(settings.path, 'utf8'))).toMatchObject({ updates: { channel: 'stable' } })
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/desktop-channel/stable.expected.md', import.meta.url)),
        await captureStableAria(page, '[role="group"][aria-label="Update channel"]', scaffold.workspaceCwd), webSnapshotMode())
      await writeFile(settings.path, JSON.stringify({ updates: { channel: 'nightly' } }))
      expect(await row.getByText('Stable', { exact: true }).count()).toBe(1)
      expect(await settings.load()).toEqual({ kind: 'ready', channel: 'nightly' })
      await writeFile(settings.path, '{broken')
      await row.getByRole('button', { name: 'Update channel', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Development', exact: true }).click()
      await page.getByText('Could not save: invalid settings file', { exact: true }).waitFor()
      await row.getByText('Stable', { exact: true }).waitFor()
      expect(await row.getByText('Stable', { exact: true }).count()).toBe(1)
      expect(await readFile(settings.path, 'utf8')).toBe('{broken')
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/desktop-channel/save-error.expected.md', import.meta.url)),
        await captureStableAria(page, '[role="group"][aria-label="Update channel"]', scaffold.workspaceCwd) + '\n'
          + await captureStableAria(page, '[role="alert"]', scaffold.workspaceCwd), webSnapshotMode())
      state = { ...state, error: 'format' }
      await page.reload({ waitUntil: 'load' })
      await page.getByRole('alert').filter({ hasText: 'Settings file error; updates are paused' }).waitFor()
      await page.getByRole('button', { name: 'View details', exact: true }).click()
      await expect.poll(() => detailOpens).toBe(1)
      expect(await readFile(settings.path, 'utf8')).toBe('{broken')
      expect(tripwire.pageErrors).toEqual([])
      expect(tripwire.warnings).toEqual([])
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})

// The full-page Desktop category is owned by the Suiyi client build.
it.runIf(process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi').each(['en', 'zh'] as const)(
  'Suiyi explains unavailable updates and exposes no update actions in %s', async (locale) => {
    const scaffold = await launchWebScaffold({})
    try {
      const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
      const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
      try {
        const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, locale: locale === 'zh' ? 'zh-CN' : 'en-US' })
        const tripwire = watchConsole(page)
        let actions = 0
        await page.exposeFunction('unexpectedUpdateAction', () => { actions++ })
        await page.addInitScript(() => {
          const bridge = globalThis as typeof globalThis & { unexpectedUpdateAction(): Promise<void> }
          const state = { channel: null, packagedChannel: 'nightly', changing: false, unavailable: true }
          Object.assign(globalThis, { dshDesktop: { protocolVersion: 1, updates: {
            status: async () => ({ phase: 'unavailable' }), open: () => bridge.unexpectedUpdateAction(), subscribe: () => () => {},
            channels: { get: async () => state, set: async () => {
              await bridge.unexpectedUpdateAction()
              return { kind: 'unavailable', state }
            }, subscribe: () => () => {} },
          } } })
        })
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        const retryLabel = locale === 'zh' ? '重试更新' : 'Retry update'
        expect(await page.getByRole('button', { name: retryLabel, exact: true }).count()).toBe(0)
        await page.getByRole('button', { name: locale === 'zh' ? '设置与偏好' : 'Settings and preferences', exact: true }).click()
        await page.getByRole('button', { name: locale === 'zh' ? '运行与插件' : 'Runtime and plugins', exact: true }).click()
        const row = page.getByRole('group', { name: locale === 'zh' ? '更新渠道' : 'Update channel', exact: true })
        const description = locale === 'zh' ? '此版本未启用自动更新，请手动安装新版'
          : 'Automatic updates are disabled in this build. Install a newer version manually.'
        await row.getByText(description, { exact: true }).waitFor()
        expect(await row.getByRole('button').count()).toBe(0)
        expect(await row.getByRole('alert').count()).toBe(0)
        await compareOrRefreshGolden(fileURLToPath(new URL(`./expected/desktop-channel/unavailable-${locale}.expected.md`, import.meta.url)),
          await captureStableAria(page, '[role="group"][aria-label="' + (locale === 'zh' ? '更新渠道' : 'Update channel') + '"]', scaffold.workspaceCwd), webSnapshotMode())
        const evidenceRoot = fileURLToPath(new URL('../../desktop/.desktop-build/qualification/', import.meta.url))
        await mkdir(evidenceRoot, { recursive: true })
        const evidence = await mkdtemp(join(evidenceRoot, `updates-unavailable-${locale}-`))
        await row.scrollIntoViewIfNeeded()
        await page.screenshot({ path: join(evidence, 'channel.png') })
        const section = page.getByRole('button', { name: locale === 'zh' ? '桌面与更新' : 'Desktop and updates', exact: true })
        await section.click()
        await page.getByText(description, { exact: true }).waitFor()
        expect(await page.getByRole('button', { name: locale === 'zh' ? '打开更新' : 'Open updates', exact: true }).count()).toBe(0)
        await page.screenshot({ path: join(evidence, 'desktop.png') })
        expect(actions).toBe(0)
        expect(tripwire.pageErrors).toEqual([])
        expect(tripwire.warnings).toEqual([])
        console.log(`Unavailable update UI evidence: ${evidence}`)
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  },
)
