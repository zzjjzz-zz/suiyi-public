/**
 * The workbench toggle in the conversation header's corner seat, and the
 * shared presentational pill used by the retained global trigger.
 *
 * The prototype keeps one labelled “Workbench” pill on the top bar in both
 * states; this is that control. It shows the panel's real expanded state and
 * toggles it through the shared per-Session store, so opening and closing use
 * the same path as the panel's own chrome and the `sidebar.right.toggle`
 * command. On narrow viewports the label drops and the control keeps its 31px-wide
 * icon footprint without losing the toggle.
 *
 * The glyph is the left sidebar's collapse icon mirrored: the same affordance,
 * on the other edge.
 */
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createSidebarRightStore } from '../stores.ts'
import css from './ExpandButton.module.css'

/** The shared pill's visual inputs and activation callback. */
export interface WorkbenchToggleProps {
  readonly expanded: boolean
  /** Visible label, normally “工作台”. */
  readonly label: string
  /** Accessible action name. */
  readonly ariaLabel: string
  /** Tooltip action name. */
  readonly title: string
  /** Effective toggle shortcut, when this occurrence has one. */
  readonly shortcut?: ShortcutCatalogEntry | undefined
  /** Render the disabled state (a global page with no selected Session). */
  readonly disabled?: boolean
  /** Run the real toggle/open action. */
  readonly onActivate: () => void
}

/**
 * The workbench pill shared by the conversation corner and the retained global
 * trigger.
 * @param props - state, labels, shortcut and activation callback.
 * @returns the toggle button.
 */
export function WorkbenchToggle({
  expanded, label, ariaLabel, title, shortcut, disabled = false, onActivate,
}: WorkbenchToggleProps): ReactNode {
  return (
    <Tooltip label={title} shortcutKeys={shortcut?.keys} side="bottom" delayMs={500}>
      <button
        type="button"
        className={clsx(css.button, expanded && css.open)}
        aria-label={ariaLabel}
        aria-pressed={expanded}
        aria-keyshortcuts={shortcut?.aria}
        data-sidebar-right-expand
        disabled={disabled}
        onClick={onActivate}
      >
        <span aria-hidden="true"><IconPanelLeftOutlineRegular className={css.icon} /></span>
        <span className={css.label}>{label}</span>
      </button>
    </Tooltip>
  )
}

/** The button's props: the header corner seat, the shared store, and copy. */
export type ExpandButtonProps =
  & PropsRuntime<'conversation.session.header.corner'>
  & PropsStore<ReturnType<typeof createSidebarRightStore>>
  & PropsLocale<'sidebarRight'>
  & InjectFace<{ hooks: { shortcuts: HostObservable<readonly ShortcutCatalogEntry[]> } }>

/**
 * Render the conversation corner's workbench toggle.
 * @param props - session identity, the shared surface store, locale seat, and shortcuts.
 * @returns the toggle button.
 */
export function ExpandButton({ sessionId, useStore, actions, t, useShortcuts }: ExpandButtonProps): ReactNode {
  const shortcut = useShortcuts(entries => entries.find(entry => entry.id === 'sidebar.right.toggle'))
  const expanded = useStore(state => state.bySession[sessionId]?.layout.expanded ?? false)
  return <WorkbenchToggle
    expanded={expanded}
    label={t('chrome.workbench')}
    ariaLabel={expanded ? t('chrome.collapseAria') : t('chrome.expandAria')}
    title={expanded ? t('chrome.collapse') : t('chrome.expand')}
    shortcut={shortcut}
    onActivate={() => { actions.setExpanded(sessionId, !expanded) }}
  />
}
