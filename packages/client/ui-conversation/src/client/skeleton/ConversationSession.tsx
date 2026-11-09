/** Strict per-session header/body content inserted into the resident conversation layout. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Button, IconEllipsisOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ConversationSessionHeaderSlotProps, ConversationSessionSlotProps, ConversationViewActionsOwnerProps,
} from '../contract/slots.ts'
import { resolveActiveView } from '../view-selection.ts'
import { FIXED_VIEW_ID } from '../view-pins.ts'
import { DefaultConversationViews } from './DefaultConversationViews.tsx'
import css from './ConversationRoot.module.css'

/** Full props composed from the strict session body contract. */
export type ConversationSessionProps = ConversationSessionSlotProps

/** Full props composed from the strict session header contract. */
export type ConversationSessionHeaderProps = ConversationSessionHeaderSlotProps

type ViewsMoreMenuProps =
  Omit<ConversationViewActionsOwnerProps, 'onDismiss'>
  & Pick<ConversationSessionHeaderSlotProps, 'renderSlot'>
  & {
    readonly label: string
    readonly current: boolean
    /** Views whose tabs are hidden by the one-row header; they stay reachable here. */
    readonly tabs: readonly { readonly id: string; readonly label: string; readonly active: boolean }[]
  }

/** The View tab row's More launcher; its menu rows come from `conversation.session.header.views.actions`. */
function ViewsMoreMenu({ label, current, entries, tabs, onOpen, onPinnedChange, renderSlot }: ViewsMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const onDismiss = (): void => { setOpen(false) }
  return (
    <Menu open={open} onClose={onDismiss} portal autoFocus className={css.viewsMoreAnchor} listClassName={css.viewsMoreMenu}
      anchor={(
        <Tooltip label={label} portal>
          <Button size="sm" className={clsx(css.viewsMore, current && css.viewsMoreActive)} aria-label={label} aria-haspopup="menu" aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}>
            <IconEllipsisOutlineRegular size={13} />
          </Button>
        </Tooltip>
      )}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="menuitem"
          className={css.viewsMoreItem}
          data-active={tab.active ? '' : undefined}
          onClick={() => { onOpen(tab.id); onDismiss() }}
        >
          {tab.label}
        </button>
      ))}
      {renderSlot('conversation.session.header.views.actions', { entries, onOpen, onPinnedChange, onDismiss })}
    </Menu>
  )
}

/** Approximate 13px text advance: full-width glyphs take one em, other glyphs about half. */
const WIDE_GLYPH = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u
const WIDE_GLYPH_WIDTH = 13
const NARROW_GLYPH_WIDTH = 7
/** Mirrors the `.tabLabel` max-width in `ConversationRoot.module.css`. */
const TAB_LABEL_MAX_WIDTH = 88

/** Estimate whether a View tab label exceeds its 88px cell. */
function labelNeedsTooltip(label: string): boolean {
  let width = 0
  for (const glyph of label) width += WIDE_GLYPH.test(glyph) ? WIDE_GLYPH_WIDTH : NARROW_GLYPH_WIDTH
  return width > TAB_LABEL_MAX_WIDTH
}

/** One View tab label; its full-name tooltip is offered only when the text is expected to overflow. */
function ViewTabLabel({ label }: { readonly label: string }) {
  return (
    <Tooltip label={label} portal disabled={!labelNeedsTooltip(label)}>
      <span className={css.tabLabel}>{label}</span>
    </Tooltip>
  )
}

/** Move the navigation-owned corner control into the global shell topbar when it is mounted. */
function HeaderCornerPortal({ children }: { readonly children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setTarget(document.querySelector<HTMLElement>('[data-shell-header-corner]'))
  }, [])
  const content = <div className={css.headerCorner} data-conversation-header-corner="">{children}</div>
  return target === null ? content : createPortal(content, target)
}

/**
 * Renders Session header chrome above the resident conversation scrollport.
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns Session navigation controls, with title and tabs after conversation starts.
 */
