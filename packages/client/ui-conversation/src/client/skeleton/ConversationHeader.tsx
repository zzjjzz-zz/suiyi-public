/** Resident conversation chat-top: workspace entry plus real Session controls. */
import clsx from 'clsx'
import {
  IconChevronDownOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationHeaderProps } from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import css from './ConversationRoot.module.css'

/**
 * Keep the workspace entry and real Session controls below the global shell
 * topbar. The current title, theme, and plugin center stay in the shell header,
 * so settings and plugin pages never show a conversation chat-top.
 * @param props - Optional Session sources, live chrome services, and the Session-header seat.
 * @returns the resident 52px chat-top, or nothing before a Session exists.
 */
export function ConversationHeader({
  sessionId, useSession, useConversation, useWorkspaces, renderSlot, openWorkspaces, t,
}: ConversationHeaderProps) {
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const blank = session === undefined || conversation === undefined
    || (session.blank && conversationPhase(session, conversation) === 'blank')
  const workspace = useWorkspaces(snapshot => sessionId === undefined
    ? undefined
    : snapshot.items.find(item => item.sessionIds.includes(sessionId)))
  const workspaceLabel = workspace?.title ?? t('hero.chooseWorkspace')
  return (
    <header className={clsx(css.header, blank && css.headerBlank)} data-window-drag data-conversation-session-bar="">
      <div className={css.headerLeading} data-conversation-header-leading="">
        <button
          type="button"
          className={css.shellWorkspace}
          aria-label={workspaceLabel}
          onClick={openWorkspaces}
        >
          {workspace === undefined
            ? <IconFolderCloseRegular size={14} />
            : <IconFolderOpenRegular size={14} />}
          <span className={css.shellWorkspaceLabel}>{workspaceLabel}</span>
          <IconChevronDownOutlineRegular size={12} className={css.shellWorkspaceChevron} />
        </button>
        {renderSlot('conversation.header.leading', {})}
      </div>
      {sessionId === undefined ? null : (
        <div className={css.headerMain}>
          {renderSlot('conversation.session.header', { hideChrome: blank })}
        </div>
      )}
    </header>
  )
}
