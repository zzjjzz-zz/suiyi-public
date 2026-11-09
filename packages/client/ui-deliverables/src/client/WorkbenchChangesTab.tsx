/** The workbench Changes tab: open the latest real turn review, or say there is none. */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button, IconBranchOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { changesReviewAddress, type ChangesReviewCoordinates } from '../changes.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NS } from './locales.ts'
import css from './WorkbenchChangesTab.module.css'

/** Composed props of the workbench Changes page. */
export type WorkbenchChangesTabProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS>

/** The handoff state of one resolved review address. */
type ResolvePhase = 'idle' | 'opening' | 'opened' | 'failed'

/**
 * Read the latest Turn that announced workspace changes.
 * @param chat - assembled Chat snapshot, or undefined before it exists.
 * @param sessionId - the Session whose review address is built.
 * @returns the latest real review coordinates, or undefined when the Session records none.
 */
export function latestChangesCoordinates(
  chat: ChatSnapshot | undefined,
  sessionId: SessionId,
): ChangesReviewCoordinates | undefined {
  if (chat === undefined) return undefined
  const order = chat.timeline.turnOrder
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const turnNumber = order[index]
    if (turnNumber === undefined) continue
    const turn = chat.timeline.turns.get(turnNumber)
    const changes = turn?.data.get('deliverables')?.changes
    if (turn !== undefined && changes !== undefined) return { sessionId, seq: changes.seq, turn: turn.turn }
  }
  return undefined
}

/**
 * Open the newest recorded turn review when one exists; otherwise show the
 * Session's real empty state. The page resolves the address from the existing
 * `deliverables` Turn projection, never from a guessed sequence. It records the
 * address it handed off so a later latest sequence can open again, and a handoff
 * that leaves this tab mounted shows a completed state with an explicit re-open
 * control instead of a permanent spinner.
 * @param props - the tab, current Conversation, Session identity and copy.
 * @returns a status/empty/completed state, never an unbounded opening spinner.
 */
export function WorkbenchChangesTab({ useTabInfo, useConversation, sessionId, t }: WorkbenchChangesTabProps): ReactNode {
  const { tab } = useTabInfo()
  const chat = useConversation((state: ConversationSnapshot) => state.views.get('chat'))
  const latest = latestChangesCoordinates(chat, sessionId)
  const address = latest === undefined ? undefined : changesReviewAddress(latest)
  const [openedAddress, setOpenedAddress] = useState<string>()
  const [phase, setPhase] = useState<ResolvePhase>('idle')

  const handOff = useCallback((target: string): void => {
    setPhase('opening')
    try {
      // Open without `replaceTab`: an already open review is revealed and this
      // resolver could otherwise stay beside it. Closing this tab explicitly
      // hands the pane over in both the new and already-open cases.
      tab.actions.openResource(target, { params: { index: 0 } })
      tab.actions.close()
      setOpenedAddress(target)
      setPhase('opened')
    } catch (error) {
      console.error('ui-deliverables: opening the latest changes failed', error)
      setPhase('failed')
    }
  }, [tab.actions])

  useEffect(() => {
    if (address === undefined) {
      setPhase('idle')
      return
    }
    if (openedAddress === address) return
    handOff(address)
  }, [address, openedAddress, handOff])

  if (chat === undefined) {
    return <div className={css.status} data-workbench-changes="loading">
      <StateDot state="ongoing" size={28} />
      <span>{t('changes.loading')}</span>
    </div>
  }
  if (latest === undefined || address === undefined) {
    return <div className={css.empty} data-workbench-changes="empty">
      <IconBranchOutlineRegular className={css.emptyIcon} />
      <p className={css.emptyTitle}>{t('changes.empty')}</p>
      <p className={css.emptyHint}>{t('changes.emptyHint')}</p>
    </div>
  }
  if (phase === 'failed') {
    return <div className={css.opened} data-workbench-changes="failed">
      <StateDot state="error" size={28} appearance="step" />
      <p className={css.openedText}>{t('changes.failed')}</p>
      <Button variant="outline" size="sm" onClick={() => { handOff(address) }}>{t('changes.open')}</Button>
    </div>
  }
  if (phase === 'opened') {
    return <div className={css.opened} data-workbench-changes="opened">
      <StateDot state="done" size={28} appearance="step" />
      <p className={css.openedText}>{t('changes.opened')}</p>
      <Button variant="outline" size="sm" onClick={() => { handOff(address) }}>{t('changes.open')}</Button>
    </div>
  }
  return <div className={css.status} data-workbench-changes="opening">
    <StateDot state="ongoing" size={28} />
    <span>{t('changes.opening')}</span>
  </div>
}
