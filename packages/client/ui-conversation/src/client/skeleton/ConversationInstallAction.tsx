/** Real Desktop install/update entry in the global shell topbar. */
import { useEffect, useRef, useState } from 'react'
import {
  IconDownloadOutlineRegular, IconWarningOutlineRegular, Toast, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopUpdateBridge } from '@deepseek-ai/dsh-client-ui-settings-general/types'
import type { ConversationShellTopbarProps } from './ConversationShellTopbar.tsx'
import css from './ConversationRoot.module.css'

/** Product API subset that carries the Desktop update bridge. */
interface UpdateDesktopApi {
  readonly updates?: DesktopUpdateBridge
}

/**
 * Render the install/update entry only when the Desktop preload exposes the
 * real update bridge. Web and non-Desktop hosts get no demo button. An IPC
 * transport rejection is reported through the shared localized Toast, never a
 * raw bridge error or a silent button.
 * @param props - locale seat.
 * @returns the install action, or null without a real capability.
 */
export function ConversationInstallAction({ t }: { t: ConversationShellTopbarProps['t'] }) {
  const bridge = (globalThis as { dshDesktop?: UpdateDesktopApi }).dshDesktop?.updates
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [failure, setFailure] = useState<number | null>(null)
  const failureSeq = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  if (bridge === undefined) return null
  return (
    <>
      <Tooltip label={t('topbar.installDetail')} side="bottom" portal>
        <button
          ref={buttonRef}
          type="button"
          className={css.installAction}
          aria-label={t('topbar.install')}
          onClick={() => {
            void bridge.open().catch(() => {
              // Unmounted: no surface remains to report to.
              if (!mounted.current) return
              failureSeq.current += 1
              setFailure(failureSeq.current)
            })
          }}
        >
          <IconDownloadOutlineRegular size={16} />
          <span className={css.installLabel}>{t('topbar.install')}</span>
        </button>
      </Tooltip>
      {failure !== null && (
        <Toast
          key={failure}
          text={t('topbar.installFailed')}
          icon={<IconWarningOutlineRegular />}
          anchor={buttonRef.current}
          onDone={() => { setFailure(null) }}
        />
      )}
    </>
  )
}
