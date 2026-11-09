/**
 * The sidebar shell's search row. The trigger owns no search state: it asks the
 * browser's shortcut controls to open search, and WorkspaceBrowser expands the
 * inline field, focuses it, and owns filtering and results.
 */
import type { ReactNode } from 'react'
import { IconSearchOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SidebarSearchTrigger.module.css'

/** The trigger's injected action: the browser-owned search request. */
export interface SidebarSearchTriggerInjected {
  /** Open the sidebar browser's search field. */
  readonly requestSearch: () => void
  hooks: {
    /** Effective shortcut catalog, bound to `useShortcuts`. */
    readonly shortcuts: ObservableSnapshot<readonly ShortcutCatalogEntry[]>
  }
}

/** Composed slot props for the shell's `sidebar.search` seat. */
export type SidebarSearchTriggerProps =
  & PropsRuntime<'sidebar.search'>
  & PropsLocale<'workspace'>
  & InjectFace<SidebarSearchTriggerInjected>

/**
 * Render the full-width search row.
 * @param props - standard hooks, locale seat, and the browser-owned search request.
 * @returns the search trigger element.
 */
export function SidebarSearchTrigger({ requestSearch, useShortcuts, t }: SidebarSearchTriggerProps): ReactNode {
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'session.search'))
  return (
    <div className={css.row}>
      <Tooltip label={t('search.sessions.aria')} shortcutKeys={shortcut?.keys} side="bottom" delayMs={500}>
        <button
          type="button"
          className={css.trigger}
          aria-label={t('search.sessions.aria')}
          aria-keyshortcuts={shortcut?.aria}
          onClick={requestSearch}
        >
          <IconSearchOutlineRegular size={18} />
          <span className={css.label}>{t('search.trigger')}</span>
        </button>
      </Tooltip>
    </div>
  )
}
