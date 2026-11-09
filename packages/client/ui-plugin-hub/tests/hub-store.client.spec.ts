import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { CatalogPlugin, PluginHubSnapshot, PluginInstanceView } from '../src/client/contract.ts'
import { PluginHubController } from '../src/client/hub-store.ts'

function plugin(id: string, fields: Partial<CatalogPlugin> = {}): CatalogPlugin {
  return {
    pluginId: id,
    workloadId: `workload-${id}`,
    releaseVersion: '1.0.0',
    name: `Plugin ${id}`,
    description: `${id} description`,
    category: 'research',
    allowedTools: [],
    schemaFingerprint: 'sha256:abc',
    riskLevel: 'low',
    visibility: 'public',
    allowedRoles: [],
    status: 'published',
    mcpPath: `/api/v1/plugins/${id}/mcp?releaseVersion=1.0.0`,
    ...fields,
  }
}

const instance = (pluginId: string, state: PluginInstanceView['state'], releaseVersion = '1.0.0'): PluginInstanceView =>
  ({ pluginId, releaseVersion, state, added: true })

function catalog(fields: Partial<PluginHubSnapshot> = {}): PluginHubSnapshot {
  return { plugins: [plugin('alpha'), plugin('beta')], catalogVersion: 'catalog-7', instances: [], enabled: true, ...fields }
}

type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RemoteError<never> }
const ok = <T>(value: T): Promise<Answer<T>> => Promise.resolve({ ok: true, value })
const fail = (message: string, code = 'plugin-hub/read-failed'): Promise<Answer<never>> =>
  Promise.resolve({ ok: false, error: new RemoteError(code as never, message, {} as never) })

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

function setup(initial: PluginHubSnapshot = catalog()) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('locale', new LocaleRuntime(ctx))
  const state = { snapshot: initial }
  const hub = {
    catalog: vi.fn<() => Promise<Answer<PluginHubSnapshot>>>(() => ok(state.snapshot)),
    refresh: vi.fn<() => Promise<Answer<PluginHubSnapshot>>>(() => ok(state.snapshot)),
    add: vi.fn<(_pluginId: string) => Promise<Answer<void>>>(() => ok(undefined)),
    removeInstance: vi.fn<(_pluginId: string) => Promise<Answer<void>>>(() => ok(undefined)),
    enable: vi.fn<(_pluginId: string) => Promise<Answer<void>>>(() => ok(undefined)),
    disable: vi.fn<(_pluginId: string) => Promise<Answer<void>>>(() => ok(undefined)),
  }
  new TestRemote(ctx, { pluginHub: hub })
  const controller = new PluginHubController(ctx)
  const face = controller.face()
  const snapshot = () => controller.store.getSnapshot()
  return { controller, face, hub, state, snapshot }
}

