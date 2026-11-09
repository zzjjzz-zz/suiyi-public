/** Desktop category: real preload update state, or an explicit unavailable state. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopUpdateView } from '../types.ts'
import css from './PreferenceRow.module.css'

/** Desktop update state and its real action. */
export interface DesktopSectionInjected {
  hooks: { desktopUpdate: HostObservable<DesktopUpdateView> }
  openUpdate(): void
}

/**
 * Render the Desktop and updates category.
 * @param props - update state, action, and localized copy
 * @returns the category content
 */
export function DesktopSection({ useDesktopUpdate, openUpdate, t }:
  PropsRuntime<'settings.section'> & PropsLocale<'settings'> & InjectFace<DesktopSectionInjected>) {
  const view = useDesktopUpdate(state => state)
  const presentation = view.presentation
  if (presentation === undefined) return <p className={css.description}>{t('desktop.unavailable')}</p>
  return <div className={css.row}>
    <div className={css.copy}>
      <div className={css.title}>{t('desktop.title')}</div>
      <div className={css.description}>{presentation.version ?? t('desktop.current')}</div>
      {view.failed && <div className={css.error} role="alert">{t('desktop.failed')}</div>}
    </div>
    <button type="button" className={css.action} onClick={openUpdate}>{t('desktop.open')}</button>
  </div>
}
