// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import type { PluginHubSnapshot } from '../src/client/contract.ts'
import type { PluginHubFace } from '../src/client/hub-store.ts'
import { apply, inject } from '../src/client/index.ts'

beforeEach(() => { vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'local') })
afterEach(() => { vi.unstubAllEnvs() })

const PLUGIN: PluginHubSnapshot['plugins'][number] = {
  pluginId: 'alpha', workloadId: 'workload-alpha', releaseVersion: '1.2.0', name: 'Alpha', description: 'Reads papers',
  category: 'research', allowedTools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }],
  schemaFingerprint: 'sha256:abc', riskLevel: 'low', visibility: 'public', allowedRoles: [], status: 'published',
  mcpPath: '/api/v1/plugins/alpha/mcp?releaseVersion=1.2.0',
}

const ENABLED: PluginHubSnapshot = { plugins: [PLUGIN], catalogVersion: 'catalog-7', instances: [], enabled: true }
const DISABLED: PluginHubSnapshot = { ...ENABLED, enabled: false }

type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Error }
const ok = <T>(value: T): Promise<Answer<T>> => Promise.resolve({ ok: true, value })

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

interface FakeFrame<T> {
  readonly value: T
  readonly accept: ReturnType<typeof vi.fn>
}

interface FakeStream<T> {
  readonly dispose: ReturnType<typeof vi.fn>
  push(value: T): FakeFrame<T>
  finish(): void
  fail(error: Error): void
  [Symbol.asyncIterator](): AsyncGenerator<FakeFrame<T>, void, undefined>
}

/** One logical stream generation the spec drives frame by frame. */
function fakeStream<T>(): FakeStream<T> {
  const queue: FakeFrame<T>[] = []
  let wake: (() => void) | undefined
  let closed = false
  let failure: Error | undefined
  const stream: FakeStream<T> = {
    dispose: vi.fn(() => Promise.resolve()),
    push(value) {
      const frame = { value, accept: vi.fn() }
      queue.push(frame)
      wake?.()
      wake = undefined
      return frame
    },
    finish() {
      closed = true
      wake?.()
      wake = undefined
    },
    fail(error) {
      failure = error
      wake?.()
      wake = undefined
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length === 0 && !closed && failure === undefined) {
          await new Promise<void>((resolve) => { wake = resolve })
        }
        if (queue.length > 0) {
          yield queue.shift() as FakeFrame<T>
          continue
        }
        if (failure !== undefined) {
          const error = failure
          failure = undefined
          throw error
        }
        return
      }
    },
  }
  return stream
}

/** The stream supervisor's opener options, as `remote.$stream` receives them. */
interface CatalogStreamOptions {
  readonly name: string
  readonly open: (signal: AbortSignal) => AsyncIterable<PluginHubSnapshot>
  readonly ended: (accepted: boolean) => Error
  readonly carrierFailed?: (error: Error) => void
}

interface MountOptions {
  readonly initial: () => PluginHubSnapshot
  /** Overrides the first `catalog()` read, which the plugin issues while applying. */
  readonly firstRead?: () => Promise<Answer<PluginHubSnapshot>>
  /** Whether the old Plugins page declares its preview slot; safe mode removes it. */
  readonly previewTab?: boolean
}

async function mount({ initial, firstRead, previewTab = true }: MountOptions) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const hub = {
    catalog: vi.fn<() => Promise<Answer<PluginHubSnapshot>>>(() => ok(initial())),
    refresh: vi.fn<() => Promise<Answer<PluginHubSnapshot>>>(() => ok(initial())),
    enable: vi.fn<(_pluginId: string) => Promise<Answer<void>>>(() => ok(undefined)),
    disable: vi.fn<(_pluginId: string) => Promise<Answer<void>>>(() => ok(undefined)),
    watch: vi.fn<(signal: AbortSignal) => AsyncIterable<PluginHubSnapshot>>(() => (async function* () {})()),
  }
  if (firstRead !== undefined) hub.catalog.mockImplementationOnce(firstRead)
  const remote = new TestRemote(ctx, { pluginHub: hub })
  const stream = fakeStream<PluginHubSnapshot>()
  let captured: CatalogStreamOptions | undefined
  const $stream = vi.fn((options: CatalogStreamOptions) => {
    captured = options
    return stream
  })
  Object.assign(remote, { $stream })
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: {
      ...previewTab ? { 'plugins.tab': { kind: 'list', scope: 'root' } } : {},
      'main': { kind: 'keyed', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  const fiber = await ctx.plugin({ inject: [...inject], apply }).await()
  const options = (): CatalogStreamOptions => {
    if (captured === undefined) throw new Error('plugin hub did not open a catalog stream')
    return captured
  }
  return { ctx, hub, slots, fiber, stream, $stream, options }
}

const flush = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }

const entryIds = (slots: SlotRegistry): string[] => [
  ...slots.entries('plugins.tab').map(entry => `tab:${String(entry.options.id)}`),
  ...slots.entries('main').map(entry => `main:${String(entry.options.key)}`),
  ...slots.entries('sidebar.panellist').map(entry => `sidebar:${String(entry.options.id)}`),
]

const ALL_ENTRIES = ['tab:hub', 'main:plugin-hub', 'sidebar:plugin-hub']

