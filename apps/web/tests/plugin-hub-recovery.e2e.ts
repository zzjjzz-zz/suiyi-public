/** Hub Remote recovery with an injected manager failure and a real retained tool registration. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it, onTestFinished, vi } from 'vitest'
import { startPlatformFixture, TEST_IDENTITY } from '../../../packages/mcp/plugin-hub-client/tests/fixture.ts'
import { namespaceForPlugin, publicToolName } from '../../../packages/mcp/plugin-hub-client/src/names.ts'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'

it.runIf(process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi')('recovers a failed Hub instance without restoring withdrawn authorization', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'hub-recovery-web-'))
  onTestFinished(() => rm(scratch, { recursive: true, force: true }))
  const platform = await startPlatformFixture({
    authorization: 'Bearer fixture-secret',
    plugins: [{ pluginId: 'demo', releaseVersion: '1', tools: ['ping'], advertisedTools: [] }],
  })
  try {
    await writeFile(join(scratch, 'package.json'), JSON.stringify({
      name: 'dsh-web-hub-recovery-fixture', version: '1.0.0', private: true, type: 'module',
      dsh: { bundle: { patch: 'cordis.patch.yml' } },
    }))
    await writeFile(join(scratch, 'cordis.patch.yml'), JSON.stringify([{ id: 'plugin-hub', config: {
      enabled: true, platformUrl: platform.url, authorization: 'Bearer fixture-secret', identity: TEST_IDENTITY,
    } }], null, 2))
    const scaffold = await launchWebScaffold({ profile: { hmr: false, packages: [{ dir: scratch, enabled: true }] } })
    try {
      await scaffold.ctx.pluginHub.refresh()
      await scaffold.ctx.pluginHub.enable('demo')
      await vi.waitFor(async () => {
        expect((await scaffold.ctx.pluginHub.catalog()).instances).toMatchObject([{ state: 'enabled', authorized: true }])
      }, { timeout: 20_000 })
      scaffold.ctx.emit('mcp-manager/status', namespaceForPlugin('demo'), {
        state: 'failed', reason: 'load', lastError: 'Fixture manager failure',
      })
      await vi.waitFor(async () => {
        expect((await scaffold.ctx.pluginHub.catalog()).instances).toMatchObject([{ state: 'error', authorized: true }])
      }, { timeout: 20_000 })
      const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
      const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-US' })
        const tripwire = watchConsole(page)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.locator('nav').getByRole('button', { name: 'Plugin center', exact: true }).click()
        const card = page.locator('[data-hub-plugin="demo"]')
        await card.getByRole('button', { name: 'Disable demo', exact: true }).waitFor()
        await compareOrRefreshGolden(fileURLToPath(new URL('./expected/plugin-hub-recovery/authorized-error.expected.md', import.meta.url)),
          await captureStableAria(page, '[data-hub-plugin="demo"]', scaffold.workspaceCwd), webSnapshotMode())
        const qualification = fileURLToPath(new URL('../../desktop/.desktop-build/qualification', import.meta.url))
        await mkdir(qualification, { recursive: true })
        await page.screenshot({ path: join(qualification, 'plugin-hub-authorized-error.png'), fullPage: true, animations: 'disabled' })
        const unregister = scaffold.ctx.tools.register({
          name: publicToolName(namespaceForPlugin('demo'), 'ping'), description: 'Fixture registration retained across child disposal.',
          parameters: { type: 'object', properties: {} },
          output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'fixture' }] },
          execute: () => Promise.resolve('fixture'),
        })
        try {
          await card.getByRole('button', { name: 'Disable demo', exact: true }).click()
          await writeFile(join(qualification, 'plugin-hub-after-disable.json'), JSON.stringify({
            catalog: await scaffold.ctx.pluginHub.catalog(),
            aria: await captureStableAria(page, '[data-hub-plugin="demo"]', scaffold.workspaceCwd),
          }, null, 2))
          const cleanup = card.getByRole('button', { name: 'Retry cleanup for demo', exact: true })
          await cleanup.waitFor()
          expect((await scaffold.ctx.pluginHub.catalog()).instances).toMatchObject([{ state: 'error', authorized: false, added: true }])
          await expect(scaffold.ctx.pluginHub.disable('demo')).rejects.toMatchObject({ code: 'plugin-hub/instance-failed' })
          expect((await scaffold.ctx.pluginHub.catalog()).instances).toMatchObject([{ state: 'error', authorized: false }])
          await compareOrRefreshGolden(fileURLToPath(new URL('./expected/plugin-hub-recovery/cleanup-error.expected.md', import.meta.url)),
            await captureStableAria(page, '[data-hub-plugin="demo"]', scaffold.workspaceCwd), webSnapshotMode())
          await page.setViewportSize({ width: 390, height: 844 })
          const bounds = await cleanup.boundingBox()
          expect(bounds).not.toBeNull()
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
          await page.screenshot({ path: join(qualification, 'plugin-hub-cleanup-narrow.png'), fullPage: true, animations: 'disabled' })
          await card.getByRole('button', { name: 'Open demo', exact: true }).click()
          await page.getByRole('dialog').getByRole('button', { name: 'Retry cleanup for demo', exact: true }).waitFor()
          await page.keyboard.press('Escape')
          unregister()
          await cleanup.click()
          await card.getByRole('button', { name: 'Enable demo', exact: true }).waitFor()
          expect((await scaffold.ctx.pluginHub.catalog()).instances).toMatchObject([{ state: 'disabled', authorized: false, added: true }])
          expect(platform.calls).toEqual([])
          expect(tripwire.pageErrors).toEqual([])
        } finally { unregister() }
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  } finally { await platform.close() }
})
