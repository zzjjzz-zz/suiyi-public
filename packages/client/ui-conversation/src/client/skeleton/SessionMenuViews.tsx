/** Session-scoped View navigation inside the shared header menu. */
import { useEffect, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSessionHeaderInjected, ConversationStore } from '../contract/slots.ts'
import { FIXED_VIEW_ID } from '../view-pins.ts'
import { resolveActiveView } from '../view-selection.ts'
import css from './ConversationRoot.module.css'

/** Retain the captured Session until its menu unmounts. */
export interface SessionMenuScopeInjected {
  /** @param id - Captured header Session. @returns a reference released on dismissal. */
  retainSession(id: SessionId): SessionReference
}

type ScopeProps = PropsRuntime<'contextMenu.content'> & PropsRenderSlots<'conversation.session.menu.views'> & InjectFace<SessionMenuScopeInjected>
/** @param props - Captured menu and Session lifetime owner. @returns View rows bound to that Session. */
export function SessionMenuScope({ target, dismiss, retainSession, SessionProvider, renderSlot }: ScopeProps) {
  const id = target.kind === 'sessionHeader' ? target.value.sessionId : undefined
  const [reference, setReference] = useState<SessionReference>()
  useEffect(() => {
    if (id === undefined) return
    const next = retainSession(id)
    setReference(next)
    return () => { next.release() }
  }, [id, retainSession])
  if (reference === undefined || reference.sessionId !== id) return null
  return <SessionProvider session={reference}>
    {renderSlot('conversation.session.menu.views', { dismiss })}
  </SessionProvider>
}

type ViewProps = PropsRuntime<'conversation.session.menu.views'> & PropsStore<ConversationStore>
  & PropsRenderSlots<'conversation.session.header.views.actions'> & PropsLocale<'conversation'>
  & InjectFace<Pick<ConversationSessionHeaderInjected, 'hooks' | 'selectView' | 'setPinned'>>
/** @param props - Live View roster, shared selection, and extension rows. @returns navigation in the existing menu. */
export function SessionMenuViews({
  useConversationViews, useStore, useEntryPins, useEntryActions, selectView, setPinned, dismiss, renderSlot, t,
}: ViewProps) {
  const tabs = useConversationViews(value => value)
  const selected = useStore(value => value.view)
  const unpinned = useEntryPins(value => value)
  const hasActions = useEntryActions(value => value)
  const active = resolveActiveView(tabs, selected)
  if (tabs.length < 2) return null
  const plain = hasActions ? tabs.filter(tab => tab.id === FIXED_VIEW_ID) : tabs
  return <div className={css.sessionMenuViews} role="group" aria-label={t('session.moreViews')}>
    {plain.map(tab => <button key={tab.id} type="button" role="menuitem" className={css.viewsMoreItem}
      data-active={tab.id === active?.id ? '' : undefined}
      onClick={() => { selectView(tab.id); dismiss() }}>{tab.label}</button>)}
    {hasActions && renderSlot('conversation.session.header.views.actions', {
      entries: tabs.filter(tab => tab.id !== FIXED_VIEW_ID).map(tab => ({
        ...tab, pinned: !unpinned.includes(tab.id), active: tab.id === active?.id,
      })),
      onOpen: selectView, onPinnedChange: setPinned, onDismiss: dismiss,
    })}
  </div>
}