export function ConversationSessionHeader({
  sessionId, hideChrome, useConversationViews, useStore,
  renderSlot, renderFactorySlot, selectView, setPinned, t, useEntryPins, useEntryActions,
}: ConversationSessionHeaderProps) {
  const tabs = useConversationViews(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const unpinned = useEntryPins(ids => ids)
  const hasEntryActions = useEntryActions(registered => registered)
  const showTabs = process.env.DSH_CLIENT_BUILD_PROFILE !== 'suiyi' && !hideChrome && tabs.length > 1
  const tabRow = useRef<HTMLDivElement>(null)
  const [visibleViewLimit, setVisibleViewLimit] = useState(1)
  // Observe only the available row width; individual tabs are not measured.
  useLayoutEffect(() => {
    const row = tabRow.current
    if (row === null || !hasEntryActions) return
    const updateLimit = (): void => {
      setVisibleViewLimit(Math.max(1, Math.floor((row.clientWidth - 48) / 120)))
    }
    updateLimit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateLimit)
    observer.observe(row)
    return () => { observer.disconnect() }
  }, [showTabs, hasEntryActions])
  const { visibleTabs, moreTabs } = useMemo(() => {
    const preferred = [
      ...tabs.filter(tab => tab.id === FIXED_VIEW_ID),
      ...tabs.filter(tab => tab.id !== FIXED_VIEW_ID && !unpinned.includes(tab.id)),
    ]
    const visibleTabs = hasEntryActions ? preferred.slice(0, visibleViewLimit) : preferred
    const visibleIds = new Set(visibleTabs.map(tab => tab.id))
    return { visibleTabs, moreTabs: tabs.filter(tab => !visibleIds.has(tab.id)) }
  }, [tabs, unpinned, hasEntryActions, visibleViewLimit])
  // Every View is reachable through the one More menu; the visible tab strip is
  // visually collapsed by CSS so the header keeps a single row.
  const currentInMore = tabs.some(tab => tab.id === active?.id)
  return (
    <>
      <div className={css.titleRow}>
        {hideChrome ? null : (
          <>
            <div className={css.headerActions}>
              {renderSlot('conversation.session.header.actions', {})}
            </div>
            <div className={css.headerUtilities}>
              {renderSlot('conversation.session.header.utilities', {})}
              {renderFactorySlot('contextMenu.button', {
                target: { kind: 'sessionHeader', value: { sessionId } },
                label: t('header.more'), className: css.headerMenuButton, size: 'sm',
              })}
            </div>
          </>
        )}
        <HeaderCornerPortal>
          {renderSlot('conversation.session.header.corner', {})}
        </HeaderCornerPortal>
      </div>
      {showTabs && (
        // data-conversation-tabs: marks the tab strip, which the window-chrome
        // geometry and the browser coverage lane anchor on.
        <div ref={tabRow} className={css.tabs}>
          <div className={css.viewTabs} role="tablist" data-conversation-tabs="">
            {visibleTabs.map(viewTab => (
              <button
                key={viewTab.id}
                type="button"
                role="tab"
                aria-selected={viewTab.id === active?.id}
                className={clsx(css.tab, viewTab.id === active?.id && css.tabActive)}
                onClick={() => { selectView(viewTab.id) }}
              >
                <ViewTabLabel label={viewTab.label} />
              </button>
            ))}
          </div>
          {hasEntryActions && (
            <ViewsMoreMenu
              label={t('session.moreViews')}
              current={currentInMore}
              entries={moreTabs.map(viewTab => ({
                id: viewTab.id, label: viewTab.label,
                pinned: !unpinned.includes(viewTab.id), active: viewTab.id === active?.id,
              }))}
              tabs={visibleTabs.map(viewTab => ({
                id: viewTab.id, label: viewTab.label, active: viewTab.id === active?.id,
              }))}
              onOpen={selectView}
              onPinnedChange={setPinned}
              renderSlot={renderSlot}
            />
          )}
        </div>
      )}
    </>
  )
}

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession(props: ConversationSessionProps) {
  return <DefaultConversationViews {...props} />
}
