/** The workbench's persistent domain bar above the docked tab strip. */
import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import { activeDockPaneId, getPane } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import {
  IconCloseOutlineRegular, IconFolderCloseRegular, IconGlobeOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarRightKey } from '../locales.ts'
import type { SidebarRightOpenTabOptions } from '../service.ts'
import type { SurfaceState } from '../stores.ts'
import type { SidebarRightTabDefinition } from '../tab-registry.ts'
import css from './WorkbenchBar.module.css'

/** One fixed domain in the workbench bar. */
type WorkbenchDomain = 'artifacts' | 'files' | 'terminal' | 'browser' | 'changes'

/** The label, glyph and provider kinds of one domain. */
interface DomainSpec {
  readonly domain: WorkbenchDomain
  readonly label: SidebarRightKey
  readonly icon: ComponentType<IconProps>
  /** The unavailability reason shown while no provider is registered. */
  readonly unavailable: SidebarRightKey
}

/** Prototype `box` glyph for the artifacts door. */
function BoxGlyph({ className }: IconProps): ReactNode {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="m12 3 10 5-10 5L2 8l10-5ZM2 8v10l10 5 10-5V8M12 13v10M7 5.5l10 5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
}

/** Prototype `terminal` glyph for the terminal door. */
function TerminalGlyph({ className }: IconProps): ReactNode {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="m4 5 6 7-6 7M12 19h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

/** Prototype `external` glyph: framed expand arrow. */
function ExternalGlyph({ className }: IconProps): ReactNode {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M14 3h7v7M10 14 21 3M10 3H3v18h18v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

/** Prototype `branch` glyph for the changes door. */
function BranchGlyph({ className }: IconProps): ReactNode {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M6 3v12a5 5 0 0 0 5 5h7M6 7h7a5 5 0 0 0 5-5M3 3h6M16 18l2 2-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

const DOMAINS: readonly DomainSpec[] = [
  { domain: 'artifacts', label: 'workbench.artifacts', icon: BoxGlyph, unavailable: 'workbench.unavailable.artifacts' },
  { domain: 'files', label: 'workbench.files', icon: IconFolderCloseRegular, unavailable: 'workbench.unavailable.files' },
  { domain: 'terminal', label: 'workbench.terminal', icon: TerminalGlyph, unavailable: 'workbench.unavailable.terminal' },
  { domain: 'browser', label: 'workbench.browser', icon: IconGlobeOutlineRegular, unavailable: 'workbench.unavailable.browser' },
  { domain: 'changes', label: 'workbench.changes', icon: BranchGlyph, unavailable: 'workbench.unavailable.changes' },
]

/** What the bar needs from the panel: the session's layout, its two navigation paths, the registry and copy. */
export interface WorkbenchBarProps {
  /** The Session whose layout and tabs the bar acts on. */
  readonly sessionId: SessionId
  /** That Session's committed surface. */
  readonly surface: SurfaceState
  /** Focus an existing tab in the same Session. @param tabId - the record to focus. */
  readonly focusTab: (tabId: TabId) => void
  /** @param kind - page kind to open. @param options - the pane it lands in. */
  readonly openTab: (kind: string, options?: SidebarRightOpenTabOptions) => void
  /** The registry's registered types; the bar only enables providers that exist. */
  readonly useTabTypes: <S>(selector: (types: readonly SidebarRightTabDefinition[]) => S) => S
  /** Right-Sidebar dictionary. */
  readonly t: TranslateNS<'sidebarRight'>
  /** Whether the panel currently fills the viewport. */
  readonly fullscreen?: boolean
  /** Toggle the panel's presentation. Omitted in isolated tests. */
  readonly toggleFullscreen?: () => void
  /** Collapse the panel through its shared store. Omitted in isolated tests. */
  readonly collapse?: () => void
  /** Effective shortcut catalog for the title-bar controls. */
  readonly shortcuts?: readonly ShortcutCatalogEntry[]
}

/**
 * Which workbench domain an active tab belongs to.
 * @param kind - the active tab's kind, if any.
 * @returns the domain, or undefined for a tab outside the workbench's five doors.
 */
function domainOf(kind: string | undefined): WorkbenchDomain | undefined {
  switch (kind) {
    case 'files':
    case 'text': return 'files'
    case 'terminal': return 'terminal'
    case 'browser': return 'browser'
    case 'changes':
    case 'changes-review': return 'changes'
    case 'artifacts':
    case 'deliverables': return 'artifacts'
    default: return undefined
  }
}

/**
 * The workbench's fixed domain bar: 工作台 plus 成果/文件/终端/浏览/改动.
 *
 * Each button navigates through the existing typed registry: a registered
 * provider opens a real tab, an already open tab is focused, and a missing
 * provider or a change review without a turn target states why it is
 * unavailable. The bar never fabricates session artifacts or a diff.
 * @param props - the session layout, navigation callbacks, registry and copy.
 * @returns the title, five domain buttons, and any unavailable notice.
 */
export function WorkbenchBar({
  sessionId, surface, focusTab, openTab, useTabTypes, t, fullscreen = false, toggleFullscreen, collapse, shortcuts = [],
}: WorkbenchBarProps): ReactNode {
  const [notice, setNotice] = useState<SidebarRightKey>()
  const types = useTabTypes(entries => entries)
  const has = (kind: string): boolean => types.some(type => type.kind === kind)
  const artifactsKind = has('artifacts') ? 'artifacts' : has('deliverables') ? 'deliverables' : undefined
  const { layout } = surface
  const activePane = getPane(layout, layout.activePaneId)
  const activeTab = activePane.activeTabId === undefined ? undefined : layout.tabs[activePane.activeTabId]
  const active = domainOf(activeTab?.kind)
  // Doors land in the docked workbench even while a floating panel has focus.
  const targetPaneId = activeDockPaneId(layout)
  const targetPane = getPane(layout, targetPaneId)
  const unavailable: Readonly<Record<WorkbenchDomain, boolean>> = {
    artifacts: artifactsKind === undefined,
    files: !has('files'),
    terminal: !has('terminal'),
    browser: !has('browser'),
    changes: !has('changes-review') && !has('changes'),
  }
  const existing = (kind: string): TabId | undefined => {
    const inPane = targetPane.tabs.find(tabId => layout.tabs[tabId]?.kind === kind)
    if (inPane !== undefined) return inPane
    return Object.values(layout.tabs).find(tab => tab.kind === kind)?.id
  }
  const focusKind = (kind: string): boolean => {
    const tabId = existing(kind)
    if (tabId === undefined) return false
    focusTab(tabId)
    return true
  }
  const choose = (domain: WorkbenchDomain): void => {
    setNotice(undefined)
    if (unavailable[domain]) {
      const reason = DOMAINS.find(spec => spec.domain === domain)?.unavailable
      if (reason !== undefined) setNotice(reason)
      return
    }
    switch (domain) {
      case 'artifacts':
        // The kind is defined exactly while some provider registered it.
        if (artifactsKind !== undefined && !focusKind(artifactsKind)) openTab(artifactsKind, { paneId: targetPaneId })
        return
      case 'files':
        if (!focusKind('files')) openTab('files', { paneId: targetPaneId })
        return
      case 'terminal':
        if (!focusKind('terminal')) openTab('terminal', { paneId: targetPaneId })
        return
      case 'browser':
        if (!focusKind('browser')) openTab('browser', { paneId: targetPaneId })
        return
      case 'changes':
        // Resolve through the provider first: focusing a review by kind alone
        // could reveal an older turn while the Session has newer changes.
        if (has('changes')) { openTab('changes', { paneId: targetPaneId }); return }
        if (focusKind('changes-review')) return
        setNotice('workbench.unavailable.changes')
    }
  }
  const mode = shortcuts.find(entry => entry.id === 'pane.fullscreen.toggle')
  const toggle = shortcuts.find(entry => entry.id === 'sidebar.right.toggle')
  const modeLabel = fullscreen ? t('chrome.exitFullscreen') : t('chrome.toFullscreen')
  return (
    <div className={css.bar} data-sidebar-workbench data-workbench-session={sessionId}>
      <div className={css.titleBar}>
        <span className={css.title}>{t('chrome.workbench')}</span>
        {(toggleFullscreen !== undefined || collapse !== undefined) && (
          <div className={css.actions}>
            {toggleFullscreen !== undefined && (
              <Tooltip label={modeLabel} shortcutKeys={mode?.keys} side="bottom" delayMs={500}>
                <button
                  type="button"
                  className={css.chromeButton}
                  aria-label={modeLabel}
                  aria-keyshortcuts={mode?.aria}
                  data-sidebar-right-mode={fullscreen ? 'push' : 'fullscreen'}
                  onClick={toggleFullscreen}
                >
                  <ExternalGlyph />
                </button>
              </Tooltip>
            )}
            {collapse !== undefined && (
              <Tooltip label={t('chrome.collapse')} shortcutKeys={toggle?.keys} side="bottom" delayMs={500}>
                <button
                  type="button"
                  className={css.chromeButton}
                  aria-label={t('chrome.collapseAria')}
                  aria-keyshortcuts={toggle?.aria}
                  data-sidebar-right-toggle
                  onClick={collapse}
                >
                  <IconCloseOutlineRegular />
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <nav className={css.tabs} aria-label={t('workbench.tabsAria')}>
        {DOMAINS.map(({ domain, label, icon: Icon, unavailable: reason }) => (
          <button
            key={domain}
            type="button"
            className={css.tab}
            aria-current={active === domain ? 'page' : undefined}
            aria-label={t(label)}
            title={unavailable[domain] ? t(reason) : undefined}
            data-workbench-tab={domain}
            data-unavailable={unavailable[domain] || undefined}
            onClick={() => { choose(domain) }}
          >
            <span className={css.tabContent}>
              <Icon />
              <span className={css.label}>{t(label)}</span>
            </span>
          </button>
        ))}
      </nav>
      {notice !== undefined && <p className={css.notice} role="status">{t(notice)}</p>}
    </div>
  )
}
