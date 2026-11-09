// @vitest-environment jsdom
/** Real navigation callbacks, stale-query cancellation, and modal command ownership. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { GlobalSearch, type GlobalSearchProps } from '../src/client/GlobalSearch.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const sid = 'session-1' as SessionId
const wid = 'workspace-1' as WorkspaceId
const cid = 'settings.open' as ShortcutCommandId
function hook<T>(snapshot: T) { return <S,>(selector: (value: T) => S): S => selector(snapshot) }
function mount(overrides: Partial<GlobalSearchProps> = {}) {
  const state = createSnapshotStore(true)
  const sessions: SessionListState = { ids: [sid], byId: { [sid]: { id: sid, displayTitle: 'Budget report', updatedAt: 1, blank: false, running: false, retainedBy: {} } }, phase: 'ready', projectionsBySession: {} }
  const workspaces: WorkspaceSnapshot = { items: [{ workspaceId: wid, title: 'Office', path: '/office', sessionIds: [sid], createdAt: '', updatedAt: '' }], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }
  const props: GlobalSearchProps = {
    ...({} as GlobalStandardProps), t: makeTranslate(zh, commonZh),
    useSearchOpen: bindSnapshotSelector(state), useSearchPanels: hook([]),
    useShortcuts: hook([{ id: cid, label: 'Settings', aliases: ['preferences'], keys: [], aria: undefined, binding: null, modified: false, conflicts: [], issue: null }]),
    useSessions: hook(sessions), useWorkspaces: hook(workspaces),
    setSearchOpen: (open) => { state.set(open) },
    searchSessions: vi.fn(async () => ({ items: [], hasMore: false })),
    openSession: vi.fn(), openWorkspace: vi.fn(async () => {}), restoreSession: vi.fn(async () => {}),
    selectPanel: vi.fn(), invokeCommand: vi.fn(() => ({ status: 'handled' as const })), ...overrides,
  }
  const view = render(<GlobalSearch {...props} />)
  return { ...view, props, state }
}

it('searches real session and workspace names and opens through existing owners', async () => {
  const { props } = mount()
  const input = screen.getByRole('textbox', { name: '全局搜索' })
  expect(document.activeElement).toBe(input)
  fireEvent.change(input, { target: { value: 'Budget' } })
  fireEvent.click(screen.getByRole('button', { name: /Budget report/ }))
  expect(props.openSession).toHaveBeenCalledWith(sid)
  await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
})

it('cancels superseded content queries and rejects late results after closing', async () => {
  const calls: {
    signal: AbortSignal
    resolve: (value: { items: { sessionId: SessionId; snippet: string }[]; hasMore: boolean }) => void
  }[] = []
  const searchSessions = vi.fn<GlobalSearchProps['searchSessions']>((_query, signal) => new Promise((resolve) => { calls.push({ signal, resolve }) }))
  const { unmount } = mount({ searchSessions })
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'first' } })
  await waitFor(() => { expect(calls).toHaveLength(1) })
  fireEvent.change(input, { target: { value: 'second' } })
  expect(calls[0]!.signal.aborted).toBe(true)
  await waitFor(() => { expect(calls).toHaveLength(2) })
  calls[0]!.resolve({ items: [{ sessionId: sid, snippet: 'obsolete' }], hasMore: false })
  expect(screen.queryByText('obsolete')).toBeNull()
  calls[1]!.resolve({ items: [{ sessionId: sid, snippet: 'current match' }], hasMore: false })
  expect(await screen.findByText('current match')).toBeTruthy()
  unmount()
  expect(calls[1]!.signal.aborted).toBe(true)
})

it('keeps local results on content failure and offers a bounded explicit retry', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const searchSessions = vi.fn<GlobalSearchProps['searchSessions']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ items: [], hasMore: false })
  mount({ searchSessions })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Office' } })
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('会话内容搜索失败'))
  expect(screen.getByRole('button', { name: /Office/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => { expect(searchSessions).toHaveBeenCalledTimes(2); expect(screen.queryByRole('alert')).toBeNull() })
})

it('dismisses its own dialog before dispatch and shows refused commands without claiming success', async () => {
  const invokeCommand = vi.fn<GlobalSearchProps['invokeCommand']>(() => {
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    return { status: 'blocked', reason: 'permission' }
  })
  mount({ invokeCommand })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Settings' } })
  fireEvent.click(screen.getByRole('button', { name: /Settings/ }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('无法打开此项目'))
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Settings')
  expect(invokeCommand).toHaveBeenCalledExactlyOnceWith(cid)
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('keeps the dialog and user query when workspace navigation fails', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const openWorkspace = vi.fn<GlobalSearchProps['openWorkspace']>().mockRejectedValue(new Error('permission'))
  mount({ openWorkspace })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Office' } })
  fireEvent.click(screen.getByRole('button', { name: /Office/ }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Office')
  expect(openWorkspace).toHaveBeenCalledExactlyOnceWith(wid)
})
