/** The workbench Artifacts tab: the current Session's real delivered files. */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import {
  IconChevronRightOutlineRegular, IconDeliverDocRegular,
  IconRightUpOutlineRegular, StateDot, fileExtension,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PresentedHost } from '../presented.ts'
import type { PresentedOpenPhase } from './present-open.ts'
import { basename, type PresentedPath } from './turn-deliverables.ts'
import type { NS } from './locales.ts'
import css from './ArtifactsTab.module.css'

/** Native-open state and callbacks the artifacts tab reads from the plugin. */
export interface ArtifactsInjected {
  readonly hooks: {
    readonly presentedOpen: ObservableSnapshot<Readonly<Record<string, PresentedOpenPhase | undefined>>>
    readonly presentedHost: ObservableSnapshot<PresentedHost | 'error' | null>
  }
  /** Reload the Host desktop capabilities. @returns settlement of the read. */
  readonly reloadPresentedHost: () => Promise<void>
  /**
   * @param sessionId - owning Session.
   * @param seq - declaration event sequence.
   * @param index - file index.
   * @returns the safe open outcome.
   */
  readonly openPresented: (sessionId: SessionId, seq: number, index: number) => Promise<unknown>
}

/** Prototype's exact folded-corner document glyph with three text rules. */
function FileGlyph({ className }: IconProps): ReactNode {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-7-7ZM14 2v7h7M7 13h10M7 17h7" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
}

/** The artifacts tab's composed props. */
export type ArtifactsTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<typeof NS>
  & InjectFace<ArtifactsInjected>

/**
 * Collect the latest declaration of each delivered path across the loaded Session.
 * The existing `deliverables` Turn projection supplies the data; this reader does
 * not fold events or infer turns.
 * @param chat - the assembled Chat snapshot, or undefined before it exists.
 * @returns delivered files, latest declaration first.
 */
export function deliveredFiles(chat: ChatSnapshot | undefined): readonly PresentedPath[] {
  if (chat === undefined) return []
  const latest = new Map<string, PresentedPath>()
  for (const turnNumber of chat.timeline.turnOrder) {
    const turn = chat.timeline.turns.get(turnNumber)
    for (const file of turn?.data.get('deliverables')?.presented ?? []) latest.set(file.path, file)
  }
  return [...latest.values()].sort((left, right) => right.seq - left.seq)
}

/**
 * Render the current Session's delivered files as the prototype's single rows:
 * file-content icon, name/detail, and a right chevron that previews the file.
 * Safe Host open is a separate compact control only when the Host desktop is
 * available; Web shows a lightweight availability note instead. Loading and
 * empty states are real, never sample artifacts.
 * @param props - the tab, current Conversation, Session paths, safe open and copy.
 * @returns the artifact rows or its loading/empty state.
 */
export function ArtifactsTab({
  useTabInfo, useConversation, useSessions, useContextMenu, usePresentedHost,
  reloadPresentedHost, openPresented, sessionId, t,
}: ArtifactsTabProps): ReactNode {
  const { tab, panel } = useTabInfo()
  const { getTriggerProps } = useContextMenu()
  const chat = useConversation((state: ConversationSnapshot) => state.views.get('chat'))
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const host = usePresentedHost(value => value)
  useEffect(() => {
    if (host === null) void reloadPresentedHost()
  }, [host, reloadPresentedHost])
  const files = deliveredFiles(chat)
  const available = host !== null && host !== 'error' && host.available
  const preview = (file: PresentedPath): void => {
    tab.actions.openResource(fileAddressFor(sessionId, cwd, file.path), { paneId: panel.id })
  }
  const context = (file: PresentedPath): ContextMenuTriggerProps =>
    getTriggerProps({ kind: 'file', value: { sessionId, path: file.path } })
  if (chat === undefined) {
    return <div className={css.status} data-deliverables-artifacts="loading">
      <StateDot state="ongoing" size={28} />
      <span>{t('artifacts.loading')}</span>
    </div>
  }
  return <div className={css.root} data-deliverables-artifacts="ready">
    <header className={css.header}>
      <span className={css.title}>{t('artifacts.heading')}</span>
      <span className={css.count}>{t('artifacts.count', { count: String(files.length) })}</span>
    </header>
    {files.length === 0
      ? <div className={css.empty} data-deliverables-artifacts-empty>
        <IconDeliverDocRegular className={css.emptyIcon} />
        <p className={css.emptyTitle}>{t('artifacts.empty')}</p>
        <p className={css.emptyHint}>{t('artifacts.emptyHint')}</p>
      </div>
      : <div className={css.list}>
        {files.map((file) => {
          const name = basename(file.path)
          const detail = file.description ?? (fileExtension(name).toUpperCase() || t('presented.file'))
          return <div className={css.row} key={`${file.seq}:${file.index}:${file.path}`}>
            <button
              type="button"
              className={css.preview}
              aria-label={t('presented.previewCard', { name: file.path })}
              title={file.path}
              onClick={() => { preview(file) }}
              {...context(file)}
            >
              <FileGlyph className={css.fileIcon} />
              <span className={css.rowText}>
                <span className={css.name}>{name}</span>
                <span className={css.detail}>{detail}</span>
              </span>
              <IconChevronRightOutlineRegular className={css.chevron} />
            </button>
            {available && <button
              type="button"
              className={css.openButton}
              aria-label={t('artifacts.open')}
              title={t('artifacts.open')}
              onClick={() => { void openPresented(sessionId, file.seq, file.index) }}
            ><IconRightUpOutlineRegular /></button>}
          </div>
        })}
      </div>}
    {host === 'error' && <p className={css.hostNote}>{t('presented.hostError')}</p>}
    {host !== null && host !== 'error' && !host.available && <p className={css.hostNote}>{t('artifacts.nativeUnavailable')}</p>}
  </div>
}
