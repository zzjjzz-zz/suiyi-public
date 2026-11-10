/** Conversation workspace selection backed by the Host list and existing navigation. */
import { useState } from 'react'
import {
  IconChevronDownOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular,
  Menu, MenuItemButton, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SidebarWorkspaceSwitcher.module.css'

/** Workspace actions remain with their existing navigation and directory owners. */
export interface SidebarWorkspaceSwitcherInjected {
  /** Select or create the workspace's blank conversation without discarding drafts. */
  openWorkspace: (id: WorkspaceId) => Promise<void>
  /** Open the workspace management page. */
  manageWorkspaces: () => void
  /** Pick a directory and adopt it through the existing Host flow. */
  addWorkspace: () => Promise<void>
}

type Props = PropsRuntime<'conversation.header.leading'> & PropsLocale<'workspace'> & InjectFace<SidebarWorkspaceSwitcherInjected>

/**
 * Keep workspace navigation in the conversation-owned upper-left button.
 * @param props - live workspace/session hooks and navigation actions.
 * @returns the real workspace chooser and an actionable error message.
 */
export function SidebarWorkspaceSwitcher({
  renderWorkspaceButton, useWorkspaces, useSessions, openWorkspace, manageWorkspaces, addWorkspace, t,
}: Props) {
  const workspaces = useWorkspaces(state => state.items)
  const sessionId = useSessions(state => Object.values(state.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id)
  const current = workspaces.find(workspace => sessionId !== undefined && workspace.sessionIds.includes(sessionId))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wide = renderWorkspaceButton === undefined
  const title = current === undefined ? t('draft.workspaceRequired') : workspaceDisplayTitle(current.title, t('workspace.defaultName'))
  const act = (operation: () => Promise<void>): void => {
    if (busy) return
    setOpen(false)
    setBusy(true)
    setError(null)
    void operation().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t('folderError.title'))
    }).finally(() => { setBusy(false) })
  }
  return <div className={wide ? css.root : css.headerRoot} data-conversation-workspace-switcher="">
    <Menu open={open} onClose={() => { setOpen(false) }} portal autoFocus
      className={wide ? css.anchor : css.headerAnchor} listClassName={css.menu}
      anchor={renderWorkspaceButton?.({ open, disabled: busy, onClick: () => { setOpen(value => !value) } }) ?? <Tooltip label={title} disabled={wide} side="right">
        <button type="button" className={css.trigger} data-wide={wide || undefined}
          aria-label={t('section.workspaces')} title={title} aria-haspopup="menu" aria-expanded={open} disabled={busy}
          onClick={() => { setOpen(value => !value) }}>
          <IconFolderCloseRegular size={16} />
          {wide && <><span className={css.label}><small>{t('section.workspaces')}</small><strong>{title}</strong></span><IconChevronDownOutlineRegular size={12} /></>}
        </button>
      </Tooltip>}>
      {workspaces.map(workspace => <MenuItemButton key={workspace.workspaceId} current={workspace.workspaceId === current?.workspaceId}
        icon={<IconFolderCloseRegular size={16} />} disabled={busy} onSelect={() => { act(() => openWorkspace(workspace.workspaceId)) }}>
        <span className={css.item} title={workspace.path}><strong>{workspaceDisplayTitle(workspace.title, t('workspace.defaultName'))}</strong><small>{workspace.path}</small></span>
      </MenuItemButton>)}
      <MenuItemButton separatorBefore={workspaces.length > 0} icon={<IconPlusOutlineRegular size={16} />} disabled={busy}
        onSelect={() => { act(addWorkspace) }}>{t('workspace.add')}</MenuItemButton>
      <MenuItemButton icon={<IconFolderCloseRegular size={16} />} onSelect={() => { setOpen(false); manageWorkspaces() }}>{t('workspace.manage')}</MenuItemButton>
    </Menu>
    {error !== null && <div className={css.error} role="alert">{error}</div>}
  </div>
}
