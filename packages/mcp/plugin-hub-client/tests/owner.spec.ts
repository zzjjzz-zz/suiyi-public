/** Even an in-process Remote dispatch cannot borrow the Host owner's platform identity. */
import { expect, it } from 'vitest'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import type { RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { bootHubProfile, fixtureCredentials, prepareHubProfile, removeHubProfile, startPlatformFixture } from './fixture.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** A second caller distinct from this Host's owner. */
    'plugin-hub-guest': { readonly kind: 'plugin-hub-guest' }
  }
}

it('denies every non-owner Remote method before resolving the configured credential', async () => {
  const platform = await startPlatformFixture({ authorization: 'Bearer fixture-secret', plugins: [] })
  const prepared = await prepareHubProfile(platform.url)
  const credentials = fixtureCredentials({ PLUGIN_HUB_TOKEN: 'fixture-secret' })
  const booted = await bootHubProfile(prepared.profile, credentials)
  try {
    await booted.hub.refresh()
    const resolved = credentials.resolved.length
    const peer = new Peer(booted.ctx, { principal: { kind: 'plugin-hub-guest' } })
    const invocation: RemoteInvocation = {
      request: { namespace: 'pluginHub', method: 'catalog', args: {} }, service: 'pluginHub', peer,
      signal: new AbortController().signal,
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    }
    const guest = booted.ctx.extend({ invocation }).pluginHub
    for (const call of [() => guest.catalog(), () => guest.refresh(), () => guest.enable('invalid_id'), () => guest.disable('invalid_id')]) {
      await expect(call()).rejects.toMatchObject({ code: 'plugin-hub/owner-required' })
    }
    await expect(guest.watch(invocation.signal)[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'plugin-hub/owner-required' })
    expect(credentials.resolved.length).toBe(resolved)
  } finally {
    await booted.ctx.fiber.dispose()
    await removeHubProfile(prepared.home)
    await platform.close()
  }
})
