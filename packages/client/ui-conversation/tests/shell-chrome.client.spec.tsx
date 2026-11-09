// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionListState, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  allowAllAccess, bindSnapshotSelector, makeTranslate, sessionSnapshot as sessionFixture,
} from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locales.ts'
import type { ConversationShellTopbarProps } from '../src/client/skeleton/ConversationShellTopbar.tsx'
import { ConversationShellTopbar } from '../src/client/skeleton/ConversationShellTopbar.tsx'
import type { ConversationFooterProps } from '../src/client/skeleton/ConversationFooter.tsx'
import { ConversationFooter } from '../src/client/skeleton/ConversationFooter.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SID = 's1' as SessionId
const WID = 'w1' as WorkspaceId
const t = makeTranslate(zh, commonZh)
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined }))

function listOf(session: SessionSnapshot): SessionListState {
  return {
    ids: [SID], phase: 'ready', projectionsBySession: {},
    byId: {
      [SID]: {
        id: SID, displayTitle: 'Child', running: session.running,
        retainedBy: { mainView: 1 }, blank: false, updatedAt: 1,
      },
    },
  }
}

function workspaces(): WorkspaceSnapshot {
  return {
    items: [{
      workspaceId: WID, path: '/projects/one', title: 'Project one', sessionIds: [SID],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }
}

function topbar(overrides: Partial<ConversationShellTopbarProps> = {}) {
  const session = createSnapshotStore(sessionFixture(SID))
  const current = createSnapshotStore<SessionId | undefined>(SID)
  const props = {
    useSessions: bindSnapshotSelector(createSnapshotStore(listOf({ running: false } as SessionSnapshot))),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore(workspaces())),
    usePanelInfo: selector => selector({ activePanelId: null }),
    useCurrentSessionId: bindSnapshotSelector(current),
    useTheme: bindSnapshotSelector(createSnapshotStore({ active: { colorScheme: 'light' as const } })),
    useResource,
    ...allowAllAccess,
    toggleTheme: vi.fn(),
    openPluginCenter: vi.fn(),
    openWorkspaces: vi.fn(),
    t,
    ...overrides,
  } as ConversationShellTopbarProps
  const view = render(<ConversationShellTopbar {...props} />)
  return { view, props, session }
}

function footer(overrides: Partial<ConversationFooterProps> = {}) {
  const current = createSnapshotStore<SessionId | undefined>(SID)
  const props = {
    useSessions: bindSnapshotSelector(createSnapshotStore(listOf({ running: false } as SessionSnapshot))),
    useCurrentSessionId: bindSnapshotSelector(current),
    useConnectionState: bindSnapshotSelector(createSnapshotStore<'connected' | 'disconnected' | 'connecting' | undefined>('connected')),
    useResource,
    ...allowAllAccess,
    reconnect: vi.fn(),
    t,
    ...overrides,
  } as ConversationFooterProps
  const view = render(<ConversationFooter {...props} />)
  return { view, props, current }
}

describe('global shell chrome', () => {
  it('shows the current title and exposes the real topbar actions', () => {
    const b = topbar()
    expect(screen.getByText('Child')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '插件中心' }))
    expect(b.props.openPluginCenter).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '切换深浅主题' }))
    expect(b.props.toggleTheme).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Project one' })).toBeNull()
  })

  it('falls back to the new-chat title without a Session', () => {
    const current = createSnapshotStore<SessionId | undefined>(undefined)
    topbar({ useCurrentSessionId: bindSnapshotSelector(current) })
    expect(screen.getByText('新对话')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '选择工作区' })).toBeNull()
  })

  it('shows the active Settings or plugin-center title, and the session title on the Conversation', () => {
    topbar({ usePanelInfo: selector => selector({ activePanelId: 'settings' as never }) })
    expect(screen.getByTitle('设置与偏好')).toBeTruthy()
    cleanup()
    topbar({ usePanelInfo: selector => selector({ activePanelId: 'plugin-hub' as never }) })
    expect(screen.getByTitle('插件中心')).toBeTruthy()
    cleanup()
    topbar()
    expect(screen.getByTitle('Child')).toBeTruthy()
  })

  it('shows an explicit unavailable identity state on Web and never a model account', () => {
    topbar()
    const button = screen.getByRole('button', { name: '身份中心不可用' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the signed-in Suiyi name and signs out through the bridge', async () => {
    const bridge = {
      view: vi.fn(async () => ({ state: 'signed-in' as const, displayName: '验收用户' })),
      signIn: vi.fn(async () => ({ ok: true as const })),
      signOut: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    }
    vi.stubGlobal('dshDesktop', { suiyiIdentity: bridge })
    topbar()
    const button = await screen.findByRole('button', { name: '验收用户' })
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('menuitem', { name: '退出登录' }))
    await waitFor(() => { expect(bridge.signOut).toHaveBeenCalledOnce() })
  })

  it('keeps a newer subscribe update when the initial view resolves later', async () => {
    let resolveView: ((view: { state: 'locked' }) => void) | undefined
    let listener: ((view: { state: 'signed-in'; displayName: string }) => void) | undefined
    const bridge = {
      view: vi.fn(() => new Promise<{ state: 'locked' }>((resolve) => { resolveView = resolve })),
      signIn: vi.fn(async () => ({ ok: true as const })),
      signOut: vi.fn(async () => {}),
      subscribe: vi.fn((next: (view: { state: 'signed-in'; displayName: string }) => void) => {
        listener = next
        return () => {}
      }),
    }
    vi.stubGlobal('dshDesktop', { suiyiIdentity: bridge })
    topbar()
    act(() => { listener?.({ state: 'signed-in', displayName: '较新账号' }) })
    await act(async () => { resolveView?.({ state: 'locked' }) })
    expect(screen.getByRole('button', { name: '较新账号' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
  })

  it('shows localized failure and never logs raw IPC rejection on sign-in', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bridge = {
      view: vi.fn(async () => ({ state: 'locked' as const })),
      signIn: vi.fn(async () => { throw new Error('raw-ipc-secret') }),
      signOut: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    }
    vi.stubGlobal('dshDesktop', { suiyiIdentity: bridge })
    topbar()
    fireEvent.click(await screen.findByRole('button', { name: '登录' }))
    expect(await screen.findByRole('button', { name: '身份操作失败' })).toBeTruthy()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('shows localized failure and never logs raw IPC rejection on sign-out', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bridge = {
      view: vi.fn(async () => ({ state: 'signed-in' as const, displayName: '验收用户' })),
      signIn: vi.fn(async () => ({ ok: true as const })),
      signOut: vi.fn(async () => { throw new Error('raw-ipc-secret') }),
      subscribe: vi.fn(() => () => {}),
    }
    vi.stubGlobal('dshDesktop', { suiyiIdentity: bridge })
    topbar()
    fireEvent.click(await screen.findByRole('button', { name: '验收用户' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '退出登录' }))
    expect(await screen.findByRole('button', { name: '身份操作失败' })).toBeTruthy()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('prevents duplicate sign-in while the first IPC is pending', async () => {
    let release: (() => void) | undefined
    const bridge = {
      view: vi.fn(async () => ({ state: 'locked' as const })),
      signIn: vi.fn(() => new Promise<{ ok: true }>((resolve) => { release = () => { resolve({ ok: true }) } })),
      signOut: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    }
    vi.stubGlobal('dshDesktop', { suiyiIdentity: bridge })
    topbar()
    const button = await screen.findByRole('button', { name: '登录' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(bridge.signIn).toHaveBeenCalledOnce()
    await act(async () => { release?.() })
  })

  it('signs in from the locked state through the real bridge', async () => {
    const bridge = {
      view: vi.fn(async () => ({ state: 'locked' as const })),
      signIn: vi.fn(async () => ({ ok: true as const })),
      signOut: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    }
    vi.stubGlobal('dshDesktop', { suiyiIdentity: bridge })
    topbar()
    fireEvent.click(await screen.findByRole('button', { name: '登录' }))
    await waitFor(() => { expect(bridge.signIn).toHaveBeenCalledOnce() })
  })

  it('offers install only when the Desktop update bridge exists', () => {
    const open = vi.fn(async () => {})
    vi.stubGlobal('dshDesktop', { updates: { open } })
    topbar()
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    expect(open).toHaveBeenCalledOnce()
    cleanup()
    vi.unstubAllGlobals()
    topbar()
    expect(screen.queryByRole('button', { name: '安装' })).toBeNull()
  })

  it('reports an install IPC rejection with the localized alert and no raw log', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const open = vi.fn(async () => { throw new Error('raw-ipc-secret') })
    vi.stubGlobal('dshDesktop', { updates: { open } })
    topbar()
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('无法打开安装或更新界面，请重试')
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('reports live connection and task state, and offers reconnect when disconnected', () => {
    footer()
    expect(screen.getByRole('status').textContent).toContain('已连接 · 待命')
    cleanup()

    footer({
      useSessions: bindSnapshotSelector(createSnapshotStore(listOf({ running: true } as SessionSnapshot))),
    })
    expect(screen.getByRole('status').textContent).toContain('已连接 · 任务进行中')
    cleanup()

    const disconnected = footer({
      useConnectionState: bindSnapshotSelector(createSnapshotStore<'connected' | 'disconnected' | 'connecting' | undefined>('disconnected')),
    })
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('连接已断开')
    fireEvent.click(screen.getByRole('button', { name: '重新连接' }))
    expect(disconnected.props.reconnect).toHaveBeenCalledOnce()
  })
})
