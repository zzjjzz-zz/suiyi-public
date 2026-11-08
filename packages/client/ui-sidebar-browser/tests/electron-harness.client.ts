/** Native webview events controlled by each test; presentation and navigation stay real. */
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { DesktopBrowserBridge, DesktopBrowserLeaseId, DesktopBrowserReservation } from '../src/types.ts'
import type { BrowserTabState } from '../src/client/browser/BrowserPersistence.ts'
import { createElectronPage } from '../src/client/electron/pages.ts'
import { ElectronWebviewPresentation } from '../src/client/electron/ElectronWebviewPresentation.ts'

let sequence = 0

/** One guest page with its native operations replaced by spies. */
interface ElectronGuest {
  element: HTMLElement
  state: { url: string; title: string; loading: boolean; back: boolean; forward: boolean }
  emit: (type: string, fields?: object) => void
  loadURL: Mock<(url: string) => Promise<void>>
  getURL: Mock<() => string>
  getTitle: Mock<() => string>
  canGoBack: () => boolean
  canGoForward: () => boolean
  clearHistory: Mock<() => void>
  goBack: Mock<() => void>
  goForward: Mock<() => void>
  reload: Mock<() => void>
  isLoading: () => boolean
}

/** The native bridge with each operation exposed as a mock. */
interface ElectronBridgeFixture {
  acquire: Mock<(workspace: string) => Promise<DesktopBrowserReservation>>
  release: Mock<(lease: DesktopBrowserLeaseId) => Promise<void>>
  onOpenRequested: Mock<(lease: DesktopBrowserLeaseId, listener: (url: string) => void) => () => void>
}

/** Explicit fixture type; Vitest's inferred mock type names a private Procedure alias. */
type ElectronFixture = ReturnType<typeof createElectronPage> & {
  presentation: ElectronWebviewPresentation
  bridge: ElectronBridgeFixture
  workspace: Mock<(signal: AbortSignal) => Promise<string>>
  persist: Mock<(...args: unknown[]) => void>
  openRequested: Mock<(...args: unknown[]) => void>
  opens: Set<(url: string) => void>
  guests: ElectronGuest[]
  host: HTMLDivElement
  reservation: DesktopBrowserReservation
  mount: () => () => void
  guest: () => Promise<ElectronGuest>
  dispose: () => Promise<void>
}

/** @returns one isolated, explicitly mounted page with native operations replaced by spies. */
export function electronFixture(initial?: BrowserTabState): ElectronFixture {
  const opens = new Set<(url: string) => void>()
  const reservation: DesktopBrowserReservation = { lease: `lease-${++sequence}` as DesktopBrowserLeaseId, partition: 'partition' }
  const bridge = {
    acquire: vi.fn(async (_workspace: string) => reservation),
    release: vi.fn(async (_lease: DesktopBrowserLeaseId) => {}),
    onOpenRequested: vi.fn((_lease: DesktopBrowserLeaseId, listener: (url: string) => void) => {
      opens.add(listener)
      return () => { opens.delete(listener) }
    }),
  } satisfies DesktopBrowserBridge
  const workspace = vi.fn(async (_signal: AbortSignal) => 'cwd:/workspace')
  const persist = vi.fn()
  const openRequested = vi.fn()
  const page = createElectronPage({ initial, persist, openRequested }, bridge, workspace)
  const presentation = page.presentation
  if (!(presentation instanceof ElectronWebviewPresentation)) throw new Error('expected the Electron presentation')
  const create = presentation.createElement.bind(presentation)
  const guests: ReturnType<typeof prepareGuest>[] = []
  function prepareGuest(approved: DesktopBrowserReservation) {
    const element = create(approved)
    const state = { url: 'about:blank', title: '', loading: true, back: false, forward: false }
    const methods = {
      loadURL: vi.fn(async (_url: string) => {}), getURL: vi.fn(() => state.url), getTitle: vi.fn(() => state.title),
      canGoBack: () => state.back, canGoForward: () => state.forward, clearHistory: vi.fn(),
      goBack: vi.fn(), goForward: vi.fn(), reload: vi.fn(), isLoading: () => state.loading,
    }
    Object.assign(element, methods)
    const emit = (type: string, fields: object = {}): void => { element.dispatchEvent(Object.assign(new Event(type), fields)) }
    return { element, state, emit, ...methods }
  }
  const createElement = vi.spyOn(presentation, 'createElement').mockImplementation((approved) => {
    const guest = prepareGuest(approved)
    guests.push(guest)
    return guest.element
  })
  const host = document.createElement('div')
  host.id = `electron-fixture-${sequence}`
  document.body.append(host)
  return {
    ...page, presentation, bridge, workspace, persist, openRequested, opens, guests, host, reservation,
    mount: () => presentation.mount(host.id),
    async guest() {
      await vi.waitFor(() => { expectGuest() })
      return guests.at(-1)!
    },
    async dispose() {
      await page.frame.dispose()
      createElement.mockRestore()
      host.remove()
    },
  }
  function expectGuest(): void {
    if (host.firstElementChild === null || guests.length === 0) throw new Error('guest has not attached')
  }
}
