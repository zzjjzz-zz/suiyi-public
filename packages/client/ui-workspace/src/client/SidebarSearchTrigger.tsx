/**
 * The sidebar shell's search row. The trigger owns no search state: it asks the
 * profile's search owner to open the appropriate search surface.
 */
import type { ReactNode } from 'react'
import { IconSearchOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SidebarSearchTrigger.module.css'

/** The trigger's injected action: the profile-owned search request. */
export interface SidebarSearchTriggerInjected {
  /** Open the profile's search surface. */
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
  const label = t(process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi' ? 'globalSearch.aria' : 'search.sessions.aria')
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'session.search'))
  return (
    <div className={css.row}>
      <Tooltip label={label} shortcutKeys={shortcut?.keys} side="bottom" delayMs={500}>
        <button
          type="button"
          className={css.trigger}
          aria-label={label}
          aria-keyshortcuts={shortcut?.aria}
          onClick={requestSearch}
        >
          <span className={css.icon} aria-hidden="true"><IconSearchOutlineRegular size={18} /></span>
          <span className={css.label}>{t('search.trigger')}</span>
        </button>
      </Tooltip>
    </div>
  )
}
