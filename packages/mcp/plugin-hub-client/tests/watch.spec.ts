/** Real composition evidence for live market updates and owner identity enforcement. */
import { describe, expect, it, vi } from 'vitest'
import type { PluginHubCatalog } from '../src/types.ts'
import { bootHubProfile, fixtureCredentials, prepareHubProfile, removeHubProfile, startPlatformFixture } from './fixture.ts'

describe('plugin hub catalog stream', () => {
  it('streams independent instance status and publication updates, then ends when aborted', async () => {
    const platform = await startPlatformFixture({ authorization: 'Bearer fixture-secret', plugins: [
      { pluginId: 'demo', releaseVersion: '1', tools: ['ping'] },
      { pluginId: 'other', releaseVersion: '1', tools: ['ping'] },
    ] })
    const prepared = await prepareHubProfile(platform.url)
    const booted = await bootHubProfile(prepared.profile, fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' }))
    const abort = new AbortController()
    const frames: PluginHubCatalog[] = []
    const read = (async () => { for await (const frame of booted.hub.watch(abort.signal)) frames.push(frame) })()
    try {
      await booted.hub.refresh()
      await vi.waitFor(() => { expect(frames.at(-1)?.plugins).toHaveLength(2) })
      await booted.hub.enable('demo')
      await booted.hub.enable('other')
      await vi.waitFor(() => {
        expect(frames.at(-1)?.instances).toMatchObject([{ pluginId: 'demo', state: 'enabled' }, { pluginId: 'other', state: 'enabled' }])
      })
      await booted.hub.disable('demo')
      await vi.waitFor(() => {
        expect(frames.at(-1)?.instances).toMatchObject([{ pluginId: 'demo', state: 'disabled' }, { pluginId: 'other', state: 'enabled' }])
      })
      platform.publish([{ pluginId: 'other', releaseVersion: '2+review', tools: ['ping'] }], 'next')
      await booted.hub.refresh()
      await vi.waitFor(() => {
        expect(frames.at(-1)).toMatchObject({ catalogVersion: 'next', instances: [{ pluginId: 'other', releaseVersion: '2+review', state: 'disabled' }] })
      })
      abort.abort()
      await read
    } finally {
      abort.abort()
      await read
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  }, 20_000)

  it('does not subscribe an already aborted signal and closes streams on service disposal', async () => {
    const platform = await startPlatformFixture({ authorization: 'Bearer fixture-secret', plugins: [] })
    const prepared = await prepareHubProfile(platform.url)
    const booted = await bootHubProfile(prepared.profile, fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' }))
    try {
      const aborted = new AbortController()
      aborted.abort()
      expect(await booted.hub.watch(aborted.signal)[Symbol.asyncIterator]().next()).toEqual({ value: undefined, done: true })
      const iterator = booted.hub.watch(new AbortController().signal)[Symbol.asyncIterator]()
      expect((await iterator.next()).done).toBe(false)
      const pending = iterator.next()
      await booted.hubEntry.fiber?.dispose()
      expect(await pending).toEqual({ value: undefined, done: true })
    } finally {
      await booted.ctx.fiber.dispose()
      await removeHubProfile(prepared.home)
      await platform.close()
    }
  })
})