describe('PluginHubController', () => {
  it('reads the catalog on first render, publishes it once, and keeps later renders off the wire', async () => {
    const { face, hub, snapshot } = setup()
    expect(snapshot().status).toBe('idle')
    face.ensure()
    expect(snapshot().status).toBe('loading')
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    expect(hub.catalog).toHaveBeenCalledOnce()
    expect(snapshot().snapshot).toMatchObject({ catalogVersion: 'catalog-7', enabled: true })
    expect(snapshot().failure).toBeNull()
    face.ensure()
    expect(hub.catalog).toHaveBeenCalledOnce()
    expect(face.hooks.locale.getSnapshot().active).toBeTypeOf('string')
  })

  it('reports a failed first read and reads it again on reload', async () => {
    const { face, hub, snapshot } = setup()
    hub.catalog.mockImplementationOnce(() => fail('offline'))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('error') })
    expect(snapshot()).toMatchObject({ snapshot: null, failure: { kind: 'load', message: 'offline' } })
    face.reload()
    expect(snapshot().status).toBe('loading')
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    expect(hub.catalog).toHaveBeenCalledTimes(2)
    expect(snapshot().failure).toBeNull()
  })

  it('reloads before the first render through the catalog read', async () => {
    const { face, hub, snapshot } = setup()
    face.reload()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    expect(hub.catalog).toHaveBeenCalledOnce()
    expect(hub.refresh).not.toHaveBeenCalled()
  })

  it('checks the host without data through the catalog read', async () => {
    const { face, hub, snapshot } = setup()
    face.refresh()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    expect(hub.catalog).toHaveBeenCalledOnce()
    expect(hub.refresh).not.toHaveBeenCalled()
  })

  it('refreshes the published catalog, keeping the shown snapshot when the refresh fails', async () => {
    const { face, hub, snapshot } = setup()
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    hub.refresh.mockImplementationOnce(() => fail('refresh offline'))
    face.refresh()
    expect(snapshot().refreshing).toBe(true)
    await vi.waitFor(() => { expect(snapshot().failure?.kind).toBe('refresh') })
    expect(snapshot()).toMatchObject({ status: 'ready', refreshing: false, failure: { message: 'refresh offline' } })
    expect(snapshot().snapshot).not.toBeNull()
    face.reload()
    await vi.waitFor(() => { expect(snapshot().failure).toBeNull() })
    expect(hub.catalog).toHaveBeenCalledTimes(2)
  })

  it('ignores refresh while the first read or another refresh runs', async () => {
    const first = setup()
    const pendingRead = deferred<Answer<PluginHubSnapshot>>()
    first.hub.catalog.mockImplementationOnce(() => pendingRead.promise)
    first.face.ensure()
    first.face.refresh()
    expect(first.hub.refresh).not.toHaveBeenCalled()
    pendingRead.resolve({ ok: true, value: catalog() })
    await vi.waitFor(() => { expect(first.snapshot().status).toBe('ready') })

    const second = setup()
    second.face.ensure()
    await vi.waitFor(() => { expect(second.snapshot().status).toBe('ready') })
    const pendingRefresh = deferred<Answer<PluginHubSnapshot>>()
    second.hub.refresh.mockImplementationOnce(() => pendingRefresh.promise)
    second.face.refresh()
    second.face.refresh()
    expect(second.hub.refresh).toHaveBeenCalledOnce()
    pendingRefresh.resolve({ ok: true, value: catalog() })
    await vi.waitFor(() => { expect(second.snapshot().refreshing).toBe(false) })
  })

  it('adds a plugin, reconciles its connecting state, and leaves an added one alone', async () => {
    const { face, hub, state, snapshot } = setup()
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    const pending = deferred<Answer<void>>()
    hub.add.mockImplementationOnce(() => pending.promise)
    face.add('alpha')
    expect(snapshot().busy.alpha).toBe('add')
    state.snapshot = catalog({ instances: [{ ...instance('alpha', 'connecting'), added: true }] })
    pending.resolve({ ok: true, value: undefined })
    await vi.waitFor(() => { expect(snapshot().busy.alpha).toBeUndefined() })
    await vi.waitFor(() => { expect(snapshot().snapshot?.instances).toEqual([{ ...instance('alpha', 'connecting'), added: true }]) })
    expect(hub.add).toHaveBeenCalledWith('alpha')
    expect(hub.catalog).toHaveBeenCalledTimes(2)
    face.add('alpha')
    expect(hub.add).toHaveBeenCalledOnce()
  })

  it('uses the typed add, enable, disable, and remove Remote methods', async () => {
    const installedDisabled: PluginInstanceView = {
      pluginId: 'alpha', releaseVersion: '1.0.0', state: 'disabled', added: true,
    }
    const installedEnabled: PluginInstanceView = {
      pluginId: 'beta', releaseVersion: '1.0.0', state: 'enabled', added: true,
    }
    const { face, hub, snapshot } = setup(catalog({ plugins: [plugin('alpha'), plugin('beta'), plugin('gamma')],
      instances: [installedDisabled, installedEnabled] }))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    face.add('gamma')
    await vi.waitFor(() => { expect(snapshot().busy.gamma).toBeUndefined() })
    expect(hub.add).toHaveBeenCalledWith('gamma')
    expect(hub.enable).not.toHaveBeenCalled()
    face.enable('alpha')
    await vi.waitFor(() => { expect(snapshot().busy.alpha).toBeUndefined() })
    expect(hub.enable).toHaveBeenCalledWith('alpha')
    face.disable('beta')
    await vi.waitFor(() => { expect(snapshot().busy.beta).toBeUndefined() })
    expect(hub.disable).toHaveBeenCalledWith('beta')
    face.remove('alpha')
    await vi.waitFor(() => { expect(snapshot().busy.alpha).toBeUndefined() })
    expect(hub.removeInstance).toHaveBeenCalledWith('alpha')
  })

  it('keeps a failed removal on the installed row and retries the same operation', async () => {
    const installed: PluginInstanceView = {
      pluginId: 'alpha', releaseVersion: '1.0.0', state: 'enabled', added: true,
    }
    const { face, hub, snapshot } = setup(catalog({ instances: [installed] }))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    hub.removeInstance.mockImplementationOnce(() => fail('still mounted'))
    face.remove('alpha')
    await vi.waitFor(() => { expect(snapshot().actionFailures.alpha?.kind).toBe('remove') })
    expect(snapshot().actionFailures.alpha?.message).toBe('still mounted')
    face.retry('alpha')
    await vi.waitFor(() => { expect(snapshot().actionFailures.alpha).toBeUndefined() })
    expect(hub.removeInstance).toHaveBeenCalledTimes(2)
    expect(hub.disable).not.toHaveBeenCalled()
  })

  it('does not enable when the hub is off, the plugin already runs, or a read never landed', async () => {
    const off = setup(catalog({ enabled: false }))
    off.face.ensure()
    await vi.waitFor(() => { expect(off.snapshot().status).toBe('ready') })
    off.face.add('alpha')
    expect(off.hub.enable).not.toHaveBeenCalled()

    const enabled = setup(catalog({ instances: [instance('alpha', 'enabled')] }))
    enabled.face.ensure()
    await vi.waitFor(() => { expect(enabled.snapshot().status).toBe('ready') })
    enabled.face.add('alpha')
    expect(enabled.hub.enable).not.toHaveBeenCalled()

    const empty = setup()
    empty.face.add('alpha')
    expect(empty.hub.enable).not.toHaveBeenCalled()
  })

  it('keeps a failed enablement on its row and repeats the same operation on retry', async () => {
    const { face, hub, snapshot } = setup()
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    hub.add.mockImplementationOnce(() => fail('tool start failed'))
    face.add('alpha')
    await vi.waitFor(() => { expect(snapshot().actionFailures.alpha?.kind).toBe('add') })
    expect(snapshot().busy).toEqual({})
    expect(snapshot().actionFailures.alpha?.message).toBe('tool start failed')
    face.retry('alpha')
    await vi.waitFor(() => { expect(snapshot().actionFailures.alpha).toBeUndefined() })
    expect(hub.add).toHaveBeenCalledTimes(2)
  })

  it('retries an instance that failed to start, but nothing for a plugin that is merely off', async () => {
    const failed = setup(catalog({ instances: [instance('alpha', 'error')] }))
    failed.face.ensure()
    await vi.waitFor(() => { expect(failed.snapshot().status).toBe('ready') })
    failed.face.retry('alpha')
    expect(failed.hub.enable).toHaveBeenCalledWith('alpha')
    await vi.waitFor(() => { expect(failed.snapshot().busy).toEqual({}) })

    const idle = setup()
    idle.face.ensure()
    await vi.waitFor(() => { expect(idle.snapshot().status).toBe('ready') })
    idle.face.retry('alpha')
    expect(idle.hub.enable).not.toHaveBeenCalled()
  })

  it('disables an enabled or connecting plugin and keeps a failed disablement for retry', async () => {
    const { face, hub, snapshot } = setup(catalog({ instances: [instance('alpha', 'enabled'), instance('beta', 'connecting')] }))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    face.disable('alpha')
    expect(snapshot().busy.alpha).toBe('disable')
    await vi.waitFor(() => { expect(snapshot().busy.alpha).toBeUndefined() })
    expect(hub.disable).toHaveBeenCalledWith('alpha')
    face.disable('beta')
    await vi.waitFor(() => { expect(snapshot().busy.beta).toBeUndefined() })
    expect(hub.disable).toHaveBeenCalledWith('beta')

    hub.disable.mockImplementationOnce(() => fail('still running'))
    face.disable('alpha')
    await vi.waitFor(() => { expect(snapshot().actionFailures.alpha?.kind).toBe('disable') })
    expect(snapshot().actionFailures.alpha?.message).toBe('still running')
    face.retry('alpha')
    await vi.waitFor(() => { expect(snapshot().actionFailures.alpha).toBeUndefined() })
    expect(hub.disable).toHaveBeenCalledTimes(4)
  })

  it('does not disable a plugin that is off, failed, already busy, or behind a disabled hub', async () => {
    const states = setup(catalog({
      instances: [instance('alpha', 'disabled'), instance('beta', 'error'), instance('gamma', 'enabled')],
    }))
    states.face.ensure()
    await vi.waitFor(() => { expect(states.snapshot().status).toBe('ready') })
    states.face.disable('alpha')
    states.face.disable('beta')
    expect(states.hub.disable).not.toHaveBeenCalled()
    const pending = deferred<Answer<void>>()
    states.hub.disable.mockImplementationOnce(() => pending.promise)
    states.face.disable('gamma')
    states.face.disable('gamma')
    expect(states.hub.disable).toHaveBeenCalledOnce()
    pending.resolve({ ok: true, value: undefined })
    await vi.waitFor(() => { expect(states.snapshot().busy).toEqual({}) })

    const off = setup(catalog({ enabled: false, instances: [instance('alpha', 'enabled')] }))
    off.face.ensure()
    await vi.waitFor(() => { expect(off.snapshot().status).toBe('ready') })
    off.face.disable('alpha')
    off.face.retry('alpha')
    expect(off.hub.disable).not.toHaveBeenCalled()
    const noData = setup()
    noData.face.disable('alpha')
    noData.face.retry('alpha')
    expect(noData.hub.disable).not.toHaveBeenCalled()
  })

  it('re-reads after the connection reset and drops the reads and actions of the old generation', async () => {
    const { controller, face, hub, snapshot } = setup()
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    const pendingAction = deferred<Answer<void>>()
    hub.enable.mockImplementationOnce(() => pendingAction.promise)
    face.add('alpha')
    expect(snapshot().busy.alpha).toBe('add')
    controller.connectionReset()
    expect(snapshot()).toMatchObject({ status: 'loading', snapshot: null, failure: null, busy: {} })
    await vi.waitFor(() => { expect(hub.catalog).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    pendingAction.resolve({ ok: true, value: undefined })
    await Promise.resolve()
    await Promise.resolve()
    expect(snapshot().busy).toEqual({})
    expect(hub.catalog).toHaveBeenCalledTimes(2)
  })

  it('drops the answer of an older read and re-reads a failed first read after the reset', async () => {
    const overlap = setup()
    const first = deferred<Answer<PluginHubSnapshot>>()
    overlap.hub.catalog.mockImplementationOnce(() => first.promise)
    overlap.face.ensure()
    overlap.controller.connectionReset()
    await vi.waitFor(() => { expect(overlap.snapshot().status).toBe('ready') })
    first.resolve({ ok: true, value: catalog({ catalogVersion: 'old' }) })
    await Promise.resolve()
    await Promise.resolve()
    expect(overlap.snapshot().snapshot?.catalogVersion).toBe('catalog-7')

    const failed = setup()
    failed.hub.catalog.mockImplementationOnce(() => fail('offline'))
    failed.face.ensure()
    await vi.waitFor(() => { expect(failed.snapshot().status).toBe('error') })
    failed.controller.connectionReset()
    expect(failed.snapshot().failure).toBeNull()
    await vi.waitFor(() => { expect(failed.snapshot().status).toBe('ready') })
  })

  it('accepts a live Host snapshot and drops an older in-flight read', async () => {
    const { controller, face, hub, snapshot } = setup()
    const pending = deferred<Answer<PluginHubSnapshot>>()
    hub.catalog.mockImplementationOnce(() => pending.promise)
    face.ensure()
    expect(snapshot().status).toBe('loading')
    controller.acceptSnapshot(catalog({ catalogVersion: 'live', enabled: false }))
    expect(snapshot()).toMatchObject({
      status: 'ready', refreshing: false, failure: null, snapshot: { catalogVersion: 'live', enabled: false },
    })
    pending.resolve({ ok: true, value: catalog({ catalogVersion: 'stale' }) })
    await Promise.resolve()
    await Promise.resolve()
    expect(snapshot().snapshot?.catalogVersion).toBe('live')
  })

  it('clears a failed refresh when a live snapshot arrives', async () => {
    const { controller, face, hub, snapshot } = setup()
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    hub.refresh.mockImplementationOnce(() => fail('refresh offline'))
    face.refresh()
    await vi.waitFor(() => { expect(snapshot().failure?.kind).toBe('refresh') })
    controller.acceptSnapshot(catalog({ catalogVersion: 'live' }))
    expect(snapshot()).toMatchObject({ status: 'ready', failure: null, snapshot: { catalogVersion: 'live' } })
  })

  it('clears the cache and in-flight work when the carrier is unavailable', async () => {
    const { controller, face, hub, snapshot } = setup(catalog({ instances: [instance('alpha', 'enabled')] }))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    const pendingRead = deferred<Answer<PluginHubSnapshot>>()
    hub.catalog.mockImplementationOnce(() => pendingRead.promise)
    face.reload()
    expect(snapshot().refreshing).toBe(true)
    const pendingAction = deferred<Answer<void>>()
    hub.disable.mockImplementationOnce(() => pendingAction.promise)
    face.disable('alpha')
    expect(snapshot().busy.alpha).toBe('disable')

    controller.connectionUnavailable()
    expect(snapshot()).toMatchObject({
      status: 'error', snapshot: null, refreshing: false, busy: {}, actionFailures: {},
      failure: { kind: 'load', message: 'The plugin hub connection is unavailable.' },
    })
    pendingRead.resolve({ ok: true, value: catalog({ catalogVersion: 'stale' }) })
    pendingAction.resolve({ ok: true, value: undefined })
    await Promise.resolve()
    await Promise.resolve()
    expect(snapshot()).toMatchObject({ status: 'error', snapshot: null, busy: {}, failure: { kind: 'load' } })
    expect(hub.catalog).toHaveBeenCalledTimes(2)
  })

  it('ignores a live snapshot and a carrier loss after disposal', () => {
    const { controller, snapshot } = setup()
    controller.dispose()
    controller.acceptSnapshot(catalog({ catalogVersion: 'late' }))
    controller.connectionUnavailable()
    expect(snapshot()).toEqual({
      status: 'idle', snapshot: null, refreshing: false, failure: null, busy: {}, actionFailures: {},
    })
  })

  it('keeps an idle tab idle on a connection reset', () => {
    const { controller, hub, snapshot } = setup()
    controller.connectionReset()
    expect(hub.catalog).not.toHaveBeenCalled()
    expect(snapshot().status).toBe('idle')
  })

  it('reports a failed reconcile read after a successful action without losing the snapshot', async () => {
    const { face, hub, snapshot } = setup()
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    hub.catalog.mockImplementationOnce(() => fail('reconcile failed'))
    face.add('alpha')
    await vi.waitFor(() => { expect(snapshot().failure?.message).toBe('reconcile failed') })
    expect(snapshot()).toMatchObject({ status: 'ready', failure: { kind: 'refresh' } })
    expect(snapshot().snapshot).not.toBeNull()
    expect(snapshot().busy).toEqual({})
  })

  it('publishes nothing after disposal', async () => {
    const read = setup()
    read.face.ensure()
    await vi.waitFor(() => { expect(read.snapshot().status).toBe('ready') })
    const pendingRead = deferred<Answer<PluginHubSnapshot>>()
    read.hub.catalog.mockImplementationOnce(() => pendingRead.promise)
    read.face.reload()
    read.controller.dispose()
    pendingRead.resolve({ ok: true, value: catalog({ catalogVersion: 'late' }) })
    await Promise.resolve()
    expect(read.snapshot().snapshot?.catalogVersion).toBe('catalog-7')
    expect(read.snapshot().refreshing).toBe(true)

    const action = setup()
    action.face.ensure()
    await vi.waitFor(() => { expect(action.snapshot().status).toBe('ready') })
    const pendingAction = deferred<Answer<void>>()
    action.hub.enable.mockImplementationOnce(() => pendingAction.promise)
    action.face.add('alpha')
    action.controller.dispose()
    pendingAction.resolve({ ok: true, value: undefined })
    await Promise.resolve()
    expect(action.snapshot().busy.alpha).toBe('add')
  })
})
