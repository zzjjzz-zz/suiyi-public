/** Native welcome revisit, without signing out or creating a new conversation. */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './PreferenceRow.module.css'
import actionCss from './WelcomeRow.module.css'

/** Optional native capability; Web and older hosts do not provide it. */
export interface WelcomeRowInjected {
  openWelcome: (() => Promise<void>) | undefined
}

/**
 * Render the welcome entry and its native availability.
 * @param props - native operation and localized copy.
 * @returns the General Settings row.
 */
export function WelcomeRow({ openWelcome, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<WelcomeRowInjected>) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className={css.row}>
    <div className={css.copy}>
      <div className={css.title}>{t('welcome.title')}</div>
      <div className={css.description}>{t(openWelcome === undefined ? 'welcome.unavailable' : 'welcome.description')}</div>
      {failed && <div className={css.error} role="alert">{t('welcome.error')}</div>}
    </div>
    <button type="button" className={actionCss.action} disabled={busy || openWelcome === undefined}
      onClick={() => {
        if (openWelcome === undefined) return
        setBusy(true)
        setFailed(false)
        void openWelcome().catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
      }}>{t('welcome.open')}</button>
  </div>
}
