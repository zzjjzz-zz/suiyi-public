// @vitest-environment jsdom
/** The workspace page reuses the real navigation and management services. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { zh } from '../src/client/locales.ts'
import { WorkspacesPage } from '../src/client/WorkspacesPage.tsx'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as never
const wid = (id: string) => id as WorkspaceId
const sid = (id: string) => id as SessionId

function view(id: string, title: string): WorkspaceView {
  return {
    workspaceId: wid(id), title, path: `/home/user/${id}`,
    sessionIds: [sid('s-1'), sid('s-2')],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function mount(options: { items?: readonly WorkspaceView[]; addWorkspace?: () => Promise<void> } = {}) {
  const startSession = vi.fn()
  const requestWorkspaceAction = vi.fn()
  const addWorkspace = vi.fn(options.addWorkspace ?? (async () => {}))
  const snapshot = { items: options.items ?? [view('alpha', 'Alpha'), view('beta', 'Beta')] } as WorkspaceSnapshot
  const useWorkspaces = (<S,>(selector: (state: WorkspaceSnapshot) => S): S => selector(snapshot)) as GlobalStandardProps['useWorkspaces']
  render(
    <WorkspacesPage
      {...({} as GlobalStandardProps)}
      useWorkspaces={useWorkspaces}
      startSession={startSession}
      requestWorkspaceAction={requestWorkspaceAction}
      addWorkspace={addWorkspace}
      t={t}
    />,
  )
  return { startSession, requestWorkspaceAction, addWorkspace }
}

describe('WorkspacesPage', () => {
  it('lists the real workspaces and starts a session in one', () => {
    const { startSession } = mount()
    expect(screen.getByRole('heading', { name: '工作空间' })).toBeTruthy()
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('/home/user/beta')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: '新会话' })[0]!)
    expect(startSession).toHaveBeenCalledWith('alpha')
  })

  it('raises the existing rename and delete dialogs', () => {
    const { requestWorkspaceAction } = mount()
    fireEvent.click(screen.getAllByRole('button', { name: '重命名' })[1]!)
    expect(requestWorkspaceAction).toHaveBeenCalledWith('beta', 'Beta', 'rename')
    fireEvent.click(screen.getAllByRole('button', { name: '删除工作区' })[0]!)
    expect(requestWorkspaceAction).toHaveBeenCalledWith('alpha', 'Alpha', 'delete')
  })

  it('adds through the real picker service and reports a failure in place', async () => {
    const { addWorkspace } = mount({ addWorkspace: async () => { throw new Error('picker unavailable') } })
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))
    expect(addWorkspace).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'picker unavailable')
  })
})
