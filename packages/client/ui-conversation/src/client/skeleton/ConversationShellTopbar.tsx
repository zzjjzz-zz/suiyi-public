/** Root shell topbar: current title, theme, and plugin center. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the `shell.header` root slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ConversationShellChromeInjected } from '../contract/slots.ts'
import { ConversationAccountAction } from './ConversationAccountAction.tsx'
import { ConversationInstallAction } from './ConversationInstallAction.tsx'
import { ConversationTopbarActions } from './ConversationTopbarActions.tsx'
import css from './ConversationRoot.module.css'

/** Full props of the root shell topbar occupant. */
export type ConversationShellTopbarProps = PropsRuntime<'shell.header'>
  & PropsLocale<'conversation'>
  & InjectFace<ConversationShellChromeInjected>

/**
 * Render the global 62px topbar. It stays mounted across main-panel switches,
 * so the current title, theme, and plugin center never vanish on plugin or
 * settings pages. The workspace entry belongs to the conversation chat-top
 * row below, not to this global bar.
 * @param props - shell standard sources, chrome services, and the locale seat.
 * @returns the global topbar.
 */
export function ConversationShellTopbar({
  useSessions, usePanelInfo, useCurrentSessionId, useTheme, toggleTheme, openPluginCenter, t,
}: ConversationShellTopbarProps) {
  const panelId = usePanelInfo(info => info.activePanelId)
  const sessionId = useCurrentSessionId(id => id)
  const sessionTitle = useSessions((list) => {
    if (sessionId === undefined) return undefined
    const row = list.byId[sessionId]
    return row?.blank === true ? undefined : row?.displayTitle
  })
  const panelTitle = panelId === 'settings'
    ? t('topbar.settings')
    : panelId === 'plugin-hub' ? t('topbar.pluginCenter') : undefined
  const title = panelId !== null && panelId !== undefined ? panelTitle ?? sessionTitle : sessionTitle
  return (
    <header className={css.shellTopbar} data-conversation-topbar="" data-shell-global-chrome="">
      <div className={css.shellTopbarLeft}>
        <span className={css.shellTitle} title={title ?? t('session.new')}>{title ?? t('session.new')}</span>
      </div>
      <div className={css.shellTopbarRight}>
        <ConversationAccountAction t={t} />
        <ConversationInstallAction t={t} />
        <ConversationTopbarActions
          useTheme={useTheme}
          toggleTheme={toggleTheme}
          openPluginCenter={openPluginCenter}
          t={t}
        />
        <div className={css.shellHeaderCorner} data-shell-header-corner="" />
      </div>
    </header>
  )
}
