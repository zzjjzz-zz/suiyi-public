/** General Settings row for the explicit reduced-motion preference. */
import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './PreferenceRow.module.css'

/** Accepted preference and ordered writer supplied by the settings owner. */
export interface ReduceMotionRowInjected {
  hooks: { reducedMotion: ObservableSnapshot<boolean> }
  setReduceMotion(reduceMotion: boolean): Promise<void>
}

/**
 * Render the reduced-motion toggle.
 * @param props - accepted preference, writer and localized copy
 * @returns the General Settings row
 */
export function ReduceMotionRow({ useReducedMotion, setReduceMotion, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<ReduceMotionRowInjected>) {
  const enabled = useReducedMotion(value => value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className={css.row}>
    <div className={css.copy}>
      <div className={css.title}>{t('motion.title')}</div>
      <div className={css.description}>{t('motion.description')}</div>
      {failed && <div className={css.error} role="alert">{t('motion.error')}</div>}
    </div>
    <Switch
      checked={enabled}
      disabled={busy}
      label={t('motion.title')}
      onChange={(next) => {
        setFailed(false)
        setBusy(true)
        void setReduceMotion(next).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
      }}
    />
  </div>
}
