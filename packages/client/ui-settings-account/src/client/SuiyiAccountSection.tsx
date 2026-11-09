/** Account category backed by the real Suiyi Desktop identity bridge. */
import { useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopSuiyiIdentityView } from '@deepseek-ai/dsh-client-ui-settings-general/types'
import css from './SuiyiAccountSection.module.css'

/** Bridge view and actions supplied by the account plugin. */
export interface SuiyiAccountSectionInjected {
  hooks: { identity: HostObservable<DesktopSuiyiIdentityView> }
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

/**
 * Render the Suiyi identity account category.
 * @param props - bridge view, actions, and localized copy
 * @returns the account section
 */
export function SuiyiAccountSection({ useIdentity, signIn, signOut, t }:
  PropsRuntime<'settings.section'> & PropsLocale<'settings.account'> & InjectFace<SuiyiAccountSectionInjected>) {
  const view = useIdentity(value => value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const act = (action: () => Promise<void>): void => {
    setFailed(false)
    setBusy(true)
    void action().catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
  }
  return <section className={css.section} aria-label={t('nav')}>
    <h2 className={css.title}>{t('nav')}</h2>
    <p className={css.identity}>{view.state === 'signed-in'
      ? (view.displayName ?? t('signedIn'))
      : view.state === 'locked' ? t('signedOut') : t('suiyiUnavailable')}</p>
    {failed && <p className={css.error} role="alert">{t('failed')}</p>}
    {view.state === 'signed-in' && <button type="button" className={css.action} disabled={busy}
      onClick={() => { act(signOut) }}>{t('signOut')}</button>}
    {view.state === 'locked' && <button type="button" className={css.action} disabled={busy}
      onClick={() => { act(signIn) }}>{t('signIn')}</button>}
  </section>
}
