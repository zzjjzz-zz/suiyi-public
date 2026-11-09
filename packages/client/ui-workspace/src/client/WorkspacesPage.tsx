/**
 * The Workspaces main view: the management surface behind the sidebar's
 * Workspaces entry. It reads the same Host Workspace list and the same
 * create/rename/delete services as WorkspaceBrowser, and it starts sessions
 * through the shared uiWorkspace navigation service. No local workspace data.
 */
import type { ReactNode } from 'react'
import { useState } from 'react'
import { IconFolderCloseRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WorkspacesPage.module.css'

/** Actions the view borrows from the workspace plugin's existing services. */
export interface WorkspacesPageInjected {
  /** Start a new Session in one Host Workspace. */
  readonly startSession: (workspaceId: WorkspaceId) => void
  /** Raise the existing rename/delete dialog hosted by the sidebar browser. */
  readonly requestWorkspaceAction: (workspaceId: WorkspaceId, displayTitle: string, action: 'rename' | 'delete') => void
  /**
   * Pick a Host directory and adopt it as a Workspace.
   * @returns completion after the Host accepts or the pick is cancelled.
   */
  readonly addWorkspace: () => Promise<void>
}

/** Composed slot props for the Workspaces main panel. */
export type WorkspacesPageProps =
  & PropsRuntime<'main'>
  & PropsLocale<'workspace'>
  & InjectFace<WorkspacesPageInjected>

/**
 * Render one workspace card.
 * @param props - the workspace row and the real card actions.
 * @returns one card element.
 */
function WorkspaceCard({ workspace, title, t, startSession, requestWorkspaceAction }: {
  workspace: WorkspaceView
  title: string
  t: WorkspacesPageProps['t']
  startSession: WorkspacesPageInjected['startSession']
  requestWorkspaceAction: WorkspacesPageInjected['requestWorkspaceAction']
}): ReactNode {
  const count = workspace.sessionIds.length
  return (
    <article className={css.card} data-workspace-id={workspace.workspaceId}>
      <div className={css.cardTitle}>
        <IconFolderCloseRegular size={18} />
        <span title={title}>{title}</span>
      </div>
      <p className={css.path} title={workspace.path}>{workspace.path}</p>
      <p className={css.meta}>{t(count === 1 ? 'sessions.count.one' : 'sessions.count.other', { n: count })}</p>
      <div className={css.actions}>
        <button type="button" className={css.action} onClick={() => { requestWorkspaceAction(workspace.workspaceId, title, 'rename') }}>
          {t('rename')}
        </button>
        <button type="button" className={css.action} onClick={() => { requestWorkspaceAction(workspace.workspaceId, title, 'delete') }}>
          {t('delete.workspace')}
        </button>
        <button type="button" className={`${css.action} ${css.actionPrimary}`} onClick={() => { startSession(workspace.workspaceId) }}>
          {t('session.new')}
        </button>
      </div>
    </article>
  )
}

/**
 * Render the Workspaces main view.
 * @param props - framework hooks, locale seat, and the borrowed workspace services.
 * @returns the workspace management page.
 */
export function WorkspacesPage({ useWorkspaces, startSession, requestWorkspaceAction, addWorkspace, t }: WorkspacesPageProps): ReactNode {
  const snapshot = useWorkspaces(state => state)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const defaultName = t('workspace.defaultName')
  const add = (): void => {
    if (busy) return
    setBusy(true)
    setError(null)
    addWorkspace().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t('folderError.title'))
    }).finally(() => { setBusy(false) })
  }
  return (
    <section className={css.page} aria-label={t('section.workspaces')}>
      <header className={css.heading}>
        <div>
          <h1>{t('section.workspaces')}</h1>
          <p className={css.intro}>{t('page.workspaces.intro')}</p>
        </div>
        <button type="button" className={css.add} disabled={busy} onClick={add}>
          <IconPlusOutlineRegular size={15} />
          {t('workspace.add')}
        </button>
      </header>
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      {snapshot.items.length === 0
        ? (
          <div className={css.empty}>
            <p>{t('empty.none')}</p>
            <button type="button" className={css.add} disabled={busy} onClick={add}>
              <IconPlusOutlineRegular size={15} />
              {t('workspace.add')}
            </button>
          </div>
        )
        : (
          <div className={css.grid}>
            {snapshot.items.map(workspace => (
              <WorkspaceCard
                key={workspace.workspaceId}
                workspace={workspace}
                title={workspaceDisplayTitle(workspace.title, defaultName)}
                t={t}
                startSession={startSession}
                requestWorkspaceAction={requestWorkspaceAction}
              />
            ))}
          </div>
        )}
    </section>
  )
}
