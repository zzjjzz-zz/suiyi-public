/** Global shell footer: transport and task status plus the build version. */
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the `shell.bottom` root slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ConversationShellFooterInjected } from '../contract/slots.ts'
import css from './ConversationRoot.module.css'

const VERSION = process.env.DSH_CLIENT_VERSION
const COMMIT = process.env.DSH_CLIENT_COMMIT_HASH

/** Full props of the root shell footer occupant. */
export type ConversationFooterProps = PropsRuntime<'shell.bottom'>
  & PropsLocale<'conversation'>
  & InjectFace<ConversationShellFooterInjected>

/**
 * Render the prototype's real statusbar. The orbit and text follow the live
 * transport and the main Session's run state; the version is the build's own
 * public metadata, never a placeholder.
 * @param props - shell standard sources, chrome services, and the locale seat.
 * @returns the 30px footer.
 */
export function ConversationFooter({
  useSessions, useConnectionState, useCurrentSessionId, reconnect, t,
}: ConversationFooterProps) {
  const sessionId = useCurrentSessionId(id => id)
  const running = useSessions(list => sessionId === undefined ? false : list.byId[sessionId]?.running === true)
  const connection = useConnectionState(state => state)
  const connectionLabel = connection === 'connected'
    ? t('footer.connected')
    : connection === 'disconnected' ? t('footer.disconnected') : t('footer.connecting')
  const taskLabel = running
    ? t('footer.running')
    : sessionId !== undefined ? t('footer.idle') : t('footer.noSession')
  const version = VERSION === undefined || VERSION === ''
    ? null
    : COMMIT === undefined || COMMIT === '' ? `v${VERSION}` : `v${VERSION} · ${COMMIT}`
  return (
    <footer className={css.statusbar} data-conversation-footer="">
      <span className={css.statusGroup} role="status" aria-live="polite">
        <i className={css.statusDot} data-state={connection ?? 'connecting'} aria-hidden="true" />
        <span className={css.statusText}>{connectionLabel} · {taskLabel}</span>
      </span>
      <span className={css.statusRight}>
        {connection === 'disconnected' && (
          <button type="button" className={css.statusAction} onClick={reconnect}>
            {t('footer.reconnect')}
          </button>
        )}
        {version !== null && <span className={css.statusVersion}>{version}</span>}
      </span>
    </footer>
  )
}