it('keeps every entry hidden while the hub is disabled and follows live enablement and reset', async () => {
  const { ctx, hub, slots, fiber, stream, options } = await mount({ initial: () => DISABLED })
  expect(hub.catalog).toHaveBeenCalledOnce()
  await flush()
  expect(entryIds(slots)).toEqual([])
  const opened = options()
  expect(opened.name).toBe('plugin hub catalog')
  expect(opened.ended(false)).toBeInstanceOf(Error)

  const enabledFrame = stream.push(ENABLED)
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(ALL_ENTRIES) })
  expect(enabledFrame.accept).toHaveBeenCalledOnce()
  const [tab] = slots.entries('plugins.tab')
  expect(tab?.options.order).toBe(20)
  expect(resolveSlotLabel(tab?.options.label)).toBe('Plugin center')
  const face = (tab!.inject!() as object) as PluginHubFace
  expect(face.hooks.hub.getSnapshot()).toMatchObject({ status: 'ready', snapshot: { catalogVersion: 'catalog-7' } })
  const [sidebar] = slots.entries('sidebar.panellist')
  expect(sidebar?.options.order).toBe(10)
  expect(resolveSlotLabel(sidebar?.options.label)).toBe('Plugin center')
  const mainEntry = slots.entries('main').find(entry => entry.options.key === 'plugin-hub')
  expect(mainEntry?.inject?.()).toBe(face)
  const signal = new AbortController().signal
  opened.open(signal)
  expect(hub.watch).toHaveBeenCalledWith(signal)

  // A Host generation reset withdraws the cached identity rows until the next read lands.
  ctx.emit('connection/reset')
  await vi.waitFor(() => { expect(hub.catalog).toHaveBeenCalledTimes(2) })
  await flush()
  expect(entryIds(slots)).toEqual([])

  stream.push(ENABLED)
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(ALL_ENTRIES) })
  await fiber.dispose()
  expect(stream.dispose).toHaveBeenCalledOnce()
  stream.finish()
  expect(entryIds(slots)).toEqual([])
})

it('keeps the Suiyi center visible while the catalog is disabled and never adds the preview tab', async () => {
  vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
  const { slots, fiber, stream } = await mount({ initial: () => DISABLED })
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(['main:plugin-hub', 'sidebar:plugin-hub']) })
  expect(slots.entries('plugins.tab')).toEqual([])
  stream.push(ENABLED)
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(['main:plugin-hub', 'sidebar:plugin-hub']) })
  stream.push(DISABLED)
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(['main:plugin-hub', 'sidebar:plugin-hub']) })
  await fiber.dispose()
  stream.finish()
})

it('keeps the independent center working without the old Plugins page preview slot', async () => {
  const { fiber, slots, stream } = await mount({ initial: () => ENABLED, previewTab: false })
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(['main:plugin-hub', 'sidebar:plugin-hub']) })
  expect(slots.entries('plugins.tab')).toEqual([])
  const [sidebar] = slots.entries('sidebar.panellist')
  expect(resolveSlotLabel(sidebar?.options.label)).toBe('Plugin center')
  const mainEntry = slots.entries('main').find(entry => entry.options.key === 'plugin-hub')
  expect(mainEntry?.inject).toBeTypeOf('function')
  stream.push(DISABLED)
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual([]) })
  await fiber.dispose()
  stream.finish()
})

it('clears the cached catalog when the carrier fails and ignores the older read', async () => {
  const pendingRead = deferred<Answer<PluginHubSnapshot>>()
  const { hub, slots, fiber, stream, options } = await mount({
    initial: () => ENABLED,
    firstRead: () => pendingRead.promise,
  })
  expect(hub.catalog).toHaveBeenCalledOnce()
  stream.push(ENABLED)
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(ALL_ENTRIES) })
  const [tab] = slots.entries('plugins.tab')
  const face = (tab!.inject!() as object) as PluginHubFace

  options().carrierFailed?.(new Error('carrier lost'))
  expect(face.hooks.hub.getSnapshot()).toMatchObject({
    status: 'error', snapshot: null, refreshing: false, busy: {}, actionFailures: {},
    failure: { kind: 'load', message: 'The plugin hub connection is unavailable.' },
  })
  expect(entryIds(slots)).toEqual([])

  pendingRead.resolve({ ok: true, value: { ...ENABLED, catalogVersion: 'stale-read' } })
  await flush()
  expect(face.hooks.hub.getSnapshot()).toMatchObject({ status: 'error', snapshot: null })

  await fiber.dispose()
  stream.finish()
})

it('ignores a live frame and a carrier failure after teardown', async () => {
  const { fiber, slots, stream, options } = await mount({ initial: () => ENABLED })
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(ALL_ENTRIES) })
  const [tab] = slots.entries('plugins.tab')
  const store = ((tab!.inject!() as object) as PluginHubFace).hooks.hub
  const before = store.getSnapshot()

  await fiber.dispose()
  expect(stream.dispose).toHaveBeenCalledOnce()
  const late = stream.push(DISABLED)
  options().carrierFailed?.(new Error('late carrier failure'))
  await flush()
  expect(late.accept).not.toHaveBeenCalled()
  expect(store.getSnapshot()).toEqual(before)
  expect(entryIds(slots)).toEqual([])
  stream.finish()
})

it('clears the cached catalog when the stream itself fails', async () => {
  const { fiber, slots, stream, options } = await mount({
    initial: () => ENABLED,
    firstRead: () => deferred<Answer<PluginHubSnapshot>>().promise,
  })
  stream.push(ENABLED)
  await vi.waitFor(() => { expect(entryIds(slots)).toEqual(ALL_ENTRIES) })
  const [tab] = slots.entries('plugins.tab')
  const face = (tab!.inject!() as object) as PluginHubFace

  stream.fail(new Error('stream failed'))
  await vi.waitFor(() => { expect(face.hooks.hub.getSnapshot().status).toBe('error') })
  expect(face.hooks.hub.getSnapshot().snapshot).toBeNull()
  expect(entryIds(slots)).toEqual([])
  options().carrierFailed?.(new Error('after failure'))
  await fiber.dispose()
  stream.finish()
})
