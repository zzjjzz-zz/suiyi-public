/** General settings row for permission-gated completion notifications. */
import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TurnNotificationState } from './turn-notifications.ts'
import css from './PreferenceRow.module.css'

/** Accepted notification state and permission-aware preference writer. */
export interface TurnNotificationRowInjected {
  hooks: { notification: ObservableSnapshot<TurnNotificationState> }
  setEnabled(enabled: boolean): Promise<void>
}

/**
 * @param props - notification state, writer and localized copy.
 * @returns effective notification toggle with an actionable permission state.
 */
export function TurnNotificationRow({ useNotification, setEnabled, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<TurnNotificationRowInjected>) {
  const state = useNotification(value => value)
  const [busy, setBusy] = useState(false)
  const write = (value: boolean): void => {
    setBusy(true)
    void setEnabled(value).finally(() => { setBusy(false) })
  }
  return <div className={css.row}>
    <div className={css.copy}>
      <div className={css.title}>{t('turnComplete.title')}</div>
      <div className={css.description}>{t('turnComplete.description')}</div>
      {state.reason !== null && <div className={state.reason === 'error' ? css.error : css.status}
        role={state.reason === 'error' ? 'alert' : 'status'}>{t(`turnComplete.${state.reason}`)}</div>}
      {state.requested && !state.enabled && <button type="button" className={css.action}
        disabled={busy || !state.writable} onClick={() => { write(false) }}>{t('turnComplete.disable')}</button>}
    </div>
    <Switch checked={state.enabled} label={t('turnComplete.title')}
      disabled={busy || !state.writable || state.reason === 'unsupported' || state.reason === 'denied'}
      onChange={write} />
  </div>
}
