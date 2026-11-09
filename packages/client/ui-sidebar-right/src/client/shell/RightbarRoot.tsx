/** Root-scoped controller for the right Sidebar's Session content. */
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { HostObservable, InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarSessionViewSnapshot } from '../session-views.ts'
import type {} from '../contract/slots.ts'
import { WorkbenchToggle } from './ExpandButton.tsx'
import css from './SidebarRight.module.css'

/** Copy and actions the global workbench trigger reads from the plugin. */
export interface GlobalWorkbenchLabels {
  readonly workbench: string
  readonly expand: string
  readonly expandAria: string
  readonly noSession: string
}

/** Root-only retained Session targets and their committed mount lifetimes. */
export interface RightbarRootInjected {
  readonly hooks: { readonly views: HostObservable<readonly SidebarSessionViewSnapshot[]> }
  readonly mountView: (reference: SessionReference) => () => void
  /** Return to the selected Conversation and expand that Session's workbench. */
  readonly openWorkbench: (sessionId: SessionId) => void
  /** Locale-owned labels for the retained global trigger. */
  readonly labels: GlobalWorkbenchLabels
}

type RootProps = PropsRuntime<'rightbar'> & PropsRenderSlots<'rightbar.session'> & InjectFace<RightbarRootInjected>

/**
 * Portal the retained global workbench trigger into the shell header's corner.
 * ConversationSession owns that corner while the Conversation is mounted; this
 * root trigger appears only while another main panel is active, so there is
 * still exactly one workbench entry.
 * @param props - selected Session, labels and the real open action.
 * @returns the portalled pill, or nothing until the header corner exists.
 */
export function GlobalWorkbenchTrigger({ sessionId, labels, openWorkbench }: {
  readonly sessionId: SessionId | undefined
  readonly labels: GlobalWorkbenchLabels
  readonly openWorkbench: (sessionId: SessionId) => void
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const find = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-shell-header-corner]')
    const current = find()
    if (current !== null) { setTarget(current); return }
    // The frame mounts the header and the right column in the same commit; a
    // one-shot query can run before the header corner exists.
    const observer = new MutationObserver(() => {
      const next = find()
      if (next !== null) { setTarget(next); observer.disconnect() }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect() }
  }, [])
  if (target === null) return null
  return createPortal(
    <WorkbenchToggle
      expanded={false}
      label={labels.workbench}
      ariaLabel={sessionId === undefined ? labels.noSession : labels.expandAria}
      title={sessionId === undefined ? labels.noSession : labels.expand}
      disabled={sessionId === undefined}
      onActivate={() => { if (sessionId !== undefined) openWorkbench(sessionId) }}
    />,
    target,
  )
}

function SessionView({ view, visible, SessionProvider, renderSlot, mountView, width, viewportWidth, canShow }:
  Pick<RootProps, 'SessionProvider' | 'renderSlot' | 'mountView' | 'width' | 'viewportWidth' | 'canShow'>
  & { readonly view: SidebarSessionViewSnapshot; readonly visible: boolean }) {
  useLayoutEffect(() => mountView(view.reference), [mountView, view.reference])
  const active = visible && view.selected
  return <div className={css.session} hidden={!active} data-sidebar-right-session={view.sessionId}>
    <SessionProvider session={view.reference}>
      {renderSlot('rightbar.session', { width, viewportWidth, canShow, active, retainTab: view.retainTab })}
    </SessionProvider>
  </div>
}

/**
 * Keep independent Session subtrees and hide those outside the selected Conversation.
 * While a global main panel is active, retain one real header entry for the
 * selected Session's workbench.
 * @param props - frame geometry, view targets, labels and the authorized Session renderer.
 * @returns the foreground and retained background Sidebars, plus the global trigger.
 */
export function RightbarRoot({ usePanelInfo, useViews, labels, openWorkbench, ...props }: RootProps) {
  const visible = usePanelInfo(info => info.activePanelId === null)
  const views = useViews(value => value)
  const selected = views.find(view => view.selected)
  return <>
    {views.map(view => <SessionView key={view.sessionId} {...props} view={view} visible={visible} />)}
    {!visible && <GlobalWorkbenchTrigger
      sessionId={selected?.sessionId}
      labels={labels}
      openWorkbench={openWorkbench}
    />}
  </>
}
