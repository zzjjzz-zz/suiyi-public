/**
 * The Workspaces main view: the management surface behind the sidebar's
 * Workspaces entry. It reads the same Host Workspace list and the same
 * create/rename/delete services as WorkspaceBrowser, and it starts sessions
 * through the shared uiWorkspace navigation service. No local workspace data.
 */
import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  IconEllipsisOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular, IconRightUpOutlineRegular,
  Menu, MenuItemButton, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
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
   * @returns completion after the existing directory flow receives the opening request.
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
  const [menuOpen, setMenuOpen] = useState(false)
  const manageLabel = t('actions.workspace.aria', { name: title })
  return (
    <article className={css.card} data-workspace-id={workspace.workspaceId}>
      <div className={css.cardTop}>
        <span className={css.cardIcon} aria-hidden="true"><IconFolderCloseRegular size={22} /></span>
        <Menu
          open={menuOpen}
          onClose={() => { setMenuOpen(false) }}
          portal
          autoFocus
          anchor={(
            <Tooltip label={manageLabel} delayMs={500}>
              <button
                type="button"
                className={css.manage}
                aria-label={manageLabel}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => { setMenuOpen(value => !value) }}
              >
                <IconEllipsisOutlineRegular size={18} />
              </button>
            </Tooltip>
          )}
        >
          <MenuItemButton onSelect={() => {
            setMenuOpen(false)
            requestWorkspaceAction(workspace.workspaceId, title, 'rename')
          }}>{t('rename')}</MenuItemButton>
          <MenuItemButton onSelect={() => {
            setMenuOpen(false)
            requestWorkspaceAction(workspace.workspaceId, title, 'delete')
          }}>{t('delete.workspace')}</MenuItemButton>
        </Menu>
      </div>
      <h3 className={css.cardName} title={title}>{title}</h3>
      <p className={css.description}>{t('workspace.description')}</p>
      <div className={css.path} title={workspace.path}>{workspace.path}</div>
      <div className={css.cardFooter}>
        <span>{t(count === 1 ? 'sessions.count.one' : 'sessions.count.other', { n: count })}</span>
        <button type="button" className={css.enter} onClick={() => { startSession(workspace.workspaceId) }}>
          {t('workspace.enter')}
          <IconRightUpOutlineRegular size={18} />
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
