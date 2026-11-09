/**
 * Suiyi full-page Settings: the prototype's five categories with a heading,
 * a section rail, and the active category's real providers. The page shares
 * the shell store with the sidebar trigger and the shortcut, so every entry
 * point opens, selects, and closes the same place.
 */
import type {
  HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsStore } from '@deepseek-ai/dsh-client-store'
import clsx from 'clsx'
import type { SettingsSectionRow } from './shell-contract.ts'
import type { createSettingsShellStore } from './shell-store.ts'
import type { SettingsKey } from './locales.ts'
import { navIcon } from './settings-icons.tsx'
import css from './SettingsPage.module.css'

/** The five prototype categories, in display order. */
type Category = 'appearance' | 'permissions' | 'runtime' | 'account' | 'desktop'

const CATEGORIES: readonly { id: Category; label: SettingsKey }[] = [
  { id: 'appearance', label: 'nav.appearance' },
  { id: 'permissions', label: 'nav.permissions' },
  { id: 'runtime', label: 'nav.runtime' },
  { id: 'account', label: 'nav.account' },
  { id: 'desktop', label: 'nav.desktop' },
]

/** Registrant-private face of the full-page shell. */
export interface SettingsPageInjected {
  hooks: {
    /** settings.section ledger projected into ordered nav rows. */
    sections: HostObservable<readonly SettingsSectionRow[]>
  }
  /** Leave the settings page and return to the conversation. */
  close(): void
}

/** Full-page props: main-panel seat, declared section seats, store, and copy. */
export type SettingsPageProps =
  PropsRuntime<'main'>
  & PropsRenderSlots<
    | 'settings.header'
    | 'settings.action'
    | 'settings.close'
    | 'settings.section'
    | 'settings.section.icon'
  >
  & InjectFace<SettingsPageInjected>
  & PropsLocale<'settings'>
  & PropsStore<ReturnType<typeof createSettingsShellStore>>

/**
 * Render the Suiyi settings page inside the main panel.
 * @param props - composed slot props.
 * @returns the page element tree.
 */
export function SettingsPage({ renderSlot, useSections, useStore, actions, close, t }: SettingsPageProps) {
  const rows = useSections(value => value)
  const activeId = useStore(state => state.activeId)
  const active = CATEGORIES.some(category => category.id === activeId) ? activeId as Category : 'appearance'
  const available = new Set(rows.map(row => row.id))
  const section = (ids: readonly string[], category: 'general' | 'permissions' | 'runtime' | 'desktop') => (
    ids.filter(id => available.has(id)).map(id => (
      <div key={id} className={css.sectionGroup}>
        {renderSlot('settings.section', { close, category }, { only: id })}
      </div>
    ))
  )
  return (
    <div className={css.page} data-settings-page="">
      <div className={css.heading}>
        <div className={css.headingCopy}>
          <h1 className={css.title}>{t('title')}</h1>
          <p className={css.subtitle}>{t('page.subtitle')}</p>
        </div>
        <div className={css.headingActions}>
          <div className={css.actions}>{renderSlot('settings.action', {})}</div>
        </div>
      </div>
      <div className={css.layout}>
        <nav className={css.nav} aria-label={t('title')}>
          <div className={css.navList}>
            {CATEGORIES.map(category => (
              <button
                key={category.id}
                type="button"
                className={clsx(css.navCell, category.id === active && css.active)}
                aria-current={category.id === active ? 'true' : undefined}
                onClick={() => { actions.select(category.id) }}
              >
                <span className={css.navIcon} aria-hidden="true">
                  {renderSlot('settings.section.icon', { size: 16, active: category.id === active }, {
                    only: category.id, fallback: navIcon(category.id),
                  })}
                </span>
                <span className={css.navLabel}>{t(category.label)}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className={css.main}>
          {active === 'appearance' && section(['general'], 'general')}
          {active === 'permissions' && section(['general'], 'permissions')}
          {active === 'runtime' && (
            <>
              {section(['general'], 'runtime')}
              {section(['models', 'agent-presets'], 'runtime')}
            </>
          )}
          {active === 'account' && (available.has('suiyi-account')
            ? section(['suiyi-account'], 'runtime')
            : <p className={css.empty}>{t('account.unavailable')}</p>)}
          {active === 'desktop' && (
            <>
              {available.has('desktop')
                ? section(['desktop'], 'runtime')
                : <p className={css.empty}>{t('desktop.unavailable')}</p>}
              {section(['general'], 'desktop')}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
