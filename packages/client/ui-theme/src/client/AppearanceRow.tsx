/**
 * Appearance preference row registered into the General section item slot: the
 * prototype's three theme cards, each a miniature window preview plus its label.
 * Registered by this package — the theme feature owns its own settings surface.
 * Selection follows the persisted preference, never the resolved active theme.
 */
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Card order and preview variants (prototype: light, dark, follow system). */
const CARDS: readonly { id: ThemePreference; labelKey: ThemeKey }[] = [
  { id: 'light', labelKey: 'appearance.light' },
  { id: 'dark', labelKey: 'appearance.dark' },
  { id: 'system', labelKey: 'appearance.system' },
]

/**
 * Render the Appearance row as three window-preview cards.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, useStore }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cards}>
        {CARDS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCard, preference === id && css.selected)}
            aria-pressed={preference === id}
            onClick={() => { setTheme(id) }}
          >
            <span className={css.preview} data-preview={id} aria-hidden="true" />
            <span className={css.label}>{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
